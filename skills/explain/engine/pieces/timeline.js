// timeline: horizontal axis with milestones (label above or below, alternating so neighbors never overlap),
// a progress fill and a travelling marker driven by t. A milestone lights up when the marker reaches it.
import { clamp, ease, hash, lerp, prog } from '../math.js';
import { fitText } from '../text.js';
import { blockBox, drawTextBlock } from './base.js';

const register = (s, id, rect) => (s.reg.has(id) ? s.reg.get(id) : s.reg.add(id, rect));
const asSpec = x => (typeof x === 'string' ? { label: x } : x);

/**
 * Pure geometry: milestone x positions, label width and which side each label sits on.
 * Labels alternate (above, below, ...); same-side labels are two spacings apart, so width < 2 * spacing keeps them clear.
 */
export function timelineGeometry(n, area) {
  const labelW = clamp(n > 1 ? ((area.w - 280) / (n - 1)) * 1.8 : 420, 170, 440);
  const x0 = area.x + Math.max(labelW / 2, 90);
  const x1 = area.x + area.w - Math.max(labelW / 2, 90);
  const spacing = n > 1 ? (x1 - x0) / (n - 1) : 0;
  const xs = Array.from({ length: n }, (_, i) => (n > 1 ? x0 + i * spacing : (x0 + x1) / 2));
  return { xs, spacing, labelW: n > 1 ? Math.min(labelW, spacing * 1.85) : labelW, sides: xs.map((_, i) => (i % 2 === 0 ? 'above' : 'below')), x0, x1 };
}

/**
 * Timeline. opts: id, milestones [text | { label, date, color }], area, at, dur (travel seconds), to (0..1, how far the
 * marker travels, default 1), px, color. Milestone i lights up when the marker passes it.
 */
export function timeline(s, o) {
  const id = o.id ?? s.uid('timeline');
  const items = (o.milestones ?? o.items ?? []).map(asSpec);
  if (!items.length) { throw new Error('timeline needs milestones'); }
  const n = items.length;
  const area = o.area ?? o.rect ?? s.area;
  const d = s.style.defaults;
  const g = timelineGeometry(n, area);
  const axisY = area.y + area.h / 2;
  const px = o.px ?? d.labelPx * (area.h >= 560 ? 1.1 : 0.95);
  const fontFor = size => s.style.font('body', size, 600);
  const dateW = Math.min(g.labelW, Math.max(g.spacing * 0.9, 120));
  const fits = items.map(it => fitText(s.ctx, it.label, { w: g.labelW, h: px * 1.2 * 3 }, { fontFor, maxPx: px, minPx: d.minPx, lineHeight: 1.2 }));
  const dateFits = items.map(it => (it.date ? fitText(s.ctx, it.date, { w: dateW, h: px }, { fontFor, maxPx: px * 0.8, minPx: d.minPx - 4, lineHeight: 1.2 }) : null));
  // Taller areas get longer stems, so the strip uses more of the height; never so long that a label leaves the area.
  const labelMaxH = Math.max(...fits.map(f => f.lines.length * f.lineH + 6));
  const stem = Math.max(40, Math.min(clamp(area.h * 0.26, 74, 170), area.h / 2 - labelMaxH - 14));
  const labels = items.map((it, i) => {
    const h = fits[i].lines.length * fits[i].lineH + 6;
    const y = g.sides[i] === 'above' ? axisY - stem - h : axisY + stem;
    return { x: g.xs[i] - g.labelW / 2, y, w: g.labelW, h };
  });
  const dates = items.map((it, i) => {
    if (!it.date) { return null; }
    const f = dateFits[i];
    const h = f.lines.length * f.lineH + 4;
    return { x: g.xs[i] - dateW / 2, y: g.sides[i] === 'above' ? axisY + 26 : axisY - 26 - h, w: dateW, h };
  });
  const rects = [...labels, ...dates.filter(Boolean)];
  const axis = { x0: g.x0 - 50, x1: g.x1 + 50 };
  const left = Math.min(axis.x0, ...rects.map(r => r.x));
  const top = Math.min(axisY - 24, ...rects.map(r => r.y));
  const rect = register(s, id, {
    x: left,
    y: top,
    w: Math.max(axis.x1, ...rects.map(r => r.x + r.w)) - left,
    h: Math.max(axisY + 24, ...rects.map(r => r.y + r.h)) - top,
  });
  const at = o.at ?? 0;
  const travelAt = at + 0.8;
  const travel = o.dur ?? 4;
  const to = o.to ?? 1;
  const xp = t => lerp(g.x0, lerp(g.x0, g.x1, to), ease.inOut(prog(t, travelAt, travel)));
  const reach = (t, i) => ease.out(clamp((xp(t) - g.xs[i] + 28) / 90));
  const axisP = t => ease.inOut(prog(t, at, 0.7));
  const dotR = 18;
  const dot = (x, r) => ({ x: x - r, y: axisY - r, w: r * 2, h: r * 2 });
  return {
    kind: 'timeline',
    id,
    z: o.z ?? 0,
    rect,
    texts: () => [...items.map(it => it.label), ...items.filter(it => it.date).map(it => it.date)],
    draw(api, t) {
      const ap = axisP(t);
      if (ap <= 0) { return; }
      const seed = hash(id);
      api.style.line(api, [[axis.x0, axisY], [axis.x1, axisY]], { p: ap, color: 'dim', lw: 5, head: true, seed });
      const x = xp(t);
      if (x > g.x0 + 1) { api.style.line(api, [[g.x0, axisY], [x, axisY]], { p: 1, color: o.color ?? 'accent', lw: 7, seed: seed + 1 }); }
      items.forEach((it, i) => {
        const r = reach(t, i);
        const color = it.color ?? o.color ?? 'accent';
        api.style.shape(api, dot(g.xs[i], dotR), { kind: 'ellipse', p: ap, stroke: r > 0.5 ? color : 'dim', fill: r > 0.5 ? color : 'panel', lw: 3, seed: seed + i });
        if (r <= 0) { return; }
        const above = g.sides[i] === 'above';
        const y0 = above ? axisY - dotR : axisY + dotR;
        const y1 = above ? labels[i].y + labels[i].h : labels[i].y;
        api.style.line(api, [[g.xs[i], y0], [g.xs[i], y1 + (above ? 4 : -4)]], { p: r, color: 'dim', lw: 2.5, seed: seed + 20 + i });
        drawTextBlock(api, fits[i], labels[i], { weight: 600, color: 'ink', alpha: r });
        if (dates[i]) { drawTextBlock(api, dateFits[i], dates[i], { weight: 600, color: it.color ?? o.color ?? 'accent', alpha: r }); }
      });
      api.style.shape(api, dot(x, 22), { kind: 'ellipse', p: 1, stroke: o.color ?? 'accent', fill: 'ink', lw: 4, glow: 22, seed: seed + 99 });
    },
    qa: (api, t) => ({
      rect,
      alpha: axisP(t),
      container: true,
      texts: [
        ...items.map((it, i) => ({ text: it.label, rect: blockBox(fits[i], labels[i]), overflow: fits[i].overflow, px: fits[i].px })),
        ...items.flatMap((it, i) => (dates[i] ? [{ text: it.date, rect: blockBox(dateFits[i], dates[i]), overflow: dateFits[i].overflow, px: dateFits[i].px }] : [])),
      ],
    }),
  };
}

export const pieces = { timeline };
