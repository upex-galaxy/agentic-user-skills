#!/bin/bash
# launch.sh <unit> [<unit>...]
# Launches one Claude Code cloud session per unit, on its branch <CLAUDE_CLOUD_BRANCH_PREFIX><unit>.
# `claude --cloud` needs a TTY: `script -q` provides one and leaves the output in a log.
# The session clones the remote on the branch the worktree is on, so the branch must be pushed.
# As soon as it has the URL, it writes it to sessions.txt and calls wake.sh: a message written from the
# claude.ai web UI is what attaches the connectors (Loom, for example) to the session; `claude --cloud`
# does not.
#
# sessions.txt (`unit url epoch`) is the fleet's durable record. Never delete or hand-edit it: it is what
# lets you resume a session from claude.ai/code days later.
#
# Variables (the required ones have no default):
#   CLAUDE_CLOUD_STATE_DIR        required. Fleet state folder: sessions.txt and launches/<unit>.log.
#                                 Keep it outside the worktree, which switches branches. A new folder per fleet.
#   CLAUDE_CLOUD_RUNBOOK          required. Path of the runbook INSIDE the branch (the session reads it from its clone).
#   CLAUDE_CLOUD_PLAYWRIGHT_PROFILE  required while waking is on (see wake.sh). Checked before any session is created.
#   CLAUDE_CLOUD_WORKTREE         worktree that switches branches to launch. Default: $HOME/.claude-cloud/worktrees/<repo-name>
#                                 (worktree.sh up creates it)
#   CLAUDE_CLOUD_BRANCH_PREFIX    branch prefix. Default: fleet/
#   CLAUDE_CLOUD_TASK             first sentence of the prompt. Default: "Cloud work for unit"
#   CLAUDE_CLOUD_EXTRA            one more sentence for the prompt (a warning from the pilot, for example). Default: empty
#   CLAUDE_CLOUD_PROMPT_FILE      file with the full prompt; {UNIT}, {BRANCH} and {RUNBOOK} are replaced
#                                 ({UNIDAD} and {RAMA} still work). When the file exists, it wins over the default
#   CLAUDE_CLOUD_RETURN_REF       branch or commit the worktree returns to at the end (detached).
#                                 Default: the remote default branch (origin/HEAD), or origin/main
#   CLAUDE_CLOUD_PERMISSION_MODE  session permission mode. Default: auto (--permission-mode reaches the
#                                 session only when it comes BEFORE --cloud)
#   CLAUDE_CLOUD_WAKE             0 = do not call wake.sh after creating the session. Default: 1
#   CLAUDE_CLOUD_WAKE_MESSAGE     message for wake.sh. Default: the one in wake.sh (see its header)
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
source "$HERE/defaults.sh"
[ $# -gt 0 ] || { echo "Usage: launch.sh <unit> [<unit>...]" >&2; exit 2; }
: "${CLAUDE_CLOUD_STATE_DIR:?CLAUDE_CLOUD_STATE_DIR is required (fleet state folder)}"
: "${CLAUDE_CLOUD_RUNBOOK:?CLAUDE_CLOUD_RUNBOOK is required (runbook path inside the branch)}"
W=${CLAUDE_CLOUD_WORKTREE:-$CLAUDE_CLOUD_WORKTREE_DEFAULT}
[ -n "$W" ] || { echo "CLAUDE_CLOUD_WORKTREE is required (you are not in a git repo)" >&2; exit 2; }
P=${CLAUDE_CLOUD_BRANCH_PREFIX:-fleet/}
TASK=${CLAUDE_CLOUD_TASK:-Cloud work for unit}
EXTRA=${CLAUDE_CLOUD_EXTRA:-}
RETURN_REF=${CLAUDE_CLOUD_RETURN_REF:-$CLAUDE_CLOUD_RETURN_REF_DEFAULT}
MODE=${CLAUDE_CLOUD_PERMISSION_MODE:-auto}
WAKE=${CLAUDE_CLOUD_WAKE:-1}
# Fail before creating any session: a session that cannot be woken never gets its connectors.
if [ "$WAKE" != 0 ]; then claude_cloud_require_profile || exit 6; fi
STATE=$CLAUDE_CLOUD_STATE_DIR
claude_cloud_state_files "$STATE"
L=$CC_LAUNCHES; S=$CC_SESSIONS
mkdir -p "$L"
[ -s "$S" ] || echo "# unit url epoch · durable fleet record: never delete it (it is how you resume sessions by hand)" >> "$S"
cd "$W" || { echo "The worktree $W does not exist" >&2; exit 1; }
git fetch -q origin

prompt_for() {  # $1 unit, $2 branch
  if [ -n "${CLAUDE_CLOUD_PROMPT_FILE:-}" ] && [ -f "$CLAUDE_CLOUD_PROMPT_FILE" ]; then
    sed -e "s|{UNIT}|$1|g" -e "s|{BRANCH}|$2|g" -e "s|{UNIDAD}|$1|g" -e "s|{RAMA}|$2|g" \
        -e "s|{RUNBOOK}|$CLAUDE_CLOUD_RUNBOOK|g" "$CLAUDE_CLOUD_PROMPT_FILE"
    return
  fi
  printf '%s %s. You are on branch %s. Read ALL of %s and follow it to the letter (the unit is %s). %s Time every step. Commit and push ONLY to branch %s (switch to it if you start on another one; if it already has work from an earlier session, continue from there), with the exact trailers the runbook asks for and no attribution to Claude and no Co-Authored-By. Work without asking questions: nobody will answer.' \
    "$TASK" "$1" "$2" "$CLAUDE_CLOUD_RUNBOOK" "$1" "$EXTRA" "$2"
}

for u in "$@"; do
  branch="$P$u"
  if ! git rev-parse -q --verify "origin/$branch" >/dev/null; then echo "$u: no branch origin/$branch"; continue; fi
  git switch -q "$branch" 2>/dev/null || git switch -q -c "$branch" "origin/$branch" || { echo "$u: could not switch to $branch"; continue; }
  git merge -q --ff-only "origin/$branch" 2>/dev/null
  log="$L/$u.log"
  # earlier attempts keep their logs; the legacy .intentoN name is counted too so numbers never repeat
  [ -f "$log" ] && mv "$log" "$L/$u.attempt$(ls "$L/$u".attempt*.log "$L/$u".intento*.log 2>/dev/null | wc -l | tr -d ' ' | awk '{print $1+1}').log"
  p=$(prompt_for "$u" "$branch")
  (script -q "$log" claude --permission-mode "$MODE" --cloud "$p" </dev/null >/dev/null 2>&1 &)
  # "Created cloud session" is the Claude Code CLI's own output; do not translate it
  for _ in $(seq 1 30); do sleep 3; grep -a -q "Created cloud session" "$log" 2>/dev/null && break; done
  url=$(LC_ALL=C tr -d '\r' < "$log" 2>/dev/null | grep -a -o 'https://claude.ai/code/session_[A-Za-z0-9]*' | head -1)
  [ -n "$url" ] || echo "$u: no URL after 90 s, see $log" >&2
  echo "$u ${url:-NO-URL} $(date +%s)" | tee -a "$S"
  if [ -n "$url" ] && [ "$WAKE" != 0 ]; then
    # in a subshell; this script is standing in the branches worktree
    ( CLAUDE_CLOUD_STATE_DIR="$STATE" bash "$HERE/wake.sh" "$url" ${CLAUDE_CLOUD_WAKE_MESSAGE:+"$CLAUDE_CLOUD_WAKE_MESSAGE"} ) >> "$L/$u.wake.log" 2>&1
    rc=$?
    echo "$u wake=$rc (0 sent, 2 not logged in, 3 Cloudflare, 4 no composer, 5 lock, 6 no profile; detail in $CC_WAKE_LOG)"
    [ "$rc" = 2 ] && echo "$u: the profile $CLAUDE_CLOUD_PROFILE_DIR is not logged in. The user logs in once inside a headed Chrome window opened with that profile" >&2
  fi
done
git switch -q --detach "$RETURN_REF"
