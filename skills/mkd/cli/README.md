# `mkd` — MKD (Make Decision) decision-deck CLI

MKD is a local decision-deck CLI. An AI agent (or any caller) writes a **spec**
JSON describing a deck of items — decisions with justified options, questions,
report sections, answerable tables — and runs the CLI with Bun. The CLI renders
a self-contained browser page where the user works through the deck **one
screen at a time** (progress rail, arrow keys, skip, live stats, localStorage
persistence, light/dark theme).

Two modes:

- **copy (default, non-blocking):** render `~/.mkd/deck-<name>.html`, open the
  browser, exit 0. The user presses **Copy JSON** whenever they finish and
  pastes the Result into the chat.
- **`--wait` (blocking):** serve the same page over loopback HTTP, await the
  browser's `POST /submit` (guarded by a per-run `x-mkd-token`), print the
  Result JSON to stdout, exit 0. Only this mode supports clipboard-image paste
  (the server persists the bytes to `~/.mkd/` files).

## Decoupling guarantee

`skills/mkd/cli/` imports **only Bun built-ins** — no repo aliases, no external
npm dependencies. The HTTP server is native `Bun.serve`; the markdown renderer
and spec validation are hand-rolled. UI assets are embedded via
`with { type: 'text' }` imports. This keeps the skill independently
extractable.

## Run (no install)

```bash
bun skills/mkd/cli/index.ts <specPath> [flags]
```

There is no compiled binary and no PATH entry — the AI runs it straight from
the skill directory (`.claude/skills/mkd/cli/index.ts` in a consumer repo).

## Flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `<specPath>` | — | **Required** positional. Path to a spec JSON file. |
| `--wait` | off | Blocking mode: serve + await submit + print Result to stdout. |
| `--port <n>` | `4747` | `--wait` only. Auto-increments past a busy port (~20 attempts). |
| `--timeout <min>` | `1440` | `--wait` only. Minutes to wait (fractional ok). No submit → exit 1. |
| `--no-open` | off | Do not auto-open the browser (path/URL still printed to stderr). |
| `--help` | — | Print usage to stderr and exit 0. |

## Spec + Result contract (brief)

A spec is `{ session, source?, title, intro?, submitLabel?, items[] }`. Each
item is one of:

- `decision` — `problem` (markdown) + `context[]` balloons + `options[]`, where
  **every option carries a non-empty `justification`** (validator-enforced) and
  at most one is `recommended`. Optional custom option + a note field.
- `question` — markdown `content` + `controls` (`single` | `multi` | `toggle`)
  + a free-text field.
- `report` — a markdown section with a free-text reaction field.
- `table` — `{ columns, rows, rowControls?, rowText? }`; each row answers
  independently via a popover; cells are highlight-to-quote sources.

The Result is `{ session, source?, submittedAt, stats, items[] }` with
per-type answer fields and `status: answered | skipped | pending` per item.
`stats` carries `total / answered / skipped / recFollowed / overridden /
custom`. Full field-by-field contract and validation rules: `schema.ts` (the
source of truth), mirrored in `../references/schema.md`. Worked specs:
`../references/examples.md`.

## stdout discipline

stdout carries **only** the `--wait` Result JSON — a single object, emitted
once. Copy mode writes nothing to stdout. Every banner, path, URL and error
goes to **stderr** (`console.error`); the CLI never calls `console.log`. This
lets a caller `JSON.parse` stdout cleanly.

`--wait` also writes a backup to `~/.mkd/result-<name>.json` (`<name>` derived
from a `spec-<name>.json` filename, else a short epoch id). The stdout copy is
authoritative; the server reshapes the browser payload against the spec
(unknown items dropped, stats recomputed) before it is emitted.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Copy mode: deck rendered + opened. `--wait`: submitted, Result on stdout. |
| `1` | `--wait` timeout or a runtime error. SIGINT (Ctrl-C) exits `130`. |
| `2` | Spec file unreadable, or failed validation (stderr: `[mkd] invalid spec at <path>: …`). |

## Markdown subset supported

`problem`, `content`, balloon bodies, intro body and option justifications are
rendered by a dependency-free renderer (`markdown.ts`). Source HTML special
characters are escaped first, then markdown transforms run on top, so AI/user
content can never inject live markup.

Supported: ATX headings 1-6, bold, italic, inline code, fenced code blocks,
`http`/`https`/`mailto` links, one-level lists, paragraphs (single newline →
`<br>`). Out of scope (escaped plain text): md tables, images, nested
blockquotes, deep-nested lists.

## File layout

```
skills/mkd/cli/
  index.ts     # CLI entry: parse args, validate spec, copy mode (render+open+exit) / --wait (serve+await+print)
  server.ts    # Bun.serve: GET / -> page | POST /submit -> shape against spec + resolve; token gate, timeout
  render.ts    # builds the full deck HTML (header/rail, one card per item, footer bar, inline CSS+JS+spec)
  schema.ts    # Spec / Item / Result types + hand-rolled validateSpec (source of truth, hard rule lives here)
  markdown.ts  # minimal markdown -> HTML (dependency-free)
  ui/app.css   # deck stylesheet: verdigris+amber tokens, light/dark, all components
  ui/app.js    # client logic: deck navigation, per-type builders, quotes, images, persistence, JSON/copy/submit
  README.md    # this file
```
