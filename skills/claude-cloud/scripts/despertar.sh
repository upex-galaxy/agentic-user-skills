#!/bin/bash
# Deprecated alias kept for existing callers: despertar.sh was renamed to wake.sh.
echo "deprecated: despertar.sh is now wake.sh" >&2
exec bash "$(cd "$(dirname "$0")" && pwd)/wake.sh" "$@"
