// `codeBlock`: a code window with a title bar and line numbers. Lines type in or fade in; a highlight band
// glides between line ranges over time; an optional pointer callout explains one line.
// s.codeBlock({ id: 'login', title: 'login.ts', lines: ['const user = await find(email);', ...],
//   highlights: [{ lines: [1, 2], at: 3 }, { lines: 4, at: 5.5 }],     // 1-based, inclusive; each stays until the next
//   pointer: { line: 4, text: 'Aquí se valida la clave', at: 6 }, type: 'type' | 'appear' | false })
import { clamp, ease, hash, prog } from '../math.js';
import { layoutCode, measure, revealLines } from '../text.js';
import { blockRect, drawFit, fitIn, inflate, lerpRect, lineItem } from './diagram-kit.js';

const TITLE_H = 60;
const GUTTER = 76;

/** Normalize the highlight list: sorted by time, each with from/to (1-based, inclusive). */
export function normalizeHighlights(list = []) {
  return list
    .map((h) => {
      const [from, to] = Array.isArray(h.lines) ? h.lines : [h.lines, h.lines];
      return { from, to: to ?? from, at: h.at ?? 0, until: h.until, color: h.color ?? 'accent' };
    })
    .sort((a, b) => a.at - b.at);
}

/** Pure: the band (rect, alpha) at time t, or null. `rowRect(from, to)` maps line numbers to a rect. */
export function bandAt(t, hls, rowRect, glide = 0.4) {
  let k = -1;
  hls.forEach((h, i) => { if (h.at <= t) { k = i; } });
  if (k < 0) { return null; }
  const cur = hls[k];
  const target = rowRect(cur.from, cur.to);
  const fadeIn = prog(t, cur.at, 0.3);
  const fadeOut = cur.until === undefined ? 0 : prog(t, cur.until, 0.3);
  const alpha = (k === 0 ? fadeIn : 1) * (1 - fadeOut);
  if (alpha <= 0) { return null; }
  const rect = k > 0 ? lerpRect(rowRect(hls[k - 1].from, hls[k - 1].to), target, ease.inOut(prog(t, cur.at, glide))) : target;
  return { rect, alpha, color: cur.color, index: k };
}

