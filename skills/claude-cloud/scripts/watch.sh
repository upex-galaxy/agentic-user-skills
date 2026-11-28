#!/bin/bash
# watch.sh <already_delivered>
# Exits as soon as the number of <CLAUDE_CLOUD_BRANCH_PREFIX>* branches with a delivery (a file that matches
# CLAUDE_CLOUD_DELIVERY_PATTERN) goes above <already_delivered>, and prints which ones. Use it to wake up
# the coordinating session: run it in the background and move on to something else.
#
# Variables:
#   CLAUDE_CLOUD_BRANCH_PREFIX     branch prefix. Default: fleet/
#   CLAUDE_CLOUD_DELIVERY_PATTERN  regex (grep -E) of the file that proves delivery.
#                                  Default: (^|/)(delivery|entrega)\.json$ (the last step of templates/runbook.md writes delivery.json)
#   CLAUDE_CLOUD_REPO              repo to fetch in. Default: CLAUDE_CLOUD_WORKTREE or $HOME/.claude-cloud/worktrees/<repo-name>
#   CLAUDE_CLOUD_POLL_SEC          seconds between rounds. Default: 180
#   CLAUDE_CLOUD_MAX_POLLS         rounds before giving up. Default: 100 (5 h with the default poll)
set -u
source "$(cd "$(dirname "$0")" && pwd)/defaults.sh"
P=${CLAUDE_CLOUD_BRANCH_PREFIX:-fleet/}
PATTERN=${CLAUDE_CLOUD_DELIVERY_PATTERN:-$CLAUDE_CLOUD_DELIVERY_PATTERN_DEFAULT}
R=${CLAUDE_CLOUD_REPO:-${CLAUDE_CLOUD_WORKTREE:-$CLAUDE_CLOUD_WORKTREE_DEFAULT}}
[ -n "$R" ] || { echo "CLAUDE_CLOUD_REPO or CLAUDE_CLOUD_WORKTREE is required" >&2; exit 2; }
POLL=${CLAUDE_CLOUD_POLL_SEC:-180}
MAX_POLLS=${CLAUDE_CLOUD_MAX_POLLS:-100}
prev=${1:-0}
n=0
for _ in $(seq 1 "$MAX_POLLS"); do
  git -C "$R" fetch -q origin "refs/heads/$P*:refs/remotes/origin/$P*" 2>/dev/null
  n=0; ready=""
  for b in $(git -C "$R" for-each-ref --format='%(refname:short)' "refs/remotes/origin/$P"); do
    if git -C "$R" ls-tree -r --name-only "$b" | grep -E -q "$PATTERN"; then
      n=$((n + 1)); ready="$ready ${b#origin/$P}"
    fi
  done
  if [ "$n" -gt "$prev" ]; then echo "delivered=$n at $(date -u +%FT%TZ):$ready"; exit 0; fi
  sleep "$POLL"
done
echo "no new deliveries after $MAX_POLLS rounds (delivered=$n)"
exit 1
