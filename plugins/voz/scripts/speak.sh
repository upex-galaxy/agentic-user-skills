#!/usr/bin/env bash
# Stop hook: speaks the marked line of the last message, if this session has voice on.
# Never fails outward: any problem ends in silence, with exit 0.
#
# Providers (VOZ_PROVIDER):
#   kokoro      local, free, OpenAI-compatible endpoint. Default.
#   elevenlabs  cloud, paid.
# A failing provider falls back to kokoro: a worse voice beats no voice.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$HERE")}"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/voz-data}"
LOCKDIR="$DATA_DIR/speak.lock.d"

# Values come from the plugin's userConfig, exported by Claude Code as
# CLAUDE_PLUGIN_OPTION_*. The VOZ_* variables override them for local testing.
PROVIDER="${VOZ_PROVIDER:-${CLAUDE_PLUGIN_OPTION_PROVIDER:-kokoro}}"
export KOKORO_URL="${VOZ_KOKORO_URL:-${CLAUDE_PLUGIN_OPTION_KOKORO_URL:-http://127.0.0.1:8880}}"
export VOICE="${VOZ_VOICE:-${CLAUDE_PLUGIN_OPTION_VOICE:-af_heart}}"
export SPEED="${VOZ_SPEED:-${CLAUDE_PLUGIN_OPTION_SPEED:-1.0}}"
export EL_VOICE_ID="${VOZ_EL_VOICE_ID:-${CLAUDE_PLUGIN_OPTION_ELEVENLABS_VOICE_ID:-}}"
export EL_MODEL="${VOZ_EL_MODEL:-eleven_flash_v2_5}"

mkdir -p "$DATA_DIR/sessions"
payload=$(cat)

[ "${VOZ_DEBUG:-0}" = "1" ] && printf '%s\n' "$payload" >> "$DATA_DIR/debug.log"

text=$(printf '%s' "$payload" | \
  VOZ_PLUGIN_ROOT="$PLUGIN_ROOT" VOZ_DATA_DIR="$DATA_DIR" \
  python3 "$PLUGIN_ROOT/scripts/extract.py" 2>/dev/null)
[ -z "${text:-}" ] && exit 0

# Pick a player for this OS. macOS has afplay; Linux usually one of these;
# Windows via Git Bash or WSL falls back to PowerShell.
reproducir() {
  local f="$1"
  if command -v afplay      >/dev/null 2>&1; then afplay "$f"
  elif command -v mpg123    >/dev/null 2>&1; then mpg123 -q "$f"
  elif command -v ffplay    >/dev/null 2>&1; then ffplay -nodisp -autoexit -loglevel quiet "$f"
  elif command -v paplay    >/dev/null 2>&1; then paplay "$f"
  elif command -v aplay     >/dev/null 2>&1; then aplay -q "$f"
  elif command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -c "(New-Object Media.SoundPlayer '$f').PlaySync()"
  else
    return 1
  fi
}

# Portable file size: BSD stat and GNU stat disagree on flags.
tamano() {
  stat -f%z "$1" 2>/dev/null || stat -c%s "$1" 2>/dev/null || echo 0
}

# All the heavy work goes behind: the hook returns control immediately.
(
  mp3="$(mktemp "${TMPDIR:-/tmp}/voz-XXXXXX")" || exit 0
  mv "$mp3" "$mp3.mp3" 2>/dev/null && mp3="$mp3.mp3"

  if [ "$PROVIDER" = "elevenlabs" ]; then
    key="${ELEVENLABS_API_KEY:-${CLAUDE_PLUGIN_OPTION_ELEVENLABS_API_KEY:-}}"
    if [ -z "$key" ] || [ -z "$EL_VOICE_ID" ]; then
      PROVIDER=kokoro
    else
      body=$(python3 -c '
import json, os, sys
print(json.dumps({"text": sys.argv[1], "model_id": os.environ["EL_MODEL"]}))' "$text") \
        || { rm -f "$mp3"; exit 0; }
      curl -sS -m 90 -X POST \
        "https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE_ID}?output_format=mp3_44100_128" \
        -H "xi-api-key: $key" -H 'Content-Type: application/json' \
        -d "$body" -o "$mp3" || { rm -f "$mp3"; exit 0; }
      # A tiny response is an error JSON, not audio: fall back.
      if [ "$(tamano "$mp3")" -lt 2000 ]; then
        cp "$mp3" "$DATA_DIR/elevenlabs-last-error.json" 2>/dev/null || true
        PROVIDER=kokoro
      fi
    fi
  fi

  if [ "$PROVIDER" = "kokoro" ]; then
    body=$(python3 -c '
import json, os, sys
print(json.dumps({"model": "kokoro", "input": sys.argv[1], "voice": os.environ["VOICE"],
                  "response_format": "mp3", "speed": float(os.environ["SPEED"])}))' "$text") \
      || { rm -f "$mp3"; exit 0; }
    curl -sS -m 90 -X POST "$KOKORO_URL/v1/audio/speech" \
      -H 'Content-Type: application/json' -d "$body" -o "$mp3" || { rm -f "$mp3"; exit 0; }
  fi

  [ -s "$mp3" ] || { rm -f "$mp3"; exit 0; }

  # Lock by mkdir: macOS ships no flock(1). Keeps two sessions from talking over
  # each other. A lock older than 5 minutes is dead and gets reclaimed.
  if [ -d "$LOCKDIR" ] && [ -n "$(find "$LOCKDIR" -maxdepth 0 -mmin +5 2>/dev/null)" ]; then
    rmdir "$LOCKDIR" 2>/dev/null || true
  fi
  for _ in $(seq 1 600); do
    if mkdir "$LOCKDIR" 2>/dev/null; then
      trap 'rmdir "$LOCKDIR" 2>/dev/null || true' EXIT
      break
    fi
    sleep 0.5
  done

  reproducir "$mp3" >/dev/null 2>&1 || true
  rm -f "$mp3"
) >/dev/null 2>&1 &

exit 0
