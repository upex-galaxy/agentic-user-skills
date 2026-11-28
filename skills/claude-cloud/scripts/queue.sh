#!/bin/bash
# queue.sh <unit> [<unit>...]
# Keeps up to CLAUDE_CLOUD_MAX_SESSIONS cloud sessions running until the queue is empty. Every
# CLAUDE_CLOUD_POLL_SEC seconds it fetches the <CLAUDE_CLOUD_BRANCH_PREFIX>* branches, counts delivered
# (the branch has a file that matches CLAUDE_CLOUD_DELIVERY_PATTERN), running and stuck sessions, and
# launches the missing units with launch.sh until every slot is full.
# Run it in the background: the agent's Bash tool kills a foreground command after 10 min.
#
# A session counts as STUCK when CLAUDE_CLOUD_STUCK_MIN minutes pass with no delivery since its last sign
# of life (the last push to its branch, or the launch if that is later). Stuck is not dead: the worker
# process can restart and leave the session idle for hours, and a message wakes it up. So the first time a
# session gets stuck, the queue
# sends it ONE automatic message (`script -q <log> claude -p "<msg>" --cloud <session_id>`, with the id
# taken from the URL in sessions.txt) so it resumes from the state of its branch, pushes its log and goes
# on. One per session, recorded in messages.txt and queue.log. A stuck session keeps its slot (a long
# render can pass the hour with no push) until CLAUDE_CLOUD_ABANDON_MIN with no sign of life; only then is
# it abandoned and the slot freed.
#
# Before that CLI message, the queue WAKES the session from the web UI with wake.sh (the profile in
# CLAUDE_CLOUD_PLAYWRIGHT_PROFILE, once per session and reason, recorded in wakes.txt): a message written in
# claude.ai attaches the connectors (Loom, for example), which `claude -p … --cloud` does not.
# It also wakes a session that is not stuck when the last line of its cloud log that names
# the connector says "waiting for connector" (the runbook asks the session to write it that way when its
# output needs a connector that has not arrived). The older log name nube-log.md and the older phrase
# "esperando conector" are still recognised.
#
# The queue never assembles or downloads deliveries. assemble.sh and git-chunked output only with explicit
# permission from the person who owns the machine, case by case: large files pulled back in chunks stay in
# the history and grow the local .git by gigabytes.
#
# Variables:
#   CLAUDE_CLOUD_STATE_DIR        required. The same folder launch.sh uses (reads sessions.txt; writes queue.log,
#                                 messages.txt and wakes.txt). A state dir that already holds sesiones.txt keeps
#                                 its legacy file names.
#   CLAUDE_CLOUD_RUNBOOK          required (passed to launch.sh)
#   CLAUDE_CLOUD_PLAYWRIGHT_PROFILE  required while waking is on (see wake.sh). Checked before any session is created.
#   CLAUDE_CLOUD_MAX_SESSIONS     sessions at once. Default: 10 (check your plan's limits)
#   CLAUDE_CLOUD_STUCK_MIN        minutes with no delivery and no push before a session counts as stuck. Default: 60
#   CLAUDE_CLOUD_GRACE_MIN        with CLAUDE_CLOUD_RELAUNCH=1, minutes to wait after the message before relaunching. Default: 30
#   CLAUDE_CLOUD_ABANDON_MIN      minutes with no sign of life before a session is abandoned and frees its slot. Default: 240
#   CLAUDE_CLOUD_DELIVERY_PATTERN regex (grep -E) of a branch file that proves delivery.
#                                 Default: (^|/)(delivery|entrega)\.json$ (the last step of templates/runbook.md writes delivery.json)
#   CLAUDE_CLOUD_BRANCH_PREFIX    branch prefix. Default: fleet/
#   CLAUDE_CLOUD_REPO             repo to fetch in. Default: CLAUDE_CLOUD_WORKTREE or $HOME/.claude-cloud/worktrees/<repo-name>
#   CLAUDE_CLOUD_POLL_SEC         seconds between rounds. Default: 180
#   CLAUDE_CLOUD_RELAUNCH         1 = relaunch once each stuck session that pushed nothing within CLAUDE_CLOUD_GRACE_MIN
#                                 after the message (the old log stays as .attemptN). Default: 0 (only warn and message)
#   CLAUDE_CLOUD_STUCK_MESSAGE    text of the automatic message; {UNIT}, {BRANCH} and {MIN} are replaced
#                                 ({UNIDAD} and {RAMA} still work). Default: below
#   CLAUDE_CLOUD_WAKE             0 = do not use wake.sh (CLI message only). Default: 1
#   CLAUDE_CLOUD_CONNECTOR_WAIT_PATTERN  regex (grep -E -i) of the log line saying the session waits for the connector.
#                                 Default: waiting for connector|esperando conector
#   CLAUDE_CLOUD_LOGIN_PAUSE_MIN  when wake.sh says the profile is not logged in (exit 2), minutes before trying
#                                 again while the user logs in. Default: 30
#   The rest (CLAUDE_CLOUD_WORKTREE, CLAUDE_CLOUD_TASK, CLAUDE_CLOUD_EXTRA, CLAUDE_CLOUD_PROMPT_FILE) passes to launch.sh as is.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
source "$HERE/defaults.sh"
[ $# -gt 0 ] || { echo "Usage: queue.sh <unit> [<unit>...]" >&2; exit 2; }
: "${CLAUDE_CLOUD_STATE_DIR:?CLAUDE_CLOUD_STATE_DIR is required}"
: "${CLAUDE_CLOUD_RUNBOOK:?CLAUDE_CLOUD_RUNBOOK is required}"
MAX=${CLAUDE_CLOUD_MAX_SESSIONS:-10}
STUCK=$(( ${CLAUDE_CLOUD_STUCK_MIN:-60} * 60 ))
GRACE=$(( ${CLAUDE_CLOUD_GRACE_MIN:-30} * 60 ))
ABANDON=$(( ${CLAUDE_CLOUD_ABANDON_MIN:-240} * 60 ))
PATTERN=${CLAUDE_CLOUD_DELIVERY_PATTERN:-$CLAUDE_CLOUD_DELIVERY_PATTERN_DEFAULT}
P=${CLAUDE_CLOUD_BRANCH_PREFIX:-fleet/}
R=${CLAUDE_CLOUD_REPO:-${CLAUDE_CLOUD_WORKTREE:-$CLAUDE_CLOUD_WORKTREE_DEFAULT}}
[ -n "$R" ] || { echo "CLAUDE_CLOUD_REPO or CLAUDE_CLOUD_WORKTREE is required (you are not in a git repo)" >&2; exit 2; }
POLL=${CLAUDE_CLOUD_POLL_SEC:-180}
RELAUNCH=${CLAUDE_CLOUD_RELAUNCH:-0}
WAKE=${CLAUDE_CLOUD_WAKE:-1}
CONNECTOR_WAIT=${CLAUDE_CLOUD_CONNECTOR_WAIT_PATTERN:-$CLAUDE_CLOUD_CONNECTOR_WAIT_PATTERN_DEFAULT}
LOGIN_PAUSE=$(( ${CLAUDE_CLOUD_LOGIN_PAUSE_MIN:-30} * 60 ))
NO_LOGIN_UNTIL=0
# Fail before creating any session: a session that cannot be woken never gets its connectors.
if [ "$WAKE" != 0 ]; then claude_cloud_require_profile || exit 6; fi
MESSAGE=${CLAUDE_CLOUD_STUCK_MESSAGE:-'Automatic message from the queue: your branch {BRANCH} has had no push for {MIN} min. If your process restarted, resume from the state of your branch: read the log file your runbook names and git log, push that log now with the time and the step you are on, and follow the runbook from the first unfinished step until you deliver. If the output of a heavy step is still on disk, do not generate it again. Do not start over and do not touch any other branch. If a connector is missing, wait as the runbook says: do not split the output into parts.'}
STATE=$CLAUDE_CLOUD_STATE_DIR
claude_cloud_state_files "$STATE"
S=$CC_SESSIONS; LOG=$CC_QUEUE_LOG; MSGS=$CC_MESSAGES; L=$CC_LAUNCHES; WAKES=$CC_WAKES
mkdir -p "$L"; touch "$S" "$MSGS" "$WAKES"
QUEUE=("$@")

delivered() { git -C "$R" ls-tree -r --name-only "origin/$P$1" 2>/dev/null | grep -E -q "$PATTERN"; }
launched()  { grep -v '^#' "$S" | awk 'NF {print $1}' | sort -u; }
launch_count() { grep -v '^#' "$S" | awk -v u="$1" '$1 == u' | wc -l | tr -d ' '; }
launch_epoch() {  # third column of the last line; if there is none, the log's mtime
  local e; e=$(grep -v '^#' "$S" | awk -v u="$1" '$1 == u {x = $3} END {print x}')
  if [ -n "$e" ]; then echo "$e"; return; fi
  local f="$L/$1.log"
  [ -f "$f" ] && { stat -f %m "$f" 2>/dev/null || stat -c %Y "$f"; } || echo 0
}
session_of() {  # session_… of the last URL recorded for the unit (empty if it was NO-URL)
  grep -v '^#' "$S" | awk -v u="$1" '$1 == u {x = $2} END {print x}' | grep -o 'session_[A-Za-z0-9]*' | head -1
}
push_epoch() { git -C "$R" log -1 --format=%ct "origin/$P$1" 2>/dev/null || echo 0; }
message_epoch() { awk -v s="$1" '$2 == s {x = $3} END {print x}' "$MSGS"; }  # empty if never messaged

waiting_for_connector() {  # the last line of its cloud log that names the connector says it is waiting for it
  local f; f=$(git -C "$R" ls-tree -r --name-only "origin/$P$1" 2>/dev/null | grep -E "$CLAUDE_CLOUD_LOG_FILE_PATTERN" | head -1)
  [ -n "$f" ] || return 1
  git -C "$R" show "origin/${P}${1}:${f}" 2>/dev/null | grep -E -i 'connector|conector' | tail -1 | grep -E -i -q "$CONNECTOR_WAIT"
}
legacy_reason() { case "$1" in connector) echo conector ;; stuck) echo trabada ;; *) echo "$1" ;; esac; }
woken() {  # $1 session_id, $2 reason; a wake recorded under the legacy reason name counts too
  awk -v s="$1" -v m="$2" -v o="$(legacy_reason "$2")" '$2 == s && ($3 == m || $3 == o) {x = 1} END {exit !x}' "$WAKES"
}

