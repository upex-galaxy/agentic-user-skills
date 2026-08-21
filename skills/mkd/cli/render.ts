/**
 * MKD (`mkd`) - full HTML document assembler.
 *
 * Server-renders the static deck shell (the exact class/id contract shared
 * with `ui/app.css` and `ui/app.js`): the header (MKD wordmark + progress
 * rail host), one hidden `<section class="mkd-card">` per item (markdown
 * content server-rendered so text nodes are stable for highlight-to-quote
 * anchoring), the intro + summary cards, and the fixed footer bar. `ui/app.js`
 * then builds the interactive parts (deck navigation, options, controls,
 * textareas, quote chips, JSON panel, submit) at runtime from `window.__MKD__`.
 *
 * Two render modes:
 * - `copy` (default): a SELF-CONTAINED page written to `~/.mkd/` and opened
 *   from `file://`. No server, no token; the user copies the result JSON into
 *   the chat.
 * - `wait`: the same page served over loopback HTTP with a per-run submit
 *   token; a "Send to Claude" button POSTs the result to `/submit`.
 *
 * The two vanilla UI assets are inlined as text via Bun import attributes
 * (`with { type: 'text' }`) - a Bun built-in, so this honors the decoupling
 * rule (Bun built-ins only, zero external deps) and needs no per-call I/O.
 * The Google Fonts stylesheet is a plain <link> with full system fallbacks:
 * offline the page still renders correctly on the fallback stacks.
 */

import type { NormalizedItem, NormalizedSpec } from './schema.ts';

import { md } from './markdown.ts';
import APP_CSS from './ui/app.css' with { type: 'text' };
import APP_JS from './ui/app.js' with { type: 'text' };

export interface RenderOptions {
  mode: 'copy' | 'wait'
  /** Per-run submit token; required (non-empty) in `wait` mode. */
  submitToken?: string
}

// ============================================================================
// ESCAPING
// ============================================================================

/** Escape a string for safe interpolation into HTML text / attributes. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * JSON-encode a value for embedding inside a `<script>` block, then neutralize
 * the only sequences that could break out of that script context: `<` (so a
 * literal `</script>` inside any content string cannot terminate the tag) and
 * `>` for symmetry. Both become their `\uXXXX` escapes, which `JSON.parse`
 * decodes back to the original characters - so the client sees the exact data.
 */
function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
}

/**
 * Render markdown for an INLINE slot (an option justification/label inside a
 * button): when the output is a single paragraph, unwrap it so no block
 * element lands inside phrasing content. Multi-paragraph input keeps its
 * structure.
 */
function mdInline(src: string): string {
  const html = md(src).trim();
  const single = /^<p>([\s\S]*)<\/p>$/.exec(html);
  return single && !single[1].includes('<p>') ? single[1] : html;
}

// ============================================================================
// CARD RENDERING
// ============================================================================

const TYPE_LABEL: Record<NormalizedItem['type'], string> = {
  decision: 'Decision',
  question: 'Question',
  report: 'Report',
  table: 'Table',
};

/** The eyebrow row: type + position + optional severity / scope chips. */
function renderEyebrow(item: NormalizedItem, index: number, total: number): string {
  const chips: string[] = [];
  if (item.severity) {
    chips.push(
      `<span class="mkd-chip mkd-chip--${item.severity}">${escapeHtml(item.severity)}</span>`,
    );
  }
  if (item.scope) {
    chips.push(`<span class="mkd-chip mkd-chip--scope">${escapeHtml(item.scope)}</span>`);
  }
  return `<div class="mkd-card__eyebrow">${TYPE_LABEL[item.type]} ${index + 1} of ${total}${chips.length > 0 ? ` ${chips.join(' ')}` : ''}</div>`;
}

/**
 * Render one item as a hidden `<section class="mkd-card">`: server-rendered
 * markdown (stable text nodes for quoting on question/report/table) plus an
 * EMPTY interactive host that `app.js` fills. Decision context balloons are
 * server-rendered `<details>` so they work before JS even runs.
 */
function renderItemCard(item: NormalizedItem, index: number, total: number): string {
  const id = escapeHtml(item.id);
  const head = `${renderEyebrow(item, index, total)}
        <h2 class="mkd-card__title">${escapeHtml(item.title)}</h2>`;

  let body = '';
  if (item.type === 'decision') {
    const balloons = item.context
      .map(
        balloon => `
        <details class="mkd-ctx">
          <summary class="mkd-ctx__summary">${escapeHtml(balloon.title)}</summary>
          <div class="mkd-ctx__body">${md(balloon.body)}</div>
        </details>`,
      )
      .join('');
    body = `
        <div class="mkd-card__problem">${md(item.problem)}</div>${balloons}
        ${renderDecisionOptions(item)}`;
  }
  else if (item.type === 'table') {
    body = renderTableBody(item);
  }
  else {
    // question | report
    body = `
        <div class="mkd-card__content" data-quote-source>${md(item.content)}</div>`;
  }

  return `      <section class="mkd-card mkd-card--${item.type}" data-item-id="${id}" data-item-index="${index}" hidden>
        ${head}${body}
        <div class="mkd-card__interactive" data-item-id="${id}"></div>
        <div class="mkd-card__nav" data-item-id="${id}"></div>
      </section>`;
}

