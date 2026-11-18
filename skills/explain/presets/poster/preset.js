// Poster preset: a saturated violet color field, flat solid shapes with a hard offset shadow, thick round strokes and a
// rounded geometric font (Fredoka). No glow, no texture noise, no hand wobble: a flat motion-graphics explainer or a
// screen-printed poster. Preset file: a factory with no imports, `export default ({ math, rough }) => ({ ... })`.
export default ({ math }) => {
  const { clamp, hexA, lerp, rng } = math;
  const palette = {
    bg: '#4a2bc2',
    ink: '#fff8ea',
    dim: '#d3c8ff',
    accent: '#ffd23f',
    accent2: '#ff8fc7',
    good: '#5ff0a8',
    warn: '#ffa24a',
    bad: '#ff7b88',
    panel: '#22115c',
    onPanel: '#fff8ea',
    onAccent: '#22115c',
    shadow: '#160a40',
    syntax: { comment: '#a99be0', string: '#5ff0a8', keyword: '#ff8fc7', number: '#ffa24a', type: '#ffd23f', fn: '#9ed0ff', plain: '#fff8ea' },
  };
  const FIELD = ['#5733d6', '#3a1f9e']; // top and bottom of the color field
  const RADIUS = 24;

  const stacks = {
    body: '"Fredoka", "Arial Rounded MT Bold", "Helvetica Neue", sans-serif',
    display: '"Fredoka", "Arial Rounded MT Bold", "Helvetica Neue", sans-serif',
    mono: '"JetBrains Mono", Menlo, monospace',
  };
  const weights = { body: 500, display: 700, mono: 500 };
  const color = tok => palette[tok] ?? palette.syntax[tok] ?? tok;
  const font = (role, px, weight) => `${weight ?? weights[role] ?? 500} ${px}px ${stacks[role] ?? stacks.body}`;

  const BLOBS = (() => {
    const r = rng(11);
    return Array.from({ length: 6 }, (_, i) => ({ x: r(), y: r(), rad: 220 + r() * 300, ph: r() * 6.28, sp: 0.05 + r() * 0.08, light: i % 2 === 0 }));
  })();

  /** Trace a shape path. r: corner radius override. */
  function pathFor(ctx, kind, rect, r) {
    ctx.beginPath();
    if (kind === 'ellipse') { ctx.ellipse(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, rect.h / 2, 0, 0, Math.PI * 2); }
    else {
      const k = kind === 'pill' ? Math.min(rect.w, rect.h) / 2 : r ?? (kind === 'rect' ? Math.min(8, rect.h / 4) : Math.min(RADIUS, rect.h / 3, rect.w / 3));
      ctx.roundRect(rect.x, rect.y, rect.w, rect.h, Math.max(0, Math.min(k, rect.w / 2, rect.h / 2)));
    }
  }
  const perimeter = (kind, r) => (kind === 'ellipse' ? Math.PI * (r.w + r.h) * 0.8 : 2 * (r.w + r.h));
  const polyLen = pts => pts.slice(1).reduce((n, q, i) => n + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
  /** Hard shadow drop: grows with the shape, never more than 10 px. */
  const drop = r => clamp(Math.min(r.w, r.h) * 0.09, 3, 10);

  /** Catmull-Rom samples through the points (closed wraps around). */
  function smoothPts(pts, closed) {
    const n = pts.length;
    if (n < 3) { return pts; }
    const at = i => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    const out = [];
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
      for (let k = 0; k < 12; k++) {
        const t = k / 12;
        const [t2, t3] = [t * t, t * t * t];
        out.push([0, 1].map(d => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
      }
    }
    out.push(closed ? pts[0] : pts[n - 1]);
    return out;
  }

  /** The first `frac` of a polyline by length: { pts, prev, last } (prev/last give the end direction). */
  function trim(pts, frac) {
    let d = polyLen(pts) * clamp(frac);
    const out = [pts[0]];
    let prev = pts[0];
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      prev = pts[i - 1];
      if (d >= l) {
        out.push(pts[i]);
        d -= l;
      }
      else {
        out.push([lerp(prev[0], pts[i][0], l ? d / l : 0), lerp(prev[1], pts[i][1], l ? d / l : 0)]);
        break;
      }
    }
    return { pts: out, prev: out.length > 1 ? out[out.length - 2] : pts[0], last: out[out.length - 1] };
  }

  const tracePts = (ctx, pts, dx = 0, dy = 0) => {
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q[0] + dx, q[1] + dy) : ctx.moveTo(q[0] + dx, q[1] + dy)));
  };

  return {
    name: 'poster',
    description: 'Saturated violet field, flat shapes with hard shadows, thick round strokes, Fredoka: bold and playful. Pick it for friendly pitches and product explainers.',
    palette,
    stacks,
    weights,
    faces: [
      { family: 'Fredoka', file: 'fonts/fredoka.woff2', weight: '300 700' },
      { family: 'JetBrains Mono', file: 'vendor:fonts/jetbrains-mono.woff2', weight: '400 700' },
    ],
    defaults: { nodePx: 38, labelPx: 40, codePx: 28, minPx: 20, lw: 4, pad: 20, radius: RADIUS, fillAlpha: 1 },
    export: { bitrate: 2e6 },
    color,
    font,

    background(api) {
      const { ctx, W, H, t } = api;
      ctx.save();
      ctx.globalAlpha = 1;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, FIELD[0]);
      g.addColorStop(1, FIELD[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // Slow color blobs: big flat circles one step lighter or darker than the field.
      for (const b of BLOBS) {
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = b.light ? '#7a55f5' : '#2c1582';
        ctx.beginPath();
        ctx.arc(b.x * W + Math.sin(t * b.sp + b.ph) * 90, b.y * H + Math.cos(t * b.sp * 0.8 + b.ph) * 60, b.rad, 0, 7);
        ctx.fill();
      }
      // Halftone corners: dots that shrink toward the center of the frame.
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.07;
      const step = 34;
      for (let y = step / 2; y < H; y += step) {
        for (let x = step / 2; x < W; x += step) {
          const d = Math.min(Math.hypot(x - W, y) / 620, Math.hypot(x, y - H) / 620);
          if (d >= 1) { continue; }
          ctx.beginPath();
          ctx.arc(x, y, (1 - d) * 7, 0, 7);
          ctx.fill();
        }
      }
      ctx.restore();
    },

    /** Flat filled dot (particles, LEDs, packets) with a small hard shadow. o: color, alpha. */
    dot(api, x, y, r, o = {}) {
      const { color: c = 'accent', alpha = 1 } = o;
      if (alpha <= 0 || r <= 0) { return; }
      const { ctx } = api;
      ctx.save();
      api.alpha(alpha * 0.9);
      ctx.fillStyle = palette.shadow;
      ctx.beginPath();
      ctx.arc(x + Math.min(2, r * 0.3), y + Math.min(3, r * 0.5), r, 0, Math.PI * 2);
      ctx.fill();
      api.alpha(alpha);
      ctx.fillStyle = color(c);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },

    /** Flat filled rect without outline (bars, tints). o: color, alpha, radius. */
    fill(api, rect, o = {}) {
      const { color: c = 'accent', alpha = 1, radius = 6 } = o;
      if (alpha <= 0 || rect.w <= 0 || rect.h <= 0) { return; }
      const { ctx } = api;
      ctx.save();
      api.alpha(alpha);
      ctx.fillStyle = color(c);
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.w, rect.h, Math.max(0, Math.min(radius, rect.w / 2, rect.h / 2)));
      ctx.fill();
      ctx.restore();
    },

    /**
     * Closed shape. o: kind (round|rect|ellipse|pill), p draw-on 0..1, stroke (token | null), fill (token | null),
     * fillAlpha, lw, r (corner radius), dash, dashOffset, alpha, shadow (hard offset shadow, default on).
     */
    shape(api, rect, o = {}) {
      const { kind = 'round', p = 1, stroke = 'accent', fill = 'panel', fillAlpha = 1, lw = 4, dash = null, dashOffset = 0, alpha = 1, shadow = true, r } = o;
      if (p <= 0 || alpha <= 0 || rect.w <= 0 || rect.h <= 0) { return; }
      const { ctx } = api;
      ctx.save();
      if (fill) {
        if (shadow) {
          const d = drop(rect) * p;
          api.alpha(alpha * p * 0.9 * fillAlpha);
          ctx.fillStyle = palette.shadow;
          pathFor(ctx, kind, { ...rect, x: rect.x + d * 0.5, y: rect.y + d }, r);
          ctx.fill();
        }
        api.alpha(alpha * Math.min(1, p * 1.6) * fillAlpha);
        ctx.fillStyle = color(fill);
        pathFor(ctx, kind, rect, r);
        ctx.fill();
      }
      if (stroke) {
        api.alpha(alpha);
        ctx.strokeStyle = color(stroke);
        ctx.lineWidth = lw;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        pathFor(ctx, kind, rect, r);
        if (dash) {
          ctx.setLineDash(dash);
          ctx.lineDashOffset = dashOffset;
        }
        else if (p < 1) { ctx.setLineDash([perimeter(kind, rect) * p, 1e5]); }
        ctx.stroke();
      }
      ctx.restore();
    },

    /** Free polygon or polyline. o: closed, p, stroke (token | null), fill (token | null), fillAlpha, lw, alpha, smooth, shadow. */
    poly(api, pts, o = {}) {
      const { p = 1, stroke = 'accent', fill = null, fillAlpha = 1, lw = 4, alpha = 1, closed = true, smooth = false, shadow = false } = o;
      if (p <= 0 || alpha <= 0 || pts.length < 2) { return; }
      const { ctx } = api;
      const src = smooth ? smoothPts(pts, closed) : pts;
      ctx.save();
      if (fill && closed) {
        if (shadow) {
          api.alpha(alpha * p * 0.9 * fillAlpha);
          ctx.fillStyle = palette.shadow;
          tracePts(ctx, src, 4, 8);
          ctx.closePath();
          ctx.fill();
        }
        api.alpha(alpha * Math.min(1, p * 1.6) * fillAlpha);
        ctx.fillStyle = color(fill);
        tracePts(ctx, src);
        ctx.closePath();
        ctx.fill();
      }
      if (stroke) {
        api.alpha(alpha);
        ctx.strokeStyle = color(stroke);
        ctx.lineWidth = lw;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        tracePts(ctx, trim(closed ? [...src, src[0]] : src, p).pts);
        ctx.stroke();
      }
      ctx.restore();
    },

    /** Polyline drawn on to progress p, optional arrow head. o: color, lw, head, dash, dashOffset, alpha, smooth. */
    line(api, pts, o = {}) {
      const { p = 1, color: c = 'accent', lw = 5, head = false, dash = null, dashOffset = 0, alpha = 1, smooth = false } = o;
      if (p <= 0 || alpha <= 0 || pts.length < 2) { return; }
      const { ctx } = api;
      const cut = trim(smooth ? smoothPts(pts, false) : pts, p);
      ctx.save();
      api.alpha(alpha);
      ctx.strokeStyle = color(c);
      ctx.fillStyle = color(c);
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (dash) {
        ctx.setLineDash(dash);
        ctx.lineDashOffset = dashOffset;
      }
      tracePts(ctx, cut.pts);
      ctx.stroke();
      if (head && p >= 0.97) {
        const hs = 12 + lw * 3;
        const a = Math.atan2(cut.last[1] - cut.prev[1], cut.last[0] - cut.prev[0]);
        const [x, y] = cut.last;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * lw, y + Math.sin(a) * lw);
        ctx.lineTo(x - hs * Math.cos(a - 0.5), y - hs * Math.sin(a - 0.5));
        ctx.lineTo(x - hs * Math.cos(a + 0.5), y - hs * Math.sin(a + 0.5));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    },

    /** Single line of text. o: px, role (body|display|mono), weight, color, align, alpha. */
    text(api, str, x, y, o = {}) {
      const { px = 40, role = 'body', weight, color: c = 'ink', align = 'left', alpha = 1 } = o;
      if (alpha <= 0 || !str) { return; }
      const { ctx } = api;
      ctx.save();
      api.alpha(alpha);
      ctx.font = font(role, px, weight);
      ctx.fillStyle = color(c);
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillText(str, x, y);
      ctx.restore();
    },

    /** Solid marker block behind text or code that wipes in from the left. o: p, color, alpha. */
    highlight(api, rect, o = {}) {
      const { p = 1, color: c = 'accent', alpha = 1 } = o;
      if (p <= 0 || alpha <= 0) { return; }
      const { ctx } = api;
      ctx.save();
      api.alpha(alpha);
      ctx.fillStyle = hexA(color(c), 0.26);
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.w * clamp(p), rect.h, Math.max(0, Math.min(10, rect.h / 3, (rect.w * clamp(p)) / 2)));
      ctx.fill();
      ctx.fillStyle = color(c);
      ctx.fillRect(rect.x, rect.y + 4, 6, Math.max(0, rect.h - 8));
      ctx.restore();
    },

    transitions: {
      /** Three flat diagonal bands (accent, accent2, ink) crossing the frame. */
      sweep(api, p) {
        const { ctx, W, H } = api;
        const k = p * p * (3 - 2 * p);
        const slant = 260;
        for (const [tok, off, w] of [['accent', 0, 200], ['accent2', 210, 110], ['ink', 330, 46]]) {
          const x = lerp(-700, W + 500, k) + off;
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = color(tok);
          ctx.beginPath();
          ctx.moveTo(x + slant, 0);
          ctx.lineTo(x + slant + w, 0);
          ctx.lineTo(x + w, H);
          ctx.lineTo(x, H);
          ctx.closePath();
          ctx.fill();
        }
      },
      /** Flat color bars snap across the frame (a cut with a flat tear). Pure in p. */
      glitch(api, p) {
        const { ctx, W, H } = api;
        const k = Math.sin(Math.PI * p);
        if (k <= 0.02) { return; }
        const r = rng(2000 + Math.floor(p * 12));
        for (let i = 0; i < 7; i++) {
          const h = 40 + r() * 120;
          const y = r() * (H - h);
          ctx.globalAlpha = 0.9 * k;
          ctx.fillStyle = color(['accent', 'accent2', 'ink'][i % 3]);
          ctx.fillRect(0, y, W * (0.25 + 0.75 * r()) * k, h);
        }
      },
      /** A warm accent flash at the middle of the transition. */
      flash(api, p) {
        const { ctx, W, H } = api;
        ctx.fillStyle = palette.accent;
        ctx.globalAlpha = 0.5 * Math.sin(Math.PI * p) ** 2;
        ctx.fillRect(0, 0, W, H);
      },
      /** A thick flat ring growing from the origin with a hard offset shadow. */
      ring(api, p, _spec, origin) {
        if (p >= 1) { return; }
        const { ctx, W, H } = api;
        const rad = Math.hypot(W, H) * (p * p * (3 - 2 * p));
        ctx.lineWidth = 16;
        ctx.globalAlpha = 1 - p * 0.6;
        ctx.strokeStyle = palette.shadow;
        ctx.beginPath();
        ctx.arc(origin[0] + 4, origin[1] + 8, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = palette.accent;
        ctx.beginPath();
        ctx.arc(origin[0], origin[1], rad, 0, Math.PI * 2);
        ctx.stroke();
      },
      /** A thick accent bar on the edge of a wipe, with a hard shadow. */
      edge(api, p) {
        const { ctx, W, H } = api;
        const x = W * (p * p * (3 - 2 * p));
        ctx.globalAlpha = 1;
        ctx.fillStyle = palette.shadow;
        ctx.fillRect(x + 4, 0, 18, H);
        ctx.fillStyle = palette.accent;
        ctx.fillRect(x - 6, 0, 18, H);
      },
    },
  };
};
