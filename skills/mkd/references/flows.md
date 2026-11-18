# MKD flows: exact steps per environment

Read the section for the flow `SKILL.md` picked. `<skill-dir>` is the skill's install directory (`<repo>/.claude/skills/mkd` or `~/.claude/skills/mkd`). Specs live at `~/.mkd/spec-<name>.json`; output lands under `~/.mkd/`.

## Artifact mode (Claude Code with the `Artifact` tool)

The user answers inside a claude.ai artifact. **Send to Claude** saves the Result JSON in the artifact's database and posts a comment addressed to Claude, which wakes this session. Nothing runs on localhost and nothing is copied.

1. **Render**: `bun "<skill-dir>/cli/index.ts" ~/.mkd/spec-<name>.json --artifact --title-prefix <session-name>`. The session name is the first line of `ListAgents` ("This session is ...") or the terminal title. The CLI validates the spec, writes `~/.mkd/artifact-<name>.html` (a page fragment: `<title>` first, no doctype/html/head/body), prints only that path on stdout, opens nothing, exits 0. stderr names the db document the answer will land in. Exit 2 = bad spec.
2. **Publish** with the `Artifact` tool: `file_path` = the printed path, an `icon` (e.g. `checklist`), a one-line `description`, `capabilities: {db: {}, comments: {}}`. Give the user the link. Inside Orca, open it in a tab first: run `bun "<skill-dir>/cli/index.ts" open-artifact <artifact url>` from the user's checkout (it creates a tab bound to the worktree and checks that it loaded, never the system browser). stdout `opened`: say the deck is in the Orca tab next to the terminal. `skipped` or no Orca: give the link.
3. **Confirm the watch**: `ArtifactComments` with `action: "watch"` and no `url` lists this session's watches. The artifact's row must say **auto-replies armed**; otherwise call `watch` with its `url`. Only an armed watch lets Send wake this session. Then end the turn or keep working; poll nothing. Tell the user once: if this session does not answer after **Send**, any message (for example `listo`) makes it read the answers.
4. **Read the answers** on wake-up, and as your first action on every user message while the deck is *pending* (published, answer not yet read): `ArtifactData` `get`, `collection: "results"`, `doc_id` = the spec's `session` (stderr printed the exact id; characters a db path rejects become `-`). The `result` field is the Result JSON string: parse it and treat it as the execution contract. No document yet: answer the user normally and stay pending. Then `ArtifactComments` `reply` with what you will do, and `resolve`.
5. **Fix the deck**: edit the spec, re-run the same command, publish the same `file_path` again (or pass the artifact `url` from another conversation). The URL stays and saved answers persist (browser storage belongs to the artifact).

**Why the wake can fail.** In auto mode the classifier can decline the unattended auto-reply (the watch row then reads `auto mode did not approve ...`). The db write happens before the notice, so answers are never lost and step 4 recovers them.

View-only viewers see "Sending is not available in this view": they press **Copy JSON** and paste it into the chat. If the answers saved but the notice failed ("Saved, but Claude was not notified"), the user tells you in the chat and you read the db document as in step 4. Image paste is off in artifact mode.

## Orca flow (default inside Orca)

The CLI blocks until the user submits, so run it in the background: a foreground call holds the turn for up to 24 h.

1. Write the spec.
2. Run from the user's checkout:
   - **Claude Code**: Bash with `run_in_background: true` on `bun "<skill-dir>/cli/index.ts" ~/.mkd/spec-<name>.json`. The harness notifies you when the process exits; read its stdout then (measured on Orca 1.4.190).
   - **OpenCode / Codex / Cursor** (unverified): `nohup bun "<skill-dir>/cli/index.ts" ~/.mkd/spec-<name>.json > ~/.mkd/stdout-<name>.json 2> ~/.mkd/stderr-<name>.log &`. Once `~/.mkd/stderr-<name>.log` contains `result written to`, read `~/.mkd/result-<name>.json` (same Result as stdout). If the harness cannot keep a background process alive, pass `--copy` and use copy mode.
