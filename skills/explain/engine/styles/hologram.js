// Hologram style: dark grid, glow strokes, light sweep. A style is a palette + fonts + stroke/fill renderers;
// pieces draw through the style and never hardcode colors.
import { clamp, lerp, rng } from '../math.js';

const palette = {
  bg: '#060a13',
  ink: '#e8f2ff',
  dim: '#6f88a8',
  accent: '#4de1ff',
  accent2: '#ff5cc8',
  good: '#6bffb0',
  warn: '#ffc857',
  bad: '#ff6b7a',
  panel: 'rgba(10,20,38,0.86)',
};
// Named hues from the hologram palette, usable as color tokens.
Object.assign(palette, { cyan: palette.accent, magenta: palette.accent2, green: palette.good, amber: palette.warn });

const STACKS = {
  body: '"Inter", "Helvetica Neue", Arial, sans-serif',
  display: '"Inter", "Helvetica Neue", Arial, sans-serif',
  mono: '"JetBrains Mono", Menlo, monospace',
};
const WEIGHTS = { body: 500, display: 700, mono: 500 };

const color = tok => palette[tok] ?? tok;
const PARTS = (() => {
  const r = rng(42);
  return Array.from({ length: 70 }, () => ({ x: r(), y: r(), s: 0.4 + r() * 1.6, ph: r() * 6.28, sp: 4 + r() * 10 }));
})();

function pathFor(ctx, kind, r) {
  ctx.beginPath();
  if (kind === 'ellipse') { ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2); }
  else if (kind === 'rect') { ctx.rect(r.x, r.y, r.w, r.h); }
  else { ctx.roundRect(r.x, r.y, r.w, r.h, kind === 'pill' ? Math.min(r.w, r.h) / 2 : 18); }
}

const perimeter = (kind, r) => (kind === 'ellipse' ? Math.PI * (r.w + r.h) * 0.8 : 2 * (r.w + r.h));

