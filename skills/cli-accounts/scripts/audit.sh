#!/usr/bin/env bash
# Checks that every work repo, worktree and Orca folder resolves the work
# profile, and that $HOME resolves none of it. Prints variable names only.
# Usage: audit.sh [path/to/profile/.envrc]
#        audit.sh --config    print the settings in effect and exit
#        audit.sh --help
# Settings, each taken from the environment, then from the config file, then from the default:
#   CLI_ACCOUNTS_WORK_DIR    folder with the work repos and the profile (.envrc). ~/Desktop/projects/work
#   ORCA_ROOT                Orca worktree dir. ~/orca/workspaces
#   CLI_ACCOUNTS_GITCONFIG   work git config (reported by --config). ~/.gitconfig-work
#   CLI_ACCOUNTS_CLAUDE_DIR  work Claude Code config dir (reported by --config). ~/.claude-work
# Config file: ~/.cli-accounts/config (CLI_ACCOUNTS_CONFIG points elsewhere). KEY=VALUE lines, never executed.
set -uo pipefail

config=${CLI_ACCOUNTS_CONFIG:-$HOME/.cli-accounts/config}
setting() {  # $1 name, $2 default
  local v=${!1:-}
  if [ -z "$v" ] && [ -f "$config" ]; then
    v=$(sed -n "s/^[[:space:]]*$1=//p" "$config" | tail -n 1 | tr -d '\r' |
      sed -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/")
    case "$v" in
      '~/'*) v=$HOME/${v#??} ;;
      '$HOME/'*) v=$HOME/${v#??????} ;;
    esac
  fi
  printf '%s\n' "${v:-$2}"
}

work_dir=$(setting CLI_ACCOUNTS_WORK_DIR "$HOME/Desktop/projects/work")
orca_root=$(setting ORCA_ROOT "$HOME/orca/workspaces")

case "${1:-}" in
  -h|--help) sed -n '2,/^set /p' "$0" | sed -e '$d' -e 's/^# \{0,1\}//'; exit 0 ;;
  --config)
    echo "config file: $config$([ -f "$config" ] || echo ' (absent, defaults apply)')"
    echo "CLI_ACCOUNTS_WORK_DIR=$work_dir"
    echo "ORCA_ROOT=$orca_root"
    echo "CLI_ACCOUNTS_GITCONFIG=$(setting CLI_ACCOUNTS_GITCONFIG "$HOME/.gitconfig-work")"
    echo "CLI_ACCOUNTS_CLAUDE_DIR=$(setting CLI_ACCOUNTS_CLAUDE_DIR "$HOME/.claude-work")"
    exit 0 ;;
esac

profile=${1:-$work_dir/.envrc}
[ -f "$profile" ] || { echo "no profile at $profile (set CLI_ACCOUNTS_WORK_DIR in $config)" >&2; exit 2; }
root=$(cd "$(dirname "$profile")" && pwd -P)

vars=$(sed -n 's/^export \([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' "$profile")
[ -n "$vars" ] || { echo "the profile exports nothing" >&2; exit 2; }
pattern="^($(echo $vars | tr ' ' '|'))="

# Start from a clean environment so nothing inherited from this shell counts.
clean=()
for v in $vars DIRENV_DIR DIRENV_DIFF DIRENV_FILE DIRENV_WATCHES; do clean+=(-u "$v"); done
resolve() { env "${clean[@]}" direnv exec "$1" env 2>/dev/null | grep -E "$pattern" | sort; }

expected=$(resolve "$root")
if [ "$(printf '%s\n' "$expected" | grep -c .)" -ne "$(printf '%s\n' $vars | sort -u | grep -c .)" ]; then
  echo "FAIL  the profile does not load in $root (run: direnv allow '$root')"
  exit 1
fi

folders() {
  echo "$root"
  for repo in "$root"/*/; do
    repo=${repo%/}
    [ -e "$repo/.git" ] || continue
    echo "$repo"
    git -C "$repo" worktree list --porcelain | sed -n 's/^worktree //p'
    echo "$orca_root/$(basename "$repo")"
  done
}

failed=0
while IFS= read -r dir; do
  if [ ! -d "$dir" ]; then
    echo "FAIL  $dir  (folder missing, so a worktree created there starts personal)"
    failed=1
    continue
  fi
  got=$(resolve "$dir")
  if [ "$got" = "$expected" ]; then
    echo "ok    $dir"
  else
    wrong=$(comm -23 <(printf '%s\n' "$expected") <(printf '%s\n' "$got") | cut -d= -f1 | tr '\n' ' ')
    echo "FAIL  $dir  (missing or different: $wrong)"
    failed=1
  fi
done < <(folders | sort -u)

leaked=$(resolve "$HOME" | cut -d= -f1 | tr '\n' ' ')
if [ -n "$leaked" ]; then
  echo "FAIL  $HOME resolves work variables: $leaked"
  failed=1
else
  echo "ok    $HOME resolves no work variables"
fi

echo "profile variables: $(echo $vars)"
exit $failed
