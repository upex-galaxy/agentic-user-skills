#!/bin/bash
# Deprecated alias kept for existing callers: lanzar.sh was renamed to launch.sh.
echo "deprecated: lanzar.sh is now launch.sh" >&2
exec bash "$(cd "$(dirname "$0")" && pwd)/launch.sh" "$@"