export default {
  name: 'hologram',
  palette,
  stacks: STACKS,
  // Fonts inlined by the build as base64 @font-face; `file` is relative to the skill's vendor/ dir.
  faces: [
    { family: 'Inter', file: 'fonts/inter.woff2', weight: '400 700' },
    { family: 'JetBrains Mono', file: 'fonts/jetbrains-mono.woff2', weight: '400 700' },
  ],
  defaults: { nodePx: 34, labelPx: 34, codePx: 28, minPx: 18, lw: 3, pad: 18 },
  color,
  font: (role, px, weight) => `${weight ?? WEIGHTS[role] ?? 500} ${px}px ${STACKS[role] ?? STACKS.body}`,

  background(api) {
    const { ctx, W, H, t } = api;
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 100, W * 0.5, H * 0.5, 1100);
    g.addColorStop(0, 'rgba(24,52,92,0.55)');
    g.addColorStop(1, 'rgba(6,10,19,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(77,225,255,0.07)';
    ctx.lineWidth = 1;
    const o = (t * 9) % 80;
    ctx.beginPath();
    for (let x = -o; x < W; x += 80) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let y = -o; y < H; y += 80) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();
    for (const p of PARTS) {
      const y = ((p.y * H - t * p.sp * 3) % H + H) % H;
      const a = 0.25 + 0.2 * Math.sin(t * 1.5 + p.ph);
      ctx.fillStyle = `rgba(120,220,255,${a})`;
      ctx.beginPath();
      ctx.arc(p.x * W + Math.sin(t * 0.4 + p.ph) * 12, y, p.s, 0, 7);
      ctx.fill();
    }
  },

  overlay(api) {
    const { ctx, W, H } = api;
    ctx.globalAlpha = 1;
    const v = ctx.createRadialGradient(W / 2, H / 2, 500, W / 2, H / 2, 1150);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  },

  /** Light sweep between scenes: a cyan band crossing the frame left to right. */
  sweep(api, p) {
    const { ctx, W, H } = api;
    const x = lerp(-300, W + 300, p * p * (3 - 2 * p));
    const g = ctx.createLinearGradient(x - 160, 0, x + 160, 0);
    g.addColorStop(0, 'rgba(77,225,255,0)');
    g.addColorStop(0.5, 'rgba(77,225,255,0.35)');
    g.addColorStop(1, 'rgba(77,225,255,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(x - 160, 0, 320, H);
  },

  /** Closed shape. o: kind (round|rect|ellipse|pill), p draw-on 0..1, stroke, fill (token | null), lw, glow, dash, alpha. */
  shape(api, rect, o = {}) {
    const { kind = 'round', p = 1, stroke = 'accent', fill = 'panel', lw = 3, glow = 14, dash = null, alpha = 1 } = o;
    if (p <= 0 || alpha <= 0) { return; }
    const { ctx } = api;
    ctx.save();
    if (fill) {
      api.alpha(alpha * p);
      ctx.fillStyle = color(fill);
      pathFor(ctx, kind, rect);
      ctx.fill();
    }
    api.alpha(alpha);
    ctx.strokeStyle = color(stroke);
    ctx.lineWidth = lw;
    ctx.shadowColor = color(stroke);
    ctx.shadowBlur = glow;
    pathFor(ctx, kind, rect);
    if (dash) { ctx.setLineDash(dash); }
    else if (p < 1) { ctx.setLineDash([perimeter(kind, rect) * p, 1e5]); }
    ctx.stroke();
    ctx.restore();
  },

  /** Polyline drawn on to progress p, with an optional arrow head at the end. o: color, lw, glow, head, dash, alpha. */
  line(api, pts, o = {}) {
    const { p = 1, color: c = 'accent', lw = 4, glow = 12, head = false, dash = null, alpha = 1 } = o;
    if (p <= 0) { return; }
    const { ctx } = api;
    const col = color(c);
    ctx.save();
    api.alpha(alpha);
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = lw;
    ctx.shadowColor = col;
    ctx.shadowBlur = glow;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (dash) { ctx.setLineDash(dash); }
    let d = pts.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0) * clamp(p);
    ctx.beginPath();
    ctx.moveTo(...pts[0]);
    let last = pts[0];
    let prev = pts[0];
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      prev = pts[i - 1];
      if (d >= l) {
        ctx.lineTo(...pts[i]);
        last = pts[i];
        d -= l;
      }
      else {
        const k = l ? d / l : 0;
        last = [lerp(prev[0], pts[i][0], k), lerp(prev[1], pts[i][1], k)];
        ctx.lineTo(...last);
        break;
      }
    }
    ctx.stroke();
    if (head && p >= 0.97) {
      const hs = 10 + lw * 3;
      const a = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(...last);
      ctx.lineTo(last[0] - hs * Math.cos(a - 0.4), last[1] - hs * Math.sin(a - 0.4));
      ctx.lineTo(last[0] - hs * Math.cos(a + 0.4), last[1] - hs * Math.sin(a + 0.4));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },

  /** Single line of text. o: px, role (body|display|mono), weight, color, align, alpha, glow. */
  text(api, str, x, y, o = {}) {
    const { px = 34, role = 'body', weight, color: c = 'ink', align = 'left', alpha = 1, glow = 0 } = o;
    if (alpha <= 0 || !str) { return; }
    const { ctx } = api;
    ctx.save();
    api.alpha(alpha);
    ctx.font = this.font(role, px, weight);
    ctx.fillStyle = color(c);
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    if (glow) {
      ctx.shadowColor = color(c);
      ctx.shadowBlur = glow;
    }
    ctx.fillText(str, x, y);
    ctx.restore();
  },

  /** Translucent marker block behind text or code. o: p, color, alpha. */
  highlight(api, rect, o = {}) {
    const { p = 1, color: c = 'warn', alpha = 1 } = o;
    if (p <= 0) { return; }
    const { ctx } = api;
    ctx.save();
    api.alpha(0.16 * p * alpha);
    ctx.fillStyle = color(c);
    pathFor(ctx, 'round', rect);
    ctx.fill();
    ctx.restore();
    this.shape(api, rect, { kind: 'round', p, stroke: c, fill: null, lw: 2, glow: 8, alpha });
  },
};
