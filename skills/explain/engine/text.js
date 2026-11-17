// Text helpers: measure, wrap, fit into a box (shrink to a minimum size, then flag overflow),
// reveal wrapped lines strictly in order (typewriter), and lay out code lines with highlight.
// Everything takes a `ctx` with measureText so tests can pass a stub.

/** Width of `str` in the given CSS font string. */
export function measure(ctx, str, font) {
  ctx.font = font;
  return ctx.measureText(str).width;
}

/** Greedy word wrap that respects "\n". Words wider than maxW are broken by characters. */
export function wrapText(ctx, text, maxW, font) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
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
  }
  return lines;
}

/**
 * Fit `text` into box {w, h}. Starts at maxPx and shrinks one pixel at a time down to minPx;
 * if it still does not fit it stays at minPx and `overflow` is true.
 * opts: fontFor(px) -> CSS font (required), maxPx (40), minPx (16), lineHeight (1.25), pad (0).
 * Returns { lines, px, lineH, width, height, overflow }.
 */
export function fitText(ctx, text, box, opts) {
  const { fontFor, maxPx = 40, minPx = 16, lineHeight = 1.25, pad = 0 } = opts;
  const innerW = box.w - pad * 2;
  const innerH = box.h - pad * 2;
  const hi = Math.max(minPx, maxPx);
  let result = null;
  for (let px = hi; px >= minPx; px--) {
    const font = fontFor(px);
    const lines = wrapText(ctx, text, innerW, font);
    const lineH = px * lineHeight;
    const width = Math.max(0, ...lines.map(l => measure(ctx, l, font)));
    const height = lines.length * lineH;
    result = { lines, px, lineH, width, height, overflow: width > innerW + 0.5 || height > innerH + 0.5 };
    if (!result.overflow) { return result; }
  }
  return result;
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