export const codeBlock = (s, o) => {
  const id = o.id ?? s.uid('code');
  const area = o.area ?? s.area;
  const lines = (o.lines ?? []).map(l => (typeof l === 'string' ? { text: l } : l));
  const hls = normalizeHighlights(o.highlights);
  // Few lines in a tall area: the code grows (up to 1.5x the style's code size) so the panel fills the area.
  const baseCodePx = s.style.defaults.codePx;
  const codePx = o.px ?? Math.max(baseCodePx, Math.min(baseCodePx * 1.5, area.h / (lines.length + 3) / 1.55));
  let rect = o.rect ?? (s.reg.has(id) ? s.reg.get(id) : null);
  if (!rect) {
    const w = o.pointer ? area.w * 0.62 : area.w * 0.9;
    const h = Math.min(area.h, TITLE_H + 44 + lines.length * codePx * 1.55);
    rect = { x: o.pointer ? area.x : area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h };
  }
  if (!s.reg.has(id)) { s.reg.add(id, rect); }
  const body = { x: rect.x + GUTTER, y: rect.y + TITLE_H, w: rect.w - GUTTER, h: rect.h - TITLE_H };
  const lay = layoutCode(s.ctx, lines, body, { fontFor: px => s.style.font('mono', px), maxPx: codePx, minPx: s.style.defaults.minPx - 4, pad: 22 });
  const flat = lay.rows.map(r => r.text);
  const total = flat.reduce((n, l) => n + l.length, 0);
  const at = o.at ?? 0;
  const dur = o.dur ?? 0.6;
  const mode = o.type === false || o.type === 'none' ? 'none' : (o.type ?? 'type');
  const typeAt = o.typeAt ?? at + dur;
  const typeDur = o.typeDur ?? Math.max(0.8, total * 0.025);
  const lineStep = o.lineStep ?? 0.22;
  const rowY = i => body.y + lay.rows[i].y;
  const rowRect = (from, to) => ({ x: rect.x + 12, y: rowY(clamp(from - 1, 0, flat.length - 1)) - lay.lineH / 2, w: rect.w - 24, h: (to - from + 1) * lay.lineH });
  const panel = t => ease.out(prog(t, at, dur));
  const titleRect = { x: rect.x + 130, y: rect.y + 6, w: rect.w - 160, h: TITLE_H - 12 };
  const titleFit = o.title ? fitIn(s, o.title, titleRect, { font: 'mono', px: Math.round(s.style.defaults.labelPx * 0.62), pad: 0 }) : null;
  const end = mode === 'type' ? typeAt + typeDur : mode === 'appear' ? typeAt + lineStep * flat.length : typeAt;

  s.add({
    kind: 'code',
    id,
    z: o.z ?? 0,
    rect,
    texts: () => [...(o.title ? [o.title] : []), ...flat],
    draw(api, t) {
      const p = panel(t);
      if (p <= 0) { return; }
      const { style } = api;
      style.shape(api, rect, { kind: 'round', p, stroke: o.color ?? 'dim', fill: 'panel', lw: 2.5, seed: hash(id) });
      if (p < 0.6) { return; }
      const a = clamp((p - 0.6) / 0.4);
      [['bad', 0], ['warn', 1], ['good', 2]].forEach(([c, i]) => style.shape(api, { x: rect.x + 28 + i * 30, y: rect.y + TITLE_H / 2 - 8, w: 16, h: 16 }, { kind: 'ellipse', p: 1, stroke: c, fill: c, lw: 1.5, glow: 4, alpha: a, seed: 11 + i }));
      if (titleFit) { drawFit(api, titleFit, titleRect, { align: 'left', role: 'mono', color: 'dim', alpha: a }); }
      style.line(api, [[rect.x + 14, rect.y + TITLE_H], [rect.x + rect.w - 14, rect.y + TITLE_H]], { p: 1, color: 'dim', lw: 1.8, head: false, alpha: a * 0.7, seed: 5 });
      const band = bandAt(t, hls, rowRect);
      if (band) { style.highlight(api, band.rect, { p: 1, color: band.color, alpha: band.alpha, seed: 9 }); }
      const typed = mode === 'type' ? revealLines(flat, prog(t, typeAt, typeDur)).shown : flat;
      lay.rows.forEach((row, i) => {
        const vis = mode === 'appear' ? ease.out(prog(t, typeAt + lineStep * i, 0.3)) : (typed[i].length ? 1 : 0);
        if (vis <= 0) { return; }
        const y = rowY(i);
        style.text(api, String(i + 1), body.x - 18, y, { px: Math.round(lay.px * 0.8), role: 'mono', color: 'dim', align: 'right', alpha: a * vis * 0.8 });
        style.text(api, typed[i], body.x + lay.pad, y + (mode === 'appear' ? (1 - vis) * 8 : 0), { px: lay.px, role: 'mono', color: row.color ?? 'ink', alpha: a * vis });
      });
    },
    qa: (_api, t) => ({
      rect,
      alpha: panel(t),
      container: true,
      texts: [
        ...(titleFit ? [{ text: o.title, rect: blockRect(titleFit, titleRect, 'left'), overflow: titleFit.overflow, px: titleFit.px }] : []),
        { text: flat.join('\n'), rect: { x: body.x + lay.pad, y: body.y + lay.pad, w: Math.min(lay.widest, body.w - lay.pad * 2), h: flat.length * lay.lineH }, overflow: lay.overflow, px: lay.px },
      ],
    }),
  });

  const handle = { id, rect, end, lineY: rowY, lay };
  const ptr = o.pointer;
  if (ptr) {
    const row = clamp((ptr.line ?? 1) - 1, 0, flat.length - 1);
    const gap = 60;
    const left = rect.x + rect.w + gap;
    const w = Math.min(520, area.x + area.w - left);
    const fit = fitIn(s, ptr.text ?? '', { x: 0, y: 0, w: w - 40, h: 220 }, { px: Math.round(s.style.defaults.labelPx * 0.78), pad: 0 });
    const h = Math.min(rect.h, fit.height + 44);
    const pr = { x: left, y: clamp(rowY(row) - h / 2, rect.y, rect.y + rect.h - h), w, h };
    const pid = `${id}-pointer`;
    s.reg.add(pid, pr);
    const pat = ptr.at ?? end + 0.3;
    const k = t => ease.out(prog(t, pat, 0.5)) * (ptr.until === undefined ? 1 : 1 - prog(t, ptr.until, 0.3));
    const tip = [body.x + lay.pad + measure(s.ctx, flat[row], s.style.font('mono', lay.px)) + 16, rowY(row)];
    s.add({
      kind: 'label',
      id: pid,
      z: 1.5,
      rect: pr,
      texts: () => [ptr.text ?? ''],
      draw(api, t) {
        const p = k(t);
        if (p <= 0) { return; }
        api.style.shape(api, pr, { kind: 'round', p, stroke: ptr.color ?? 'warn', fill: 'panel', lw: 2.5, alpha: p, seed: hash(pid) });
        drawFit(api, fit, inflate(pr, -20), { align: 'left', color: 'ink', alpha: p });
      },
      qa: (_api, t) => ({ rect: pr, alpha: k(t), texts: [{ text: ptr.text ?? '', rect: blockRect(fit, inflate(pr, -20), 'left'), overflow: fit.overflow, px: fit.px }] }),
    });
    const leader = lineItem(s, { id: `${pid}-leader`, pts: [[pr.x - 4, pr.y + pr.h / 2], tip], at: pat + 0.1, dur: 0.5, color: ptr.color ?? 'warn', z: 1.4 });
    leader.draw = (orig => (api, t) => { if (ptr.until === undefined || t < ptr.until + 0.3) { orig(api, t); } })(leader.draw);
    s.add(leader);
    handle.pointer = pr;
    handle.end = pat + 0.6;
  }
  return { kind: 'codeBlock', id: `${id}-handle`, z: -2, rect, ...handle, texts: () => [], draw() {} };
};

export const pieces = { codeBlock };
