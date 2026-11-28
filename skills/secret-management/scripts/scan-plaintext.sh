#!/usr/bin/env bash
# scan-plaintext.sh: list file:KEY pairs that look like plaintext secrets in a folder.
#
# Prints key NAMES only. A value is never printed, logged or put in an error message.
# Usage: bash scan-plaintext.sh [folder]      (default: current folder)
# Exit:  0 nothing found, 1 something found, 2 bad usage.
# Works on bash 3.2 and BSD tools (macOS). Reads files; changes nothing.
#
# Output lines:
#   path/to/file:KEY                   key name looks like a secret and has a value
#   path/to/file:KEY [token-shape]     value starts like a known token prefix (any key name)
#
# It skips: op:// references, ${...} and $(...) placeholders, empty values, comment lines,
# .example/.sample/.template/.dist files, and the .git, node_modules, .venv and vendor folders.
# It reads only config-style files, so it misses secrets in source code. Review the list by hand.

set -u

dir="${1:-.}"
if [ ! -d "$dir" ]; then
  echo "usage: bash scan-plaintext.sh [folder]" >&2
  exit 2
fi

tmp="$(mktemp 2>/dev/null || echo "${TMPDIR:-/tmp}/scan-plaintext.$$")"
trap 'rm -f "$tmp"' EXIT

find "$dir" \( -name .git -o -name node_modules -o -name .venv -o -name vendor \) -prune -o \
  -type f \( -name '.env' -o -name '.env.*' -o -name '*.env' -o -name '*.properties' \
  -o -name '*.ini' -o -name '*.cfg' -o -name '*.conf' -o -name '*.yml' -o -name '*.yaml' \
  -o -name '*.toml' -o -name 'appsettings*.json' -o -name 'secrets*.json' \) -print 2>/dev/null |
while IFS= read -r f; do
  case "$f" in
    *.example|*.sample|*.template|*.dist) continue ;;
  esac
  awk -v F="$f" '
    {
      line = $0
      sub(/^[ \t]+/, "", line)
      if (line == "" || line ~ /^#/ || line ~ /^\/\// || line ~ /^;/) next
      sub(/^export[ \t]+/, "", line)
      sub(/^["\x27]/, "", line)
      if (!match(line, /^[A-Za-z0-9_.-]+/)) next
      key = substr(line, 1, RLENGTH)
      rest = substr(line, RLENGTH + 1)
      sub(/^["\x27]/, "", rest)
      sub(/^[ \t]*/, "", rest)
      c = substr(rest, 1, 1)
      if (c != "=" && c != ":") next
      val = substr(rest, 2)
      sub(/^[ \t]+/, "", val)
      sub(/^["\x27]/, "", val)
      sub(/[ \t,]+$/, "", val)
      if (val == "") next
      if (val ~ /^op:\/\//) next
      if (val ~ /^\$\{/ || val ~ /^\$\(/) next
      lk = tolower(key)
      name_hit = (lk ~ /(secret|token|passw|pwd|api[_.-]?key|private[_.-]?key|access[_.-]?key|credential|connection[_.-]?string|auth[_.-]?key)/)
      shape_hit = (val ~ /^(ghp_|gho_|ghu_|ghs_|github_pat_|sk-|xox[abp]-|AKIA|eyJ|ops_)/)
      if (shape_hit) print F ":" key " [token-shape]"
      else if (name_hit) print F ":" key
    }
  ' "$f"
done > "$tmp"

if [ -s "$tmp" ]; then
  sort -u "$tmp"
  exit 1
fi
exit 0
