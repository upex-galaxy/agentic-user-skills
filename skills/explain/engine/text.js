// Text helpers: measure, wrap, fit into a box (shrink to a minimum size, then flag overflow),
// reveal wrapped lines strictly in order (typewriter), and lay out code lines with highlight.
// Everything takes a `ctx` with measureText so tests can pass a stub.

/** Width of `str` in the given CSS font string. */
export function measure(ctx, str, font) {
  ctx.font = font;
  return ctx.measureText(str).width;
}

/** Tag a text-block rect with the fit's widow flag (non-enumerable, so rect equality in tests is unaffected); the QA gate reads it. */
export function withWidow(rect, fit) {
  if (fit?.widow) { Object.defineProperty(rect, 'widow', { value: true }); }
  return rect;
}

/** Greedy wrap of one paragraph's words. Words wider than maxW are broken by characters. */
function greedy(ctx, words, maxW, font) {
  const lines = [];
  let cur = '';
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word;
    if (measure(ctx, trial, font) <= maxW) {
      cur = trial;
      continue;
    }
    if (cur) { lines.push(cur); }
    cur = word;
    while (measure(ctx, cur, font) > maxW && cur.length > 1) {
      let n = cur.length - 1;
      while (n > 1 && measure(ctx, cur.slice(0, n), font) > maxW) { n--; }
      lines.push(cur.slice(0, n));
      cur = cur.slice(n);
    }
  }
  lines.push(cur);
  return lines;
}

/** A widow: 2+ lines whose last line is one word narrower than 30 % of the widest line. */
export function isWidow(ctx, lines, font) {
  if (lines.length < 2) { return false; }
  const last = lines[lines.length - 1];
  if (!last || /\s/.test(last)) { return false; }
  const widest = Math.max(...lines.map(l => measure(ctx, l, font)));
  return measure(ctx, last, font) < widest * 0.3;
}

/** Wrap each paragraph; a widow is rebalanced by narrowing the measure while the line count stays the same. */
function wrapParas(ctx, text, maxW, font) {
  return String(text).split('\n').map((para) => {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { return ['']; }
    const lines = greedy(ctx, words, maxW, font);
    if (!isWidow(ctx, lines, font)) { return lines; }
    for (let w = maxW * 0.96; w >= maxW * 0.55; w -= maxW * 0.04) {
      const alt = greedy(ctx, words, w, font);
      if (alt.length !== lines.length) { break; }
      if (!isWidow(ctx, alt, font)) { return alt; }
    }
    return lines;
  });
}

/** Greedy word wrap that respects "\n" and avoids a lone short word on the last line of a paragraph. */
export function wrapText(ctx, text, maxW, font) {
  return wrapParas(ctx, text, maxW, font).flat();
}

/**
 * Fit `text` into box {w, h}. Starts at maxPx and shrinks one pixel at a time down to minPx;
 * if it still does not fit it stays at minPx and `overflow` is true. A size that would break a word across lines is skipped.
 * opts: fontFor(px) -> CSS font (required), maxPx (40), minPx (16), lineHeight (1.25), pad (0).
 * A lone short word on a paragraph's last line is rebalanced, else one smaller size is tried; `widow` is true if one remains.
 * Returns { lines, px, lineH, width, height, overflow, widow }.
 */
export function fitText(ctx, text, box, opts) {
  const { fontFor, maxPx = 40, minPx = 16, lineHeight = 1.25, pad = 0 } = opts;
  const innerW = box.w - pad * 2;
  const innerH = box.h - pad * 2;
  const hi = Math.max(minPx, maxPx);
  let result = null;
  let widowed = null; // first size that fits but leaves a widow; kept unless one smaller step removes it
  for (let px = hi; px >= minPx; px--) {
    const font = fontFor(px);
    // Shrink before breaking a word across lines ("Transicio / nes"); a broken word is only accepted at the minimum size.
    if (px > minPx && String(text).split(/\s+/).some(word => word && measure(ctx, word, font) > innerW)) { continue; }
    const paras = wrapParas(ctx, text, innerW, font);
    const lines = paras.flat();
    const lineH = px * lineHeight;
    const width = Math.max(0, ...lines.map(l => measure(ctx, l, font)));
    const height = lines.length * lineH;
    result = { lines, px, lineH, width, height, overflow: width > innerW + 0.5 || height > innerH + 0.5, widow: paras.some(l => isWidow(ctx, l, font)) };
    if (!result.overflow && !result.widow) { return result; }
    if (!result.overflow) {
      if (widowed) { return widowed; }
      widowed = result;
    }
    else if (widowed) { return widowed; }
  }
  return widowed ?? result;
}

/**
 * Typewriter over already wrapped lines. Characters appear in reading order: a line shows nothing
 * until every previous line is complete. Returns the visible text per line and the caret position.
 */
export function revealLines(lines, p) {
  const total = lines.reduce((s, l) => s + l.length, 0);
  let left = p >= 1 ? total : Math.max(0, Math.ceil(total * p));
  const shown = [];
  let caret = { line: 0, col: 0 };
  lines.forEach((l, i) => {
    const n = Math.min(l.length, left);
    shown.push(l.slice(0, n));
    if (n > 0 || i === 0) { caret = { line: i, col: n }; }
    left -= n;
  });
  return { shown, caret, done: p >= 1 };
}

/**
 * Code block layout. lines: string | { text, color?, hl? }. The font shrinks until the longest line fits the
 * box width and all rows fit the height. highlight: line indexes (or Set) to mark.
 * Returns { rows: [{ text, y, hl, color }], px, lineH, overflow } with y relative to box.y (row centers).
 */
export function layoutCode(ctx, lines, box, opts) {
  const { fontFor, maxPx = 30, minPx = 14, lineHeight = 1.5, pad = 20, highlight = [] } = opts;
  const hl = new Set(highlight);
  const items = lines.map(l => (typeof l === 'string' ? { text: l } : l)).map((l, i) => ({ ...l, hl: l.hl || hl.has(i) }));
  const innerW = box.w - pad * 2;
  const innerH = box.h - pad * 2;
  let out = null;
  for (let px = Math.max(minPx, maxPx); px >= minPx; px--) {
    const font = fontFor(px);
    const widest = Math.max(0, ...items.map(l => measure(ctx, l.text, font)));
    const lineH = px * lineHeight;
    out = { px, lineH, widest, overflow: widest > innerW + 0.5 || items.length * lineH > innerH + 0.5 };
    if (!out.overflow) { break; }
  }
  const rows = items.map((l, i) => ({ text: l.text, hl: l.hl, color: l.color, y: pad + out.lineH * (i + 0.5) }));
  return { ...out, rows, pad };
}
