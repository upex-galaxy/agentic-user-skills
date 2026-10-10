---
name: mkd
description: "MKD (`mkd` — Make Decision) — a local, browser-based decision-deck CLI the AI drives to collect structured human feedback: decisions with justified options, questions, report reactions and answerable tables, one screen at a time (Slack Catch-Up style). WHEN to use: the AI has MORE THAN ~3 decision points or a long multi-section report/plan that needs the user's verdict point by point. It beats `AskUserQuestion` (capped at ~4 questions × ~4 options, terminal-bound, no rich free-text, cannot show reference content) and beats an inline prose questionnaire (unanchored replies the AI must guess-map back). HOW it works: the AI writes a spec JSON of `items` (`decision` | `question` | `report` | `table`), runs `bun <skill-dir>/cli/index.ts <specPath>` (no install, no binary), and the CLI renders a self-contained deck page under `~/.mkd/`, opens the browser and EXITS immediately — the user answers at their own pace (progress rail, arrow keys, skip = decide later, live stats, localStorage persistence) and pastes the copied Result JSON back into the chat, which the AI treats as the execution contract. Inside Orca (multi-agent IDE) the default changes: the CLI serves the deck, opens it in a browser tab bound to the current worktree and BLOCKS until the user presses Send, then prints the Result JSON on stdout, so the AI must run it in the background (`--copy` restores the copy-paste flow). Add `--wait` outside Orca only when the answer is needed the same turn (blocking loopback server, Result JSON on stdout). In Claude Code with the `Artifact` tool, pass `--artifact`: the CLI renders a claude.ai Artifact page, the agent publishes it with `capabilities: {db: {}, comments: {}}` and arms a watch, and the user's Send to Claude wakes the session with the Result in the artifact's db (no localhost, no copy-paste); other harnesses keep the flows above. HARD RULE: every decision option MUST carry a written justification (value + cost), and the recommended option's justification must state WHY it is recommended — the validator rejects options without one. Triggers on: `mkd`, `make decision`, `decision deck`, `catch-up`, `catchup`, `decision form`, `feedback UI`, `ask me point by point`, `let me answer in the browser`, `review this plan point by point`, `react to each section`, `more than three questions`, `decisiones de auditoría`, `tomar decisiones`, `mkd artifact`, `answer in a claude.ai artifact`. Use this skill even when the user does not say `mkd` — if the task is to collect granular decisions or anchored feedback on many points, this is the right tool. Do NOT use for: a trivial 1-2 option pick or a single yes/no (use `AskUserQuestion`), or any non-interactive / CI / one-shot output where there is no human at a browser."
license: MIT
compatibility: [claude-code, opencode, cursor, codex]
allowed-tools: Bash(bun:*), Bash(command:*)
complementary_categories: [meta-skill]
---

# MKD (`mkd`) — Make Decision

MKD is a local decision-deck CLI the AI invokes mid-conversation. It renders a browser page where the user works through a deck of items **one screen at a time** (Slack Catch-Up style): decisions with justified options, questions with controls, report sections to react to, and answerable tables. The default flow is **non-blocking copy-paste**: the CLI opens the page and exits; the user answers whenever they want and pastes the Result JSON into the chat. That JSON is the **execution contract** — the AI executes exactly what it says.

This skill needs **no install step**: there is no compiled binary and nothing added to PATH. The AI runs the CLI from the skill directory with Bun. All output (rendered decks, results, images) lands under `~/.mkd/` — never the cwd — so running it inside any repo leaves **zero footprint** there.

## Running it (no install)

```bash
bun "<skill-dir>/cli/index.ts" <specPath> [--wait | --copy] [--no-open] [--port <n>] [--timeout <min>]
bun "<skill-dir>/cli/index.ts" <specPath> --artifact --title-prefix <session-name>   # Claude Code only
```

`<skill-dir>` is this skill's install directory:

- project-level: `<repo>/.claude/skills/mkd`
- user-level: `~/.claude/skills/mkd`