3. Tell the user the deck is open in a tab next to this terminal and **Send to Claude** returns the answers directly. End the turn or keep working.
4. When the process exits, act on the exit code (table below). Exit 0: stdout holds the Result JSON.

How Orca is detected: `ORCA_TERMINAL_HANDLE` is set, or `orca status --json` reports a reachable runtime. The executable resolves as `ORCA_CLI_COMMAND`, then `orca-dev` in an Orca dev checkout, then `orca-ide` on Linux outside a managed terminal (bare `orca` there is usually the GNOME screen reader), then `orca`. A failed check counts as "no Orca" and prints nothing.

| Environment | Flags | What happens |
| --- | --- | --- |
| No Orca | none | **copy mode**: render, open the system browser, exit 0 |
| No Orca | `--wait` | serve, open the system browser, block until submit |
| Orca | none | **Orca flow**: serve, open a tab bound to the current worktree, block until Send, Result JSON on stdout |
| Orca | `--copy` | copy mode, system browser, exit 0 |
| any | `--no-open` | same mode, nothing opened; path or URL goes to stderr |

The tab is bound with `--worktree path:<git toplevel of the cwd>`: run the CLI inside the user's checkout. After `orca tab create` the CLI checks `orca tab list` for the tab and a null `loadError`. If the tab cannot be created or fails to load, the CLI closes it, opens the system browser and says so on stderr. When the run ends (submit, timeout, Ctrl-C, SIGTERM) it closes its tab; if that fails, stderr says the tab points to a dead server.

**Stable port, persistent answers.** Each deck gets its own port in 4747-4946, derived from `<name>` in `spec-<name>.json` (else from `session`). A half-answered deck reopened from the same spec lands on the same origin and its answers come back. A busy port moves to the next free one and stderr says saved answers on the original port will not show. `--port <n>` overrides.

**One copy of a deck at a time.** Browser storage is per origin and per engine, so the same deck in the system browser and in an Orca tab (or `file://` and loopback) keeps two sets of answers that never merge. The CLI remembers where it last opened each deck (`~/.mkd/opened-<name>.json`) and warns on stderr when this run opens it elsewhere: tell the user which copy is live. It also warns when an earlier `~/.mkd/result-<name>.json` backup exists (the next submit overwrites it).

## Copy mode (default outside Orca, non-blocking)

1. Write the spec to `~/.mkd/spec-<name>.json` (the page lands at `~/.mkd/deck-<name>.html`).
2. Run `bun "<skill-dir>/cli/index.ts" ~/.mkd/spec-<name>.json`. The CLI validates, renders a self-contained page, opens the browser, exits 0 at once. Nothing on stdout.
3. Tell the user the deck is open and that **Copy JSON** (footer) pasted into the chat brings the answers back. Continue or end the turn; never block or poll.
4. When the JSON arrives, treat it as the execution contract: `status: "skipped"` means decide later (re-ask later, never assume a rejection); `chosen: "CUSTOM"` means execute `customText` as stated (ask if it does not add up); read each item's `note`.

## `--wait` (blocking, same-turn answer)

Outside Orca, use it only when the next step needs the answer in this turn. `bun "<skill-dir>/cli/index.ts" <specPath> --wait` serves the deck over loopback (`--port`, default the deck's stable port) with a per-run `x-mkd-token` submit gate, waits for the submit (`--timeout <min>`, default 1440), prints the Result JSON to stdout (the only thing on stdout) and backs it up to `~/.mkd/result-<name>.json`. Image paste (clipboard to attachment) works only here and in the Orca flow: `images` arrive as absolute paths under `~/.mkd/` you can `Read`.

| Exit | Meaning | What to do |
| --- | --- | --- |
| 0 | submitted, Result JSON on stdout | parse it, continue the turn |
| 1 | timeout without submission (or runtime error) | the user is away, not an error: post a standby note, offer to relaunch |
| 2 | bad spec | fix the spec at the reported path, re-run |
| 130 | Ctrl-C | the user cancelled: ask what they want next |
| 143 | SIGTERM | relaunch with the same spec; the stable port brings saved answers back |
