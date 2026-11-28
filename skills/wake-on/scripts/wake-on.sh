#!/usr/bin/env bash
# wake-on engine. Generic: it knows nothing about GitHub, ticket trackers or Playwright. A PRESET (presets/*.sh)
# says what to read and how to describe a change. Zero model tokens while it runs: bash + sleep.
#
# Two processes per watch, so no event is lost between a wake-up and the next arm:
#   watcher  runs until `stop`. It never exits on an event or on a failing poll. Every change is
#            appended as ONE line to events.log and the baseline moves forward.
#   wake     blocks until events.log has lines past the saved offset, prints them, advances the
#            offset and exits 0. That exit is what wakes the session. Re-arm it after handling.
#            It exits 2 if a watcher died or stopped polling, so a silent death is impossible.
#
# Commands:
#   presets                                list presets and their parameters
#   start <preset> <name> [KEY=VAL ...]    create a watch and start its watcher (restarts a dead one)
#   wake <name> [name ...]                 block until any listed watch has new events
#   status [name ...]                      watcher health, last poll age, events logged/consumed
#   log <name> [n]                         last n events (default 20), without consuming them
#   stop <name>                            stop the watcher (the only way a watch ends)
# Environment: WAKE_ON_HOME (state root, default ~/.wake-on), WAKE_ON_TEST_DROP=1 (tests: fake event).
set -u
export LC_ALL=C
set -o pipefail

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
SKILL_DIR="$(dirname "$(dirname "$SELF")")"
PRESETS="$SKILL_DIR/presets"
ROOT="${WAKE_ON_HOME:-$HOME/.wake-on}/instances"
STALE_AFTER=900

die() { echo "wake-on: $*" >&2; exit 64; }

