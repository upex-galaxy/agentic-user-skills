// table: comparison table that fills row by row, with column headers, fitted cells and an optional highlighted
// row or column. All cells share one font size (the smallest any cell needs), so the grid reads as one block.
import { clamp, ease, hash, prog } from '../math.js';
import { fitText } from '../text.js';
import { blockBox, drawTextBlock } from './base.js';

const register = (s, id, rect) => (s.reg.has(id) ? s.reg.get(id) : s.reg.add(id, rect));
const colSpec = c => (typeof c === 'string' ? { text: c } : c);

/** Column widths that sum to `total`: proportional to the longest cell text, never narrower than `min`. */
export function columnWidths(weights, total, min = 120) {
  const sum = weights.reduce((a, b) => a + b, 0);
  let w = weights.map(x => Math.max(min, (x / sum) * total));
  const over = w.reduce((a, b) => a + b, 0) - total;
  if (over > 0.5) {
    const free = w.map(x => x - min);
    const room = free.reduce((a, b) => a + b, 0);
    w = w.map((x, i) => (room > 0 ? x - (free[i] / room) * over : x));
  }
  return w;
}

/**
 * Comparison table. opts: id, columns [text | { text, align }], rows [[cell, ...]], area (default scene area), at, step
 * (seconds per row), px, highlight { row | col (0-based), at, color }, firstColBold (default true), w, rowH.
 */
export function table(s, o) {
  const id = o.id ?? s.uid('table');
  const cols = (o.columns ?? []).map(colSpec);
  const rows = (o.rows ?? []).map(r => r.map(String));
  if (!cols.length || !rows.length) { throw new Error('table needs columns and rows'); }
  const nc = cols.length;
  const area = o.area ?? o.rect ?? s.area;
  const d = s.style.defaults;
  const pad = 22;
  const maxPx = o.px ?? d.labelPx * 0.85;
  const fontFor = (px, bold) => s.style.font('body', px, bold ? 700 : undefined);
  const totalW = Math.min(area.w, o.w ?? area.w);
  const weights = cols.map((c, j) => clamp(Math.max(c.text.length, ...rows.map(r => (r[j] ?? '').length)), 6, 34));
  const widths = columnWidths(weights, totalW);
  const rowH = o.rowH ?? clamp(area.h / (rows.length + 1.2), 64, 120);
  const headH = rowH * 0.9;
  const h = headH + rows.length * rowH;
  const rect = register(s, id, { x: area.x + (area.w - totalW) / 2, y: area.y + Math.max(0, (area.h - h) / 2), w: totalW, h });
  const xs = widths.reduce((acc, w, j) => [...acc, acc[j] + w], [rect.x]);
  const cell = (j, i) => ({ x: xs[j] + pad / 2, y: i < 0 ? rect.y : rect.y + headH + i * rowH, w: widths[j] - pad, h: i < 0 ? headH : rowH });
  const fitAll = (px) => {
    const out = [];
    cols.forEach((c, j) => out.push({ j, i: -1, text: c.text, fit: fitText(s.ctx, c.text, cell(j, -1), { fontFor: p => fontFor(p, true), maxPx: px, minPx: d.minPx - 4, lineHeight: 1.18, pad: 6 }) }));
    rows.forEach((r, i) => cols.forEach((_, j) => out.push({ j, i, text: r[j] ?? '', fit: fitText(s.ctx, r[j] ?? '', cell(j, i), { fontFor: p => fontFor(p, j === 0 && o.firstColBold !== false), maxPx: px, minPx: d.minPx - 4, lineHeight: 1.18, pad: 6 }) })));
    return out;
  };
  const px = Math.min(...fitAll(maxPx).map(c => c.fit.px));
  const cells = fitAll(px);
  const align = j => cols[j].align ?? (j === 0 ? 'left' : 'center');
  const at = o.at ?? 0;
  const step = o.step ?? 0.55;
  const rowAt = i => at + 0.7 + (i + 1) * step;
  const hl = o.highlight ?? null;
  const hlAt = hl?.at ?? rowAt(rows.length) + 0.5;
  const panelP = t => ease.out(prog(t, at, 0.5));
  return {
    kind: 'table',
    id,
    z: o.z ?? 0,
    rect,
    texts: () => cells.map(c => c.text),
    draw(api, t) {
      const pp = panelP(t);
      if (pp <= 0) { return; }
      const seed = hash(id);
      api.style.shape(api, rect, { kind: 'round', p: pp, stroke: 'dim', fill: 'panel', lw: 2.5, seed });
      const hp = hl ? ease.out(prog(t, hlAt, 0.4)) : 0;
      if (hp > 0 && hl.row !== undefined) { api.style.highlight(api, { x: rect.x + 6, y: rect.y + headH + hl.row * rowH + 4, w: rect.w - 12, h: rowH - 8 }, { p: hp, color: hl.color ?? 'accent' }); }
      if (hp > 0 && hl.col !== undefined) { api.style.highlight(api, { x: xs[hl.col] + 4, y: rect.y + 6, w: widths[hl.col] - 8, h: h - 12 }, { p: hp, color: hl.color ?? 'accent' }); }
      const hh = ease.inOut(prog(t, at + 0.4, 0.5));
      api.style.line(api, [[rect.x + 12, rect.y + headH], [rect.x + rect.w - 12, rect.y + headH]], { p: hh, color: 'accent', lw: 4, seed: seed + 1 });
      for (let j = 1; j < nc; j++) { api.style.line(api, [[xs[j], rect.y + 14], [xs[j], rect.y + h - 14]], { p: hh, color: 'dim', lw: 2, seed: seed + 10 + j }); }
      for (const c of cells) {
        const k = c.i < 0 ? prog(t, at + 0.4, 0.4) : prog(t, rowAt(c.i), 0.35);
        if (k <= 0) { continue; }
        const e = ease.out(k);
        if (c.i >= 1 && c.j === 0) { api.style.line(api, [[rect.x + 12, rect.y + headH + c.i * rowH], [rect.x + rect.w - 12, rect.y + headH + c.i * rowH]], { p: e, color: 'dim', lw: 1.8, seed: seed + 40 + c.i }); }
        const hot = hp > 0 && (hl.row === c.i || hl.col === c.j);
        drawTextBlock(api, c.fit, cell(c.j, c.i), { align: align(c.j), pad: 6, weight: c.i < 0 || (c.j === 0 && o.firstColBold !== false) ? 700 : undefined, color: c.i < 0 ? 'accent' : hot ? 'ink' : (hl && hp > 0 ? 'dim' : 'ink'), alpha: e });
      }
    },
    qa: (api, t) => ({
      rect,
      alpha: panelP(t),
      container: true,
      texts: cells.map(c => ({ text: c.text, rect: blockBox(c.fit, cell(c.j, c.i), align(c.j), 6), overflow: c.fit.overflow, px: c.fit.px })),
    }),
  };
}

export const pieces = { table };
