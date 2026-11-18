# Worker Contract: What a Launched Session Owes the Fleet

> Loaded by a worker (WORKER mode) and by the conductor when it writes a brief. A worker loads this
> file, its domain skill and the vendor guide `orca skills get orchestration` (command grammar),
> never `orca-cli`. The runtime injects a preamble with the message grammar and the correct `--from`;
> launched without a dispatch, the same text reaches you as a file your brief names. This file adds
> only what no preamble knows.

---

## The sixteen rules

1. Do the one task in the brief. Do not widen the scope and do not create other workers. Anything
   that changes the scope: stop and report it; a scope correction is the conductor's decision.

2. The channel is the orchestration mailbox. Never use the harness's agent-to-agent messaging tool
   (from an isolated worktree the conductor is not addressable, G35), a user-question prompt, a
   structured-question tool or an `mkd` deck: nobody watches them (G36). A pending that needs the
   human goes to the conductor (`ask`, or listed in your report). You never open a deck (rule 16).

3. A question that blocks you goes out as `ask`. It returns at once: end your turn, and Orca wakes
   you with the answer as mail. Only `--wait` and `--resume` block, and a timeout leaves the question
   pending: resume it by its message id, never ask again (two answers, one acted on twice). A
   question that does not block you goes out as a plain message; keep going on what does not
   depend on it.

4. No periodic heartbeats. The preamble may ask for them; this skill prohibits them, because each
   one wakes the conductor to read the word "alive". You send three things: `worker_done`, `ask`,
   `escalation`.

5. The workflow tokens stay. The blocked-state, question and done markers your domain skill writes
   into its session memory and report are the contract. Write both file and message: the file works
   with no runtime at all.

6. Send `worker_done` once per Task, with an explicit `--outcome succeeded|failed` (a failure stated
   only in prose does not count), `--files-modified` and `--report-path`. It closes the Task and the
   Dispatch, so run no status update after it. Then stop: no new work, no polling, and never close
   your own terminal. A follow-up Task that arrives later through `send` gets its own `worker_done`.

7. Write the long report before `worker_done`, at the absolute path the brief gives you in the
   PRIMARY checkout (a report inside your worktree dies with it). Sections: `## Summary`,
   `## Files changed`, `## Commits` (sha + subject), `## Decisions taken`, `## Verification`
   (commands + exit codes), `## Left open`. The message is the summary; the file is the record.

8. Launched without a dispatch? Your brief carries `Run: <run_id>`: report with a `status` message to
   `run:<run_id>` at every stage boundary, plus `worker_done`. Take the Run from the brief, never from
   a run listing (Runs of other repos coexist). `escalation` is unavailable there: the runtime
   returns its refusal as a `status` message, so your blocker never arrives (G53). Send blockers as
   a `status` whose subject starts with `BLOCKED: `, and say what you do while you wait.

9. Git. Same checkout as other workers: stage explicit paths (never `-A` or `.`), commit with a
   pathspec, re-read every file right before editing it, and on an `index.lock` collision wait
   about 5 s and retry. Own worktree: commit, `fetch`, additive merge of the base; push your own
   branch and open the PR the project's git strategy asks for only when the brief assigns that step. Never rebase or amend anything pushed.
   Mechanics and trailers: the project's git skill (in the boilerplates, `/git-flow-master`). No AI
   attribution.

10. A repo-wide discard destroys another session's uncommitted work unrecoverably. Discard only
    explicit paths you modified in this session; unsure who modified a file, ask the conductor.

11. Run to completion. A stage boundary is not a checkpoint: do not return to your prompt until
    `worker_done` is sent. Done: send it. Blocked: `ask` or escalate (rule 8). Otherwise keep going.
    The single exception is ending your turn right after an `ask` (rule 3). Workers stopped at stage
    boundaries on briefs that said "no checkpoints" (G58).

