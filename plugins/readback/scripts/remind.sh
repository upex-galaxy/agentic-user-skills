#!/usr/bin/env bash
# UserPromptSubmit hook: reminds the model to write the spoken line,
# but only if this session has voice turned on.
# With no sentinel it prints nothing and the session behaves exactly as always.
set -uo pipefail

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

LANG_FILE="$DATA_DIR/sessions/$sid"
cat <<'MSG'
VOICE MODE is on for this session.

Answer exactly as you always would: same detail, same tables, same code, same
length. Do not shorten anything because voice is on.

In addition, close the reply with a single logical quote line starting with the
speaker emoji:

> 🔊 <two or three sentences, in the user's language>

That quote becomes audio, so write it for the ear, not the eye:
- No markdown, no backticks, no tables, no bullets, no code blocks.
- No raw paths or identifiers: say "the middleware", not `lib/auth/middleware.ts`.
- No spatial references: never "the table above" or "point 3" — the listener sees nothing.
- Tell the outcome and what comes next, not the procedure. It is what you would
  tell a colleague in passing.
- If the reply was trivial (a greeting, an "ok"), one short sentence is enough.
MSG
exit 0