/**
 * Render a decision's options server-side so labels + justifications carry
 * markdown (inline code, bold). `app.js` only wires the click handlers and
 * the selected state onto these buttons.
 */
function renderDecisionOptions(item: NormalizedItem & { type: 'decision' }): string {
  const options = item.options
    .map((option) => {
      const isRec = option.recommended === true;
      const badge = isRec ? '<span class="mkd-opt__badge">★ Recommended</span>' : '';
      return `
          <button type="button" class="mkd-opt${isRec ? ' has-badge' : ''}" data-opt-key="${escapeHtml(option.key)}">
            <span class="mkd-opt__head"><span class="mkd-opt__key">${escapeHtml(option.key)}</span><span class="mkd-opt__label">${mdInline(option.label)}</span>${badge}</span>
            <span class="mkd-opt__just">${mdInline(option.justification)}</span>
            <span class="mkd-opt__mark">✓</span>
          </button>`;
    })
    .join('');

  const custom = item.allowCustom
    ? `
          <button type="button" class="mkd-opt" data-opt-key="CUSTOM">
            <span class="mkd-opt__head"><span class="mkd-opt__key">✎</span><span class="mkd-opt__label">Something else (custom)</span></span>
            <span class="mkd-opt__just">Write your own direction and it will be executed as stated (or questioned if something does not add up).</span>
            <span class="mkd-opt__mark">✓</span>
          </button>
          <textarea class="mkd-text__input mkd-text__input--compact mkd-custom-input" data-custom-for="${escapeHtml(item.id)}" placeholder="Describe your custom decision…" rows="3"></textarea>`
    : '';

  return `<div class="mkd-opts">${options}${custom}
        </div>`;
}

/**
 * Render a table item's static table. Cells are server-rendered (escaped) so
 * they are stable quote-source text nodes; `app.js` fills each row's
 * `.mkd-table__answer` cell with the row answer button + popover.
 */
function renderTableBody(item: NormalizedItem & { type: 'table' }): string {
  const table = item.table;
  const intro
    = item.content.length > 0
      ? `
        <div class="mkd-card__content" data-quote-source>${md(item.content)}</div>`
      : '';

  const headCells = table.columns
    .map(column => `<th>${escapeHtml(column)}</th>`)
    .join('');

  const bodyRows = table.rows
    .map((row) => {
      const rowId = escapeHtml(row.id);
      const cells = row.cells
        .map(cell => `<td class="mkd-table__cell" data-quote-source>${escapeHtml(cell)}</td>`)
        .join('');
      return `            <tr class="mkd-table__row" data-row-id="${rowId}">${cells}<td class="mkd-table__answer" data-row-id="${rowId}"></td></tr>`;
    })
    .join('\n');

  return `${intro}
        <div class="mkd-table__scroll">
          <table class="mkd-table">
            <thead><tr>${headCells}<th class="mkd-table__answer-head">Answer</th></tr></thead>
            <tbody>
${bodyRows}
            </tbody>
          </table>
        </div>`;
}

/** The intro card: headline, markdown body, stat tiles. `app.js` adds Start. */
function renderIntroCard(spec: NormalizedSpec): string {
  const intro = spec.intro ?? {};
  const headline = intro.headline ?? spec.title;
  const body
    = typeof intro.body === 'string' && intro.body.length > 0
      ? `\n        <div class="mkd-card__content">${md(intro.body)}</div>`
      : '';
  const stats
    = Array.isArray(intro.stats) && intro.stats.length > 0
      ? `\n        <div class="mkd-tiles">${intro.stats
        .map(
          stat => `
          <div class="mkd-tile"><div class="mkd-tile__n">${escapeHtml(stat.n)}</div><div class="mkd-tile__label">${escapeHtml(stat.label)}</div></div>`,
        )
        .join('')}
        </div>`
      : '';
  return `      <section class="mkd-card mkd-card--intro" id="mkd-intro" hidden>
        <div class="mkd-card__eyebrow">${escapeHtml(spec.session)}</div>
        <h2 class="mkd-card__title">${escapeHtml(headline)}</h2>${body}${stats}
        <div class="mkd-legend">
          <p>One screen per item. Navigate with the rail above or the <b>&#8592; &#8594;</b> arrow keys. Skipping means "decide later", not a rejection.</p>
          <p id="mkd-legend-finish">When you are done, copy the JSON from the footer and paste it back into the chat.</p>
        </div>
        <div class="mkd-card__nav" data-intro-nav></div>
      </section>`;
}

// ============================================================================
// DOCUMENT ASSEMBLY
// ============================================================================

const FONTS_HREF
  = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Albert+Sans:wght@400;500;600;700&family=Spline+Sans+Mono:wght@400;500&display=swap';

/**
 * Build the full HTML document for `spec`, exactly per the shared DOM
 * contract. Synchronous; returns the complete document string.
 */
