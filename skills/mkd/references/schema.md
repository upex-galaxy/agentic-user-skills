# MKD — Full data contract

The authoritative source is `../cli/schema.ts` (`validateSpec` + the exported types). This reference mirrors it. If the two ever disagree, the TypeScript wins.

There are two shapes: the **Spec** the AI writes (input), and the **Result** the browser returns (output — pasted into the chat in copy mode, printed to stdout in `--wait` mode, stored in the artifact database in `--artifact` mode). In between, `validateSpec` produces a `NormalizedSpec` (every default filled) which the UI renders — the AI never writes the normalized form directly.

---

## Spec (input — the AI writes it)

### `Spec`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `session` | `string` | yes | Non-empty slug. Echoed in the result; keys the page's localStorage persistence. |
| `source` | `string` | no | Pointer to the artifact the deck was derived from. Echoed in the result. |
| `title` | `string` | yes | Non-empty. Page title + header brand line. |
| `intro` | `SpecIntro` | no | The intro screen. Omit → the intro shows just `title` + the how-it-works legend. |
| `submitLabel` | `string` | no | CTA label for the submit button (`--wait` and `--artifact`). Default `"Send to Agent"`. |
| `items` | `Item[]` | yes | Non-empty array. One item = one screen. |

### `SpecIntro`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `headline` | `string` | no | Intro heading. Defaults to `title`. |
| `body` | `string` | no | Markdown, PM voice. |
| `stats` | `{ n: string \| number, label: string }[]` | no | Stat tiles (e.g. `115 / verified findings`). `n` accepts a number and is normalized to a string. |
| `media` | `MediaEntry[]` | no | Shown under the intro body. See [Media](#media-display-only). |

### `Item` — common fields (all four types)

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | yes | Non-empty AND **unique** across the spec. Anchors the answer. |
| `type` | `'decision' \| 'question' \| 'report' \| 'table'` | yes | Anything else fails validation. |
| `title` | `string` | yes | Non-empty. The card heading + rail tooltip + summary row. |
| `severity` | `'high' \| 'medium' \| 'low'` | no | Rendered as a colored chip in the eyebrow. |
| `scope` | `string` | no | Non-empty when present. Rendered as an accent chip. |
| `media` | `MediaEntry[]` | no | Shown under the problem (decision), the content (question, report) or the table intro. See [Media](#media-display-only). |

### `DecisionItem` (`type: "decision"`)

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `problem` | `string` | yes | Non-empty markdown. Plain-language problem statement. |
| `context` | `ContextBalloon[]` | no | Collapsible "How does X work today?" balloons. Each needs non-empty `title` + `body` (markdown). |
| `options` | `DecisionOption[]` | yes | **At least 2** — one option is not a decision. |
| `allowCustom` | `boolean` | no | Default `true`. Adds the "Something else (custom)" option with its textarea. |
| `optionMediaLayout` | `'large' \| 'compact'` | no | Default `'large'`: option pictures (images, SVGs, video posters, artifact embed thumbnails) preview at card width, one big, two side by side, or one big plus a strip for three or more; other media show as chips. `'compact'` keeps the older row of small thumbnails. Any other value fails validation. |

`DecisionOption`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `key` | `string` | yes | Non-empty, **unique** within the decision, and **not** the reserved `"CUSTOM"`. |
| `label` | `string` | yes | Non-empty. Inline markdown supported. |
| `justification` | `string` | yes | **Non-empty — the HARD RULE.** The written value/cost rationale. Inline markdown supported. An option without it fails validation. |
| `recommended` | `boolean` | no | **At most ONE option per decision** may be `true` (a second fails validation). Its justification must state WHY it is recommended. |
| `media` | `MediaEntry[]` | no | Previews inside the option card (see `optionMediaLayout`). Clicking a preview opens the media viewer on it instead of picking the option; **V** or "View option media" opens the viewer from the keyboard. A media-only option still needs its `justification`. |

Decision extras rendered by the UI (not in the spec): the custom option textarea (when `allowCustom`) and a per-decision "Note for Claude (optional)" textarea.

### `QuestionItem` (`type: "question"`)

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `content` | `string` | yes | Markdown (may be `""`). Quote-source. |
| `controls` | `Controls` | yes | Required on a question — content without controls is a `report`. |
| `text` | `TextField` | no | Defaults to `{ required: false }`. The textarea is ALWAYS rendered; this only governs whether it is required. |

### `ReportItem` (`type: "report"`)

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `content` | `string` | yes | **Non-empty** markdown. Quote-source. |
| `text` | `TextField` | no | Defaults to `{ required: false }`. Feedback textarea, always rendered. |

### `TableItem` (`type: "table"`)

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `content` | `string` | no | Optional markdown intro above the table. Quote-source. |
| `table` | `ItemTable` | yes | The answerable table config. |

`ItemTable`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `columns` | `string[]` | yes | Non-empty array of non-empty strings. |
| `rows` | `TableRow[]` | yes | Non-empty. `TableRow` = `{ id, cells }`: `id` non-empty + unique within the item; `cells.length === columns.length`, each cell a string (`""` allowed). Cells render escaped (stable quote sources). |
| `rowControls` | `Controls` | no | Applied to EVERY row. Omit → rows have only a textarea. |
| `rowText` | `TextField` | no | Defaults to `{ required: false }`. Applied to EVERY row. |

Each row's answer lives behind a compact "Answer" button that opens a popover (controls + textarea + quotes + row reference). The table item also gets a "Note for Claude (optional)" textarea.

### `Controls`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | `'single' \| 'multi' \| 'toggle'` | yes | |
| `options` | `{ value, label }[]` | conditional | **Required + non-empty** for `single`/`multi` (unique non-empty `value`s). **Must be ABSENT** for `toggle`. |
| `required` | `boolean` | no | Default `false`. Gates the `--wait` submit (a **skipped** item is exempt). |

### `TextField`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `required` | `boolean` | no | Default `false`. |
| `placeholder` | `string` | no | Textarea placeholder. |

### Media (display only)

`media` is an array allowed on `intro`, on every item and on every decision option. One entry renders as a figure; two or more render as a carousel (arrows, dots, `1/N` counter, swipe, left/right keys while focused, no auto-play). Media never reaches the Result.

| `type` | Fields | Notes |
| --- | --- | --- |
| `image` | `src`, `alt` (required), `caption?`, `full?` | Click to open the media viewer. `full` is an optional higher-resolution source (same source rules as `src`, raster only) used only in the viewer: the card shows `src`, the viewer swaps to `full` once it loads. In `--artifact` mode a remote `full` is inlined when it is under 2 MB; otherwise the viewer shows `src` with an "Original" link to it. |
| `video` | `src` (mp4, webm or mov), `poster?`, `caption?` | `<video controls muted playsinline preload="metadata">`, never autoplays. Without `poster`, the first frame becomes the poster when ffmpeg is present. |
| `embed` | `url`, `caption?` | Loom (`loom.com/share/<id>`) or YouTube (`watch?v=`, `youtu.be/`, `/shorts/`, `/live/`, `/embed/`; `t=` becomes the start time). Copy and wait modes: a sandboxed 16:9 iframe (`loom.com/embed/<id>` or `youtube-nocookie.com/embed/<id>`) with an "Open in new tab" link that is always visible. `--artifact` mode: a poster card (thumbnail, play icon, caption) that opens the video in a new tab, with no iframe. Any other host fails validation. |
| `link` | `url` (https), `title?`, `description?`, `image?` | A preview card, never an iframe. Missing fields are read from the page's Open Graph tags at build time; when that fails the card is a plain titled link. |
| `diagram` | `format: "mermaid"`, `code`, `caption?` | Mermaid is loaded from the CDN only when a deck has a diagram, follows the deck theme, and falls back to the source code block when it cannot load or parse. |
| `svg` | exactly one of `src` (local path) or `svg` (inline markup), `alt` (required), `caption?` | Sanitized at build time and rendered as an image. |

Sources (`src`, `poster`, `image`, `full`): a local path (relative to the spec file, or absolute), an `https:` URL, or a `data:` URI. Local files are inlined as `data:` URIs in every mode so the page is self-contained; https URLs stay URLs. Any other scheme fails validation.

**Media viewer.** Any image, the option previews and **V** (the current card's media; on a decision it starts at the chosen option) open a full-viewport viewer: the picture fits the screen, the wheel or a pinch zooms around the pointer, drag pans when zoomed, double-click or **Z** toggles 1:1, **+ / -** zoom, **0** fits, **left / right** (or a swipe) move through every picture of the same item or, on a decision, every option's media in screen order (it follows Shuffle), **Esc** closes. On option media the foot shows "Choose option X" (**Enter**), which picks it and closes. Video, embeds, links and diagrams show as they are, without zoom. A picture with an https source gets an "Original" link that opens it in a new tab.

**Links in markdown** (`problem`, `content`, balloons, justifications) open in a new tab (`target="_blank" rel="noopener noreferrer"`; `mailto:` keeps the default). In `--artifact` mode the claude.ai viewer runs the page in a sandboxed frame: a new-tab link works only while the viewer allows popups, and the page can never show a remote image itself. To let the user inspect a high-resolution picture inside the deck, put it in `media` (a local file, or `full` on an image entry) instead of linking it in the text.

Build-time rules (the CLI, not `validateSpec`):

- A missing local file exits 2 and names the path (`items[3].media[0].src: file not found: ...`).
- A local video is transcoded with ffmpeg to WebM VP9 (480p max height, about 700 kbps, no audio, 24 fps cap) and cached under `~/.mkd/media/`. Without ffmpeg, or for a WebM already under 1.5 MB, it is inlined as is with a warning. A video over 6 MB after processing exits 2.
- Page budget: a warning above 8 MB; in `--artifact` mode a page over 14 MB exits 2 and names the heaviest media to shrink or host.
- Dedupe: a picture inlined more than once on the page (an option preview and its viewer copy, the same file in item and option media, a `full` equal to another `src`) is stored once in a `<script type="application/json" id="mkd-media-pool">` and referenced by key (`data-mkd-src`, `data-mkd-full`); the page fills them at start. A picture used once stays inline. The budget counts the final page, so repeats cost nothing.
- `--artifact` mode loads nothing remote, because the artifact viewer blocks remote frames and images:
  - Embeds become poster cards. The thumbnail (YouTube `i.ytimg.com/vi/<id>/hqdefault.jpg`, Loom oEmbed `thumbnail_url`, its still JPEG first) is fetched at build time and inlined when it is under 150 KB; otherwise the card shows a plain play icon.
  - https images, link-card images and video posters are fetched and inlined when they are under 200 KB; otherwise the figure shows its `alt` text and the card renders without the image. A remote video becomes a poster card that opens it in a new tab.
  - The CLI then scans the page and warns on stderr about any remaining remote `src`/`href` that loads a resource (fonts from Google Fonts and scripts from `cdn.jsdelivr.net/npm/` are allowed).

  Copy and wait modes keep the iframes and https URLs.

---

## Result (output)

Copy mode: the user pastes this JSON into the chat. `--wait` mode: printed to stdout (the ONLY thing on stdout) + backed up to `~/.mkd/result-<name>.json`. In `--wait` mode the server reshapes the payload against the SPEC (unknown items dropped, statuses and stats recomputed), so the stdout copy is authoritative. `--artifact` mode: the page writes the db document `results/<session>` (`<session>` with characters a db path rejects replaced by `-`) as `{ session, submittedAt, result }`, where `result` is this object as a JSON string; like copy mode it is built by the page, not reshaped by a server, and it never carries `images`.

### `Result`

| Field | Type | Notes |
| --- | --- | --- |
| `session` | `string` | Echo of the spec. |
| `source` | `string` | Present only when the spec set it. |
| `submittedAt` | `string` | ISO-8601. In copy mode: when the JSON was generated/copied. |
| `stats` | `ResultStats` | See below. |
| `items` | `ResultItem[]` | One entry per spec item, in order. |

### `ResultStats`

| Field | Notes |
| --- | --- |
| `total` | Item count. |
| `answered` | Items with any concrete answer. |
| `skipped` | Items explicitly skipped ("decide later", NOT a rejection). |
| `recFollowed` | Decisions where the recommended option was chosen. |
| `overridden` | Decisions where a NON-recommended option was chosen. |
| `custom` | Decisions answered with a custom direction. |

### `ResultItem` — common fields

Every item carries `id`, `type`, `title`, and `status: 'answered' | 'skipped' | 'pending'`. Type-specific fields:

**`decision`:**

| Field | Type | Notes |
| --- | --- | --- |
| `chosen` | `string \| null` | The chosen option `key`, the literal `"CUSTOM"`, or `null`. |
| `chosenLabel` | `string \| null` | The chosen option's label; `"custom"` for CUSTOM. |
| `wasRecommended` | `boolean \| null` | `true`/`false` for a real option pick; `null` for CUSTOM / no pick. |
| `customText` | `string` | The custom-direction text (`""` if untouched). |
| `note` | `string` | The "Note for Claude" text. |

**`question` / `report`:**

| Field | Type | Notes |
| --- | --- | --- |
| `controlAnswer` | `string \| string[] \| boolean \| null` | By control type: `single` → `string\|null`, `multi` → `string[]`, `toggle` → `boolean`. Always `null` on a report. |
| `text` | `string` | Free-text (`""` if untouched). |
| `quotes` | `string[]` | Exact highlighted phrases from the content. |
| `images` | `string[]` | **`--wait` mode only**, present ONLY when at least one image was pasted. Each entry is an absolute file path under `~/.mkd/` the AI can `Read`. |

**`table`:**

| Field | Type | Notes |
| --- | --- | --- |
| `quotes` | `string[]` | Quotes from the intro content (per-cell quotes live in rows). |
| `note` | `string` | The item-level "Note for Claude" text. |
| `rows` | `RowResult[]` | One per spec row, in order: `{ id, controlAnswer, text, quotes, images? }` (same semantics as question fields; `images` `--wait`-only). |
| `images` | `string[]` | `--wait`-only, item-level pastes. |

### Pasted images (`--wait` mode only)

In transit (browser → server) each `images[]` entry is a `data:` URL; before the result is written/printed, the CLI decodes each one to `~/.mkd/<name>-img-<itemId>[-<rowId>]-<n>.<ext>` and rewrites the entry to that path. Ids are sanitized (`[^A-Za-z0-9._-]` → `_`); extensions map from the mime (`png`/`jpg`/`gif`/`webp`/`svg`, else `bin`). Entries that fail to decode are logged to stderr and dropped. Copy mode disables image paste entirely.

### Status semantics

- `answered` — the item has a concrete answer (a chosen option; a control selection or non-empty text; any answered row or a table note). An answer always wins over a stale skip flag.
- `skipped` — explicitly skipped, no answer. Treat as "decide later"; re-ask when relevant.
- `pending` — never touched.

---

## Validation rules (what `validateSpec` rejects → exit 2)

Each violation throws a `SpecError` with a `path` (e.g. `items[2].options[1].justification`); the CLI prints `[mkd] invalid spec at <path>: <message>` to stderr and exits 2.

Spec level: not a plain object; `session`/`title` missing or empty; `source`/`submitLabel` present but not strings; `intro` malformed (non-object, bad `headline`/`body`/`stats`); `items` missing/empty.

Item level: not an object; `id` missing/empty/**duplicated**; `type` not one of the four; `title` missing/empty; `severity` not `high|medium|low`; `scope` present but empty.

`decision`: `problem` missing/empty; `context` not an array / balloon without non-empty `title`+`body`; `options` fewer than 2; option `key` missing/duplicated/`"CUSTOM"`; option `label` missing; **option `justification` missing or empty**; `recommended` non-boolean or set on more than one option; `allowCustom` non-boolean.

`question`: `content` not a string; `controls` missing or failing the `Controls` rules.

`report`: `content` missing or empty.

`table`: `table` not an object; `columns` empty or with empty strings; `rows` empty; row `id` missing/duplicated; `cells` length ≠ `columns.length` or non-string cells; `rowControls`/`rowText` failing their rules.

`media` (intro, items, options): not a non-empty array; entry `type` not one of `image`, `video`, `embed`, `link`, `diagram`, `svg`; `alt` missing on `image`/`svg`; a source (including `full`) that is not a local path, `https:` or `data:`; `link.url` not https; `embed.url` not a Loom or YouTube video URL; `diagram.format` not `mermaid` or empty `code`; `svg` with both or neither of `src`/`svg`, or `svg` markup without an `<svg>` element.

`Controls`: `type` invalid; `options` present on `toggle`; `options` missing/empty on `single`/`multi`; option `value`/`label` missing or duplicated `value`; `required` non-boolean. `TextField`: non-object; `required` non-boolean; `placeholder` non-string.

---

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Copy mode: deck rendered + opened. `--wait`: submitted, Result JSON on stdout. `--artifact`: fragment written, its path on stdout. |
| 1 | `--wait` timeout (user away) or a runtime error. SIGINT exits 130. |
| 2 | Spec file unreadable or failed validation. |

stdout discipline: **only** the `--wait` Result JSON, or the `--artifact` fragment path, is ever written to stdout. Banners, paths, URLs and errors all go to stderr.