wake() {  # $1 unit, $2 session_id, $3 reason (connector | stuck). Once per session and reason.
  local u="$1" sid="$2" reason="$3" rc now
  [ "$WAKE" != 0 ] || return 0
  woken "$sid" "$reason" && return 0
  now=$(date +%s)
  [ "$now" -lt "$NO_LOGIN_UNTIL" ] && return 0
  CLAUDE_CLOUD_STATE_DIR="$STATE" bash "$HERE/wake.sh" "https://claude.ai/code/$sid" >> "$L/$u.wake.log" 2>&1; rc=$?
  case "$rc" in
    2) NO_LOGIN_UNTIL=$((now + LOGIN_PAUSE))
       echo "$(date -u +%TZ) wake $u ($sid): the profile $CLAUDE_CLOUD_PROFILE_DIR is not logged in. The user logs in once inside a headed Chrome window opened with that profile; retrying in $((LOGIN_PAUSE / 60)) min" >> "$LOG"
       return 1 ;;
    5) echo "$(date -u +%TZ) wake $u ($sid): the profile is busy (lock); retrying next round" >> "$LOG"
       return 1 ;;
  esac
  echo "$u $sid $reason $now $rc" >> "$WAKES"
  echo "$(date -u +%TZ) wake ($reason) $u ($sid): exit $rc (0 sent, 3 Cloudflare, 4 no composer, 6 no profile), detail in $L/$u.wake.log" >> "$LOG"
}