Bun runs TypeScript directly; cold start is negligible. If Bun is missing, tell the user to install it (`curl -fsSL https://bun.sh/install | bash`) — do not substitute Node.

## When to use vs `AskUserQuestion` vs inline prose

| Situation | Use |
| --- | --- |
| 1-2 option pick, single yes/no, ≤3 simple decisions | `AskUserQuestion` |
| >3 decision points, or decisions needing context + written tradeoffs | **MKD** |
| A long multi-section report/plan the user should react to point by point | **MKD** (`report` items) |
| Row-by-row verdicts over tabular data | **MKD** (`table` item) |
| The reply must be ANCHORED to exact phrases | **MKD** (highlight-to-quote) |
| Non-interactive / CI / no human at a browser | neither — emit plain output |

## The deck model

A spec is a list of **items**; each item is one screen. Four types:

| Type | What the screen holds | Answer captured |
| --- | --- | --- |
| `decision` | Problem statement (plain PM language) + collapsible context balloons + options **with written justification** + optional custom option + note | `chosen` key (or `"CUSTOM"` + `customText`), `wasRecommended`, `note` |
| `question` | Markdown content + `single`/`multi`/`toggle` control + free text | `controlAnswer`, `text`, `quotes` |
| `report` | A report section to react to | `text`, `quotes` |
| `table` | Answerable table, one answer per row (popover controls + text) | `rows[]` each with `controlAnswer`/`text`/`quotes`, plus item `note` |

Deck chrome, always on: intro screen (headline + markdown + stat tiles), navigable progress rail, ← → arrow keys, per-item **Skip for now** (skipped = decide later, NOT a rejection), summary screen, live footer stats (answered / rec followed / changed / custom / skipped), light/dark theme, localStorage persistence (closing the tab loses nothing).

## HARD RULE — justified options (this is the point of the tool)

When authoring `decision` items:

1. **Every option carries a written `justification`**: what it buys (value) and what it costs. The validator **rejects** any option without one (exit 2) — do not fight it, write the justification.
2. **At most one option is `recommended`**, and its justification must state **why it is the recommendation** explicitly (e.g. "**Recommended** because …").
3. The `problem` is written in **plain language** (PM voice) for someone without the full technical context; jargon and internal codenames go inside `context` balloons that explain how things work today.
4. Every real tradeoff the user should know about goes in writing. An unexplained option list is exactly the failure mode this tool exists to eliminate.

## Spec schema in brief

```jsonc
{
  "session": "audit-skills-alignment",   // required — result echo + persistence key
  "source": ".session/.../audit.md",     // optional pointer to the source artifact
  "title": "Catch-Up: audit decisions",  // required
  "intro": {                              // optional intro screen
    "headline": "8 decisions await you",
    "body": "Markdown, PM voice",
    "stats": [{ "n": "115", "label": "verified findings" }]
  },
  "items": [
    {
      "id": "D1", "type": "decision", "title": "…",
      "severity": "high",                // optional: high | medium | low (chip)
      "scope": "test-documentation",     // optional (chip)
      "problem": "Plain-language markdown problem statement",
      "context": [{ "title": "How does X work today?", "body": "markdown" }],
      "options": [
        { "key": "A", "label": "…", "justification": "Value + cost. **Recommended** because …", "recommended": true },
        { "key": "B", "label": "…", "justification": "Value + cost." }
      ],
      "allowCustom": true                // default true
    },
    { "id": "Q1", "type": "question", "title": "…", "content": "markdown",
      "controls": { "type": "single", "required": true, "options": [{ "value": "keep", "label": "Keep" }] },
      "text": { "placeholder": "Why?" } },
    { "id": "R1", "type": "report", "title": "…", "content": "markdown section" },
    { "id": "T1", "type": "table", "title": "…", "content": "optional intro",
      "table": { "columns": ["Test", "Rate"], "rows": [{ "id": "r1", "cells": ["a", "b"] }],
                 "rowControls": { "type": "single", "options": [ … ] } } }
  ]
}
```

