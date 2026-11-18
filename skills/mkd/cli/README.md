# `mkd` — MKD (Make Decision) decision-deck CLI

MKD is a local decision-deck CLI. An AI agent (or any caller) writes a **spec**
JSON describing a deck of items — decisions with justified options, questions,
report sections, answerable tables — and runs the CLI with Bun. The CLI renders
a self-contained browser page where the user works through the deck **one
screen at a time** (progress rail, arrow keys, skip, live stats, localStorage
persistence, light/dark theme).

Three modes:

- **copy (default outside Orca, non-blocking):** render
  `~/.mkd/deck-<name>.html`, open the browser, exit 0. The user presses
  **Copy JSON** whenever they finish and pastes the Result into the chat.
- **wait (`--wait`, and the default inside Orca):** serve the same page over
  loopback HTTP, await the browser's `POST /submit` (guarded by a per-run
  `x-mkd-token`), print the Result JSON to stdout, exit 0. Only this mode
  supports clipboard-image paste (the server persists the bytes to `~/.mkd/`
  files).
- **artifact (`--artifact`, Claude Code only, never automatic):** render a
  claude.ai Artifact page fragment to `~/.mkd/artifact-<name>.html` (`<title>`
  first, no doctype/html/head/body/meta), print its path on stdout, open
  nothing, exit 0. The agent publishes it with its `Artifact` tool and
  `capabilities: {db: {}, comments: {}}`; the page's **Send to Claude** writes
  the Result to the artifact db (`results/<session>`, field `result`) and posts
  a `comments.sendToClaude` notice that wakes the watching session. Image paste
  is off; Copy JSON stays as the fallback.

Inside Orca (`ORCA_TERMINAL_HANDLE` set, or `orca status --json` reports a
reachable runtime) the wait-mode page opens in a browser tab bound to the
current worktree (`orca tab create --worktree path:<git toplevel>`), checked
with `orca tab list` (tab present, `loadError` null), and closed again when the
run ends. Any failure falls back to the system browser with a stderr note.
`orca.ts` holds that logic; every spawn goes through an injectable runner so
`orca.test.ts` covers it without Orca installed.

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
| `--wait` | off (on inside Orca) | Blocking mode: serve + await submit + print Result to stdout. |
| `--copy` | off | Copy mode even inside Orca. Mutually exclusive with `--wait` (exit 2). |
| `--port <n>` | stable per deck | Wait mode only. Default derived from the deck name in 4747-4946; auto-increments past a busy port (~20 attempts) and says so. |
| `--timeout <min>` | `1440` | Wait mode only. Minutes to wait (fractional ok). No submit → exit 1. |
| `--no-open` | off | Open nothing, neither browser nor Orca tab (path/URL still printed to stderr). |
| `--artifact` | off | Artifact mode (see above). Skips Orca detection. Mutually exclusive with `--wait` and `--copy` (exit 2). |
| `--title-prefix <s>` | — | Artifact mode only (exit 2 otherwise): the page title becomes `<s> · <spec title>`. Pass the session name. |
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

stdout carries one machine-readable value per run, emitted once: the `--wait`
Result JSON (a single object), or the `--artifact` fragment path (one line).
Copy mode writes nothing to stdout. Every banner, path, URL and error
goes to **stderr** (`console.error`); the CLI never calls `console.log`. This
lets a caller `JSON.parse` stdout cleanly.

`--wait` also writes a backup to `~/.mkd/result-<name>.json` (`<name>` derived
from a `spec-<name>.json` filename, else a short epoch id). The stdout copy is
authoritative; the server reshapes the browser payload against the spec
(unknown items dropped, stats recomputed) before it is emitted.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Copy mode: deck rendered + opened. `--wait`: submitted, Result on stdout. `--artifact`: fragment written, path on stdout. |
| `1` | Wait-mode timeout or a runtime error. SIGINT (Ctrl-C) exits `130`, SIGTERM `143`. |
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

## Media

Specs can carry `media` on the intro, on any item and on any decision option:
images, videos, Loom/YouTube embeds, link cards, Mermaid diagrams and SVGs
(field reference: `../references/schema.md`, "Media"). Media is display only
and never changes the Result.

