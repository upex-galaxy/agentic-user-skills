#!/bin/bash
# wake.sh <session_url> [message]
# wake.sh --check [url]          (--comprobar is the deprecated spelling and still works)
#
# Writes a message to a cloud session FROM THE claude.ai WEB UI, using the Playwright profile named by
# CLAUDE_CLOUD_PLAYWRIGHT_PROFILE. Why: a session created with `claude --cloud` from the terminal does not
# get the tools of the claude.ai connectors (Loom, for example), not even if you message it with
# `claude -p … --cloud`. A message written in the web UI does attach them (a known Claude Code cloud bug).
#
# Sequence: open with a window (Cloudflare stops headless with "Just a moment...") → wait until
# the title is no longer the challenge → if the URL lands on /login, the profile lost its login → fill the
# composer, found by role (the ref changes on every load) → read the text back and compare → send
# (if the session is mid-turn, the message is queued and goes in when the current step ends) →
# screenshot → close.
#
# --check opens the URL (default https://claude.ai/code), runs only the Cloudflare and login checks, and
# closes without writing anything. Run it before launching a fleet.
#
# Required:
#   CLAUDE_CLOUD_PLAYWRIGHT_PROFILE  absolute path to a Playwright profile directory logged into the claude.ai
#                                    account that owns the cloud sessions. No default. The playwright-cli
#                                    session name is the profile's basename; the lock is <profile>.lock next to it.
#
# Exit codes:
#   0  message sent (with --check: the profile is logged in)
#   1  wrong usage, or the browser did not open
#   2  the profile is not logged in: the user logs in once, inside the headed Chrome window that the
#      agent opens with that profile; the agent never types credentials
#   3  Cloudflare (or any challenge) was not passed within CLAUDE_CLOUD_WAKE_CHALLENGE_SEC seconds
#   4  the composer did not appear, or did not accept the text
#   5  another run holds the profile (lock) and did not release it within CLAUDE_CLOUD_WAKE_LOCK_SEC seconds
#   6  CLAUDE_CLOUD_PLAYWRIGHT_PROFILE is not set, or the directory does not exist
#
# playwright-cli runs from $HOME/.claude-cloud, so its .playwright-cli/ snapshots land there.
#
# One browser at a time on the profile: a noclobber lock in <profile>.lock (PID inside; an orphan lock is
# cleaned up on its own). It opens a visible window for a short while.
#
# Variables:
#   CLAUDE_CLOUD_WAKE_MESSAGE         default message when none is passed as an argument (the neutral one is below)
#   CLAUDE_CLOUD_STATE_DIR            fleet state folder; the log goes to <state>/wake.log and the screenshots to
#                                     <state>/wake/ (despertar.log and despertar/ in a legacy state dir).
#                                     Default: $HOME/.claude-cloud/state
#   CLAUDE_CLOUD_WAKE_CHALLENGE_SEC   max wait for the Cloudflare challenge. Default: 60
#   CLAUDE_CLOUD_WAKE_COMPOSER_SEC    max wait for the composer. Default: 30
#   CLAUDE_CLOUD_WAKE_LOCK_SEC        max wait for the lock. Default: 300
#   CLAUDE_CLOUD_WAKE_COMPOSER        forces one composer locator (tried first)
#   CLAUDE_CLOUD_WAKE_KEY             key that sends. Default: Meta+Enter
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
source "$HERE/defaults.sh"

