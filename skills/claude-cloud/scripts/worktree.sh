#!/usr/bin/env bash
# Lifecycle of the detached worktree that launch.sh, queue.sh and watch.sh switch between branches.
# Rule: it exists ONLY while a fleet is running. `up` before launching, `down` when closing, `status` to look.
#   up      creates it, or refreshes it to the remote tip; prints the exports you need to run
#   down    removes it; refuses if it is dirty or if queue.sh/watch.sh are still running (never forces)
#   status  exists / commit / size / dirty
# Variables:
#   CLAUDE_CLOUD_REPO_ROOT    main checkout of the repo. Default: the one of the current directory (even from inside a worktree)
#   CLAUDE_CLOUD_WORKTREE     worktree path. Default: $HOME/.claude-cloud/worktrees/<repo-name>
#   CLAUDE_CLOUD_RETURN_REF   ref it stays on, detached. Default: the remote default branch (origin/HEAD), or origin/main
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/defaults.sh"
ROOT=${CLAUDE_CLOUD_REPO_ROOT:-$CLAUDE_CLOUD_REPO_ROOT_DEFAULT}
[ -n "$ROOT" ] || { echo "You are not in a git repo: set CLAUDE_CLOUD_REPO_ROOT" >&2; exit 1; }
W=${CLAUDE_CLOUD_WORKTREE:-$CLAUDE_CLOUD_WORKTREE_DEFAULT}
BASE=${CLAUDE_CLOUD_RETURN_REF:-$(git -C "$ROOT" symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null || echo origin/main)}
exists() { git -C "$ROOT" worktree list --porcelain | grep -qx "worktree $W"; }
case "${1:-status}" in
  up)
    git -C "$ROOT" fetch -q origin
    if exists; then git -C "$W" checkout -q --detach "$BASE"; echo "refreshed $W at $(git -C "$W" rev-parse --short HEAD)"
    else git -C "$ROOT" worktree prune; mkdir -p "$(dirname "$W")"; git -C "$ROOT" worktree add --detach "$W" "$BASE"; echo "created $W"; fi
    echo "export CLAUDE_CLOUD_WORKTREE=$W CLAUDE_CLOUD_RETURN_REF=$BASE" ;;
  down)
    if ! exists; then echo "no worktree at $W"; git -C "$ROOT" worktree prune; exit 0; fi
    [ -z "$(git -C "$W" status --porcelain)" ] || { echo "REFUSED: $W has uncommitted changes" >&2; exit 2; }
    # the deprecated cola.sh/vigilar.sh names are matched too, for a fleet started before the rename
    if pgrep -f "claude-cloud/scripts/(queue|watch|cola|vigilar)\.sh" >/dev/null 2>&1; then echo "REFUSED: queue.sh or watch.sh is still running" >&2; exit 3; fi
    git -C "$ROOT" worktree remove "$W"; git -C "$ROOT" worktree prune; echo "removed $W" ;;
  status)
    if exists; then echo "exists: $W  commit $(git -C "$W" rev-parse --short HEAD)  size $(du -sh "$W" | cut -f1)  dirty=$([ -n "$(git -C "$W" status --porcelain)" ] && echo yes || echo no)"
    else echo "absent: $W"; fi ;;
  *) echo "usage: worktree.sh up|down|status" >&2; exit 1 ;;
esac
