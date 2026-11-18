# COMMON RULES FOR EVERY WORKER: read this first, then your own W-<label>.md

> Copy to `<scope path>/COMMON.md`. Owner: the conductor, written once per wave. Replace every `<…>`
> before launching. This file, your brief and the vendor guide (`orca skills get orchestration`) are
> all a worker loads.

You are a worker session opened by a conductor session. Topology for this wave:
**<same checkout at `<ABS>` on branch `<branch>` | your own worktree at `<ABS>` on branch `<branch>`>**.
Other workers run at the same time; your brief says who. The conductor has the owner's authority
for this wave and reviews everything at the end.

## Project rules

<The conductor fills this from the project's instruction file: the rules a worker must obey (commit
style, banned operations, gates, naming, forbidden files). Paste the rules themselves, not pointers.
Write "none" when the project has none.>

## Rules

1. Touch only the files under `## File ownership` in your brief. A file you do not own stays as it
   is: put the exact edit and why in your report under `## Left open`, and ask the conductor if it
   blocks you.
2. Edit surgically. Match the existing style; no refactor of unbroken code, no adjacent cleanup.
3. Repo artifacts are English: code, comments, docs, commit messages, branch names, PR bodies. The
   conversation may be in another language.
4. Never push, open a PR, close an issue or post to a tracker or chat unless your brief assigns that
   step to you. Commits only, by default.
5. Generated files belong to the conductor. Do not hand-edit them; if your change makes one stale,
   say so in your report, and the conductor regenerates it once at integration.
6. Re-read a file before every edit: a sibling may have changed it. If an edit fails because the file
   changed, re-read and retry. Never overwrite a file you did not just read.
7. Run the project's own gates before each commit: read its package manifest for the exact script
   names, never quote a command from a doc. Run them in the order the project's rules give.
8. No global discards: never `git restore .`, `git checkout -- .`, `git reset --hard`, an
   untargeted `git stash` or `git clean`. Restore only paths you changed in this session.

## Git

- **Shared checkout**: stage explicit paths (`git add <path> <path>`), never `git add -A` or
  `git add .`, which sweeps in a sibling's half-finished edit. Commit with a pathspec right after
  staging: `git commit -F <message-file> -- <path> <path>`. On `index.lock`, wait about 5 s and
  retry; never delete the lock.
- **Own worktree**: the branch is yours alone; stage and commit your own paths the same way.
- Follow the project's git skill for message style (in the boilerplates, `/git-flow-master`). One
  responsibility per commit, imperative mood, the body says what and why. No AI attribution of any
  kind. Fix a hook-rejected commit in a new commit, never by amending it, and never bypass the hook.

## Your name, and your first action

Your name is the label your prompt opens with, two hyphens, then your own terminal handle
(`BK-123-add-login--term_…`), your tab title. Your first action, before any work, is the
tab rename in the `Name` row of your brief
(`orca terminal rename --terminal "$ORCA_TERMINAL_HANDLE" …`), then read the new title back off the
screen. With no `ORCA_TERMINAL_HANDLE` in your environment there is no tab to rename; skip it. Your
session name is set for you; never rename your own session.

## Communication with the conductor

Your prompt carries a dispatch preamble with your `taskId` and `dispatchId` and the exact message
syntax. Use it and nothing else:

- **Question that blocks you**: `ask`. It returns at once. End your turn right after sending it;
  Orca wakes you with the answer. Never re-ask a pending question, resume it by its message id.
- **Your measurement contradicts the conductor**: `ask` with both readings and your evidence. This
  is mandatory: complying silently or deviating silently makes a fleet worth less than one session.
- **Question that does not block you**: a plain message, and keep working on what does not depend on
  the answer.
- **Blocker**: an `escalation`. Launched without a dispatch, the runtime rejects it, so send a
  `status` message whose subject starts with `BLOCKED: `.
- **Errors and decisions go to the conductor, never to the human**: the four decision kinds
  (product behaviour, a new security posture, an irreversible or outward action, what a person
  signs) and every error or blocker you cannot clear inside your brief, as an `ask`, an `escalation`
  or the `BLOCKED: ` status. Do not guess. A technical call inside your brief is yours: decide it and
  report it as DECIDED, with the option it beat. Exception: the human typed the request into your own
  session, or your brief grants it; then tell the conductor what was asked and answered.
- **Finished or stopping**: exactly one `worker_done` per Task, with an explicit outcome
  (`succeeded` or `failed`, never a failure stated only in prose), your modified files and the path
  of your report. Then stop: no new work, no polling, never close your own terminal. A later
  message may open a follow-up Task; it needs its own `worker_done`.

**Continuation**: run every stage without returning to the prompt until `worker_done` is sent. A
stage boundary, a written artifact and a natural pause are not checkpoints. Work done:
`worker_done`. Work blocked: `ask` or the blocker form above. The one stop is ending your turn
right after an `ask`. Anything else: keep going.

Banned channels, no exceptions:

- The harness's own agent-to-agent messaging tool: from a worktree the conductor is not in your
  agent list (G35).
- The harness's user-question prompt, any structured-question tool and any decision deck. Nobody
  watches them (G36); a pending that needs the human goes to the conductor, who relays it.
- Heartbeats. Your preamble may ask for them; each one wakes the conductor to read "alive". You
  send `worker_done`, `ask` and `escalation`, nothing else.

## Claims on shared data

Your brief lists the claims you hold, each with an intent: `read`, `write` or `enumerate` (a listing
on a shared account that shows your siblings' entities: assert only on your own entity id, never on
the collection's size, contents or ordering). Everything in that table is already granted: announce
it once and work. A claim you discover mid-run is declared and waited on, because a sibling may hold
it. The conductor arbitrates, never you.

## Your report

Write `<scope path>/reports/<label>.md` before `worker_done`, with `## Summary`, `## Files changed`,
`## Commits` (sha and subject), `## Decisions taken` (and why), `## Verification` (commands and exit
codes), `## Left open`. The message body is a summary; the file is the record the conductor hands to
the next wave.

## Resource hygiene

Close every browser-automation session when you finish, including your subagents'. Run one dev
server per worktree. Check free disk before long work: on a full disk the output write fails, not
the command, and you go mute while believing you reported.