use_instance() {  # sets D and the file variables for instance $1
  case "$1" in ''|*[!A-Za-z0-9._-]*) die "invalid name '$1' (letters, digits, . _ - only)";; esac
  D="$ROOT/$1"; NAME="$1"
  META="$D/meta.env"; SEEN="$D/seen.txt"; EVENTS="$D/events.log"; OFFSET="$D/offset"
  PIDF="$D/pid"; BEAT="$D/heartbeat"; DLOG="$D/daemon.log"
}
now()   { date '+%Y-%m-%d %H:%M:%S'; }
note()  { printf '%s %s\n' "$(now)" "$1" >> "$DLOG"; }
emit()  { printf 'EVENT %s %s\n' "$(now)" "$1" >> "$EVENTS"; }
oneline() { tr '\n\r' '  ' | head -c "${1:-500}"; }
alive() { [ -s "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; }
# A watcher is stale when it has not polled for longer than two intervals plus a minute (never under
# STALE_AFTER). The watcher records its effective interval, so a 30-minute poll is not called dead.
interval_of() { cat "$D/interval" 2>/dev/null || echo 120; }
stale_limit() {
  local lim=$(( 2 * $(interval_of) + 60 ))
  [ "$lim" -lt "$STALE_AFTER" ] && lim=$STALE_AFTER
  echo "$lim"
}
beat_age() {
  local m; m=$(stat -f %m "$BEAT" 2>/dev/null || stat -c %Y "$BEAT" 2>/dev/null) || { echo 999999; return; }
  echo $(( $(date +%s) - m ))
}

# Default describe: preset can override preset_describe. WAKE_ADDED / WAKE_REMOVED hold the changed lines.
preset_describe() {
  local l
  while IFS= read -r l; do [ -n "$l" ] && emit "ADDED $l"; done <<< "${WAKE_ADDED:-}"
  while IFS= read -r l; do [ -n "$l" ] && emit "REMOVED $l"; done <<< "${WAKE_REMOVED:-}"
}

normalize() { sed '/^$/d' | sort -u; }

run_watcher() {  # internal: the long-lived process
  use_instance "$1"
  [ -f "$META" ] || die "no such watch: $1"
  # shellcheck disable=SC1090
  . "$META"
  # shellcheck disable=SC1090
  . "$PRESETS/$PRESET.sh" || { note "cannot load preset $PRESET"; exit 2; }
  preset_init || { note "preset_init failed, see daemon.out"; exit 2; }
  INTERVAL="${INTERVAL:-120}"   # after preset_init, so a preset can set its own default
  echo "$INTERVAL" > "$D/interval"
  if alive; then echo "already running, pid $(cat "$PIDF")"; exit 0; fi
  echo $$ > "$PIDF"
  trap 'emit "WATCH STOPPED on request"; rm -f "$PIDF"; exit 0' TERM INT

  local out snap
  if [ ! -f "$SEEN" ]; then
    out=$(preset_snapshot) || { note "first poll failed, nothing is watched"; rm -f "$PIDF"; exit 2; }
    printf '%s\n' "$out" | normalize > "$SEEN"
    note "started with a fresh baseline"
  else
    note "restarted: comparing with the saved baseline, changes made while it was down are reported"
  fi
  if [ "${WAKE_ON_TEST_DROP:-0}" = "1" ]; then tail -n +2 "$SEEN" > "$SEEN.tmp"; mv "$SEEN.tmp" "$SEEN"; fi

  local fails=0 warned=0 added removed
  while :; do
    touch "$BEAT"
    if out=$(preset_snapshot); then
      snap=$(printf '%s\n' "$out" | normalize)
      if [ "$warned" = "1" ]; then emit "WATCH RECOVERED: polling works again, watching continues"; warned=0; fi
      fails=0
      added=$(comm -13 "$SEEN" <(printf '%s\n' "$snap" | sed '/^$/d'))
      removed=$(comm -23 "$SEEN" <(printf '%s\n' "$snap" | sed '/^$/d'))
      if [ -n "$added" ] || [ -n "$removed" ]; then
        WAKE_ADDED="$added" WAKE_REMOVED="$removed" preset_describe
        printf '%s\n' "$snap" | sed '/^$/d' > "$SEEN"
      fi
    else
      fails=$((fails + 1))
      if [ "$fails" -ge 10 ] && [ "$warned" = "0" ]; then
        emit "WATCH WARNING: $fails polls failed in a row (login, network or the command itself). Still retrying."
        warned=1
      fi
    fi
    sleep "$INTERVAL" &
    wait $!
  done
}

cmd_presets() {
  local f
  for f in "$PRESETS"/*.sh; do
    ( . "$f"; printf '%s\n  %s\n  params: %s\n\n' "$(basename "$f" .sh)" "$PRESET_SUMMARY" "$PRESET_PARAMS" )
  done
}

cmd_start() {
  [ $# -ge 2 ] || die "usage: start <preset> <name> [KEY=VAL ...]"
  local preset="$1" name="$2"; shift 2
  use_instance "$name"
  [ -f "$PRESETS/$preset.sh" ] || die "unknown preset '$preset' (run: presets)"
  mkdir -p "$D"
  local kv key val
  if [ -f "$META" ]; then
    # shellcheck disable=SC1090
    ( . "$META"; [ "$PRESET" = "$preset" ] ) || die "watch '$name' already exists with another preset"
    if alive; then echo "watch '$name' already running, pid $(cat "$PIDF")"; return 0; fi
    echo "watch '$name' exists but its watcher is dead: restarting with the saved parameters"
  else
    printf 'PRESET=%q\n' "$preset" > "$META"
  fi
  for kv in "$@"; do
    key="${kv%%=*}"; val="${kv#*=}"
    case "$key" in [A-Z]*) ;; *) die "parameter '$kv' must look like KEY=VALUE with an UPPERCASE key";; esac
    printf '%s=%q\n' "$key" "$val" >> "$META"
  done
  touch "$EVENTS"
  nohup bash "$SELF" _run "$name" >> "$D/daemon.out" 2>&1 &
  disown 2>/dev/null || true
  local i=0
  while [ $i -lt 40 ]; do
    if alive && [ -f "$SEEN" ] && [ -f "$BEAT" ]; then
      echo "watch '$name' started, pid $(cat "$PIDF")"; echo "baseline:"; sed 's/^/  /' "$SEEN"
      return 0
    fi
    sleep 0.5; i=$((i + 1))
  done
  echo "watch '$name' did NOT start. daemon.log / daemon.out say why:" >&2
  tail -n 5 "$DLOG" "$D/daemon.out" 2>/dev/null >&2
  return 1
}

cmd_wake() {
  [ $# -ge 1 ] || die "usage: wake <name> [name ...]"
  local n off total age got stale
  for n in "$@"; do use_instance "$n"; [ -f "$META" ] || die "no such watch: $n"; done
  while :; do
    got=0
    for n in "$@"; do
      use_instance "$n"
      off=$(cat "$OFFSET" 2>/dev/null || echo 0)
      total=$(wc -l < "$EVENTS" | tr -d ' ')
      if [ "$total" -gt "$off" ]; then
        tail -n +$((off + 1)) "$EVENTS" | sed "s/^/[$n] /"
        echo "$total" > "$OFFSET"; got=1
      fi
    done
    [ "$got" = "1" ] && exit 0
    stale=0; recheck=0
    for n in "$@"; do
      use_instance "$n"
      if ! alive; then
        echo "[$n] WATCH DEAD: no watcher process. Nothing is watching. Restart: bash $SELF start <preset> $n"
        exit 2
      fi
      age=$(beat_age)
      if [ "$age" -gt "$(stale_limit)" ]; then
        stale=1
        [ $(( $(interval_of) + 20 )) -gt "$recheck" ] && recheck=$(( $(interval_of) + 20 ))
      fi
    done
    if [ "$stale" = "1" ]; then
      sleep "$recheck"   # a sleeping laptop looks stale until the watcher's next poll
      for n in "$@"; do
        use_instance "$n"
        if [ "$(beat_age)" -gt "$(stale_limit)" ]; then
          echo "[$n] WATCH STALE: process alive but no poll for $(beat_age)s (limit $(stale_limit)s). See $DLOG"; exit 2
        fi
      done
    fi
    sleep 10
  done
}

cmd_status() {
  local names=("$@") n
  if [ ${#names[@]} -eq 0 ]; then
    names=(); for n in "$ROOT"/*/; do [ -d "$n" ] && names+=("$(basename "$n")"); done
  fi
  [ ${#names[@]} -gt 0 ] || { echo "no watches yet"; return 0; }
  for n in "${names[@]}"; do
    use_instance "$n"; [ -f "$META" ] || { echo "$n: no such watch"; continue; }
    if alive; then
      printf '%s: ALIVE pid %s, polls every %ss, last poll %ss ago, ' "$n" "$(cat "$PIDF")" "$(interval_of)" "$(beat_age)"
    else
      printf '%s: NOT RUNNING, ' "$n"
    fi
    printf 'preset %s, events %s, consumed %s\n' "$( . "$META"; echo "$PRESET")" "$(wc -l < "$EVENTS" | tr -d ' ')" "$(cat "$OFFSET" 2>/dev/null || echo 0)"
  done
}

cmd_log() {
  [ $# -ge 1 ] || die "usage: log <name> [n]"
  use_instance "$1"; [ -f "$META" ] || die "no such watch: $1"
  tail -n "${2:-20}" "$EVENTS"
}

cmd_stop() {
  [ $# -ge 1 ] || die "usage: stop <name>"
  use_instance "$1"; [ -f "$META" ] || die "no such watch: $1"
  if alive; then
    local p; p=$(cat "$PIDF")
    kill "$p" 2>/dev/null; pkill -P "$p" 2>/dev/null
    local i=0
    while alive && [ $i -lt 10 ]; do sleep 0.5; i=$((i + 1)); done
    if alive; then echo "still alive after 5s, pid $p"; else echo "watch '$1' stopped"; fi
  else
    echo "watch '$1' was not running"
  fi
}

case "${1:-}" in
  presets) cmd_presets ;;
  start)   shift; cmd_start "$@" ;;
  wake)    shift; cmd_wake "$@" ;;
  status)  shift; cmd_status "$@" ;;
  log)     shift; cmd_log "$@" ;;
  stop)    shift; cmd_stop "$@" ;;
  _run)    shift; run_watcher "$@" ;;
  *) sed -n '2,24p' "$SELF" | sed 's/^# \{0,1\}//'; exit 64 ;;
esac
