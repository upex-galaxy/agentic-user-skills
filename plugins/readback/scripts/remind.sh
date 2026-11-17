#!/usr/bin/env bash
# UserPromptSubmit hook: reminds the model to write the spoken line,
# but only if this session has voice turned on.
# With no sentinel it prints nothing and the session behaves exactly as always.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$HERE")}"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/readback-data}"
payload=$(cat)

sid=$(printf '%s' "$payload" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    d = {}
print(d.get("session_id") or d.get("sessionId") or "")
' 2>/dev/null)

[ -z "${sid:-}" ] && exit 0
[ -f "$DATA_DIR/sessions/$sid" ] || exit 0

# A failure the Stop hook recorded on the last reply: say it once, then forget it.
if [ -s "$DATA_DIR/notices/$sid" ]; then
  echo "READBACK STATUS (relay to the user in one short line, then continue as normal):"
  cat "$DATA_DIR/notices/$sid"
  echo
  rm -f "$DATA_DIR/notices/$sid"
fi

PERSONA="${READBACK_PERSONA:-${CLAUDE_PLUGIN_OPTION_PERSONA:-companion}}"
MODEL="${READBACK_EL_MODEL:-${CLAUDE_PLUGIN_OPTION_ELEVENLABS_MODEL:-eleven_flash_v2_5}}"
case "$PERSONA" in companion|sarcastic|serious|professional) ;; *) PERSONA=companion ;; esac

cat <<'MSG'
VOICE MODE is on for this session.

Answer exactly as you always would: same detail, same tables, same code, same
length. Do not shorten anything because voice is on.

In addition, close the reply with a single logical quote line starting with the
speaker emoji:

> 🔊 <two or three sentences, in the user's language>

That quote becomes audio. Keep it out of any code block and put nothing after it.

MSG
cat "$PLUGIN_ROOT/config/voice-style.txt" 2>/dev/null
echo
cat "$PLUGIN_ROOT/config/personas/$PERSONA.txt" 2>/dev/null
case "$MODEL" in
  eleven_v3*|eleven_v4*) echo; cat "$PLUGIN_ROOT/config/personas/_tags.txt" 2>/dev/null ;;
esac
exit 0
