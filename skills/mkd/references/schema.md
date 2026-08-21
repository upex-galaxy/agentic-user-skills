# MKD — Full data contract

The authoritative source is `../cli/schema.ts` (`validateSpec` + the exported types). This reference mirrors it. If the two ever disagree, the TypeScript wins.

There are two shapes: the **Spec** the AI writes (input), and the **Result** the browser returns (output — pasted into the chat in copy mode, printed to stdout in `--wait` mode). In between, `validateSpec` produces a `NormalizedSpec` (every default filled) which the UI renders — the AI never writes the normalized form directly.

---

## Spec (input — the AI writes it)

### `Spec`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `session` | `string` | yes | Non-empty slug. Echoed in the result; keys the page's localStorage persistence. |
| `source` | `string` | no | Pointer to the artifact the deck was derived from. Echoed in the result. |
| `title` | `string` | yes | Non-empty. Page title + header brand line. |
| `intro` | `SpecIntro` | no | The intro screen. Omit → the intro shows just `title` + the how-it-works legend. |
| `submitLabel` | `string` | no | CTA label for the `--wait` submit button. Default `"Send to Claude"`. |
| `items` | `Item[]` | yes | Non-empty array. One item = one screen. |

### `SpecIntro`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `headline` | `string` | no | Intro heading. Defaults to `title`. |
| `body` | `string` | no | Markdown, PM voice. |
| `stats` | `{ n: string \| number, label: string }[]` | no | Stat tiles (e.g. `115 / verified findings`). `n` accepts a number and is normalized to a string. |

### `Item` — common fields (all four types)

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | yes | Non-empty AND **unique** across the spec. Anchors the answer. |
| `type` | `'decision' \| 'question' \| 'report' \| 'table'` | yes | Anything else fails validation. |
| `title` | `string` | yes | Non-empty. The card heading + rail tooltip + summary row. |
| `severity` | `'high' \| 'medium' \| 'low'` | no | Rendered as a colored chip in the eyebrow. |
| `scope` | `string` | no | Non-empty when present. Rendered as an accent chip. |

### `DecisionItem` (`type: "decision"`)

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `problem` | `string` | yes | Non-empty markdown. Plain-language problem statement. |
| `context` | `ContextBalloon[]` | no | Collapsible "How does X work today?" balloons. Each needs non-empty `title` + `body` (markdown). |
| `options` | `DecisionOption[]` | yes | **At least 2** — one option is not a decision. |
| `allowCustom` | `boolean` | no | Default `true`. Adds the "Something else (custom)" option with its textarea. |

`DecisionOption`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `key` | `string` | yes | Non-empty, **unique** within the decision, and **not** the reserved `"CUSTOM"`. |
| `label` | `string` | yes | Non-empty. Inline markdown supported. |
| `justification` | `string` | yes | **Non-empty — the HARD RULE.** The written value/cost rationale. Inline markdown supported. An option without it fails validation. |
| `recommended` | `boolean` | no | **At most ONE option per decision** may be `true` (a second fails validation). Its justification must state WHY it is recommended. |

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

---

## Result (output)

Copy mode: the user pastes this JSON into the chat. `--wait` mode: printed to stdout (the ONLY thing on stdout) + backed up to `~/.mkd/result-<name>.json`. In `--wait` mode the server reshapes the payload against the SPEC (unknown items dropped, statuses and stats recomputed), so the stdout copy is authoritative.

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

`Controls`: `type` invalid; `options` present on `toggle`; `options` missing/empty on `single`/`multi`; option `value`/`label` missing or duplicated `value`; `required` non-boolean. `TextField`: non-object; `required` non-boolean; `placeholder` non-string.

---

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Copy mode: deck rendered + opened. `--wait`: submitted, Result JSON on stdout. |
| 1 | `--wait` timeout (user away) or a runtime error. SIGINT exits 130. |
| 2 | Spec file unreadable or failed validation. |

stdout discipline: **only** the `--wait` Result JSON is ever written to stdout. Banners, paths, URLs and errors all go to stderr.
