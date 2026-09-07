#!/usr/bin/env bash
# Voice switch, per session. Usage: ctl.sh on|off|status|list|doctor <session-id>
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$HERE")}"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/voz-data}"
S="$DATA_DIR/sessions"
mkdir -p "$S"

action="${1:-status}"
sid="${2:-}"

if [ "$action" != "list" ] && [ "$action" != "doctor" ] && [ -z "$sid" ]; then
  echo "missing session-id: ctl.sh $action <session-id>" >&2
  exit 2
fi

PROVIDER="${VOZ_PROVIDER:-${CLAUDE_PLUGIN_OPTION_PROVIDER:-kokoro}}"
KOKORO_URL="${VOZ_KOKORO_URL:-${CLAUDE_PLUGIN_OPTION_KOKORO_URL:-http://127.0.0.1:8880}}"
VOICE="${VOZ_VOICE:-${CLAUDE_PLUGIN_OPTION_VOICE:-af_heart}}"

case "$action" in
  on)
    date -u +%Y-%m-%dT%H:%M:%SZ > "$S/$sid"
    echo "VOICE ON for $sid"
    echo "provider: $PROVIDER   voice: $VOICE"
    echo "Takes effect on your NEXT message (the reminder is injected on prompt submit)."
    ;;
  off)
    rm -f "$S/$sid"
    echo "VOICE OFF for $sid"
    ;;
  status)
    if [ -f "$S/$sid" ]; then echo "VOICE ON (since $(cat "$S/$sid"))"; else echo "VOICE OFF"; fi
    ;;
  list)
    echo "sessions with voice on: $(ls -1 "$S" 2>/dev/null | wc -l | tr -d ' ')"
    ls -1 "$S" 2>/dev/null | sed 's/^/  /'
    ;;
  doctor)
    echo "PROVIDER: $PROVIDER"
    echo "PLUGIN_ROOT: $PLUGIN_ROOT"
    echo "DATA_DIR: $DATA_DIR"
    echo
    printf '%-12s ' "kokoro"
    if curl -s -m 3 -o /dev/null "$KOKORO_URL/health" 2>/dev/null; then
      echo "OK    $KOKORO_URL   voice=$VOICE"
    else
      echo "DOWN  $KOKORO_URL"
    fi
    printf '%-12s ' "elevenlabs"
    if [ -n "${ELEVENLABS_API_KEY:-${CLAUDE_PLUGIN_OPTION_ELEVENLABS_API_KEY:-}}" ]; then
      echo "key present"
    else
      echo "no key"
    fi
    printf '%-12s ' "player"
    for p in afplay mpg123 ffplay paplay aplay powershell.exe; do
      if command -v "$p" >/dev/null 2>&1; then echo "$p"; break; fi
    done
    echo
    base="$PLUGIN_ROOT/config/pronunciation.txt"
    extra="$DATA_DIR/pronunciation.txt"
    contar() { [ -f "$1" ] && grep -vc '^[[:space:]]*#\|^[[:space:]]*$' "$1" 2>/dev/null || echo 0; }
    echo "pronunciation rules: $(( $(contar "$base") + $(contar "$extra") ))"
    echo "  base:  $base"
    echo "  yours: $extra $([ -f "$extra" ] || echo '(not created yet)')"
    echo "sessions with voice on: $(ls -1 "$S" 2>/dev/null | wc -l | tr -d ' ')"
    ;;
  *)
    echo "actions: on | off | status | list | doctor" >&2
    exit 2
    ;;
esac