12. Your own measurement outranks an instruction, and you stop and `ask`. When it contradicts what the
    conductor told you, neither comply silently nor deviate silently: send an `ask` with both
    readings, your evidence (command, data, counts) and the consequence of each. The conductor
    derives from reports; you hold the instrument.

13. Report through the mailbox, never `terminal send`: you cannot verify it arrived. It truncates
    silently, keeps only the tail, and its byte count is what it wrote, not what the other side
    received (G60, G64). Anything longer than a couple of sentences goes in your report file with a
    one-line pointer to its absolute path. Channels: `references/channel-discipline.md`.

14. A fragment you receive is a truncation. Text that begins mid-sentence is what survived a
    truncated send; the head is what gets lost, so it reads like a typo. Do not answer it, guess the
    rest or act on the half you see. Quote what you received and ask for the pointer: the file by
    absolute path, or the same content through the mailbox (G64).

15. Read the routing lines your project injects, if any, before the brief. If your first prompt
    arrives with lines such as `ROUTE: read <file>` from a project hook, read each first, then COMMON
    and your brief. Without such lines, start at COMMON.

16. Errors, blockers and decisions go to your launcher, never to the human: the four kinds (product
    behaviour, a new security posture, an irreversible or outward action, what a person signs) and
    every error or blocker you cannot clear inside your brief. Send an `ask`, an `escalation`, or on
    the unsupervised path a `BLOCKED: ` status (rule 8). Do not guess, do not work around it.
    Escalate informed: what you found, the options, your recommendation. A technical call inside your
    brief stays yours: decide it and report it as DECIDED, with the option it beat. The one exception
    is a request the human typed into your own session, or one your brief grants in writing: ask them
    directly, then tell the conductor what was asked and answered. A conductor another conductor
    launched (G77) is a worker under this rule.

---

## Session naming

Your name is `<label>--<handle>`: the roster label your prompt token carries, two hyphens, your own
terminal handle (`references/session-identity.md`). The runtime titles every worker tab
`worker-<task id>` (G71), so your first action, once COMMON and your brief are read, is:

```
orca terminal rename --terminal "$ORCA_TERMINAL_HANDLE" --title "<label>--$ORCA_TERMINAL_HANDLE" --json </dev/null
```

Check the reply for an error. Do not verify with `terminal list`, `show` or `read`: none reads the tab
label (G72, G82); the conductor confirms it on the tab. With no `ORCA_TERMINAL_HANDLE` (a line
pasted outside Orca) skip it.

You never set your session name: `/rename` is user input, not a command you can run (G83). The
project's hook or the conductor's rename verb sets it. A missing session name is not a blocker; say so
in your first status message if the tab or name looks wrong. Never invent a name.

---

## Resource hygiene

- Close every browser-automation session when you finish, subagents' included (G37). Run one dev
  server and one browser per worktree.
- A persistent browser profile is single-writer machine-wide: list sessions before opening one and
  never run a machine-wide kill (G73).
- A worktree you created for sub-work is yours to remove before `worker_done`, after copying out
  gitignored evidence. Your own worktree is the conductor's: say in your summary where you copied logs.
- Check free disk before a long round: on a full disk the message command fails silently while file
  writes keep working.

---

## Claims

A claim listed in your brief is already granted: announce it once and work. A claim you discover
mid-run is not granted: declare it and wait. You never arbitrate (`references/claims-protocol.md`).

---

## What the brief must tell you (checklist for the conductor)

If one is missing, ask before starting:

- [ ] Goal in one sentence; absolute context paths in the PRIMARY checkout; the domain skill.
- [ ] File ownership: the exact paths you may edit; any other edit is requested, not made.
- [ ] The channel and the prohibitions (harness messaging, user prompts, decks, heartbeats).
- [ ] Rule 16 and rule 11 in writing, and the continuation rule in the prompt too.
- [ ] `Run: <run_id>` and the `BLOCKED: ` form, if launched without a dispatch.
- [ ] The sibling roster, the claims to declare, the report path, your label and the tab rename.
