# Session Identity: Naming a Worker so It Can Be Found

> Loaded by the conductor (it names workers, fills the roster and the board card) and by anyone
> debugging "which session was that". After a crash the roster may be gone and the card archived, so
> the name has to be findable on the tab and in the harness. Rows marked (unverified) were reported
> but not run: confirm before building on them. Commit trailers are not defined here: the project's
> git skill owns them.

---

## 1 · One name, `<label>--<handle>`

`<label>` is `[<KEY>-]<slug>`: kebab-case, single hyphens inside, a slug of 3 or 4 words
(`TK-123-add-google-auth`, or a bare slug for work with no ticket). The `--` appears once, before the
Orca terminal handle (`term_<uuid>`), so parse a name back by splitting on the last `--term_`. The
same string names the harness session, the Orca tab, the roster's `Name` column and any report.
A worker with Orca's default tab title and a generated session title is the failure this file exists
to prevent (G84).

---

## 2 · Per-harness table

Harness flags move: confirm every launch line against `<harness> --help` on the machine.

| Axis | Claude Code | OpenCode | Codex CLI | Pi |
|---|---|---|---|---|
| name at launch | `-n, --name <name>` | none in the TUI | none | `-n, --name <name>` |
| rename in session | `/rename <name>`; queued while the session is busy | `/rename`: inline argument on some versions, a dialog with no argument on others | `/rename <name>`, accepted mid-task | `/name <name>` |
| rename from another process | only by typing `/rename` into the TUI, or a project hook | typing into the TUI | typing into the TUI | typing `/name`, or a project extension |
| name from disk | `~/.claude/sessions/<PID>.json` (`name`, `nameSource`: `user`, `derived` or `hook`) | `opencode session list`, Title column | `$CODEX_HOME/session_index.jsonl` | `session_info` entry in the session JSONL under `~/.pi/agent/sessions/` |
| id from a shell | `CLAUDE_CODE_SESSION_ID` | no env var | no confirmed env var | `PI_SESSION_ID` |
| resume | `claude -r <id>`, `--session-id`, `--fork-session` | `opencode -s <id>`, `-c`, `--fork` | `codex resume <name-or-id>` | `pi --session <path or id>`, `-c`, `-r` |

Claude Code takes `-n` on a pasted launch line, so a pasted line writes
`-n "<label>${ORCA_TERMINAL_HANDLE:+--$ORCA_TERMINAL_HANDLE}"`. The native `worker-start` has no argv,
so no name flag there. An invalid `--effort` value starts the session on the default and tells nobody
(G28); `--permission-mode` rejects an invalid value.

**How the session gets its name on the native path** (a worker the conductor starts with
`worker-start`):

- A project hook, if it has one, may compose the name from the spec's opening
  `/<skill> <label> fleet worker` plus `ORCA_TERMINAL_HANDLE` (present in a dispatched worker's
  environment, G56). Put nothing between `<label>` and `fleet worker`.
- Otherwise the conductor types the harness rename verb (`/rename <label>--<handle>`, Pi `/name`) into the
  terminal once the screen shows the worker ready, and reads it back.
- A harness whose rename takes no argument, or that cannot be renamed, is named by the roster alone:
  the roster maps name to handle, and the conductor says so once in the run report.
- A worker never renames its own session: `/rename` is user input on every harness (G83). It can
  rename its own TAB, because that is a CLI call.

Read the session name back off the screen, never assume it: the status bar carries the name with the
model and effort, and `terminal read --screen` shows it. Grep a bare token, because the bar is drawn
with non-breaking spaces and a pattern with a space in it never matches (G15). A status bar with a
generated title, or a tab still reading `worker-<task id>`, means naming failed: fix it before any
work is sent.

---

## 3 · The label rule

One rule, applied in order, so two sessions never produce two label formats:

| Case | Label |
|---|---|
| the user or a hook set the name (`nameSource` `user` or `hook`) | the name, as-is |
| the name was derived or auto-generated | `<name> (<first 8 chars of the id>)` |
| only an id is available | the full id |
| nothing is resolvable | `unknown` |

The name beats the id because it survives a resume (a fork mints a new id) and shows in the resume
picker, the terminal title and the board card. The 8-char suffix exists because derived names collide.
`unknown` is stated rather than omitted: it says the resolver ran and came back empty.

---

## 4 · Tab title, sweep and board card

- **Tab title** is the worker name. The runtime titles every worker tab `worker-<task id>` and that
  label outranks what the harness paints (G71), so the worker renames its own tab first:
  `orca terminal rename --terminal "$ORCA_TERMINAL_HANDLE" --title "<label>--$ORCA_TERMINAL_HANDLE" --json </dev/null`.
- **Sweep.** Right after the worker starts, the conductor issues the same rename with the handle it
  read from `worker-list` (`agentTerminalHandle`, G78), and again in every liveness sweep. A rename
  lands only once the app window has opened the tab, and `terminal list`, `show` and `read` do not
  expose the label (G72, G82), so confirm on the tab itself.
- **Board card.** Display name: the work key plus a short title (in a same-checkout fleet, the
  fleet's own name, because the card is per worktree). Comment: the recovery block (stage, name,
  branch, absolute brief path); in a same-checkout fleet it points at the roster (G50).
- **Roster.** The machine-readable side: task, dispatch, terminal handle, worktree, agent, model,
  name, resume command, status. The phrasebook ("the one on TK-123") resolves against it, and in a
  same-checkout fleet it is the only recovery record.

---

## 5 · The crash and restart case

The session is gone, the tab survives; only what is in the card and the roster is recoverable, so
update both at every launch and stage boundary.

After a runtime restart or a session resume every handle changes, while titles still carry the old
one (G22, G85). Then:

1. Match each tab on its label, the part before the last `--term_`.
2. Write the new handle into the roster and re-issue the tab rename with it.
3. A resumed session gets no fresh spec opening, so even a hook does not re-title it: type the rename
   verb (`/rename <label>--<new handle>`) into each resumed worker once its screen is ready, read it
   back, and update the roster's `Name` column.

Sign every message with the handle plus the Run id; the Run id is the part that survives (G85).
