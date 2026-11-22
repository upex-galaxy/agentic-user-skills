# Polisher

`rsi-polisher` turns approved findings into a candidate copy of one skill. The agent's own definition is `agents/rsi-polisher.md`, and the approved spec behind it is `agents/rsi-polisher.spec.md`. This file holds what the main session needs to call it.

## Call it

1. Run `python3 -I scripts/rsi.py candidate <skill_dir>` and read the printed `candidate` path.
2. Delegate to `rsi-polisher` with: the candidate path, the skill path, the approved findings (ids, verdict, quote, event), and the paths of every brief on file for that skill. The polisher sees nothing else, so put everything in the prompt.
3. Done when the reply starts with `STATUS: DONE` and lists the candidate path, the diff, one line per change tied to an event id, the test result, the net line count and what was left unchanged. A `STATUS: PARTIAL` or `BLOCKED` reply goes to the person as it is.

## Candidate rules

- Each change removes or tightens about as much text as it adds. The report states the net line count.
- Each sentence passes the no-op test from `writing-for-agents`. The skill stays in English.
- Names, `description` and trigger words change only when a finding is about triggering.
- Text a person reads goes through `humanizer`.
- The polisher never edits its own agent file.

## Non-regression by reading

For every earlier finding on the skill (applied or rejected) and every brief on file, the polisher states whether the candidate still handles it. Reading replaces re-running.

## Limits

- Writes only under `~/.rsi/candidates/`. The agent's hook (`rsi.py guard`) blocks any other write and any `rsi.py` subcommand that writes elsewhere. The permission rules in the spec are the second wall.
- At most 6 test runs per candidate. The report states what they cost.
- No web, no MCP, no sub-agents.

## With nobody at the keyboard

The main session stops after gate 1 and leaves the findings in `~/.rsi/pending/`. It starts no polisher.
