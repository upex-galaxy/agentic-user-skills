#!/usr/bin/env bash
# Append one decision row to a TSV log.
# Usage: log.sh <logfile> <phase> <decision> <why> <evidence> <result>
set -euo pipefail

if [ "$#" -ne 6 ]; then
  echo "usage: log.sh <logfile> <phase> <decision> <why> <evidence> <result>" >&2
  exit 2
fi

logfile="$1"
shift

# One line per cell: tabs and newlines become spaces. A leading = + - @ would
# turn the cell into a spreadsheet formula, so prefix it with a single quote.
clean() {
  local cell
  cell="$(printf '%s' "$1" | tr '\t\r\n' '   ')"
  case "$cell" in
    =* | +* | -* | @*) cell="'$cell" ;;
  esac
  printf '%s' "$cell"
}

if [ ! -s "$logfile" ]; then
  printf 'ts\tphase\tdecision\twhy\tevidence\tresult\n' >"$logfile"
fi

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
  "$ts" "$(clean "$1")" "$(clean "$2")" "$(clean "$3")" "$(clean "$4")" "$(clean "$5")" >>"$logfile"
