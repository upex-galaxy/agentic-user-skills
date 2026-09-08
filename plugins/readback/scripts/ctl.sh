#!/usr/bin/env bash
# Readback switch, per session.
# Usage: ctl.sh on|off|status|list|doctor|docs [session-id]
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$HERE")}"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/readback-data}"
S="$DATA_DIR/sessions"
mkdir -p "$S"

action="${1:-status}"
sid="${2:-}"

case "$action" in
  list|doctor|docs) ;;
  *)
    if [ -z "$sid" ]; then
      echo "missing session-id: ctl.sh $action <session-id>" >&2
      exit 2
    fi
    ;;
esac

PROVIDER="${READBACK_PROVIDER:-${CLAUDE_PLUGIN_OPTION_PROVIDER:-kokoro}}"
KOKORO_URL="${READBACK_KOKORO_URL:-${CLAUDE_PLUGIN_OPTION_KOKORO_URL:-http://127.0.0.1:8880}}"
VOICE="${READBACK_VOICE:-${CLAUDE_PLUGIN_OPTION_VOICE:-af_heart}}"

# --- helpers ---------------------------------------------------------------

motor_vivo() {
  case "$PROVIDER" in
    elevenlabs)
      [ -n "${ELEVENLABS_API_KEY:-${CLAUDE_PLUGIN_OPTION_ELEVENLABS_API_KEY:-}}" ] \
        && [ -n "${CLAUDE_PLUGIN_OPTION_ELEVENLABS_VOICE_ID:-${READBACK_EL_VOICE_ID:-}}" ]
      ;;
    *)
      curl -s -m 3 -o /dev/null "$KOKORO_URL/health" 2>/dev/null
      ;;
  esac
}

reproductor() {
  for p in afplay mpg123 ffplay paplay aplay powershell.exe; do
    if command -v "$p" >/dev/null 2>&1; then echo "$p"; return 0; fi
  done
  return 1
}

contar() { [ -f "$1" ] && grep -vc '^[[:space:]]*#\|^[[:space:]]*$' "$1" 2>/dev/null || echo 0; }

abrir() {
  local f="$1"
  if   command -v open     >/dev/null 2>&1; then open "$f"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$f"
  elif command -v explorer.exe >/dev/null 2>&1; then explorer.exe "$(cygpath -w "$f" 2>/dev/null || echo "$f")"
  else return 1
  fi
}

# --- actions ---------------------------------------------------------------

case "$action" in
  on)
    date -u +%Y-%m-%dT%H:%M:%SZ > "$S/$sid"
    echo "READBACK ON for this session."
    echo "  provider: $PROVIDER    voice: $VOICE"

    # Say now what would otherwise be silence later.
    if ! motor_vivo; then
      echo
      if [ "$PROVIDER" = "elevenlabs" ]; then
        echo "  WARNING: ElevenLabs is selected but the API key or voice id is missing."
        echo "  Set them in /plugin -> readback -> Configure, or switch PROVIDER to kokoro."
      else
        echo "  WARNING: no speech engine answering at $KOKORO_URL."
        echo "  Nothing will be spoken until one is running. To install a local one"
        echo "  (about two minutes, ~150 MB of RAM when idle):"
        echo
        echo "      uvx voice-mode-install --yes"
        echo "      voicemode service install kokoro"
        echo
        echo "  Any OpenAI-compatible /v1/audio/speech server works; point KOKORO_URL"
        echo "  at it in /plugin -> readback -> Configure."
      fi
    fi

    if ! reproductor >/dev/null; then
      echo
      echo "  WARNING: no audio player found."
      echo "  Install one of: mpg123, ffplay, paplay, aplay."
    fi

    echo
    echo "  Takes effect on your NEXT message."
    ;;

  off)
    rm -f "$S/$sid"
    echo "READBACK OFF for this session."
    ;;

  status)
    if [ -f "$S/$sid" ]; then
      echo "READBACK ON (since $(cat "$S/$sid"))"
      motor_vivo || echo "  WARNING: no engine answering. Run /readback:speak doctor"
    else
      echo "READBACK OFF"
    fi
    ;;

  list)
    n=$(ls -1 "$S" 2>/dev/null | wc -l | tr -d ' ')
    echo "sessions with readback on: $n"
    ls -1 "$S" 2>/dev/null | sed 's/^/  /'
    ;;

  doctor)
    echo "provider:     $PROVIDER"
    echo "plugin root:  $PLUGIN_ROOT"
    echo "data dir:     $DATA_DIR"
    echo
    printf '  %-13s' "engine"
    if motor_vivo; then
      if [ "$PROVIDER" = elevenlabs ]; then echo "OK         credentials present"
      else echo "OK         $KOKORO_URL   voice=$VOICE"; fi
    else
      if [ "$PROVIDER" = elevenlabs ]; then echo "NOT READY  missing key or voice id"
      else echo "NOT READY  nothing at $KOKORO_URL"; fi
    fi
    printf '  %-13s' "player"
    reproductor || echo "NONE FOUND"
    printf '  %-13s' "rules"
    echo "$(( $(contar "$PLUGIN_ROOT/config/pronunciation.txt") + $(contar "$DATA_DIR/pronunciation.txt") ))"
    echo "                 base:  $PLUGIN_ROOT/config/pronunciation.txt"
    echo "                 yours: $DATA_DIR/pronunciation.txt $([ -f "$DATA_DIR/pronunciation.txt" ] || echo '(not created yet)')"
    printf '  %-13s' "sessions on"
    ls -1 "$S" 2>/dev/null | wc -l | tr -d ' '
    ;;

  docs)
    doc="$PLUGIN_ROOT/docs/index.html"
    if [ ! -f "$doc" ]; then
      echo "documentation not found at $doc" >&2
      exit 1
    fi
    if abrir "$doc"; then
      echo "Opened the readback documentation in your browser."
    else
      echo "Could not open a browser. The file is at:"
      echo "  $doc"
    fi
    ;;

  *)
    echo "actions: on | off | status | list | doctor | docs" >&2
    exit 2
    ;;
esac
