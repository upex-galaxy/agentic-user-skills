# Channel Discipline: Which Verb Carries What

> Loaded by any session that sends anything to another. Violations cost the most here: the failure is
> silent in both directions and the receipt says `ok` (G64, G66). This is a channel ASSIGNMENT, not
> advice about brief length.

---

## 1 · The three channels

| Channel | What it carries | Integrity |
|---|---|---|
| `orca orchestration send` (the mailbox) | every message between sessions: status, questions, answers, decisions, escalations | byte-intact (G66) |
| a file plus a one-line pointer | anything longer than a couple of sentences: briefs, reports, scope agreements, evidence, tables | perfect, and re-readable later |
| `orca terminal send` | raw terminal input only: a command, a harness slash-command (`/rename`, `/mcp`, `/reload-plugins`), an interrupt, Ctrl+U | lossy: truncates silently, keeps only the TAIL, reports success anyway (G60, G64) |

Between independent Claude Code sessions that share no Run, the channel is native `SendMessage`, not
the mailbox: `references/cross-session-messaging.md`.

The test: if a human would READ it, it does not go through `terminal send`; if a shell or a TUI would
EXECUTE it, that is what the verb is for. `terminal send` never carries conversation and never the
first prompt: the task spec (`--spec` / `--spec-file`) is the first prompt. Mail to
`dispatch:<id>` reaches a worker in any state (`references/conductor-cycle.md`), so there is no nudge
through `terminal send` either (G46).

What `terminal send` is for: running a command in the worker's own shell; a harness slash-command the
session cannot invoke for itself (`/mcp` reconnect, `/rename`, G76, G83); an interrupt, then verifying on the
rendered screen. Confirm a slash command's exact string on the machine before it goes in a brief.

---

## 2 · Reading the result of a send

- A success code describes the CALL, never the outcome (hard rule 17). `ok: true` means the text was
  WRITTEN; the byte count is what was written, not what the agent received (G60). Verify at the
  destination: the screen, the mailbox, the row.
- `ok: false` on a `terminal send` means a human is typing in that terminal (hard rule 18, G65). It
  is not a transport failure and not a reason to retry: a retry interleaves keystrokes. Wait, then
  read the screen.
- A message that begins mid-sentence is a truncation until proven otherwise (hard rule 19, G64).
  Say so and ask for the pointer; do not answer the fragment.
- `agent_prompt_stalled` can arrive with the text already queued (G52). `--retry-request <id>`
  replays the earlier result and is never a resend: read the screen first, and resend nothing.
- Never send into an input box that already holds text: it concatenates, and `--interrupt` does not
  clear it (G61). Submit or absorb what is there, or clear it with Ctrl+U (`--text $'\x15'`, no
  `--enter`).

---

## 3 · Where the pointed-at file goes

A pointer is worth exactly the path it names:

1. **Absolute, into the scope dir in the PRIMARY checkout.** A relative path resolves per worktree,
   and a path inside a worker's own worktree dies with it (G40). The default scope dir is
   `<primary checkout>/.session/orchestration/<slug>/`; the project's profile key
   `orchestration.scope_dir` overrides it.
2. **Gitignored correspondence**, not a project record: nothing downstream may depend on it existing
   on another machine. Anything durable graduates to the repo, the tracker or memory.
3. **Never a system temp directory.** It triggers a permission prompt on the receiving side and the
   worker stalls on a human who is not watching.

---

## 4 · Sign with an address, not a name

A brief, report or seed names its author by terminal handle plus Run id, never by a name the session
read about itself: that can resolve to nothing, to itself, or to the wrong session in another repo
while returning success (hard rule 20, G69, G70). `ORCA_TERMINAL_HANDLE` is in the environment and is
not a self-report. Handles change after a session resume, so the Run id is the stable part (G85).
