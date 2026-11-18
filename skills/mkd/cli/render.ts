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
 * Three render modes:
 * - `copy` (default): a SELF-CONTAINED page written to `~/.mkd/` and opened
 *   from `file://`. No server, no token; the user copies the result JSON into
 *   the chat.
 * - `wait`: the same page served over loopback HTTP with a per-run submit
 *   token; a "Send to Claude" button POSTs the result to `/submit`.
 * - `artifact`: a claude.ai Artifact page FRAGMENT (title first, no doctype /
 *   html / head / body / meta: the Artifact tool wraps the page itself). The
 *   "Send to Claude" button writes the result to the artifact's `db`
 *   capability and notifies the watching Claude Code session through the
 *   `comments` capability (see `ui/app.js`).
 *
 * The two vanilla UI assets are inlined as text via Bun import attributes
 * (`with { type: 'text' }`) - a Bun built-in, so this honors the decoupling
 * rule (Bun built-ins only, zero external deps) and needs no per-call I/O.
 * The Google Fonts stylesheet is a plain <link> with full system fallbacks:
 * offline the page still renders correctly on the fallback stacks.
 */

import type { MediaEntry, NormalizedItem, NormalizedSpec } from './schema.ts';

import { md } from './markdown.ts';
import APP_CSS from './ui/app.css' with { type: 'text' };
import APP_JS from './ui/app.js' with { type: 'text' };

export interface RenderOptions {
  mode: 'copy' | 'wait' | 'artifact'
  /** Per-run submit token; required (non-empty) in `wait` mode. */
  submitToken?: string
  /**
   * `artifact` mode: prepended to the page `<title>` as `<prefix> · <title>`
   * (the artifact's name in the claude.ai gallery), typically the name of
   * the session that published it.
   */
  titlePrefix?: string
}

/**
 * The artifact `db` document id the result is written under: the spec's
 * `session`, reduced to the characters a db path segment accepts
 * (letters, digits and `_ - . ~ : @ +`, at most 200 bytes, never `.` or
 * `..` alone). A typical slug session passes through unchanged.
 */
export function artifactDocId(session: string): string {
  const id = session.replace(/[^\w.~:@+-]/g, '-').slice(0, 200);
  return id === '.' || id === '..' ? `deck${id}` : id;
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
// MEDIA (display only; app.js wires carousels, lightbox, mermaid)
// ============================================================================

const ICON = (path: string, size = 18): string =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const ICON_PREV = ICON('<path d="m15 18-6-6 6-6"/>');
const ICON_NEXT = ICON('<path d="m9 18 6-6-6-6"/>');
const ICON_EXPAND = ICON('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>', 16);
const ICON_PLAY = ICON('<path d="M7 4v16l13-8Z" fill="currentColor"/>', 14);
const ICON_LINK = ICON('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>', 14);
const ICON_DIAGRAM = ICON('<rect x="3" y="3" width="7" height="6" rx="1"/><rect x="14" y="15" width="7" height="6" rx="1"/><path d="M6.5 9v3a3 3 0 0 0 3 3h4.5"/>', 14);

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  }
  catch {
    return url;
  }
}

function sizeAttrs(entry: { width?: number, height?: number }): string {
  return entry.width && entry.height ? ` width="${entry.width}" height="${entry.height}"` : '';
}

function caption(text: string | undefined): string {
  return text ? `<figcaption class="mkd-media__caption">${escapeHtml(text)}</figcaption>` : '';
}

/**
 * The mode being rendered. An artifact page loads nothing remote (its viewer
 * CSP blocks remote frames and images), so media.ts inlines what it can and
 * the figures below draw anything still remote without loading it.
 */
let renderMode: RenderOptions['mode'] = 'copy';

/** A remote URL the current page must not load (artifact mode only). */
function blockedRemote(url: string | undefined): boolean {
  return renderMode === 'artifact' && Boolean(url) && /^https?:/i.test(url ?? '');
}

const ICON_PLAY_LARGE = ICON('<path d="M8 5v14l11-7Z" fill="currentColor"/>', 28);