nudge() {  # $1 unit, $2 session_id, $3 minutes with no sign of life. One message per session.
  local u="$1" sid="$2" min="$3" mlog="$L/$1.message.log" txt
  txt=$(printf '%s' "$MESSAGE" | sed -e "s|{UNIT}|$u|g" -e "s|{BRANCH}|$P$u|g" -e "s|{UNIDAD}|$u|g" -e "s|{RAMA}|$P$u|g" -e "s|{MIN}|$min|g")
  rm -f "$mlog"
  (script -q "$mlog" claude -p "$txt" --cloud "$sid" </dev/null >/dev/null 2>&1 &)
  local ok=no
  # "Sent to cloud session" is the Claude Code CLI's own output; do not translate it
  for _ in $(seq 1 20); do sleep 3; grep -a -q "Sent to cloud session" "$mlog" 2>/dev/null && { ok=yes; break; }; done
  echo "$u $sid $(date +%s)" >> "$MSGS"
  echo "$(date -u +%TZ) automatic message to $u ($sid, no sign of life for $min min): sent=$ok, output in $mlog" >> "$LOG"
}

while :; do
  git -C "$R" fetch -q origin "refs/heads/$P*:refs/remotes/origin/$P*" 2>/dev/null
  now=$(date +%s); running=0; done_count=0; abandoned=0; stuck=(); detail=""
  for u in $(launched); do
    if delivered "$u"; then done_count=$((done_count + 1)); continue; fi
    sid=$(session_of "$u")
    if [ -n "$sid" ] && waiting_for_connector "$u"; then wake "$u" "$sid" connector; fi
    t=$(launch_epoch "$u"); pe=$(push_epoch "$u"); [ "$pe" -gt "$t" ] && t=$pe
    if [ "$t" -gt 0 ] && [ $((now - t)) -gt "$STUCK" ]; then
      min=$(( (now - t) / 60 ))
      stuck+=("$u"); detail="$detail $u(no sign of life for $min min)"
      if [ -z "$sid" ]; then
        # NO-ID-<unit> marks a unit warned once; the legacy SIN-ID-<unit> counts too
        if [ -z "$(message_epoch "NO-ID-$u")" ] && [ -z "$(message_epoch "SIN-ID-$u")" ]; then
          echo "$u NO-ID-$u $now" >> "$MSGS"
          echo "$(date -u +%TZ) $u stuck with no session id in $(basename "$S"): cannot message it" >> "$LOG"
        fi
      else
        wake "$u" "$sid" stuck               # web UI first: it attaches the connectors
        [ -z "$(message_epoch "$sid")" ] && nudge "$u" "$sid" "$min"
      fi
    fi
    if [ "$t" -gt 0 ] && [ $((now - t)) -gt "$ABANDON" ]; then
      abandoned=$((abandoned + 1))
    else
      running=$((running + 1))   # stuck sessions keep their slot until they are abandoned
    fi
  done
  pending=()
  for u in "${QUEUE[@]}"; do launched | grep -q -x "$u" || pending+=("$u"); done
  echo "$(date -u +%TZ) delivered=$done_count running=$running stuck=[${detail# }] abandoned=$abandoned queue=${#pending[@]}" >> "$LOG"
  free=$((MAX - running))

  if [ "$RELAUNCH" = 1 ]; then   # the relaunch takes the old session's slot: it does not use a free one
    for u in "${stuck[@]+"${stuck[@]}"}"; do
      [ "$(launch_count "$u")" -lt 2 ] || continue   # once per unit
      sid=$(session_of "$u"); me=""; [ -n "$sid" ] && me=$(message_epoch "$sid")
      # with a session id: relaunch only if the message went out more than CLAUDE_CLOUD_GRACE_MIN ago with no push since
      if [ -n "$sid" ]; then
        [ -n "$me" ] && [ $((now - me)) -gt "$GRACE" ] && [ "$(push_epoch "$u")" -lt "$me" ] || continue
      fi
      echo "$(date -u +%TZ) relaunching $u (archive the old session ${sid:-with no id} in claude.ai/code)" >> "$LOG"
      bash "$HERE/launch.sh" "$u" >> "$LOG" 2>&1
    done
  fi

  if [ ${#pending[@]} -gt 0 ] && [ $free -gt 0 ]; then
    bash "$HERE/launch.sh" "${pending[@]:0:$free}" >> "$LOG" 2>&1
    continue
  fi
  if [ ${#pending[@]} -eq 0 ] && [ $running -eq 0 ]; then
    echo "DONE: delivered=$done_count of $(launched | wc -l | tr -d ' '), abandoned=$abandoned, stuck=[${detail# }]"
    tail -3 "$LOG"; exit 0
  fi
  sleep "$POLL"
done