`media.ts` resolves media once, after validation and before any mode renders:

- Local files are inlined as `data:` URIs, so copy, wait and artifact pages are
  self-contained; https URLs stay URLs. A missing file exits 2.
- SVGs are sanitized with Bun's `HTMLRewriter` (no script, event handlers,
  `foreignObject`, links or external references) and rendered as images.
- Local videos are transcoded with ffmpeg when it is on PATH (WebM VP9, 480p,
  about 700 kbps, no audio, 24 fps cap) and cached in `~/.mkd/media/` by
  content hash, with a poster from the first frame. ffmpeg is optional: without
  it the file is inlined as is and the CLI says so on stderr.
- Link cards with missing fields read the page's Open Graph tags at build time
  (5 s timeout, redirects followed, 512 KB cap, no cookies); on failure the card
  is a plain titled link and stderr says why.
- Budgets: 6 MB per video; a warning when a page passes 8 MB; `--artifact`
  exits 2 above 14 MB and names the heaviest media.

Mermaid is never bundled: a deck with a diagram loads
`https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js` (pinned,
with SRI) when a diagram is first shown, renders with `securityLevel: 'strict'`
in the deck theme, and keeps the source code block when the script or the
diagram fails. Embeds are sandboxed iframes on `loom.com/embed` or
`youtube-nocookie.com/embed` only, always followed by an "Open in new tab" link.

### Artifact mode loads nothing remote

The claude.ai artifact viewer admits only the page's own content, Google Fonts
and npm scripts on `cdn.jsdelivr.net`, so remote frames and images are blocked.
With `--artifact`, `prepareForArtifact` (in `media.ts`) runs after
`resolveMedia`:

- Embeds become poster cards: a build-time thumbnail (YouTube `hqdefault.jpg`,
  Loom oEmbed `thumbnail_url`, preferring its still JPEG), inlined when under
  150 KB, with a play icon and an "Open video in a new tab" link. No iframe is
  emitted.
- https images, link-card images and video posters are fetched and inlined when
  under 200 KB; otherwise images show their `alt` text and link cards render
  without a picture.
- `findBlockedResources` scans the final HTML and prints a stderr warning for
  any remaining remote resource (img, iframe, video, audio, source, track,
  embed, object, a stylesheet other than Google Fonts, a script outside
  `cdn.jsdelivr.net/npm/`).

Mermaid stays a lazy `cdn.jsdelivr.net/npm/mermaid@<exact version>` script
with SRI, which the artifact rules allow. Copy and wait modes are unchanged.

## File layout

```
skills/mkd/cli/
  index.ts     # CLI entry: parse args, validate spec, copy mode (render+open+exit) / wait mode (serve+await+print) / artifact mode (render fragment+print path)
  orca.ts      # Orca detection, worktree selector, stable port, tab open/verify/close (injectable runner)
  orca.test.ts # bun test: detection, selector, port derivation, mode choice, tab fallback (mocked spawns)
  server.ts    # Bun.serve: GET / -> page | POST /submit -> shape against spec + resolve; token gate, timeout
  render.ts    # builds the deck HTML (header/rail, one card per item, footer bar, inline CSS+JS+spec); full document or artifact fragment
  render.test.ts # bun test: artifact fragment contract, copy/wait output pinned to pre-artifact hashes, --artifact CLI contract
  schema.ts    # Spec / Item / Result types + hand-rolled validateSpec (source of truth, hard rule lives here), media validation
  media.ts     # build-time media: inlining, svg sanitizing, ffmpeg video, link previews, page budgets (injectable deps)
  media.test.ts # bun test: media validation, inlining, svg sanitizing, link-card fallback (local fake server), budgets, markup
  markdown.ts  # minimal markdown -> HTML (dependency-free)
  ui/app.css   # deck stylesheet: verdigris+amber tokens, light/dark, all components
  ui/app.js    # client logic: deck navigation, per-type builders, quotes, images, persistence, JSON/copy/submit (server or artifact db)
  README.md    # this file
```
