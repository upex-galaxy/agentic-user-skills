#!/bin/bash
# Deprecated alias kept for existing callers: cola.sh was renamed to queue.sh.
echo "deprecated: cola.sh is now queue.sh" >&2
exec bash "$(cd "$(dirname "$0")" && pwd)/queue.sh" "$@"
