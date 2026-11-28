# Preset: command. Sourced by wake-on.sh, never run directly.
# The agnostic one: watch anything a shell command can print. Use it for a ticket tracker CLI, the Playwright
# CLI, `curl`, `az`, a file listing, a database count, any state that changes.
PRESET_SUMMARY="Any shell command. Each output line is a fact; a line that appears or disappears between polls is an event."
PRESET_PARAMS="CMD='<shell command>' [INTERVAL=120]  (the command must exit 0 and print the state; non-zero counts as a failed poll)"

preset_init() {
  [ -n "${CMD:-}" ] || { echo "command needs CMD='<shell command>'" >&2; return 1; }
}

preset_snapshot() {
  bash -c "$CMD"
}

# One event per change, with both sides, so "status: In Progress" -> "status: Done" reads as one line.
preset_describe() {
  local a r
  a=$(printf '%s' "${WAKE_ADDED:-}" | tr '\n' ';')
  r=$(printf '%s' "${WAKE_REMOVED:-}" | tr '\n' ';')
  emit "CHANGED now: [${a}] was: [${r}]"
}
