# W-<label>: <one-line scope>

> Copy to `<scope path>/W-<label>.md`, one per worker. Owner: the conductor. Fleet brief fields
> (`references/brief-template.md`). Replace every `<…>`: a worker interprets any placeholder left in.

Read `<scope path>/COMMON.md` first, then this file.

| Field | Value |
|---|---|
| Label | <W1> |
| Key / scope | <KEY or module or cluster> |
| Task | `task_…` |
| Dispatch | `dispatch_…` (omit if launched without one) |
| Run | `run_…`, only when launched without a dispatch; with an active dispatch the recipient defaults to the owning Run, so this line invites an error |
| Name | `<label>--<handle>`: `<label>` is `[<KEY>-]<slug>`, the token your prompt opens with; `<handle>` is your own `ORCA_TERMINAL_HANDLE`. **First action: rename your tab and read the title back off the screen**: `orca terminal rename --terminal "$ORCA_TERMINAL_HANDLE" --title "<label>--$ORCA_TERMINAL_HANDLE" --json </dev/null`. Your session name is set for you; never rename it<. On a harness that cannot be renamed, mark this row `roster only`> |
| Worktree | <primary \| name> |
| Agent / model / effort | <agent> / <full model id> / <effort>, from the project's profile defaults unless an override matches this brief or the user said otherwise |
| Report path | `<scope path>/reports/<label>.md` |

## Goal

<One sentence. The outcome, not the activity.>

## Context docs (ABSOLUTE paths, primary checkout)

- `<ABS>/<path>`
- `<ABS>/<path>`

> Paths are absolute and in the primary checkout, always. A relative path resolves against a working
> directory you may not share, and a path inside your own worktree may not exist there at all.

## Project standards

<Paste the project's standards block, if any: the rules from its skills or instruction file that
apply to this scope. Treat them as authoritative; do not re-read the full skill unless a step below
says so. Write "none" when the project has none.>

## Skills to load

<The domain skill, if any.> `agent-orchestration` in WORKER mode (it points you back to this brief
and COMMON.md), and `orca skills get orchestration`, which holds the vendor command grammar. Your
injected preamble additionally carries the message grammar.

## File ownership

You may edit only:

- `<path>`
- `<path>`

Leave anything else alone. Put the exact edit you wanted, and why, in your report under
`## Left open`. If it blocks you, `ask`.

## Claims: pre-granted, listed here by the conductor

| Entity | Intent | Consequence / if denied |
|---|---|---|
| `<entity>:<id>` | <read \| write \| enumerate> | <for enumerate: assert only on your own entity id, never on the collection's size, contents or ordering> |

Every claim in this table was decided at triage and granted at launch: announce it once and start
working. No grant is coming, and waiting on a pre-agreed claim has stalled a worker for nothing. A
claim you discover mid-run is different: declare it and wait, because your siblings may hold it.
The conductor arbitrates, never you (`references/claims-protocol.md`).

## Siblings

| Label | Scope | State |
|---|---|---|
| <W2> | <scope> | <in-flight> |

If you discover a fact that changes ANOTHER worker's decision, tell the conductor immediately, not in
your final report. That is the whole reason this table is in your brief.

## Exact instructions

1. <step, naming the tool or skill action, and what proves it done>
2. <step>
3. <step>

## Report

Write your report to the path above, with `## Summary`, `## Files changed`, `## Commits`,
`## Decisions taken`, `## Verification` (commands and exit codes), `## Left open`. Then send
`worker_done` exactly once, with an explicit outcome, the modified files and the report path. Then
stop.

## Rules

- Channel: the orchestration mailbox only. No harness agent messaging, no user prompts, no
  structured-question tool, no decision deck, no heartbeats.
- Errors, blockers and decisions go to the conductor, never to the human: the four decision kinds
  and every error or blocker you cannot clear inside this brief, as an `ask`, an `escalation` or a
  `BLOCKED: ` status. Do not guess. A technical call inside this brief is yours: decide it and
  report it as DECIDED.
- Run every stage without returning to the prompt until `worker_done` is sent. The one stop is
  ending your turn right after an `ask`; Orca wakes you with the answer.
- If your own measurement contradicts something the conductor told you, `ask` with both readings and
  your evidence. Never comply silently and never deviate silently.
- `ask` returns at once; a question that does not block you is a message, and you keep going on what
  does not depend on the answer. <If you were launched WITHOUT a dispatch: `escalation` is rejected
  on that path, send blockers as a `status` message with the subject prefixed `BLOCKED: `.>
- <any scope-specific guardrail: the environment to test against, the credentials profile to read,
  the branch to base on>
