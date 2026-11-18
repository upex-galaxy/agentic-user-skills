# Brief template: the 7 components plus the fleet fields

> Loaded by the conductor when it seeds a worker. A worker brief is a one-shot briefing plus eight
> fleet fields, because a persistent worker has what a subagent lacks: siblings, a channel, a
> lifecycle and a git identity. A JITSO-mode brief has its own headings and folder: see
> `references/providers/jitso.md`.

---

## 1 · The two files and the launch prompt

| File (in the scope dir) | Written | Read by | Holds |
|---|---|---|---|
| `COMMON.md` | once per wave | every worker, FIRST | the project rules, the commit rules, the channel, the prohibitions |
| `W-<label>.md` | once per worker | that worker only | goal, context docs, file ownership, claims, instructions, report path |

COMMON is written once so workers do not get slightly different versions; the per-worker file is the
only place a scope is defined. Copy `templates/COMMON.md` and `templates/W-brief.md`. The scope dir is
`<primary checkout>/.session/orchestration/<slug>/` unless the profile key `orchestration.scope_dir`
says otherwise (`references/channel-discipline.md` §3).

**One message, one task.** The brief goes in a file, named by absolute path: pasted, it truncates (G60). The spec (`--spec-file`) is the worker's first prompt (G58). Its shape, the same on every path:

```
/<skill> <label> fleet worker. Read <ABS>/COMMON.md then <ABS>/W-<label>.md and execute your brief. Run every stage without returning to the prompt until worker_done is sent; stage boundaries are not checkpoints; the one stop is ending your turn right after an ask. Channel: the orchestration mailbox. No heartbeats.
```

- When the worker runs a skill, the prompt opens with `/<skill> <label> fleet worker`, nothing between
  `<label>` and `fleet worker`: that opening is the one place the label reaches the session and the
  skill (G84). A worker with no skill starts at "Read".
- The continuation sentence belongs in the prompt, the brief and COMMON; as a file pointer alone it
  reads as reference material (G58).

**Quoting rules** (a pasted launch line, `references/providers/orca.md` fallback): (1) the whole
prompt is single-quoted and holds no `'` and no unescaped `"`; rephrase instead of switching
delimiter. (2) `<` and `>` inside the single quotes are literal. (3) Run `sh -n` over the launch file
before launching: one quoting error once killed every line of a fleet at once, and the terminals
looked fine (G30).

---

## 2 · The 7 components

| # | Component | For a worker |
|---|---|---|
| 1 | **Goal** | one sentence |
| 2 | **Context** | what the worker lacks: why, siblings, prior decisions. Files by ABSOLUTE path in the PRIMARY checkout; a relative path or one inside the worker's worktree may not exist there (G40) |
| 3 | **Files to read** | context docs, the project's standards block if any, the domain skill, the `orchestration` guide |
| 4 | **Constraints** | file ownership, the channel and its prohibitions, the project's rules, the rule 16 escalation |
| 5 | **Steps** | numbered, each naming its tool or skill action, each verifiable |
| 6 | **Output format** | two destinations: the long report FILE and the `worker_done` that points at it |
| 7 | **Done criteria** | the evidence that proves it is finished (commands and exit codes, files, counts) |

---

## 3 · The eight fleet fields

1. **Identity and ids.** Label, `Task: <task_id>`, `Dispatch: <dispatch_id>` when it has one, and
   `Run: <run_id>` only when launched without a dispatch (a stray `Run:` invites a wrong manual address).
2. **Sibling roster.** One line per other live worker: label, scope, state. A cross-cutting discovery
   goes to the conductor at once, not at the end.
3. **Channel and prohibitions.** The mailbox is the channel; name the three message types. Prohibit in
   writing: the harness's agent-to-agent tool, user-question prompts, structured-question tools and
   `mkd` decks (nobody watches them), and periodic heartbeats (each one wakes the conductor).
4. **File ownership.** The exact paths this worker may edit; anything else goes in the report as a
   wanted edit. In a same-checkout fleet repeat the git rules of `references/topologies.md` §3.
5. **Claims, pre-granted.** The triage list (`references/claims-protocol.md` §5). State that
   everything listed is **already granted**: announce it and work; only a claim found mid-run waits.
   Give a fallback per `write` row and the standing consequence per `enumerate` row.
6. **Reporting protocol.** Report path, the six sections, the `worker_done` shape (once per Task,
   explicit outcome, modified files, report path), then stop without closing the terminal. Without a
   dispatch, add the `BLOCKED: ` status form. In writing: **continuation** (run to `worker_done`,
   stage boundaries are not checkpoints, the one stop is ending the turn after an `ask`);
   **the mandatory `ask`** (a measurement that contradicts an instruction: both readings, evidence);
   **escalation to the launcher** (`references/worker-contract.md` rule 16). Say if the brief grants a
   direct question to the human.
7. **Session label.** `[<KEY>-]<slug>`, 3 or 4 words; the full name is `<label>--<handle>`
   (`references/session-identity.md`). The brief tells the worker to rename its own TAB first
   (`references/worker-contract.md`), never its session.
8. **Commits.** The project's git skill owns commit rules and trailers; the brief points at it and
   repeats: no AI attribution.

---

## 4 · Skeleton

```
# W-<label>: <one-line scope>
Read <ABS>/COMMON.md first, then this file.
Label: <label>   Task: <task_id>   Dispatch: <dispatch_id>
[Run: <run_id>]        # ONLY when launched without a dispatch
Model / effort: <model> / <effort>    # the profile pin, unless the user said otherwise

## Goal
<one sentence>
## Context
<why, siblings, decisions>
## Files to read
<ABS>/... (primary checkout); <project standards block>; /<domain-skill>; the orchestration guide
## Constraints
You may edit ONLY: <path> ... Anything else: put the edit you wanted in your report.
Claims (pre-granted; announce and work): <entity>:<id> <read|write|enumerate>
Siblings: <label> | <scope> | <state>
Channel = the orchestration mailbox. No harness messaging, user prompts, decks or heartbeats.
Errors, blockers and the four escalation kinds go to me (ask / escalation / BLOCKED:), never the
human; a technical call here is yours, reported as DECIDED. A measurement that contradicts my
instruction: stop and ask, with both readings.
First action, before any work: rename your own tab to <label>--$ORCA_TERMINAL_HANDLE.
## Steps
1. ...
## Output format
Write <ABS>/reports/<label>.md: Summary, Files changed, Commits, Decisions taken, Verification,
Left open. Then send worker_done once per Task (outcome, --files-modified, --report-path). Stop.
## Done criteria
<evidence>
Run every stage until worker_done; the one stop is ending your turn after an ask.
```

---

## 5 · Anti-patterns

| Anti-pattern | What happens |
|---|---|
| four tasks in one brief | the worker does one |
| the brief pasted into a message | it truncates; the worker acts on the half it got |
| relative or in-worktree context paths | the file is not there; the worker proceeds without it, silently |
| no file-ownership list in a same-checkout fleet | two workers edit one file; one loses the work |
| no heartbeat prohibition | the worker obeys its preamble and wakes the conductor |
| no escalation rule | the worker guesses a product answer or opens a prompt nobody watches (G36) |
| claims listed beside "wait for the grant" | the worker stalls on a claim nobody disputed |
| the continuation rule only in the brief | read as reference material; the worker stops at the first stage boundary (G58) |
| no `/<skill> <label> fleet worker` opening for a skill worker | default tab name, generated session title (G84) |
| a prompt containing `'` or an unescaped `"` | the shell mangles the line; the terminal reports success and nothing ran (G30) |
| "report when done" with no path or shape | a prose report nobody can aggregate |