Full contract (every field, defaults, validation rules) → `references/schema.md`. Worked copy-pasteable specs → `references/examples.md`.

## Which flow to use: by harness

Pick the flow from the harness you are running in. Artifact mode needs the `Artifact`, `ArtifactData` and `ArtifactComments` tools, which only Claude Code has (and only when the session is signed in to claude.ai). The CLI cannot call those tools, so it never picks artifact mode by itself: you opt in with `--artifact` and publish the page yourself.

| Harness | Flow | How |
| --- | --- | --- |
| **Claude Code** with the `Artifact` tool in its tool list | **artifact mode** | `--artifact --title-prefix <session-name>`, then publish + watch (steps below) |
| Claude Code without the `Artifact` tool (not signed in to claude.ai: API key, Bedrock, Vertex), or a subagent / print session (it cannot hold a watch) | the flows for other harnesses | as below |
| OpenCode, Cursor, Codex, any other | Orca tab inside Orca, else copy mode; `--wait` for a same-turn answer | see "Which flow runs: Orca or not" |

Claude Code sets `CLAUDECODE=1` in the shells it runs. That proves the harness, not that this session has the `Artifact` tool, so the CLI only prints a one-line stderr hint when it sees it and keeps its usual default. Check your own tool list instead.

## Exact invocation — Claude Code (artifact mode)

The user answers inside a claude.ai artifact. **Send to Claude** saves the Result JSON in the artifact's database and posts a comment addressed to Claude, which wakes this session. Nothing runs on localhost and there is nothing to copy.

1. **Write the spec** to `~/.mkd/spec-<name>.json`, then **run**:
   `bun "<skill-dir>/cli/index.ts" ~/.mkd/spec-<name>.json --artifact --title-prefix <session-name>`.
   The session name is the first line of `ListAgents` ("This session is …") or the terminal title. The CLI validates the spec, writes `~/.mkd/artifact-<name>.html` (a page fragment: `<title>` first, no doctype/html/head/body), prints **only that path on stdout**, opens nothing and exits 0. stderr names the db document the answer will land in. Exit 2 = bad spec, as always.
2. **Publish** it with the `Artifact` tool: `file_path` = the printed path, an `icon` (e.g. `checklist`), a one-line `description`, and `capabilities: {db: {}, comments: {}}`. Give the user the link.
3. **Confirm the watch**: `ArtifactComments` with `action: "watch"` and no `url` lists this session's watches. The artifact's row must say **auto-replies armed**; if it does not, call `watch` with its `url`. Only an armed watch lets the Send wake this session. Then end the turn or keep working; do not poll.
4. **On wake-up** (a comment sent to Claude on that artifact): `ArtifactData` `action: "get"`, `collection: "results"`, `doc_id`: the spec's `session` (stderr printed the exact id; characters a db path rejects become `-`). The `result` field is the Result JSON string: parse it and treat it as the execution contract, exactly as in copy mode. Reply to the comment thread with what you will do and resolve it (`ArtifactComments` `reply`, then `resolve`).
5. **To fix the deck**, edit the spec, re-run the same command and publish the same `file_path` again (or pass the artifact `url` from another conversation): the URL stays, and saved answers persist because browser storage belongs to the artifact.

If the page shows "Sending is not available in this view" (the viewer lacks the `db` grant, e.g. someone with view-only access), the user can still press **Copy JSON** and paste it into the chat. If the answers saved but the notice failed ("Saved, but Claude was not notified"), the user tells you in the chat and you read the db document as in step 4. Image paste is off in artifact mode (no server to store the bytes).

## Which flow runs: Orca or not

