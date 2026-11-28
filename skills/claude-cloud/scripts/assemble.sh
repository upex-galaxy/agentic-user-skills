#!/bin/bash
# assemble.sh <unit> <destination>
# Rebuilds, from the remote branch <CLAUDE_CLOUD_BRANCH_PREFIX><unit>, every file delivered in chunks
# (<path>/<name>.part-NN plus <path>/<name>.sha256) and checks the hash, without switching branches.
# Leaves <destination>/<name>. Assemble each file only when you are about to use it and delete it
# afterwards: the disk fills up fast, in the destination and in .git.
#
# Variables:
#   CLAUDE_CLOUD_BRANCH_PREFIX  branch prefix. Default: fleet/
#   CLAUDE_CLOUD_REPO           repo with the branches. Default: CLAUDE_CLOUD_WORKTREE or $HOME/.claude-cloud/worktrees/<repo-name>
set -u
source "$(cd "$(dirname "$0")" && pwd)/defaults.sh"
[ $# -eq 2 ] || { echo "Usage: assemble.sh <unit> <destination>" >&2; exit 2; }
P=${CLAUDE_CLOUD_BRANCH_PREFIX:-fleet/}
R=${CLAUDE_CLOUD_REPO:-${CLAUDE_CLOUD_WORKTREE:-$CLAUDE_CLOUD_WORKTREE_DEFAULT}}
[ -n "$R" ] || { echo "CLAUDE_CLOUD_REPO or CLAUDE_CLOUD_WORKTREE is required" >&2; exit 2; }
ref="origin/$P$1"; dest=$2
mkdir -p "$dest" || exit 1
git -C "$R" fetch -q origin "refs/heads/$P$1:refs/remotes/$ref" || { echo "Could not fetch $ref" >&2; exit 1; }
sums=$(git -C "$R" ls-tree -r --name-only "$ref" | grep -E '\.sha256$')
[ -n "$sums" ] || { echo "$ref has no .sha256 file: nothing was delivered in chunks" >&2; exit 1; }
failures=0
while IFS= read -r sum; do
  base=${sum%.sha256}; name=$(basename "$base"); out="$dest/$name"
  # two deliveries with the same name on the branch (a relaunched session leaves its own in another
  # folder): the second one gets its folder name in front, so it does not overwrite the first
  case " ${done_files:-} " in *" $out "*) out="$dest/$(basename "$(dirname "$(dirname "$base")")")-$name" ;; esac
  done_files="${done_files:-} $out"
  parts=$(git -C "$R" ls-tree -r --name-only "$ref" | grep -E "^$(printf '%s' "$base" | sed 's/[.[\*^$]/\\&/g')\.part-[0-9]+$" | sort)
  [ -n "$parts" ] || { echo "$name: no chunks" >&2; failures=$((failures + 1)); continue; }
  : > "$out"
  while IFS= read -r p; do git -C "$R" show "${ref}:${p}" >> "$out"; done <<< "$parts"
  expected=$(git -C "$R" show "${ref}:${sum}" | awk '{print $1}')
  actual=$(shasum -a 256 "$out" | awk '{print $1}')
  if [ "$expected" = "$actual" ]; then
    echo "OK $out ($(echo "$parts" | wc -l | tr -d ' ') chunks, $(du -h "$out" | awk '{print $1}'))"
  else
    echo "HASH MISMATCH $out: expected $expected, actual $actual" >&2; failures=$((failures + 1))
  fi
done <<< "$sums"
exit "$failures"