/** Artifact mode: a link-out card in place of a frame or a remote video. */
function renderVideoCard(url: string, thumbnail: string | undefined, label: string, text: string | undefined): string {
  const image = thumbnail
    ? `<img class="mkd-videocard__img" src="${escapeHtml(thumbnail)}" alt="" loading="lazy" decoding="async">`
    : '';
  return `<figure class="mkd-media__fig mkd-media__fig--videocard">
            <a class="mkd-videocard${image ? ' has-image' : ''}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(`${label}: open video in a new tab`)}">${image}<span class="mkd-videocard__play">${ICON_PLAY_LARGE}</span><span class="mkd-videocard__bar"><span class="mkd-videocard__host">${escapeHtml(hostOf(url))}</span><span class="mkd-videocard__cta">Open video in a new tab &#8599;</span></span></a>
            ${caption(text)}
          </figure>`;
}

/** One media entry as a full-size figure (item, intro, or lightbox slide). */
function renderMediaFigure(entry: MediaEntry): string {
  switch (entry.type) {
    case 'image':
    case 'svg': {
      const src = entry.src ?? '';
      if (blockedRemote(src)) {
        return `<figure class="mkd-media__fig mkd-media__fig--missing">
            <div class="mkd-media__missing" role="img" aria-label="${escapeHtml(entry.alt)}"><span class="mkd-media__missing-label">Image not available here</span><span class="mkd-media__missing-alt">${escapeHtml(entry.alt)}</span></div>
            ${caption(entry.caption)}
          </figure>`;
      }
      const remote = /^https:/i.test(src) ? ' data-remote' : '';
      return `<figure class="mkd-media__fig mkd-media__fig--image">
            <button type="button" class="mkd-media__zoom" data-lightbox aria-label="Enlarge: ${escapeHtml(entry.alt)}"><img class="mkd-media__img" src="${escapeHtml(src)}" alt="${escapeHtml(entry.alt)}"${sizeAttrs(entry)} loading="lazy" decoding="async"${remote}><span class="mkd-media__zoom-icon">${ICON_EXPAND}</span></button>
            ${caption(entry.caption)}
          </figure>`;
    }
    case 'video': {
      if (blockedRemote(entry.src)) {
        return renderVideoCard(entry.src, blockedRemote(entry.poster) ? undefined : entry.poster, entry.caption ?? 'Video', entry.caption);
      }
      const poster = entry.poster && !blockedRemote(entry.poster) ? ` poster="${escapeHtml(entry.poster)}"` : '';
      return `<figure class="mkd-media__fig mkd-media__fig--video">
            <video class="mkd-media__video" controls muted playsinline preload="metadata" loading="lazy"${sizeAttrs(entry)}${poster}><source src="${escapeHtml(entry.src)}" type="${escapeHtml(entry.mime ?? 'video/mp4')}"></video>
            ${caption(entry.caption)}
          </figure>`;
    }
    case 'embed': {
      const label = entry.provider === 'loom' ? 'Loom video' : 'YouTube video';
      if (renderMode === 'artifact') {
        return renderVideoCard(entry.url, entry.thumbnail, entry.caption ?? label, entry.caption);
      }
      return `<figure class="mkd-media__fig mkd-media__fig--embed">
            <div class="mkd-embed"><iframe class="mkd-embed__frame" src="${escapeHtml(entry.embedUrl)}" title="${escapeHtml(entry.caption ?? label)}" loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" allow="fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
            <a class="mkd-embed__open" href="${escapeHtml(entry.url)}" target="_blank" rel="noopener noreferrer"><span class="mkd-embed__host">${escapeHtml(hostOf(entry.url))}</span><span class="mkd-embed__cta">Open in new tab &#8599;</span></a>
            ${caption(entry.caption)}
          </figure>`;
    }
    case 'link': {
      const image = entry.image && !blockedRemote(entry.image)
        ? `<img class="mkd-linkcard__img" src="${escapeHtml(entry.image)}" alt="" loading="lazy" decoding="async"${/^https:/i.test(entry.image) ? ' data-remote' : ''}>`
        : '';
      const description = entry.description ? `<span class="mkd-linkcard__desc">${escapeHtml(entry.description)}</span>` : '';
      return `<a class="mkd-linkcard${image ? ' has-image' : ''}" href="${escapeHtml(entry.url)}" target="_blank" rel="noopener noreferrer">${image}<span class="mkd-linkcard__body"><span class="mkd-linkcard__title">${escapeHtml(entry.title ?? hostOf(entry.url))}</span>${description}<span class="mkd-linkcard__host">${ICON_LINK}${escapeHtml(hostOf(entry.url))} &#8599;</span></span></a>`;
    }
    default:
      return `<figure class="mkd-media__fig mkd-diagram" data-diagram>
            <div class="mkd-diagram__canvas"></div>
            <pre class="mkd-diagram__src"><code>${escapeHtml(entry.code)}</code></pre>
            <p class="mkd-diagram__notice" hidden></p>
            <button type="button" class="mkd-diagram__zoom" data-lightbox aria-label="Enlarge diagram">${ICON_EXPAND}</button>
            ${caption(entry.caption)}
          </figure>`;
  }
}