The CLI checks for Orca before it opens anything. Orca counts as present when `ORCA_TERMINAL_HANDLE` is set (the process runs in an Orca-managed terminal) or when `orca status --json` reports a reachable runtime. The executable is resolved the way Orca's own `orca-cli` skill does it: `ORCA_CLI_COMMAND`, then `orca-dev` in an Orca dev checkout, then `orca-ide` on Linux outside a managed terminal (bare `orca` there is usually the GNOME screen reader), then `orca`. A failed check counts as "no Orca" and prints nothing.

| Environment | Flags | What happens |
| --- | --- | --- |
| No Orca | none | **copy mode**: render, open the system browser, exit 0. Unchanged. |
| No Orca | `--wait` | serve, open the system browser, block until submit |
| Orca | none | **Orca flow**: serve, open a tab bound to the current worktree, block until the user presses **Send to Claude**, Result JSON on stdout |
| Orca | `--copy` | copy mode, system browser, exit 0 (the old flow) |
| any | `--no-open` | same mode as above, but nothing is opened; the path or URL goes to stderr |

The tab is bound with `--worktree path:<git toplevel of the cwd>`, so run the CLI from inside the checkout the user is working in. After `orca tab create` the CLI reads `orca tab list` and checks that the tab exists and its `loadError` is null. If the tab cannot be created or the page fails to load, the CLI closes any tab it created, opens the system browser instead and says so on stderr. When the run ends (submit, timeout, Ctrl-C or SIGTERM) it closes the tab it opened; if the close fails, stderr says the tab now points to a dead server.

## Exact invocation — inside Orca (default there)

The CLI blocks until the user submits, so never run it in the foreground: a foreground call would hold the agent's turn for up to 24h.

1. **Write the spec** to `~/.mkd/spec-<name>.json`.
2. **Run it in the background**, from the user's checkout:
   - **Claude Code**: Bash tool with `run_in_background: true` on `bun "<skill-dir>/cli/index.ts" ~/.mkd/spec-<name>.json`. The harness notifies you when the process exits; read its stdout then. Measured on Orca 1.4.190.
   - **OpenCode / Codex / Cursor** (unverified: none was measured): start it detached with the shell, output under `~/.mkd/`: `nohup bun "<skill-dir>/cli/index.ts" ~/.mkd/spec-<name>.json > ~/.mkd/stdout-<name>.json 2> ~/.mkd/stderr-<name>.log &`. The redirect truncates the log, so once `~/.mkd/stderr-<name>.log` contains `result written to`, this run's submit has landed: read `~/.mkd/result-<name>.json` (the same Result as stdout). If the harness cannot keep a background process alive, pass `--copy` and use the copy-mode steps below.
3. **Tell the user** the deck is open in a tab next to this terminal and that **Send to Claude** returns the answers directly, with nothing to copy. Then end the turn or keep working.
4. **When the process exits**, act on the exit code (table under `--wait`). Exit 0 means stdout holds the Result JSON: treat it as the execution contract, exactly as in copy mode.

**Stable port, persistent answers.** Each deck gets its own port in 4747-4946, derived from `<name>` in `spec-<name>.json` (else from `session`). A half-answered deck reopened from the same spec lands on the same origin, so its saved answers come back. If that port is busy the CLI binds the next free one and says on stderr that answers saved on the original port will not show. `--port <n>` overrides the derived port.

**One copy of a deck at a time.** Browser storage is per origin and per browser engine: the same deck in the system browser and in an Orca tab (or as a `file://` page and over loopback) keeps two sets of answers that never merge. The CLI remembers where it last opened each deck (`~/.mkd/opened-<name>.json`) and warns on stderr when this run opens it somewhere else; when you see that warning, tell the user which copy is live. It also says so when an earlier `~/.mkd/result-<name>.json` backup exists (the next submit overwrites it).

## Exact invocation — default outside Orca (copy mode, non-blocking)

