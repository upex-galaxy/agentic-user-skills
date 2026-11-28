#!/bin/bash
# Deprecated alias kept for existing callers: armar.sh was renamed to assemble.sh.
echo "deprecated: armar.sh is now assemble.sh" >&2
exec bash "$(cd "$(dirname "$0")" && pwd)/assemble.sh" "$@"