/** Slides plus prev/next, counter, markers and a polite status region. */
function renderCarousel(slides: string[], label: string): string {
  const n = slides.length;
  const body = slides
    .map((slide, i) => `
          <div class="mkd-carousel__slide" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${n}">${slide}</div>`)
    .join('');
  const dots = slides
    .map((_s, i) => `<button type="button" class="mkd-carousel__dot" aria-label="Go to slide ${i + 1}"${i === 0 ? ' aria-current="true"' : ''}></button>`)
    .join('');
  return `<section class="mkd-carousel" aria-roledescription="carousel" aria-label="${escapeHtml(label)}">
          <div class="mkd-carousel__controls">
            <button type="button" class="mkd-carousel__btn mkd-carousel__btn--prev" data-dir="-1" aria-label="Previous slide" disabled>${ICON_PREV}</button>
            <button type="button" class="mkd-carousel__btn mkd-carousel__btn--next" data-dir="1" aria-label="Next slide">${ICON_NEXT}</button>
          </div>
          <span class="mkd-carousel__count" aria-hidden="true">1/${n}</span>
          <div class="mkd-carousel__track" tabindex="0" role="group" aria-label="Slides">${body}
          </div>
          <p class="mkd-visually-hidden mkd-carousel__status" role="status" aria-live="polite"></p>
          <div class="mkd-carousel__dots" role="group" aria-label="Choose a slide">${dots}</div>
        </section>`;
}

/** Media of the intro or an item: one figure, or a carousel for several. */
function renderMediaBlock(media: MediaEntry[] | undefined, label: string): string {
  if (!media || media.length === 0) {
    return '';
  }
  const figures = media.map(renderMediaFigure);
  const inner = figures.length === 1 ? figures[0] : renderCarousel(figures, label);
  return `
        <div class="mkd-card__media">${inner}</div>`;
}

/**
 * Option media lives INSIDE the option button, so it is purely visual:
 * thumbnails and chips, nothing interactive. The full media sits in an inert
 * <template> that moves with the button on shuffle; "View option media"
 * (outside the list) opens it in the lightbox.
 */
