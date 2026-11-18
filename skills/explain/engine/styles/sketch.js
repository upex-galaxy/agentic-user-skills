// Sketch style: Rough.js strokes with fixed seeds on a paper background, handwriting font.
// Draw-on uses strokeLineDash. Rough.js is vendored (vendor/rough.min.js) and exposed as the global `rough`.
import { hexA, rng } from '../math.js';

const palette = {
  bg: '#faf7f0',
  ink: '#222222',
  dim: '#7a7468',
  accent: '#e4572e',
  accent2: '#2a6f97',
  good: '#3a8a4f',
  warn: '#d99a00',
  bad: '#c0392b',
  panel: '#ffffff',
};

const STACKS = {
  body: '"Caveat", "Bradley Hand", "Marker Felt", cursive',
  display: '"Caveat", "Bradley Hand", "Marker Felt", cursive',
  mono: '"JetBrains Mono", Menlo, monospace',
};
const WEIGHTS = { body: 600, display: 700, mono: 500 };

const color = tok => palette[tok] ?? tok;
const rcCache = new WeakMap();
function rc(api) {
  const canvas = api.ctx.canvas;
  if (!rcCache.has(canvas)) { rcCache.set(canvas, globalThis.rough.canvas(canvas)); }
  return rcCache.get(canvas);
}

const DOTS = (() => {
  const r = rng(7);
  return Array.from({ length: 140 }, () => ({ x: r(), y: r(), s: 0.6 + r() * 1.4 }));
})();

const perimeter = (kind, r) => (kind === 'ellipse' ? Math.PI * (r.w + r.h) * 0.8 : 2 * (r.w + r.h));
const partial = (len, p) => (p < 1 ? { strokeLineDash: [len * p * 1.15 + 0.01, 1e5] } : {});

export default {
  name: 'sketch',
  palette,
  stacks: STACKS,
  faces: [
    { family: 'Caveat', file: 'fonts/caveat.woff2', weight: '400 700' },
    { family: 'JetBrains Mono', file: 'fonts/jetbrains-mono.woff2', weight: '400 700' },
  ],
  defaults: { nodePx: 54, labelPx: 56, codePx: 32, minPx: 26, lw: 3, pad: 20 },
  color,
  font: (role, px, weight) => `${weight ?? WEIGHTS[role] ?? 600} ${px}px ${STACKS[role] ?? STACKS.body}`,

  background(api) {
    const { ctx, W, H } = api;
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(34,34,34,0.07)';
    for (const d of DOTS) {
      ctx.beginPath();
      ctx.arc(d.x * W, d.y * H, d.s, 0, 7);
      ctx.fill();
    }
  },

  /** Light sweep between scenes: a soft accent band crossing the frame. */
  sweep(api, p) {
    const { ctx, W, H } = api;
    const x = -300 + (W + 600) * (p * p * (3 - 2 * p));
    const g = ctx.createLinearGradient(x - 200, 0, x + 200, 0);
    g.addColorStop(0, hexA(palette.accent, 0));
    g.addColorStop(0.5, hexA(palette.accent, 0.16));
    g.addColorStop(1, hexA(palette.accent, 0));
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(x - 200, 0, 400, H);
  },

  /** Closed shape. o: kind (round|rect|ellipse|pill), p draw-on 0..1, stroke, fill (token | null), lw, dash, alpha, seed. */
  shape(api, rect, o = {}) {
    const { kind = 'round', p = 1, stroke = 'ink', fill = 'panel', lw = 3, dash = null, alpha = 1, seed = 1 } = o;
    if (p <= 0 || alpha <= 0) { return; }
    const { ctx } = api;
    const r = rc(api);
    const draw = (opts) => {
      if (kind === 'ellipse') { r.ellipse(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h, opts); }
      else { r.rectangle(rect.x, rect.y, rect.w, rect.h, opts); }
    };
    ctx.save();
    if (fill) {
      api.alpha(alpha * p);
      draw({ seed, roughness: 1.4, fill: color(fill), fillStyle: 'solid', stroke: 'none' });
    }
    api.alpha(alpha);
    draw({ seed, roughness: 1.4, stroke: color(stroke), strokeWidth: lw, ...(dash ? { strokeLineDash: dash } : partial(perimeter(kind, rect), p)) });
    ctx.restore();
  },

  /** Polyline drawn on to progress p, with an optional arrow head at the end. o: color, lw, head, dash, alpha, seed. */
  line(api, pts, o = {}) {
    const { p = 1, color: c = 'ink', lw = 4, head = false, dash = null, alpha = 1, seed = 1 } = o;
    if (p <= 0) { return; }
    const { ctx } = api;
    const r = rc(api);
    const len = pts.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
    ctx.save();
    api.alpha(alpha);
    r.linearPath(pts, { seed, roughness: 1.1, stroke: color(c), strokeWidth: lw, ...(dash ? { strokeLineDash: dash } : partial(len, p)) });
    if (head && p >= 0.97) {
      const b = pts[pts.length - 1];
      const a = pts[pts.length - 2];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const hs = 14 + lw * 2.5;
      for (const d of [0.5, -0.5]) { r.line(b[0], b[1], b[0] - hs * Math.cos(ang + d), b[1] - hs * Math.sin(ang + d), { seed: seed + (d > 0 ? 1 : 2), roughness: 1, stroke: color(c), strokeWidth: lw }); }
    }
    ctx.restore();
  },

  /** Free polygon or polyline. o: p (draw-on), stroke (token | null), fill (token | null), fillAlpha, lw, alpha, closed. */
  poly(api, pts, o = {}) {
    const { p = 1, stroke = 'ink', fill = null, fillAlpha = 0.18, lw = 3, alpha = 1, closed = true } = o;
    if (p <= 0 || alpha <= 0 || pts.length < 2) { return; }
    const { ctx } = api;
    if (fill && closed) {
      ctx.save();
      api.alpha(alpha * fillAlpha * p);
      ctx.fillStyle = color(fill);
      ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (stroke !== null) { this.line(api, closed ? [...pts, pts[0]] : pts, { ...o, p, color: stroke, lw, alpha, head: false }); }
  },

  /** Single line of text. o: px, role, weight, color, align, alpha. */
  text(api, str, x, y, o = {}) {
    const { px = 46, role = 'body', weight, color: c = 'ink', align = 'left', alpha = 1 } = o;
    if (alpha <= 0 || !str) { return; }
    const { ctx } = api;
    ctx.save();
    api.alpha(alpha);
    ctx.font = this.font(role, px, weight);
    ctx.fillStyle = color(c);
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
    ctx.restore();
  },

  /** Marker block behind text or code. o: p, color, alpha, seed. */
  highlight(api, rect, o = {}) {
    const { p = 1, color: c = 'accent', alpha = 1, seed = 3 } = o;
    if (p <= 0) { return; }
    const { ctx } = api;
    ctx.save();
    api.alpha(0.22 * p * alpha);
    ctx.fillStyle = color(c);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
    this.shape(api, rect, { kind: 'rect', p, stroke: c, fill: null, lw: 2.5, alpha, seed });
  },
};
