// Hologram preset: a dark projected grid, glowing neon strokes, scanlines, HUD corner brackets and a tearing glitch
// transition. Technical and dramatic. Preset file: a factory with no imports, `export default ({ math, rough }) => ({ ... })`.
export default ({ math }) => {
  const { clamp, lerp, rng } = math;
  const palette = {
    bg: '#060a13',
    ink: '#e8f2ff',
    dim: '#8aa2c2',
    accent: '#4de1ff',
    accent2: '#ff5cc8',
    good: '#6bffb0',
    warn: '#ffc857',
    bad: '#ff6b7a',
    panel: 'rgba(10,20,38,0.86)',
    onPanel: '#e8f2ff',
    onAccent: '#060a13',
    syntax: { comment: '#6f88a8', string: '#6bffb0', keyword: '#ff5cc8', number: '#ffc857', type: '#4de1ff', fn: '#9db8ff', plain: '#e8f2ff' },
  };
  // Named hues from the hologram palette, usable as color tokens.
  Object.assign(palette, { cyan: palette.accent, magenta: palette.accent2, green: palette.good, amber: palette.warn });

  const stacks = {
    body: '"Inter", "Helvetica Neue", Arial, sans-serif',
    display: '"Inter", "Helvetica Neue", Arial, sans-serif',
    mono: '"JetBrains Mono", Menlo, monospace',
  };
  const weights = { body: 500, display: 700, mono: 500 };
  const RADIUS = 18;

  const color = tok => palette[tok] ?? palette.syntax[tok] ?? tok;
  const font = (role, px, weight) => `${weight ?? weights[role] ?? 500} ${px}px ${stacks[role] ?? stacks.body}`;
  const PARTS = (() => {
    const r = rng(42);
    return Array.from({ length: 70 }, () => ({ x: r(), y: r(), s: 0.4 + r() * 1.6, ph: r() * 6.28, sp: 4 + r() * 10 }));
  })();

  /** Trace a shape path. r: corner radius for round rects. */
  function pathFor(ctx, kind, rect, r) {
    ctx.beginPath();
    if (kind === 'ellipse') { ctx.ellipse(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, rect.h / 2, 0, 0, Math.PI * 2); }
    else if (kind === 'rect' && r === undefined) { ctx.rect(rect.x, rect.y, rect.w, rect.h); }
    else { ctx.roundRect(rect.x, rect.y, rect.w, rect.h, kind === 'pill' ? Math.min(rect.w, rect.h) / 2 : Math.max(0, Math.min(r ?? RADIUS, rect.w / 2, rect.h / 2))); }
  }
  const perimeter = (kind, r) => (kind === 'ellipse' ? Math.PI * (r.w + r.h) * 0.8 : 2 * (r.w + r.h));
  const polyLen = pts => pts.slice(1).reduce((n, q, i) => n + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);

  /** Catmull-Rom samples through the points (closed wraps around). */
  function smoothPts(pts, closed) {
    const n = pts.length;
    if (n < 3) { return pts; }
    const at = i => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    const out = [];
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
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

  const tracePts = (ctx, pts) => {
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
  };

  // Sound flavor: digital. High sine blips with a short FM shimmer, band-passed noise sweeps, a bit-crushed tear.
  const sound = {
    voices: {
      pop: { wave: 'sine', f0: 1568, f1: 2093, glide: 0.02, decay: 0.05, dur: 0.08, noise: 0, filter: null, fm: { ratio: 2, depth: 2 } },
      tick: { wave: 'sine', f0: 3136, f1: 2637, glide: 0.012, decay: 0.02, dur: 0.035, noise: 0.05, filter: { type: 'hp', f: 1800, q: 0.7 } },
      blip: { wave: 'sine', f0: 1760, decay: 0.07, dur: 0.1, fm: { ratio: 3, depth: 3 } },
      sparkle: { wave: 'sine', f0: 2637, decay: 0.06, dur: 0.08, fm: { ratio: 5, depth: 2 }, repeat: { n: 4, gap: 0.04, step: 4, fade: 0.7 } },
      whoosh: { wave: null, noise: 1, attack: 0.12, decay: 0.2, dur: 0.36, filter: { type: 'bp', f: [800, 6000], q: 2.5 } },
      glitch: { wave: null, noise: 1, attack: 0.001, decay: 0.07, dur: 0.1, crush: 3, filter: { type: 'bp', f: [3000, 900], q: 1.2 }, repeat: { n: 3, gap: 0.045, step: -3, fade: 0.8 } },
      ding: { wave: 'sine', f0: 1567.98, decay: 0.3, dur: 0.38, fm: { ratio: 7, depth: 1.5 } },
    },
    space: { delay: 0.11, feedback: 0.2, wet: 0.14 },
  };

  return {
    name: 'hologram',
    description: 'Dark grid, glowing neon lines, scanlines and a tearing glitch: technical and dramatic. Pick it for engineering, systems and code topics.',
    palette,
    sound,
    stacks,
    weights,
    faces: [
      { family: 'Inter', file: 'vendor:fonts/inter.woff2', weight: '400 700' },
      { family: 'JetBrains Mono', file: 'vendor:fonts/jetbrains-mono.woff2', weight: '400 700' },
    ],
    defaults: { nodePx: 34, labelPx: 34, codePx: 28, minPx: 18, lw: 3, pad: 18, radius: RADIUS, fillAlpha: 1 },
    export: { bitrate: 2e6 },
    color,
    font,

    background(api) {
      const { ctx, W, H, t } = api;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, W, H);
      const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 100, W * 0.5, H * 0.5, 1100);
      g.addColorStop(0, 'rgba(24,52,92,0.55)');
      g.addColorStop(1, 'rgba(6,10,19,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const grid = (step, style) => {
        ctx.strokeStyle = style;
        ctx.lineWidth = 1;
        const o = (t * 9) % step;
        ctx.beginPath();
        for (let x = -o; x < W; x += step) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, H);
        }
        for (let y = -o; y < H; y += step) {
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
        }
        ctx.stroke();
      };
      grid(80, 'rgba(77,225,255,0.07)');
      grid(320, 'rgba(77,225,255,0.11)');
      // A slow diagonal light shaft: depth without moving the content.
      const sx = ((t * 110) % (W + 1400)) - 700;
      const shaft = ctx.createLinearGradient(sx - 260, 0, sx + 260, 0);
      shaft.addColorStop(0, 'rgba(77,225,255,0)');
      shaft.addColorStop(0.5, 'rgba(77,225,255,0.05)');
      shaft.addColorStop(1, 'rgba(77,225,255,0)');
      ctx.save();
      ctx.transform(1, 0, -0.35, 1, 0, 0);
      ctx.fillStyle = shaft;
      ctx.fillRect(sx - 260, 0, 520 + H * 0.35, H);
      ctx.restore();
      for (const p of PARTS) {
        const y = ((p.y * H - t * p.sp * 3) % H + H) % H;
        ctx.fillStyle = `rgba(120,220,255,${0.25 + 0.2 * Math.sin(t * 1.5 + p.ph)})`;
        ctx.beginPath();
        ctx.arc(p.x * W + Math.sin(t * 0.4 + p.ph) * 12, y, p.s, 0, 7);
        ctx.fill();
      }
      ctx.restore();
    },

    /** Vignette, scanlines and HUD corner brackets: the "projected" feel. */
    overlay(api) {
      const { ctx, W, H } = api;
      ctx.save();
      ctx.globalAlpha = 1;
      const v = ctx.createRadialGradient(W / 2, H / 2, 500, W / 2, H / 2, 1150);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      for (let y = 0; y < H; y += 4) { ctx.fillRect(0, y, W, 1); }
      ctx.strokeStyle = 'rgba(77,225,255,0.35)';
      ctx.lineWidth = 2;
      const m = 18;
      const l = 34;
      ctx.beginPath();
      for (const [x, y, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
        ctx.moveTo(x + dx * l, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + dy * l);
      }
      ctx.stroke();
      ctx.restore();
    },

    /** Particle / LED / packet: a glowing filled dot. o: color, alpha, glow. */
    dot(api, x, y, r, o = {}) {
      const { color: c = 'accent', alpha = 1, glow = 0 } = o;
      if (alpha <= 0 || r <= 0) { return; }
      const { ctx } = api;
      ctx.save();
      api.alpha(alpha);
      ctx.fillStyle = color(c);
      if (glow) {
        ctx.shadowColor = color(c);
        ctx.shadowBlur = glow;
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },

    /** Flat filled rect without outline (bars, tints). o: color, alpha, radius. */
    fill(api, rect, o = {}) {
      const { color: c = 'accent', alpha = 1, radius = 4 } = o;
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
     * fillAlpha, lw, r (corner radius), dash, dashOffset, alpha, glow.
     */
    shape(api, rect, o = {}) {
      const { kind = 'round', p = 1, stroke = 'accent', fill = 'panel', fillAlpha = 1, lw = 3, glow = 14, dash = null, dashOffset = 0, alpha = 1, r } = o;
      if (p <= 0 || alpha <= 0 || rect.w <= 0 || rect.h <= 0) { return; }
      const { ctx } = api;
      ctx.save();
      if (fill) {
        api.alpha(alpha * p * fillAlpha);
        ctx.fillStyle = color(fill);
        pathFor(ctx, kind, rect, r);
        ctx.fill();
      }
      if (stroke) {
        api.alpha(alpha);
        ctx.strokeStyle = color(stroke);
        ctx.lineWidth = lw;
        ctx.shadowColor = color(stroke);
        ctx.shadowBlur = glow;
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

    /** Polyline drawn on to progress p, optional arrow head. o: color, lw, glow, head, dash, dashOffset, alpha, smooth. */
    line(api, pts, o = {}) {
      const { p = 1, color: c = 'accent', lw = 4, glow = 12, head = false, dash = null, dashOffset = 0, alpha = 1, smooth = false } = o;
      if (p <= 0 || alpha <= 0 || pts.length < 2) { return; }
      const { ctx } = api;
      const col = color(c);
      const src = smooth ? smoothPts(pts, false) : pts;
      const cut = trim(src, p);
      ctx.save();
      api.alpha(alpha);
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = lw;
      ctx.shadowColor = col;
      ctx.shadowBlur = glow;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (dash) {
        ctx.setLineDash(dash);
        ctx.lineDashOffset = dashOffset;
      }
      tracePts(ctx, cut.pts);
      ctx.stroke();
      if (head && p >= 0.97) {
        const hs = 10 + lw * 3;
        const a = Math.atan2(cut.last[1] - cut.prev[1], cut.last[0] - cut.prev[0]);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(cut.last[0], cut.last[1]);
        ctx.lineTo(cut.last[0] - hs * Math.cos(a - 0.4), cut.last[1] - hs * Math.sin(a - 0.4));
        ctx.lineTo(cut.last[0] - hs * Math.cos(a + 0.4), cut.last[1] - hs * Math.sin(a + 0.4));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    },

    /** Free polygon or polyline. o: closed, p (draw-on), stroke (token | null), fill (token | null), fillAlpha, lw, alpha, smooth, glow. */
    poly(api, pts, o = {}) {
      const { p = 1, stroke = 'ink', fill = null, fillAlpha = 0.18, lw = 3, alpha = 1, closed = true, smooth = false, glow = 10 } = o;
      if (p <= 0 || alpha <= 0 || pts.length < 2) { return; }
      const { ctx } = api;
      const src = smooth ? smoothPts(pts, closed) : pts;
      ctx.save();
      if (fill && closed) {
        api.alpha(alpha * fillAlpha * p);
        ctx.fillStyle = color(fill);
        tracePts(ctx, src);
        ctx.closePath();
        ctx.fill();
      }
      if (stroke) {
        api.alpha(alpha);
        ctx.strokeStyle = color(stroke);
        ctx.lineWidth = lw;
        ctx.shadowColor = color(stroke);
        ctx.shadowBlur = glow;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        tracePts(ctx, trim(closed ? [...src, src[0]] : src, p).pts);
        ctx.stroke();
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
      ctx.font = font(role, px, weight);
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

    /** Translucent marker block behind text or code, with a thin glow outline. o: p, color, alpha. */
    highlight(api, rect, o = {}) {
      const { p = 1, color: c = 'warn', alpha = 1 } = o;
      if (p <= 0 || alpha <= 0) { return; }
      const { ctx } = api;
      ctx.save();
      api.alpha(0.16 * p * alpha);
      ctx.fillStyle = color(c);
      pathFor(ctx, 'round', rect, RADIUS);
      ctx.fill();
      ctx.restore();
      api.style.shape(api, rect, { kind: 'round', p, stroke: c, fill: null, lw: 2, glow: 8, alpha });
    },

    transitions: {
      /** A cyan band crossing the frame left to right. */
      sweep(api, p) {
        const { ctx, W, H } = api;
        const x = lerp(-300, W + 300, p * p * (3 - 2 * p));
        const g = ctx.createLinearGradient(x - 160, 0, x + 160, 0);
        g.addColorStop(0, 'rgba(77,225,255,0)');
        g.addColorStop(0.5, 'rgba(77,225,255,0.35)');
        g.addColorStop(1, 'rgba(77,225,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 160, 0, 320, H);
      },
      /** Horizontal slices of the frame shift sideways, tinted cyan and magenta, strongest mid-way. Pure in p. */
      glitch(api, p) {
        const { ctx, W, H } = api;
        const k = Math.sin(Math.PI * p);
        const canvas = ctx.canvas;
        if (k <= 0.02) { return; }
        const r = rng(1000 + Math.floor(p * 14));
        const sc = canvas && canvas.width ? canvas.width / W : 1;
        for (let i = 0; i < 16; i++) {
          const y = Math.floor(r() * H);
          const h = 8 + Math.floor(r() * 70);
          const dx = (r() - 0.5) * 260 * k;
          if (canvas) { ctx.drawImage(canvas, 0, y * sc, canvas.width, h * sc, dx, y, W, h); }
          ctx.fillStyle = i % 2 ? 'rgba(77,225,255,0.10)' : 'rgba(255,92,200,0.10)';
          ctx.fillRect(0, y, W, h);
        }
        ctx.fillStyle = `rgba(232,242,255,${0.1 * k})`;
        ctx.fillRect(0, 0, W, H);
      },
      /** A cyan flash with a bright scan bar at the middle of the transition. */
      flash(api, p) {
        const { ctx, W, H } = api;
        const k = Math.sin(Math.PI * p) ** 2;
        ctx.fillStyle = palette.accent;
        ctx.globalAlpha = 0.18 * k;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 0.5 * k;
        ctx.fillStyle = palette.ink;
        ctx.fillRect(0, H * p - 2, W, 4);
      },
      /** A glowing ring growing from the origin (the edge of an iris). */
      ring(api, p, _spec, origin) {
        if (p >= 1) { return; }
        const { ctx, W, H } = api;
        ctx.strokeStyle = palette.accent;
        ctx.shadowColor = palette.accent;
        ctx.shadowBlur = 24;
        ctx.lineWidth = 5;
        ctx.globalAlpha = 1 - p;
        ctx.beginPath();
        ctx.arc(origin[0], origin[1], Math.hypot(W, H) * (p * p * (3 - 2 * p)), 0, Math.PI * 2);
        ctx.stroke();
      },
      /** The glowing edge of a wipe. */
      edge(api, p) {
        const { ctx, W, H } = api;
        const x = W * (p * p * (3 - 2 * p));
        ctx.fillStyle = palette.accent;
        ctx.shadowColor = palette.accent;
        ctx.shadowBlur = 22;
        ctx.globalAlpha = 1 - Math.abs(p - 0.5) * 0.6;
        ctx.fillRect(x - 2, 0, 4, H);
      },
    },
  };
};
