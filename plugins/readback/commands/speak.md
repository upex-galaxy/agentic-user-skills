---
description: Turn the spoken readback on or off for this session, or open its docs
argument-hint: "[on|off|status|list|doctor|docs]"
disable-model-invocation: true
---

# /readback:speak

Controls whether this session, on top of its normal text output, reads back a short
spoken summary at the end of each turn.

## Implementation

1. Find THIS session's id. It is the UUID-shaped segment of the scratchpad directory
   path in your system prompt.
2. Run, with `$1` as the action (default `status` when empty):

   ```bash
   "${CLAUDE_PLUGIN_ROOT}/scripts/ctl.sh" <action> <session-id>
   ```

   `list`, `doctor` and `docs` do not take a session id.
3. Report the script's output as-is. It already says what the user needs, including
   any warning about a missing speech engine. Do not restate it or explain the
   architecture unless asked.

Turning it on takes effect on the user's NEXT message, not this turn: the reminder
is injected by the `UserPromptSubmit` hook. The script says so; do not repeat it.

## Actions

| Action | What it does |
| --- | --- |
| `on` | Enable for this session. Warns if no speech engine is reachable. |
| `off` | Disable for this session. |
| `status` | Whether this session has it on. |
| `list` | Every session currently speaking. |
| `doctor` | Engine, audio player, pronunciation rules, data paths. |
| `docs` | Open the full HTML documentation in the browser. |

## When the user asks how this works

Run `docs`. It opens a self-contained page covering the turn cycle, multiple
sessions, the speech engines, pronunciation and troubleshooting. Do not explain it
from memory — the page is the source of truth and it works offline.