STATE=${CLAUDE_CLOUD_STATE_DIR:-$CLAUDE_CLOUD_STATE_DIR_DEFAULT}
case "$STATE" in /*) ;; *) STATE=$PWD/$STATE ;; esac   # absolute: the script changes directory below
CHALLENGE_SEC=${CLAUDE_CLOUD_WAKE_CHALLENGE_SEC:-60}
COMPOSER_SEC=${CLAUDE_CLOUD_WAKE_COMPOSER_SEC:-30}
LOCK_SEC=${CLAUDE_CLOUD_WAKE_LOCK_SEC:-300}
# The composer's label depends on the UI version and language (the Spanish "Instrucciones", or
# "↵ to send, ⌘↵ to queue"), so several locators are tried in order and the first one that takes the text
# wins. The two generic locators cover any UI language. CLAUDE_CLOUD_WAKE_COMPOSER forces one.
COMPOSERS=("${CLAUDE_CLOUD_WAKE_COMPOSER:-getByRole('textbox', { name: 'Instrucciones' })}" "getByRole('textbox').last()" "locator('[contenteditable=\"true\"]').last()")
COMPOSER=${COMPOSERS[0]}
# Enter sends and, with the session mid-turn, interrupts it; ⌘↵ puts the message in the queue
KEY=${CLAUDE_CLOUD_WAKE_KEY:-Meta+Enter}
LOGIN_RE='/login|/magic-link|accounts\.google\.com'
CHALLENGE_RE='just a moment|un momento|checking your browser|attention required'
DEFAULT_MESSAGE=${CLAUDE_CLOUD_WAKE_MESSAGE:-'Message from the coordinator, written from the web UI so this session gets the claude.ai connectors. Use ToolSearch to look for the connector your runbook names. If it appears, write the time and the tools you saw in the log file your runbook names, commit and push the log, and continue the runbook from the first unfinished step. If you already delivered and pushed, do nothing else. Do not split the output into parts.'}

CHECK=0
if [ "${1:-}" = "--check" ] || [ "${1:-}" = "--comprobar" ]; then CHECK=1; shift; URL=${1:-https://claude.ai/code}; MSG=""
else
  [ $# -ge 1 ] && [ $# -le 2 ] || { echo "Usage: wake.sh <session_url> [message] | wake.sh --check [url]" >&2; exit 1; }
  URL=$1; MSG=${2:-$DEFAULT_MESSAGE}
fi
case "$URL" in https://claude.ai/*) ;; *) echo "The URL must be under https://claude.ai/: $URL" >&2; exit 1 ;; esac

# The profile is required and has no fallback: a session under another claude.ai account would open the
# cloud session with the wrong account and fail silently.
claude_cloud_require_profile || exit 6
SESSION=$CLAUDE_CLOUD_PW_SESSION
PROFILE=$CLAUDE_CLOUD_PROFILE_DIR
LOCK=$CLAUDE_CLOUD_PROFILE_LOCK

SID=$(printf '%s' "$URL" | grep -o 'session_[A-Za-z0-9]*' | head -1); SID=${SID:-no-session}

claude_cloud_state_files "$STATE"
mkdir -p "$CC_WAKE_SHOTS" || exit 1
LOGF=$CC_WAKE_LOG
log() { echo "$(date -u +%FT%TZ) $SID $*" >> "$LOGF"; echo "$*" >&2; }

# playwright-cli binds the session to the working directory and writes its .playwright-cli/ snapshots there,
# so it always runs from one folder under the home, never from a repo or from the skill folder
PW_DIR=$HOME/.claude-cloud
mkdir -p "$PW_DIR" && cd "$PW_DIR" || exit 1

pw() { playwright-cli -s="$SESSION" "$@"; }
# --raw eval returns the value as JSON; this turns it into plain text
value() { pw --raw eval "$@" 2>/dev/null | python3 -c 'import json,sys
s = sys.stdin.read().strip()
try: v = json.loads(s)
except Exception: v = s
print(v if isinstance(v, str) else json.dumps(v))'; }
flat() { printf '%s' "$1" | tr -s '[:space:]' ' ' | sed -e 's/^ //' -e 's/ $//'; }

OPENED=0; LOCKED=0
cleanup() {
  [ "$OPENED" = 1 ] && pw close >/dev/null 2>&1
  [ "$LOCKED" = 1 ] && rm -f "$LOCK"
}
trap cleanup EXIT
trap 'log "interrupted"; exit 1' INT TERM

shot() { pw screenshot --filename="$CC_WAKE_SHOTS/$SID-$(date -u +%Y%m%dT%H%M%SZ)-$1.png" >/dev/null 2>&1; }

# 1 · lock: one browser at a time on the profile
end=$(( $(date +%s) + LOCK_SEC ))
while :; do
  if ( set -o noclobber; echo "$$ $(date +%s) $URL" > "$LOCK" ) 2>/dev/null; then LOCKED=1; break; fi
  other=$(awk '{print $1; exit}' "$LOCK" 2>/dev/null)
  if [ -n "$other" ] && ! kill -0 "$other" 2>/dev/null; then rm -f "$LOCK"; continue; fi   # orphan lock
  [ "$(date +%s)" -ge "$end" ] && { log "lock held by PID ${other:-?} after $LOCK_SEC s: not opening"; exit 5; }
  sleep 5
done

if playwright-cli list 2>/dev/null | grep -q -- "$SESSION"; then
  log "a browser with -s=$SESSION is already open outside this script (maybe the login window): not opening another"; exit 5
fi

# 2 · open with a window (Cloudflare stops headless)
log "opening $URL (headed)"
pw open "$URL" --profile="$PROFILE" --headed --browser=chrome >/dev/null 2>&1 || { log "open failed"; exit 1; }
OPENED=1

# 3 · Cloudflare challenge
end=$(( $(date +%s) + CHALLENGE_SEC )); title=""
while :; do
  title=$(value "document.title")
  if [ -n "$title" ] && ! printf '%s' "$title" | grep -E -i -q "$CHALLENGE_RE"; then break; fi
  [ "$(date +%s)" -ge "$end" ] && { shot challenge; log "challenge not passed after $CHALLENGE_SEC s (title: \"${title}\")"; exit 3; }
  sleep 5
done

# 4 · logged in?
href=$(value "location.href")
if printf '%s' "$href" | grep -E -q "$LOGIN_RE"; then
  shot login; log "the profile is not logged in ($href): log in once inside a headed Chrome window opened with $PROFILE"; exit 2
fi
if [ "$CHECK" = 1 ]; then log "check OK: title \"${title}\", $href"; exit 0; fi

# 4b · the "turn on notifications" dialog can cover the page: close it if present.
# Spanish labels first, then the English ones.
pw click "getByText('No me lo vuelvas a preguntar')" >/dev/null 2>&1 \
  || pw click "getByRole('button', { name: 'Ahora no' })" >/dev/null 2>&1 \
  || pw click "getByText(\"Don't ask again\")" >/dev/null 2>&1 \
  || pw click "getByRole('button', { name: 'Not now' })" >/dev/null 2>&1 \
  || true

# 5 · write in the composer (found by role: the ref changes on every load)
expected=$(flat "$MSG"); end=$(( $(date +%s) + COMPOSER_SEC )); written=""
while :; do
  for c in "${COMPOSERS[@]}"; do
    if pw fill "$c" "$MSG" >/dev/null 2>&1; then
      written=$(flat "$(value "el => el.innerText || el.value || ''" "$c")")
      if [ "$written" = "$expected" ]; then COMPOSER=$c; break 2; fi
    fi
  done
  [ "$(date +%s)" -ge "$end" ] && {
    shot composer
    if [ -z "$written" ]; then log "no composer appeared in $COMPOSER_SEC s with any of the locators ($href)"
    else log "the composer did not keep the requested text: \"${written:0:120}…\""; fi
    exit 4; }
  sleep 5
done

# 6 · send
pw press "$KEY" >/dev/null 2>&1 || { shot send; log "press $KEY failed"; exit 4; }
sleep 3
left=$(flat "$(value "el => el.innerText || el.value || ''" "$COMPOSER")")
shot sent
if [ -n "$left" ]; then log "$KEY sent, but the composer still has text (\"${left:0:80}…\"): check the screenshot"
else log "message sent (${#MSG} characters)"; fi
exit 0
