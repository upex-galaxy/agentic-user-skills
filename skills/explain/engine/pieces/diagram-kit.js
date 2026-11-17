// Shared helpers of the diagram pieces (sequence, architecture, code, anatomy, state, motion).
// Nothing here is a piece: it is geometry, text fitting and two small items (a polyline and a label chip).
import { clamp, ease, hash, prog } from '../math.js';
import { fitText, withWidow } from '../text.js';

export const TOKENS = ['accent', 'accent2', 'good', 'warn'];

/** Fit `text` into `rect` with the style's fonts. o: font, px, minPx, pad, weight, lineHeight. */
export function fitIn(s, text, rect, o = {}) {
  const d = s.style.defaults;
  return fitText(s.ctx, text, rect, {
    fontFor: px => s.style.font(o.font ?? 'body', px, o.weight),
    maxPx: o.px ?? d.labelPx,
    minPx: o.minPx ?? d.minPx,
    pad: o.pad ?? 6,
    lineHeight: o.lineHeight ?? 1.2,
  });
}

/** Bounding box of a fitted block aligned inside `rect` (left | center | right). */
export function blockRect(fit, rect, align = 'center') {
  const h = fit.lines.length * fit.lineH;
  const x = align === 'left' ? rect.x : align === 'right' ? rect.x + rect.w - fit.width : rect.x + (rect.w - fit.width) / 2;
  return withWidow({ x, y: rect.y + (rect.h - h) / 2, w: fit.width, h }, fit);
}

/** Draw a fitted block; unlike base.js it supports right alignment. o: align, role, weight, color, alpha. */
export function drawFit(api, fit, rect, o = {}) {
  const { align = 'center', role = 'body', weight, color = 'ink', alpha = 1 } = o;
  if (alpha <= 0) { return; }
  const top = rect.y + (rect.h - fit.lines.length * fit.lineH) / 2;
  const x = align === 'left' ? rect.x : align === 'right' ? rect.x + rect.w : rect.x + rect.w / 2;
  fit.lines.forEach((line, i) => {
    api.style.text(api, line, x, top + fit.lineH * (i + 0.5), { px: fit.px, role, weight, color, align, alpha });
  });
}

/** Total length of a polyline. */
export const polyLen = pts => pts.slice(1).reduce((n, q, i) => n + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);

/** Point at fraction `p` (0..1) of a polyline's length, plus the heading there. */
export function pointAt(pts, p) {
  const total = polyLen(pts);
  let d = clamp(p) * total;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (d <= l || i === pts.length - 1) {
      const k = l ? clamp(d / l) : 0;
      return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k, angle: Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]) };
    }
    d -= l;
  }
  return { x: pts[0][0], y: pts[0][1], angle: 0 };
}

/** Sample a quadratic Bezier into `n + 1` points. */
export function quad(p0, c, p1, n = 28) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const k = i / n;
    const a = (1 - k) ** 2;
    const b = 2 * (1 - k) * k;
    const e = k * k;
    return [a * p0[0] + b * c[0] + e * p1[0], a * p0[1] + b * c[1] + e * p1[1]];
  });
}

/** Sample a cubic Bezier into `n + 1` points. */
export function cubic(p0, c1, c2, p1, n = 32) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const k = i / n;
    const a = (1 - k) ** 3;
    const b = 3 * (1 - k) ** 2 * k;
    const c = 3 * (1 - k) * k * k;
    const e = k ** 3;
    return [a * p0[0] + b * c1[0] + c * c2[0] + e * p1[0], a * p0[1] + b * c1[1] + c * c2[1] + e * p1[1]];
  });
}

export const boxOf = (pts, pad = 0) => {
  const xs = pts.map(q => q[0]);
  const ys = pts.map(q => q[1]);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
};

export const inflate = (r, d) => ({ x: r.x - d, y: r.y - d, w: r.w + d * 2, h: r.h + d * 2 });
export const lerpRect = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k });

/**
 * A polyline that draws itself with the style's line. o: id, pts, at, dur, color, lw, head, dash, z.
 * Dashed lines cannot draw on in every style, so they fade in over the same window instead.
 */
export function lineItem(s, o) {
  const id = o.id ?? s.uid('line');
  const { pts } = o;
  const at = o.at ?? 0;
  const dur = o.dur ?? 0.7;
  const box = boxOf(pts);
  const lw = o.lw ?? s.style.defaults.lw + 1;
  const k = t => ease.inOut(prog(t, at, dur));
  return {
    kind: 'edge',
    id,
    z: o.z ?? -0.5,
    rect: box,
    pts,
    texts: () => [],
    draw(api, t) {
      const p = k(t);
      if (p <= 0) { return; }
      api.style.line(api, pts, { p: o.dash ? 1 : p, alpha: o.dash ? p : 1, color: o.color ?? 'dim', lw, head: o.head ?? true, dash: o.dash, seed: hash(id) });
    },
    qa: (_api, t) => ({ rect: box, alpha: k(t), texts: [], overlap: true }),
  };
}

/** Size { w, h } of the pill `chipItem` draws for `text`. o: px, maxW. */
export function chipSize(s, text, o = {}) {
  const fit = fitIn(s, text, { x: 0, y: 0, w: o.maxW ?? 360, h: 80 }, { px: o.px ?? Math.round(s.style.defaults.labelPx * 0.7), pad: 0 });
  return { w: fit.width + 32, h: fit.lineH + 14 };
}

/** A small pill with a text, drawn over lines (edge labels, transition labels). o: id, text, center [x, y], at, dur, color, px, bounds. */
export function chipItem(s, o) {
  const id = o.id ?? s.uid('chip');
  const at = o.at ?? 0;
  const dur = o.dur ?? 0.5;
  const text = o.text ?? '';
  const fit = fitIn(s, text, { x: 0, y: 0, w: o.maxW ?? 360, h: 80 }, { px: o.px ?? Math.round(s.style.defaults.labelPx * 0.7), pad: 0 });
  const w = fit.width + 32;
  const h = fit.lineH + 14;
  const lim = o.bounds ?? { x: 36, y: 36, w: s.W - 72, h: s.H - 72 };
  const cx = clamp(o.center[0], lim.x + w / 2, lim.x + lim.w - w / 2);
  const cy = clamp(o.center[1], lim.y + h / 2, lim.y + lim.h - h / 2);
  const rect = { x: cx - w / 2, y: cy - h / 2, w, h };
  const k = t => ease.out(prog(t, at, dur));
  if (o.register !== false && !s.reg.has(id)) { s.reg.add(id, rect); }
  return {
    kind: 'label',
    id,
    z: o.z ?? 1.2,
    rect,
    texts: () => [text],
    draw(api, t) {
      const p = k(t);
      if (p <= 0) { return; }
      api.style.shape(api, rect, { kind: 'pill', p, stroke: o.color ?? 'dim', fill: 'panel', lw: 1.8, alpha: p, seed: hash(id) });
      drawFit(api, fit, rect, { color: o.textColor ?? 'ink', alpha: p });
    },
    qa: (_api, t) => ({ rect, alpha: k(t), texts: [{ text, rect: blockRect(fit, rect), overflow: fit.overflow, px: fit.px }], overlap: o.overlap, overlapWith: o.overlapWith }),
  };
}

/** Rect of a registered id, or the rect itself when one is passed. */
export function rectOf(s, ref, what = 'element') {
  if (ref && typeof ref === 'object') { return ref; }
  if (s.reg.has(ref)) { return s.reg.get(ref); }
  throw new Error(`${what}: unknown element id "${ref}" (known: ${s.reg.ids().join(', ') || 'none'})`);
}
