---
name: mkd
description: "Decision deck in the browser for collecting many decisions or point-by-point feedback. Use when more than about three decisions need the person's verdict, each with justified options; when a long plan or report needs a reaction per section. Not for one yes/no or a two-option pick (use the harness question tool)."
license: MIT
compatibility: [claude-code, opencode, cursor, codex]
allowed-tools: Bash(bun:*), Bash(command:*)
complementary_categories: [meta-skill]
---

# MKD (`mkd`) — Make Decision

MKD renders a browser deck where the user works through items **one screen at a time** (Slack Catch-Up style): decisions with justified options, questions with controls, report sections to react to, answerable tables. The answers come back as a **Result JSON**, which is the **execution contract**: execute exactly what it says.

No install step: the AI runs `bun "<skill-dir>/cli/index.ts" <specPath> [flags]` from the skill directory (`<repo>/.claude/skills/mkd` or `~/.claude/skills/mkd`). Output (decks, results, images) lands under `~/.mkd/`, so a repo gets **zero footprint**. If Bun is missing, tell the user to install it (`curl -fsSL https://bun.sh/install | bash`); never substitute Node.

## Use it when

| Situation | Use |
| --- | --- |
| 1-2 option pick, one yes/no, up to 3 simple decisions | the harness question tool |
| More than 3 decisions, or decisions needing context and written tradeoffs | **MKD** |
| A long report or plan to react to section by section | **MKD** (`report` items) |
| Row-by-row verdicts over a table | **MKD** (`table` item) |
| A reply anchored to exact phrases | **MKD** (highlight-to-quote) |
| No human at a browser (CI, non-interactive) | neither: emit plain output |

## Writing a spec

Read `references/examples.md` (copy-pasteable specs) before writing the first one, and `references/schema.md` for every field, default and validation rule. A spec is a list of **items**, one screen each:

| Type | Screen | Answer captured |
| --- | --- | --- |
| `decision` | Problem (plain PM language), collapsible context balloons, options with written justification, optional custom option, note | `chosen` key (or `"CUSTOM"` + `customText`), `wasRecommended`, `note` |
| `question` | Markdown content, `single`/`multi`/`toggle` control, free text | `controlAnswer`, `text`, `quotes` |
| `report` | A report section to react to | `text`, `quotes` |
| `table` | One answer per row (popover controls + text) | `rows[]` with `controlAnswer`/`text`/`quotes`, plus item `note` |

Deck chrome, always on: intro screen, progress rail, arrow-key navigation, per-item **Skip for now** (decide later, never a rejection), summary screen, live footer stats, light/dark theme, localStorage persistence (closing the tab loses nothing).

### Justified options (the point of the tool)

1. Every option carries a written `justification`: what it buys and what it costs. The validator rejects an option without one (exit 2).
2. At most one option is `recommended`, and its justification says why it is the recommendation ("**Recommended** because ...").
3. The `problem` is plain language for someone without the full technical context; jargon and codenames go inside `context` balloons that explain how things work today.
4. Every real tradeoff the user should know about is written down: an unexplained option list is the failure this tool exists to remove.

5. **Even-handed justifications.** Give every option a justification of similar length (within about 20%), the same structure (value, then cost) and the same tone, so length and warmth do not reveal your pick. The recommendation lives only in the recommended option's own text and its `recommended` flag: the `problem`, the `context` and the other options never name it or lean toward it.
6. Refer to options by `label`, never by letter: the user can **Shuffle** the options, and the letters then follow the screen position, not the spec `key`. The Result still carries your original `key` in `chosen`.

Write `title`, `problem`, `content` and justifications in the user's language; the UI chrome is English.

## Pick the flow

The CLI never picks artifact mode by itself (it cannot call the `Artifact` tools): you opt in with `--artifact`. Check your own tool list, not `CLAUDECODE=1`, which proves the harness and not the `Artifact` tool.

| Environment | Flow | Command |
| --- | --- | --- |
| Claude Code with `Artifact`, `ArtifactData`, `ArtifactComments` (signed in to claude.ai), main session | **artifact mode** | `<spec> --artifact --title-prefix <session-name>`, then publish and watch |
| Inside Orca (`ORCA_TERMINAL_HANDLE` set or `orca status --json` reachable) | **Orca flow**: tab next to the terminal, blocks until Send, Result on stdout. Run it in the background | `<spec>` |
| Anything else, no answer needed in this turn | **copy mode**: opens the browser, exits; the user pastes the JSON | `<spec>` |
| Anything else, the next step needs the answer now | **`--wait`**: serves, blocks until submit, Result on stdout | `<spec> --wait` |

A subagent, a print session or Claude Code without the `Artifact` tool cannot hold a watch: use the Orca, copy or `--wait` rows. Other flags: `--copy` (force copy mode inside Orca), `--no-open`, `--port <n>`, `--timeout <min>`.

**Before running any flow, read the matching section of `references/flows.md`**: it holds the exact steps, the pending-deck rule for artifact mode, ports, exit codes and the `open-artifact <url>` subcommand.

## Reading the Result

```jsonc
{ "session": "...", "submittedAt": "...",
  "stats": { "total": 8, "answered": 6, "skipped": 1, "recFollowed": 4, "overridden": 1, "custom": 1 },
  "items": [ { "id": "D1", "type": "decision", "status": "answered", "chosen": "A", "chosenLabel": "...", "wasRecommended": true, "customText": "", "note": "..." } ] }
```

- `status: "skipped"` means decide later: re-ask later, never assume a rejection.
- `chosen: "CUSTOM"` means execute `customText` as stated; ask if it does not add up. Read every item's `note`.
- `controlAnswer` decodes by control: `single` is `string|null`, `multi` is `string[]`, `toggle` is `boolean`.
- `quotes` are exact phrases the user highlighted: weight them when interpreting `text`.
- Match `items[].id` and `rows[].id` back to the ids you authored. Full shape: `references/schema.md`.
- Artifact mode stores the same object as a JSON string in `results/<session>` (field `result`).

The page loads its display fonts from Google Fonts with system fallbacks; offline it degrades gracefully. The CLI uses Bun built-ins only (`cli/README.md`).
