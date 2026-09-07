---
description: Turn the spoken summary on or off for this session
argument-hint: "[on|off|status|list|doctor]"
disable-model-invocation: true
---

# /voz

Controls whether this session, on top of its normal text output, closes each turn
with a line spoken out loud.

## Implementation

1. Find THIS session's id. It is the UUID-shaped segment of the scratchpad
   directory path in your system prompt.
2. Run, with `$1` as the action (default `status` when empty):

   ```bash
   "${CLAUDE_PLUGIN_ROOT}/scripts/ctl.sh" <action> <session-id>
   ```

   `list` and `doctor` do not need the session id.
3. Report the result in one line. Do not explain the architecture unless asked.

Turning it on takes effect on the user's NEXT message, not this turn: the reminder
is injected by the `UserPromptSubmit` hook. Say so in that same line.

## Notes

- The switch is a file under the plugin's data directory. With no file, no hook does
  anything and the session behaves exactly as always.
- Needs a speech endpoint reachable. Run `/voz:voz doctor` to check.
- Voice, rate and provider come from the plugin settings (`/plugin` → voz → Configure).
