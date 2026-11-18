// Sketch preset: Rough.js strokes on warm graph paper, handwriting font, marker highlights, hachure fills and a "line
// boil": the stroke wobble re-seeds five times per second as a pure function of the scene time, so every shape stays
// alive like a hand-animated film. It changes only the look: sizes and motion are the same as in every preset.
// Preset file: a factory with no imports, `export default ({ math, rough }) => ({ ... })`; Rough.js is used lazily.
export default ({ math, rough }) => {
  const { clamp, hexA, rng } = math;
  const palette = {
    bg: '#faf6ec',
    ink: '#23201c',
    dim: '#6f6759',
    accent: '#e4572e',
    accent2: '#2a6f97',
    good: '#2f7d45',
    warn: '#d99a00',
    bad: '#c0392b',
    panel: '#fffdf8',
    onPanel: '#23201c',
    onAccent: '#1a1714',
    shadow: '#23201c',
    syntax: { comment: '#6f6759', string: '#2f7d45', keyword: '#c0392b', number: '#a15c00', type: '#2a6f97', fn: '#6a3d9a', plain: '#23201c' },
  };

  const stacks = {
    body: '"Caveat", "Bradley Hand", "Marker Felt", cursive',
    display: '"Caveat", "Bradley Hand", "Marker Felt", cursive',
    mono: '"JetBrains Mono", Menlo, monospace',
  };
  const weights = { body: 700, display: 700, mono: 500 };
  const BOIL_FPS = 5; // wobble re-seeds per second; 0 turns the boil off
  const BOIL_FRAMES = 4; // distinct wobble variants that cycle
  const RADIUS = 22;

  const color = tok => palette[tok] ?? palette.syntax[tok] ?? tok;
  const font = (role, px, weight) => `${weight ?? weights[role] ?? 600} ${px}px ${stacks[role] ?? stacks.body}`;
  const rcCache = new WeakMap();
  function rc(api) {
    const canvas = api.ctx.canvas;
    if (!rcCache.has(canvas)) { rcCache.set(canvas, (rough ?? globalThis.rough).canvas(canvas)); }
    return rcCache.get(canvas);
  }
  /** Seed for this frame: stable inside a boil step, different between steps. A pure function of the scene time. */
  const boil = (api, seed, still) => (still || !BOIL_FPS ? seed : seed + (Math.floor((api.t ?? 0) * BOIL_FPS) % BOIL_FRAMES) * 131);

  const FIBERS = (() => {
    const r = rng(7);
    return Array.from({ length: 220 }, () => ({ x: r(), y: r(), l: 6 + r() * 26, a: r() * Math.PI, o: 0.03 + r() * 0.05 }));
  })();

  const perimeter = (kind, r) => (kind === 'ellipse' ? Math.PI * (r.w + r.h) * 0.8 : 2 * (r.w + r.h));
  const partial = (len, p) => (p < 1 ? { strokeLineDash: [len * p * 1.15 + 0.01, 1e5] } : {});
  const polyLen = pts => pts.slice(1).reduce((n, q, i) => n + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
  const dashOpts = (dash, dashOffset) => (dash ? { strokeLineDash: dash, strokeLineDashOffset: dashOffset } : null);

  function roundPath(r, rad) {
    const k = Math.max(0, Math.min(rad, r.w / 2, r.h / 2));
    const { x, y, w, h } = r;
    return `M ${x + k} ${y} L ${x + w - k} ${y} Q ${x + w} ${y} ${x + w} ${y + k} L ${x + w} ${y + h - k} Q ${x + w} ${y + h} ${x + w - k} ${y + h} L ${x + k} ${y + h} Q ${x} ${y + h} ${x} ${y + h - k} L ${x} ${y + k} Q ${x} ${y} ${x + k} ${y} Z`;
  }
  const fillOpts = (c, hatch, seed) => (hatch
    ? { seed, roughness: 1, fill: color(c), fillStyle: hatch === 'cross' ? 'cross-hatch' : 'hachure', hachureGap: 9, fillWeight: 2.2, hachureAngle: -41, stroke: 'none' }
    : { seed, roughness: 0.9, fill: color(c), fillStyle: 'solid', stroke: 'none' });

  /** Catmull-Rom samples through the points (closed wraps around), used for smooth fills. */
  function smoothPts(pts, closed) {
    const n = pts.length;
    if (n < 3) { return pts; }
    const at = i => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    const out = [];
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
      for (let k = 0; k < 10; k++) {
        const t = k / 10;
        const [t2, t3] = [t * t, t * t * t];
        out.push([0, 1].map(d => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
      }
    }
    out.push(closed ? pts[0] : pts[n - 1]);
    return out;
  }

  return {
    name: 'sketch',
    description: 'Warm graph paper, hand-drawn boiling strokes, handwriting font, marker highlights: friendly and explanatory. Pick it for teaching and walkthroughs.',
    palette,
    stacks,
    weights,
    faces: [
      { family: 'Caveat', file: 'vendor:fonts/caveat.woff2', weight: '400 700' },
      { family: 'JetBrains Mono', file: 'vendor:fonts/jetbrains-mono.woff2', weight: '400 700' },
    ],
    // Caveat has a small x-height: these sizes give the same visual size as hologram's Inter 34 / 18.
    defaults: { nodePx: 58, labelPx: 60, codePx: 34, minPx: 30, lw: 3, pad: 20, radius: RADIUS, fillAlpha: 1 },
    // The boil makes every frame differ, which costs bitrate.
    export: { bitrate: 4e6 },
    color,
    font,

    /** Warm paper, a faint graph grid that drifts slowly, and paper fibers. */
    background(api) {
      const { ctx, W, H, t = 0 } = api;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(42,111,151,0.075)';
      ctx.lineWidth = 1.5;
      const off = (t * 5) % 60;
      ctx.beginPath();
      for (let x = -off; x < W; x += 60) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
      }
      for (let y = -off * 0.5; y < H; y += 60) {
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
      for (const f of FIBERS) {
        ctx.strokeStyle = `rgba(60,45,20,${f.o})`;
        ctx.beginPath();
        ctx.moveTo(f.x * W, f.y * H);
        ctx.lineTo(f.x * W + Math.cos(f.a) * f.l, f.y * H + Math.sin(f.a) * f.l);
        ctx.stroke();
      }
      ctx.restore();
    },

    /** Soft warm vignette, like a page photographed under a lamp. */
    overlay(api) {
      const { ctx, W, H } = api;
      ctx.save();
      ctx.globalAlpha = 1;
      const v = ctx.createRadialGradient(W / 2, H / 2, 620, W / 2, H / 2, 1250);
      v.addColorStop(0, 'rgba(120,90,40,0)');
      v.addColorStop(1, 'rgba(120,90,40,0.16)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    },

    /** Flat dot (particles, LEDs, packets). o: color, alpha. */
    dot(api, x, y, r, o = {}) {
      const { color: c = 'accent', alpha = 1 } = o;
      if (alpha <= 0 || r <= 0) { return; }
      const { ctx } = api;
      ctx.save();
      api.alpha(alpha);
      ctx.fillStyle = color(c);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },

    /** Flat fill without outline. o: color, alpha, hatch, radius, seed, still. */
    fill(api, rect, o = {}) {
      const { color: c = 'accent', alpha = 1, hatch = false, radius = 0, seed = 5, still = false } = o;
      if (alpha <= 0 || rect.w <= 0.5 || rect.h <= 0.5) { return; }
      const { ctx } = api;
      ctx.save();
      api.alpha(alpha);
      const r = rc(api);
      const opts = fillOpts(c, hatch, boil(api, seed, still));
      if (radius > 4) { r.path(roundPath(rect, radius), opts); }
      else { r.rectangle(rect.x, rect.y, rect.w, rect.h, opts); }
      ctx.restore();
    },

    /**
     * Closed shape. o: kind (round|rect|ellipse|pill), p draw-on 0..1, stroke (token | null), fill (token | null),
     * fillAlpha, hatch (true | 'cross'), lw, r (corner radius), dash, dashOffset, alpha, seed, still (no boil).
     */
    shape(api, rect, o = {}) {
      const { kind = 'round', p = 1, stroke = 'ink', fill = 'panel', fillAlpha = 1, lw = 3, dash = null, dashOffset = 0, alpha = 1, seed = 1, hatch = false, still = false } = o;
      if (p <= 0 || alpha <= 0 || rect.w <= 0 || rect.h <= 0) { return; }
      const { ctx } = api;
      const rcv = rc(api);
      const sd = boil(api, seed, still);
      const rad = kind === 'pill' ? rect.h / 2 : (o.r ?? Math.min(RADIUS, rect.w * 0.12, rect.h * 0.22));
      const sharp = kind === 'rect' && o.r === undefined;
      const draw = (opts) => {
        if (kind === 'ellipse') { rcv.ellipse(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h, opts); }
        else if (sharp) { rcv.rectangle(rect.x, rect.y, rect.w, rect.h, opts); }
        else { rcv.path(roundPath(rect, rad), opts); }
      };
      ctx.save();
      if (fill) {
        api.alpha(alpha * p * fillAlpha);
        draw(fillOpts(fill, hatch, sd));
      }
      if (stroke) {
        api.alpha(alpha);
        draw({ seed: sd, roughness: 1.15, stroke: color(stroke), strokeWidth: lw, ...(dashOpts(dash, dashOffset) ?? partial(perimeter(kind, rect), p)) });
      }
      ctx.restore();
    },

    /** Polyline drawn on to progress p, optional arrow head. o: color, lw, head, dash, dashOffset, alpha, seed, smooth, still. */
    line(api, pts, o = {}) {
      const { p = 1, color: c = 'ink', lw = 4, head = false, dash = null, dashOffset = 0, alpha = 1, seed = 1, smooth = false, still = false } = o;
      if (p <= 0 || alpha <= 0 || pts.length < 2) { return; }
      const { ctx } = api;
      const rcv = rc(api);
      const sd = boil(api, seed, still);
      const curve = smooth && pts.length > 2;
      const len = polyLen(curve ? smoothPts(pts, false) : pts);
      const opts = { seed: sd, roughness: smooth ? 0.7 : 1.1, stroke: color(c), strokeWidth: lw, ...(dashOpts(dash, dashOffset) ?? partial(len, p)) };
      ctx.save();
      api.alpha(alpha);
      if (curve) { rcv.curve(pts, opts); }
      else { rcv.linearPath(pts, opts); }
      if (head && p >= 0.97) {
        const b = pts[pts.length - 1];
        const a = pts[pts.length - 2];
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const hs = 14 + lw * 2.5;
        for (const d of [0.5, -0.5]) { rcv.line(b[0], b[1], b[0] - hs * Math.cos(ang + d), b[1] - hs * Math.sin(ang + d), { seed: sd + (d > 0 ? 1 : 2), roughness: 1, stroke: color(c), strokeWidth: lw }); }
      }
      ctx.restore();
    },

    /** Polygon or open path. o: closed, p, stroke (token | null), fill (token | null), fillAlpha, hatch, lw, alpha, seed, smooth, still. */
    poly(api, pts, o = {}) {
      const { closed = true, fill = null, fillAlpha = 1, stroke = 'ink', lw = 3, p = 1, alpha = 1, seed = 1, hatch = false, smooth = false, still = false } = o;
      if (p <= 0 || alpha <= 0 || pts.length < 2) { return; }
      const { ctx } = api;
      const rcv = rc(api);
      const sd = boil(api, seed, still);
      ctx.save();
      if (fill && closed) {
        api.alpha(alpha * p * fillAlpha);
        rcv.polygon(smooth ? smoothPts(pts, true) : pts, { ...fillOpts(fill, hatch, sd), roughness: smooth ? 0 : 0.8 });
      }
      if (stroke) {
        api.alpha(alpha);
        const all = closed ? [...pts, pts[0]] : pts;
        const opts = { seed: sd, roughness: smooth ? 0.7 : 1.1, stroke: color(stroke), strokeWidth: lw, ...partial(polyLen(smooth ? smoothPts(all, false) : all), p) };
        if (smooth && all.length > 2) { rcv.curve(all, opts); }
        else { rcv.linearPath(all, opts); }
      }
      ctx.restore();
    },

    /** Single line of text. o: px, role, weight, color, align, alpha. */
    text(api, str, x, y, o = {}) {
      const { px = 52, role = 'body', weight, color: c = 'ink', align = 'left', alpha = 1 } = o;
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

    /** Marker stroke behind text or code: a fat translucent line swiped left to right. o: p, color, alpha, seed. */
    highlight(api, rect, o = {}) {
      const { p = 1, color: c = 'warn', alpha = 1, seed = 3 } = o;
      if (p <= 0 || alpha <= 0 || rect.w <= 0 || rect.h <= 0) { return; }
      const { ctx } = api;
      const y = rect.y + rect.h / 2;
      ctx.save();
      api.alpha(0.3 * alpha);
      ctx.lineCap = 'round';
      rc(api).line(rect.x + 4, y + 2, rect.x + 4 + (rect.w - 8) * clamp(p), y - 2, { seed, roughness: 1.6, bowing: 1.4, stroke: color(c), strokeWidth: Math.max(8, rect.h * 0.78) });
      ctx.restore();
    },

    transitions: {
      /** A band of paper wiped across the frame, with a marker line on its leading edge. */
      sweep(api, p) {
        const { ctx, W, H } = api;
        const x = -300 + (W + 600) * (p * p * (3 - 2 * p));
        const g = ctx.createLinearGradient(x - 220, 0, x + 220, 0);
        g.addColorStop(0, hexA(palette.panel, 0));
        g.addColorStop(0.5, hexA(palette.panel, 0.82));
        g.addColorStop(1, hexA(palette.panel, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - 220, 0, 440, H);
        ctx.fillStyle = hexA(palette.warn, 0.3);
        ctx.fillRect(x + 100, 0, 18, H);
      },
      /** Torn paper strips: a few warm bands snap in and out. Pure in p. */
      glitch(api, p) {
        const { ctx, W, H } = api;
        const k = Math.sin(Math.PI * p);
        if (k <= 0.02) { return; }
        const r = rng(3000 + Math.floor(p * 10));
        for (let i = 0; i < 6; i++) {
          const h = 30 + r() * 90;
          const y = r() * (H - h);
          ctx.fillStyle = hexA(i % 2 ? palette.panel : palette.warn, 0.35 * k);
          ctx.fillRect(0, y, W, h);
        }
      },
      /** A warm lamp flash at the middle of the transition. */
      flash(api, p) {
        const { ctx, W, H } = api;
        ctx.fillStyle = hexA(palette.warn, 0.28 * Math.sin(Math.PI * p) ** 2);
        ctx.fillRect(0, 0, W, H);
      },
      /** A hand-drawn ring growing from the origin (the edge of an iris). */
      ring(api, p, _spec, origin) {
        if (p >= 1) { return; }
        const { W, H } = api;
        const rad = Math.hypot(W, H) * (p * p * (3 - 2 * p));
        rc(api).ellipse(origin[0], origin[1], rad * 2, rad * 2, { seed: 17 + Math.floor(p * 20), roughness: 1.4, stroke: palette.accent, strokeWidth: 6 });
      },
      /** A marker line on the edge of a wipe. */
      edge(api, p) {
        const { W, H } = api;
        const x = W * (p * p * (3 - 2 * p));
        rc(api).line(x, 0, x + 6, H, { seed: 9 + Math.floor(p * 20), roughness: 1.6, bowing: 1.5, stroke: palette.accent, strokeWidth: 8 });
      },
    },
  };
};