export function render(spec: NormalizedSpec, opts: RenderOptions): string {
  const title = escapeHtml(spec.title);
  const total = spec.items.length;
  const mode = opts.mode;
  const submitToken = typeof opts.submitToken === 'string' ? opts.submitToken : '';

  const cards = spec.items
    .map((item, index) => renderItemCard(item, index, total))
    .join('\n');

  const submitButton
    = mode === 'wait'
      ? `\n        <button type="button" class="mkd-bar__btn mkd-bar__btn--primary" id="mkd-submit" disabled>${escapeHtml(spec.submitLabel)}</button>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${FONTS_HREF}">
  <style>${APP_CSS}</style>
</head>
<body>
  <main id="mkd-app" data-mode="${mode}">
    <header class="mkd-header">
      <div class="mkd-brand">
        <span class="mkd-brand__logo" aria-label="MKD - Make Decision">MKD</span>
        <span class="mkd-brand__meta">
          <span class="mkd-brand__title">${title}</span>
          <span class="mkd-brand__session">${escapeHtml(spec.session)}</span>
        </span>
      </div>
      <nav class="mkd-rail" id="mkd-rail" aria-label="Progress"></nav>
      <div class="mkd-header__tools">
        <button type="button" class="mkd-kbd-toggle" id="mkd-kbd-toggle" aria-label="Keyboard shortcuts" title="Keyboard shortcuts">&#9000;</button>
        <button type="button" class="mkd-theme-toggle" id="mkd-theme-toggle" aria-label="Toggle light/dark theme" aria-pressed="false" title="Toggle light/dark theme"></button>
      </div>
    </header>
    <div class="mkd-stage" id="mkd-stage">
${renderIntroCard(spec)}
${cards}
      <section class="mkd-card mkd-card--summary" id="mkd-summary" hidden></section>
    </div>
    <footer class="mkd-bar">
      <div class="mkd-bar__row">
        <span class="mkd-stat">Answered <b id="mkd-s-answered">0</b>/${total}</span>
        <span class="mkd-stat mkd-stat--ok">Rec followed <b id="mkd-s-rec">0</b></span>
        <span class="mkd-stat mkd-stat--rec">Changed <b id="mkd-s-over">0</b></span>
        <span class="mkd-stat">Custom <b id="mkd-s-custom">0</b></span>
        <span class="mkd-stat">Skipped <b id="mkd-s-skipped">0</b></span>
        <span class="mkd-bar__spacer"></span>
        <span class="mkd-bar__error" id="mkd-submit-error" hidden></span>
        <button type="button" class="mkd-bar__btn" id="mkd-json-toggle">View JSON</button>
        <button type="button" class="mkd-bar__btn${mode === 'copy' ? ' mkd-bar__btn--primary' : ''}" id="mkd-copy">Copy JSON</button>${submitButton}
      </div>
      <div class="mkd-json" id="mkd-json-panel" hidden><pre class="mkd-json__out" id="mkd-json-out"></pre></div>
    </footer>
    <div class="mkd-expand" id="mkd-expand" hidden aria-hidden="true">
      <div class="mkd-expand__backdrop" id="mkd-expand-backdrop"></div>
      <div class="mkd-expand__panel" role="dialog" aria-modal="true" aria-label="Write your response">
        <header class="mkd-expand__head">
          <span class="mkd-expand__title" id="mkd-expand-title">Your response</span>
          <button type="button" class="mkd-expand__close" id="mkd-expand-close" aria-label="Close">close</button>
        </header>
        <details class="mkd-expand__ref" id="mkd-expand-ref">
          <summary class="mkd-expand__ref-summary">Reference</summary>
          <div class="mkd-expand__ref-content" id="mkd-expand-ref-content"></div>
        </details>
        <div class="mkd-expand__quotes" id="mkd-expand-quotes"></div>
        <textarea class="mkd-expand__input" id="mkd-expand-input" rows="10"></textarea>
      </div>
    </div>
    <button type="button" class="mkd-quote-btn" id="mkd-quote-btn" hidden>quote</button>
    <div class="mkd-kbd" id="mkd-kbd" hidden aria-hidden="true">
      <div class="mkd-kbd__backdrop" id="mkd-kbd-backdrop"></div>
      <div class="mkd-kbd__panel" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <header class="mkd-kbd__head">
          <span class="mkd-kbd__title">Keyboard shortcuts</span>
          <button type="button" class="mkd-kbd__close" id="mkd-kbd-close" aria-label="Close">close</button>
        </header>
        <ul class="mkd-kbd__list" id="mkd-kbd-list"></ul>
      </div>
    </div>
    <div class="mkd-rowpop-backdrop" id="mkd-rowpop-backdrop" hidden></div>
    <div class="mkd-rowpop-layer" id="mkd-rowpop-layer"></div>
    <div class="mkd-done" id="mkd-done" hidden>Submitted. You can close this tab.</div>
  </main>
  <script>window.__MKD__ = ${embedJson(spec)};window.__MKD_MODE__ = ${embedJson(mode)};window.__MKD_TOKEN__ = ${embedJson(submitToken)};</script>
  <script>${APP_JS}</script>
</body>
</html>
`;
}
