---
name: mkd
description: "MKD (`mkd` — Make Decision) — a local, browser-based decision-deck CLI the AI drives to collect structured human feedback: decisions with justified options, questions, report reactions and answerable tables, one screen at a time (Slack Catch-Up style). WHEN to use: the AI has MORE THAN ~3 decision points or a long multi-section report/plan that needs the user's verdict point by point. It beats `AskUserQuestion` (capped at ~4 questions × ~4 options, terminal-bound, no rich free-text, cannot show reference content) and beats an inline prose questionnaire (unanchored replies the AI must guess-map back). HOW it works: the AI writes a spec JSON of `items` (`decision` | `question` | `report` | `table`), runs `bun <skill-dir>/cli/index.ts <specPath>` (no install, no binary), and the CLI renders a self-contained deck page under `~/.mkd/`, opens the browser and EXITS immediately — the user answers at their own pace (progress rail, arrow keys, skip = decide later, live stats, localStorage persistence) and pastes the copied Result JSON back into the chat, which the AI treats as the execution contract. Add `--wait` only when the answer is needed the same turn (blocking loopback server, Result JSON on stdout). HARD RULE: every decision option MUST carry a written justification (value + cost), and the recommended option's justification must state WHY it is recommended — the validator rejects options without one. Triggers on: `mkd`, `make decision`, `decision deck`, `catch-up`, `catchup`, `decision form`, `feedback UI`, `ask me point by point`, `let me answer in the browser`, `review this plan point by point`, `react to each section`, `more than three questions`, `decisiones de auditoría`, `tomar decisiones`. Use this skill even when the user does not say `mkd` — if the task is to collect granular decisions or anchored feedback on many points, this is the right tool. Do NOT use for: a trivial 1-2 option pick or a single yes/no (use `AskUserQuestion`), or any non-interactive / CI / one-shot output where there is no human at a browser."
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
bun "<skill-dir>/cli/index.ts" <specPath> [--wait] [--no-open] [--port <n>] [--timeout <min>]
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

## Exact invocation — default (copy mode, non-blocking)

1. **Write the spec** to `~/.mkd/spec-<name>.json` (that filename makes the page land at `~/.mkd/deck-<name>.html`). Keeping it under `~/.mkd/` keeps the repo clean.
2. **Run:** `bun "<skill-dir>/cli/index.ts" ~/.mkd/spec-<name>.json`. The CLI validates, renders a self-contained page, opens the browser, and **exits 0 immediately**. Nothing lands on stdout.
3. **Tell the user** the deck is open in their browser and that pressing **Copy JSON** (footer) and pasting it into the chat brings the answers back. Then continue with other work or end the turn — do NOT block or poll.
4. **When the pasted JSON arrives**, parse it and treat it as the execution contract: `status: "skipped"` items are "decide later" (re-ask later, never assume a rejection); `chosen: "CUSTOM"` means execute `customText` as stated (or ask if something does not add up); always read each item's `note`.

## `--wait` (blocking, same-turn answer)

Use only when the AI genuinely needs the answer in the same turn to continue:

- `bun "<skill-dir>/cli/index.ts" <specPath> --wait` serves the deck over loopback (`--port`, default 4747, auto-increments) with a per-run `x-mkd-token` submit gate, waits for the browser's submit (`--timeout <min>`, default 1440 = 24h), then prints the Result JSON to **stdout** (the ONLY thing on stdout; banners/errors go to stderr) and writes a backup to `~/.mkd/result-<name>.json`.
- Image paste (clipboard → attachment) works **only** in `--wait` mode: entries in `images` arrive as absolute file paths under `~/.mkd/` the AI can `Read`. Copy mode disables paste (no server to persist bytes).

Exit codes and absence protocol (`--wait`):

| Exit | Meaning | What the AI does |
| --- | --- | --- |
| 0 | submitted — Result JSON on stdout | parse it, continue the same turn |
| 1 | timeout with NO submission (or runtime error) | user is AWAY, not an error — post a standby note, offer to relaunch |
| 2 | bad spec (unreadable / failed validation) | fix the spec at the reported path, re-run |
| 130 | Ctrl-C | the user cancelled — ask what they want next |

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

- `controlAnswer` decodes by control type: `single` → `string|null`, `multi` → `string[]`, `toggle` → `boolean`.
- `quotes` are exact phrases the user highlighted from that item's content (or that row's cells) — weight them when interpreting `text`.
- Match `items[].id` (and `rows[].id`) back to the ids you authored to anchor every answer.

## Notes

- UI chrome is English (repo-artifact rule); `title`/`problem`/`content`/justifications are whatever language you author — write them in the user's language.
- The page loads its display fonts from Google Fonts with full system fallbacks; offline it degrades gracefully.
- The CLI is decoupled (Bun built-ins only, zero external deps) — see `cli/README.md`.
