#!/bin/bash
# Deprecated alias kept for existing callers: vigilar.sh was renamed to watch.sh.
echo "deprecated: vigilar.sh is now watch.sh" >&2
exec bash "$(cd "$(dirname "$0")" && pwd)/watch.sh" "$@"