1. **Write the spec** to `~/.mkd/spec-<name>.json` (that filename makes the page land at `~/.mkd/deck-<name>.html`). Keeping it under `~/.mkd/` keeps the repo clean.
2. **Run:** `bun "<skill-dir>/cli/index.ts" ~/.mkd/spec-<name>.json`. The CLI validates, renders a self-contained page, opens the browser, and **exits 0 immediately**. Nothing lands on stdout.
3. **Tell the user** the deck is open in their browser and that pressing **Copy JSON** (footer) and pasting it into the chat brings the answers back. Then continue with other work or end the turn — do NOT block or poll.
4. **When the pasted JSON arrives**, parse it and treat it as the execution contract: `status: "skipped"` items are "decide later" (re-ask later, never assume a rejection); `chosen: "CUSTOM"` means execute `customText` as stated (or ask if something does not add up); always read each item's `note`.

## `--wait` (blocking, same-turn answer)

Outside Orca, use it only when the AI genuinely needs the answer in the same turn to continue. Inside Orca this is already the default flow.

- `bun "<skill-dir>/cli/index.ts" <specPath> --wait` serves the deck over loopback (`--port`, default: the deck's stable port in 4747-4946, auto-increments) with a per-run `x-mkd-token` submit gate, waits for the browser's submit (`--timeout <min>`, default 1440 = 24h), then prints the Result JSON to **stdout** (the ONLY thing on stdout; banners/errors go to stderr) and writes a backup to `~/.mkd/result-<name>.json`.
- Image paste (clipboard → attachment) works **only** in wait mode (`--wait` or the Orca flow): entries in `images` arrive as absolute file paths under `~/.mkd/` the AI can `Read`. Copy mode disables paste (no server to persist bytes).

Exit codes and absence protocol (`--wait` and the Orca flow):

| Exit | Meaning | What the AI does |
| --- | --- | --- |
| 0 | submitted — Result JSON on stdout | parse it, continue the same turn |
| 1 | timeout with NO submission (or runtime error) | user is AWAY, not an error — post a standby note, offer to relaunch |
| 2 | bad spec (unreadable / failed validation) | fix the spec at the reported path, re-run |
| 130 | Ctrl-C | the user cancelled — ask what they want next |
| 143 | SIGTERM (the harness or someone killed the background process) | relaunch with the same spec; the stable port brings saved answers back |

## Reading the Result

```jsonc
{
  "session": "audit-skills-alignment",
  "source": ".session/.../audit.md",
  "submittedAt": "2026-08-21T…",
  "stats": { "total": 8, "answered": 6, "skipped": 1, "recFollowed": 4, "overridden": 1, "custom": 1 },
  "items": [
    { "id": "D1", "type": "decision", "title": "…", "status": "answered",
      "chosen": "A", "chosenLabel": "…", "wasRecommended": true, "customText": "", "note": "…" },
    { "id": "Q1", "type": "question", "status": "answered", "controlAnswer": "keep", "text": "…", "quotes": ["…"] },
    { "id": "R1", "type": "report", "status": "skipped", "controlAnswer": null, "text": "", "quotes": [] },
    { "id": "T1", "type": "table", "status": "answered", "note": "", "quotes": [],
      "rows": [{ "id": "r1", "controlAnswer": "fix", "text": "", "quotes": [] }] }
  ]
}
```

- Artifact mode: the same object, stored as a JSON string in the `result` field of `results/<session>` (next to `session` and `submittedAt`). Like copy mode, it is built by the page and not reshaped by a server.
- `controlAnswer` decodes by control type: `single` → `string|null`, `multi` → `string[]`, `toggle` → `boolean`.
- `quotes` are exact phrases the user highlighted from that item's content (or that row's cells) — weight them when interpreting `text`.
- Match `items[].id` (and `rows[].id`) back to the ids you authored to anchor every answer.

## Notes

- UI chrome is English (repo-artifact rule); `title`/`problem`/`content`/justifications are whatever language you author — write them in the user's language.
- The page loads its display fonts from Google Fonts with full system fallbacks; offline it degrades gracefully.
- The CLI is decoupled (Bun built-ins only, zero external deps) — see `cli/README.md`.
