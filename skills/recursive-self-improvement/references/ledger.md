# Ledger and recurrence gate

`~/.rsi/ledger.jsonl` holds one JSON line per record. The commands are `python3 -I scripts/rsi.py ledger add|load|set|list|measure`.

## Finding fields

| Field | Meaning |
|---|---|
| `id` | 8 characters, derived from skill, subtype, anchor and session; a repeat of the same finding in one session is a duplicate and counts once |
| `ts`, `skill`, `skill_sha`, `session` | when, which skill and version, which session |
| `verdict`, `subtype`, `anchor`, `severity`, `evidence` | from the rubric; `evidence` is the event id (`E2`) |
| `status` | `logged`, `proposed`, `approved`, `applied`, `rejected`, `reverted` |
| `target` | always `skill` in v1; reserved for other targets later |

Other records carry an `event` field: `load` (a session loaded the skill), `apply` (carries `skill_sha`, `from_sha`, `backup`, `findings`) and `rollback`.

## Gate

A finding becomes `proposed` when its verdict is `SKILL` or `INTENT-UNDERSPECIFIED` and one of these holds:

- the same skill, subtype and anchor appear in 2 or more distinct sessions;
- the severity is `high`.

`ledger add` prints `gate: true` when it passes and moves earlier `logged` rows of that key to `proposed`. Every other finding stays `logged`. One bad session never triggers an edit.

## Status moves

`ledger set <id> <status>` records the person's answer: `approved` or `rejected` at gate 1. `apply` marks its findings `applied`. `rollback` marks them `reverted`.

## Measure after

Run `ledger load --skill <name> --session <id>` whenever RSI runs for a session that loaded the skill, clean or not. `ledger measure <skill>` then looks at the next 5 sessions after the last apply. If the same key recurs, propose a revert or a different fix. Do not stack a second edit on the same passage.