function renderOptionMedia(media: MediaEntry[] | undefined): string {
  if (!media || media.length === 0) {
    return '';
  }
  const thumbs = media.map((entry) => {
    switch (entry.type) {
      case 'image':
      case 'svg':
        if (blockedRemote(entry.src)) {
          return '<span class="mkd-opt__chip">Image</span>';
        }
        return `<span class="mkd-opt__thumb"><img src="${escapeHtml(entry.src ?? '')}" alt="" loading="lazy" decoding="async"${/^https:/i.test(entry.src ?? '') ? ' data-remote' : ''}></span>`;
      case 'video':
        return entry.poster && !blockedRemote(entry.poster)
          ? `<span class="mkd-opt__thumb mkd-opt__thumb--video"><img src="${escapeHtml(entry.poster)}" alt="" loading="lazy" decoding="async"><span class="mkd-opt__play">${ICON_PLAY}</span></span>`
          : `<span class="mkd-opt__chip">${ICON_PLAY}Video</span>`;
      case 'embed':
        if (renderMode === 'artifact' && entry.thumbnail) {
          return `<span class="mkd-opt__thumb mkd-opt__thumb--video"><img src="${escapeHtml(entry.thumbnail)}" alt="" loading="lazy" decoding="async"><span class="mkd-opt__play">${ICON_PLAY}</span></span>`;
        }
        return `<span class="mkd-opt__chip">${ICON_PLAY}${entry.provider === 'loom' ? 'Loom' : 'YouTube'}</span>`;
      case 'link':
        return `<span class="mkd-opt__chip">${ICON_LINK}${escapeHtml(hostOf(entry.url))}</span>`;
      default:
        return `<span class="mkd-opt__chip">${ICON_DIAGRAM}Diagram</span>`;
    }
  }).join('');
  const full = media.map(entry => `<div class="mkd-opt__full-slide">${renderMediaFigure(entry)}</div>`).join('');
  return `<span class="mkd-opt__media" aria-hidden="true">${thumbs}</span><template class="mkd-opt__full">${full}</template>`;
}

/** The spec copy shipped to app.js: media never travels twice (it is in the markup). */
function stripMedia(spec: NormalizedSpec): NormalizedSpec {
  if (!spec.intro?.media && !spec.items.some(item => item.media || (item.type === 'decision' && item.options.some(o => o.media)))) {
    return spec;
  }
  const copy: NormalizedSpec = structuredClone(spec);
  if (copy.intro) {
    delete copy.intro.media;
  }
  for (const item of copy.items) {
    delete item.media;
    if (item.type === 'decision') {
      for (const option of item.options) {
        delete option.media;
      }
    }
  }
  return copy;
}

const MERMAID_SRC = 'https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js';
const MERMAID_SRI = 'sha384-EOXBFmc3gx5mb+vn0vPvvGqACToJD24hhacX5Yx+8NUUQrHIle/Qi5Bg9o3zKwW2';

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
        <div class="mkd-card__problem">${md(item.problem)}</div>${renderMediaBlock(item.media, `Media for ${item.title}`)}${balloons}
        ${renderDecisionOptions(item)}`;
  }
  else if (item.type === 'table') {
    body = renderTableBody(item);
  }
  else {
    // question | report
    body = `
        <div class="mkd-card__content" data-quote-source>${md(item.content)}</div>${renderMediaBlock(item.media, `Media for ${item.title}`)}`;
  }

  return `      <section class="mkd-card mkd-card--${item.type}" data-item-id="${id}" data-item-index="${index}" hidden>
        ${head}${body}
        <div class="mkd-card__interactive" data-item-id="${id}"></div>
      </section>`;
}

/**
 * A bolded lead-in such as `**Recommended** because ...` (or the Spanish
 * `**Recomendada**`) inside the recommended option's justification. The
 * "Hide recommended" toggle hides it along with the badge.
 */
const REC_WORD = /<strong>(\s*(?:recommended|recommendation|recomendad[ao]s?|recomendaci[oó]n)\b[^<]*)<\/strong>/gi;

function markRecWord(html: string): string {
  return html.replace(REC_WORD, '<strong class="mkd-rec-word">$1</strong>');
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
            <span class="mkd-opt__just">${isRec ? markRecWord(mdInline(option.justification)) : mdInline(option.justification)}</span>${renderOptionMedia(option.media)}
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

  // Four or more real options switch the list to its compact layout:
  // clamped justifications, two columns on wide screens.
  const dense = item.options.length >= 4 ? ' is-dense' : '';
  const viewMedia = item.options.some(option => option.media)
    ? '<button type="button" class="mkd-opts__view" data-opt-media>View option media</button>'
    : '';
  return `<div class="mkd-opts${dense}">${options}${custom}
        </div>${viewMedia}`;
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

  return `${intro}${renderMediaBlock(item.media, `Media for ${item.title}`)}
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
        <h2 class="mkd-card__title">${escapeHtml(headline)}</h2>${body}${renderMediaBlock(intro.media, 'Media for the intro')}${stats}
        <div class="mkd-legend">
          <p>One screen per item. Move with the bar at the bottom, the rail above, or the keyboard: <b>1-6</b> picks an option, <b>Enter</b> goes on, <b>S</b> skips. Skipping means "decide later", not a rejection.</p>
          <p id="mkd-legend-finish">When you are done, copy the JSON from the footer and paste it back into the chat.</p>
        </div>
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
  renderMode = mode;
  const submitToken = typeof opts.submitToken === 'string' ? opts.submitToken : '';

  const cards = spec.items
    .map((item, index) => renderItemCard(item, index, total))
    .join('\n');

  const hasDecisions = spec.items.some(item => item.type === 'decision');
  const viewOptions = hasDecisions
    ? `
      <div class="mkd-view" role="group" aria-label="Display options">
        <label class="mkd-switch mkd-switch--sm" title="Hide every recommended marking while you decide">
          <input type="checkbox" class="mkd-switch__input" id="mkd-hide-rec" role="switch">
          <span class="mkd-switch__track" aria-hidden="true"></span>
          <span class="mkd-switch__label">Hide recommended</span>
        </label>
        <button type="button" class="mkd-view__btn" id="mkd-shuffle" title="Show every decision's options in a new random order (press again to reshuffle)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>Shuffle options</button>
        <button type="button" class="mkd-view__btn mkd-view__btn--reset" id="mkd-unshuffle" title="Original order: back to the author's order and letters" aria-label="Original order" hidden><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg><span class="mkd-view__reset-label">Original order</span></button>
        <label class="mkd-switch mkd-switch--sm" title="After you pick an option, move to the next item on its own (typing a note cancels it)">
          <input type="checkbox" class="mkd-switch__input" id="mkd-auto-advance" role="switch">
          <span class="mkd-switch__track" aria-hidden="true"></span>
          <span class="mkd-switch__label">Auto-advance</span>
        </label>
      </div>`
    : '';

  const submitButton
    = mode !== 'copy'
      ? `\n          <button type="button" class="mkd-bar__btn" id="mkd-submit" disabled>${escapeHtml(spec.submitLabel)}</button>`
      : '';

  // The artifact page learns the db document it writes to; the copy/wait
  // script line stays exactly as it always was.
  // Only a deck with a diagram learns where Mermaid lives (lazy CDN load).
  const mermaidGlobals = /"type":"diagram"/.test(JSON.stringify(spec))
    ? `window.__MKD_MERMAID__ = ${embedJson({ src: MERMAID_SRC, integrity: MERMAID_SRI })};`
    : '';

  const artifactGlobals
    = mode === 'artifact'
      ? `window.__MKD_RESULT_DOC__ = ${embedJson(`results/${artifactDocId(spec.session)}`)};`
      : '';

  const assets = `  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${FONTS_HREF}">
  <style>${APP_CSS}</style>`;

  const app = `  <main id="mkd-app" data-mode="${mode}">
    <header class="mkd-header">
      <div class="mkd-brand">
        <span class="mkd-brand__logo" aria-label="MKD - Make Decision">MKD</span>
        <span class="mkd-brand__meta">
          <span class="mkd-brand__title">${title}</span>
          <span class="mkd-brand__session">${escapeHtml(spec.session)}</span>
        </span>
      </div>
      <nav class="mkd-rail" id="mkd-rail" aria-label="Progress"></nav>${viewOptions}
      <div class="mkd-header__tools">
        <button type="button" class="mkd-kbd-toggle" id="mkd-kbd-toggle" aria-label="Keyboard shortcuts" title="Keyboard shortcuts"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9"/></svg></button>
        <button type="button" class="mkd-theme-toggle" id="mkd-theme-toggle" aria-label="Toggle light/dark theme" title="Toggle light/dark theme"></button>
      </div>
    </header>
    <div class="mkd-stage" id="mkd-stage">
${renderIntroCard(spec)}
${cards}
      <section class="mkd-card mkd-card--summary" id="mkd-summary" hidden></section>
    </div>
    <footer class="mkd-bar" id="mkd-bar">
      <progress class="mkd-progress" id="mkd-progress" max="${total}" value="0" aria-labelledby="mkd-progress-label"></progress>
      <div class="mkd-bar__row">
        <span class="mkd-bar__count" id="mkd-progress-label"><b id="mkd-count-done">0</b>/${total} done<span class="mkd-bar__sep"> · </span><span class="mkd-bar__pending" id="mkd-count-pending">${total} pending</span></span>
        <button type="button" class="mkd-bar__more" id="mkd-more" aria-expanded="false" aria-controls="mkd-bar-secondary" aria-label="More actions" title="More actions"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button>
        <div class="mkd-bar__secondary" id="mkd-bar-secondary">
          <button type="button" class="mkd-bar__btn mkd-bar__btn--jump" id="mkd-jump">First pending &#8594;</button>
          <span class="mkd-bar__error" id="mkd-submit-error" hidden></span>
          <button type="button" class="mkd-bar__btn" id="mkd-json-toggle">View JSON</button>
          <button type="button" class="mkd-bar__btn" id="mkd-copy">Copy JSON</button>${submitButton}
        </div>
        <nav class="mkd-bar__nav" aria-label="Deck navigation">
          <button type="button" class="mkd-btn mkd-btn--ghost" id="mkd-prev" aria-label="Previous"><span aria-hidden="true">&#8592;</span><span class="mkd-bar__label"> Previous</span></button>
          <button type="button" class="mkd-btn" id="mkd-skip" title="Skip for now = decide later, not a rejection">Skip<span class="mkd-bar__label"> for now</span></button>
          <button type="button" class="mkd-btn mkd-btn--primary" id="mkd-next">Next &#8594;</button>
        </nav>
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
    <dialog class="mkd-confirm" id="mkd-confirm" aria-labelledby="mkd-confirm-title" aria-describedby="mkd-confirm-body">
      <h2 class="mkd-confirm__title" id="mkd-confirm-title">Some items are still pending</h2>
      <p class="mkd-confirm__body" id="mkd-confirm-body"></p>
      <form method="dialog" class="mkd-confirm__actions">
        <button type="submit" class="mkd-btn" value="send" id="mkd-confirm-send">Send anyway</button>
        <button type="submit" class="mkd-btn mkd-btn--primary" value="review" autofocus>Review pending</button>
      </form>
    </dialog>
    <dialog class="mkd-lightbox" id="mkd-lightbox" aria-label="Media viewer">
      <button type="button" class="mkd-lightbox__close" id="mkd-lightbox-close" aria-label="Close media viewer">close</button>
      <div class="mkd-lightbox__body" id="mkd-lightbox-body"></div>
    </dialog>
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
  <script>window.__MKD__ = ${embedJson(stripMedia(spec))};${mermaidGlobals}window.__MKD_MODE__ = ${embedJson(mode)};window.__MKD_TOKEN__ = ${embedJson(submitToken)};${artifactGlobals}</script>
  <script>${APP_JS}</script>`;

  if (mode === 'artifact') {
    // The Artifact tool wraps the page in its own doctype/head/body skeleton
    // (charset + viewport included) and scans the first 8 KB for the title,
    // so the fragment opens with it.
    const prefix = opts.titlePrefix?.trim();
    const pageTitle = escapeHtml(prefix ? `${prefix} · ${spec.title}` : spec.title);
    return `<title>${pageTitle}</title>
${assets}
${app}
`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${title}</title>
${assets}
</head>
<body>
${app}
</body>
</html>
`;
}
