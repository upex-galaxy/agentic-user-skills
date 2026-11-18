import { around, box, dot, drawT, line, path, piece, poly, resolveRect, size, TAU, textKit, textW } from '../kit.js';
// Icon family: vector glyphs described as primitives in a unit box (y down), drawn stroke by stroke through the style,
// so one icon is a neon outline in hologram and a hand-drawn doodle in sketch. Every glyph scales to any rect.
// Pieces: icon. Helper: drawIcon(api, kind, rect, o). Add a glyph by adding a function to GLYPHS (t, o) -> primitives.
// s.icon({ id, kind, rect | x,y,size | in, at, dur, color, label, labelSide, labelPx, idle, spin, until, z })
import { clamp, ease, hash, prog } from '../math.js';

const { arcPts, bezierPts } = path;
const PI = Math.PI;

// ---- primitives (unit box). tone: undefined = the icon color, or a color token ('alt' = accent2) --------------------

const L = (pts, tone, w) => ({ k: 'line', pts, tone, w });
const Pg = (pts, tone, f, w) => ({ k: 'poly', pts, tone, f, w });
const B = (x, y, w, h, rad, tone, f = 'panel') => ({ k: 'box', kind: 'round', r: [x, y, w, h], rad, tone, f });
const E = (cx, cy, rx, ry, tone, f = 'panel') => ({ k: 'box', kind: 'ellipse', r: [cx - rx, cy - ry, rx * 2, ry * 2], tone, f });
const C = (cx, cy, r, tone, f = 'panel') => E(cx, cy, r, r, tone, f);
const D = (x, y, r, tone) => ({ k: 'dot', c: [x, y], r, tone });

/** Scale and center points so they fill the unit box with a margin (for the cloud and the heart). */
function fitBox(pts, pad = 0.06) {
  const xs = pts.map(q => q[0]);
  const ys = pts.map(q => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = (1 - pad * 2) / Math.max(x1 - x0, y1 - y0);
  return pts.map(q => [0.5 + (q[0] - (x0 + x1) / 2) * k, 0.5 + (q[1] - (y0 + y1) / 2) * k]);
}

const CLOUD = fitBox([
  ...arcPts(0.36, 0.62, 0.24, PI * 0.5, PI * 1.45, 10),
  ...arcPts(0.66, 0.44, 0.3, PI * 1.1, PI * 1.85, 10),
  ...arcPts(1.02, 0.5, 0.24, PI * 1.3, PI * 1.95, 8),
  ...arcPts(1.2, 0.66, 0.2, PI * 1.6, PI * 2.5, 10),
], 0.04);

const HEART = fitBox(Array.from({ length: 36 }, (_, i) => {
  const a = (i / 36) * TAU;
  return [16 * Math.sin(a) ** 3, -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))];
}), 0.08);

const GEAR_TEETH = 8;
function gearPts(rot) {
  const pts = [];
  const w = TAU / GEAR_TEETH;
  for (let i = 0; i < GEAR_TEETH; i++) {
    for (const [rad, f] of [[0.33, 0], [0.45, 0.14], [0.45, 0.38], [0.33, 0.52]]) {
      const a = rot + i * w + w * f;
      pts.push([0.5 + Math.cos(a) * rad, 0.5 + Math.sin(a) * rad]);
    }
  }
  return pts;
}

/** kind -> (t, o) => primitives, drawn in order (the staged draw-on follows this order). */
export const GLYPHS = {
  laptop: () => [
    B(0.14, 0.16, 0.72, 0.5, 0.04),
    L([[0.24, 0.28], [0.46, 0.28]], 'alt'),
    L([[0.3, 0.38], [0.7, 0.38]], 'dim'),
    L([[0.3, 0.48], [0.52, 0.48]], 'dim'),
    L([[0.24, 0.58], [0.36, 0.58]], 'alt'),
    Pg([[0.08, 0.7], [0.92, 0.7], [0.99, 0.84], [0.01, 0.84]], undefined, 'panel'),
    L([[0.42, 0.77], [0.58, 0.77]], 'dim'),
  ],
  server: (t) => {
    const out = [];
    [0.1, 0.38, 0.66].forEach((y, i) => {
      out.push(B(0.12, y, 0.76, 0.24, 0.04));
      out.push(D(0.24, y + 0.12, 0.04, Math.sin(t * (3 + i) + i * 2) > -0.3 ? 'good' : 'dim'));
      out.push(L([[0.42, y + 0.12], [0.78, y + 0.12]], 'dim'));
    });
    return out;
  },
  database: () => {
    const rx = 0.34;
    const ry = 0.11;
    return [
      Pg([[0.5 - rx, 0.22], [0.5 - rx, 0.78], ...arcPts(0.5, 0.78, rx, PI, 0, 14, ry), [0.5 + rx, 0.22]], undefined, 'panel'),
      L(arcPts(0.5, 0.4, rx, 0, PI, 14, ry), 'dim'),
      L(arcPts(0.5, 0.59, rx, 0, PI, 14, ry), 'dim'),
      E(0.5, 0.22, rx, ry),
    ];
  },
  cloud: () => [Pg(CLOUD, undefined, 'panel'), L([[0.34, 0.52], [0.5, 0.46]], 'dim')],
  package: () => [
    Pg([[0.5, 0.06], [0.88, 0.28], [0.88, 0.72], [0.5, 0.94], [0.12, 0.72], [0.12, 0.28]], undefined, 'panel'),
    L([[0.12, 0.28], [0.5, 0.5], [0.88, 0.28]], 'dim'),
    L([[0.5, 0.5], [0.5, 0.94]], 'dim'),
    L([[0.31, 0.17], [0.69, 0.39], [0.69, 0.55]], 'warn', 1.6),
  ],
  container: () => [
    B(0.04, 0.24, 0.92, 0.52, 0.03),
    ...[1, 2, 3, 4, 5, 6].map(i => L([[0.04 + i * 0.131, 0.3], [0.04 + i * 0.131, 0.7]], i % 2 ? undefined : 'dim')),
    L([[0.04, 0.84], [0.96, 0.84]], 'accent2', 0.8),
  ],
  user: () => [
    Pg([[0.16, 0.9], ...arcPts(0.5, 0.9, 0.34, PI, TAU, 14, 0.36), [0.84, 0.9]], undefined, 'panel'),
    C(0.5, 0.3, 0.19),
    L(arcPts(0.5, 0.31, 0.09, PI * 0.15, PI * 0.85, 6), 'dim', 0.8),
  ],
  gear: (t, o) => [
    Pg(gearPts((o.spin ?? 0) * t), undefined, 'panel'),
    C(0.5, 0.5, 0.13, undefined, 'bg'),
  ],
  doc: () => [
    Pg([[0.2, 0.06], [0.62, 0.06], [0.8, 0.26], [0.8, 0.94], [0.2, 0.94]], undefined, 'panel'),
    L([[0.62, 0.06], [0.62, 0.26], [0.8, 0.26]]),
    L([[0.3, 0.42], [0.58, 0.42]], 'alt'),
    L([[0.3, 0.56], [0.7, 0.56]], 'dim'),
    L([[0.3, 0.7], [0.66, 0.7]], 'dim'),
    L([[0.3, 0.84], [0.5, 0.84]], 'dim'),
  ],
  rocket: (t) => {
    const flame = 0.07 + 0.045 * (0.5 + 0.5 * Math.sin(t * 18));
    return [
      Pg([[0.42, 0.78], [0.5, 0.84 + flame], [0.58, 0.78]], 'warn', 'warn'),
      Pg([[0.33, 0.52], [0.15, 0.78], [0.33, 0.76]], undefined, 'accent'),
      Pg([[0.67, 0.52], [0.85, 0.78], [0.67, 0.76]], undefined, 'accent'),
      Pg([...arcPts(0.5, 0.4, 0.17, PI, TAU, 10, 0.34), [0.67, 0.78], [0.33, 0.78]], undefined, 'panel'),
      C(0.5, 0.4, 0.07, undefined, 'accent2'),
    ];
  },
  globe: () => [
    C(0.5, 0.5, 0.42),
    E(0.5, 0.5, 0.18, 0.42, 'dim', null),
    L([[0.08, 0.5], [0.92, 0.5]], 'dim'),
    L([[0.16, 0.3], [0.84, 0.3]], 'dim'),
    L([[0.16, 0.7], [0.84, 0.7]], 'dim'),
  ],
  shield: () => [
    Pg([[0.5, 0.06], [0.86, 0.2], [0.82, 0.6], [0.5, 0.94], [0.18, 0.6], [0.14, 0.2]], undefined, 'panel'),
    L([[0.34, 0.5], [0.46, 0.63], [0.68, 0.36]], 'good', 1.5),
  ],
  lock: () => [
    L([[0.32, 0.46], [0.32, 0.4], ...arcPts(0.5, 0.4, 0.18, PI, TAU, 12, 0.2), [0.68, 0.46]], undefined, 1.3),
    B(0.2, 0.44, 0.6, 0.46, 0.05),
    D(0.5, 0.64, 0.055, 'alt'),
    L([[0.5, 0.65], [0.5, 0.76]], 'alt'),
  ],
  heart: () => [Pg(HEART, undefined, 'bad', 1.2)],
  clock: (t, o) => {
    const m = -PI / 2 + 1.2 + t * (o.spin ?? 1.2);
    const h = -PI / 2 + 0.5 + (t * (o.spin ?? 1.2)) / 12;
    return [
      C(0.5, 0.5, 0.42),
      L([[0.5, 0.14], [0.5, 0.2]], 'dim'),
      L([[0.86, 0.5], [0.8, 0.5]], 'dim'),
      L([[0.5, 0.86], [0.5, 0.8]], 'dim'),
      L([[0.14, 0.5], [0.2, 0.5]], 'dim'),
      L([[0.5, 0.5], [0.5 + Math.cos(h) * 0.2, 0.5 + Math.sin(h) * 0.2]], 'accent', 1.5),
      L([[0.5, 0.5], [0.5 + Math.cos(m) * 0.3, 0.5 + Math.sin(m) * 0.3]]),
      D(0.5, 0.5, 0.035),
    ];
  },
  bolt: () => [Pg([[0.6, 0.04], [0.22, 0.56], [0.46, 0.56], [0.38, 0.96], [0.78, 0.4], [0.54, 0.4]], undefined, 'warn', 1.2)],
  branch: () => [
    L([[0.3, 0.28], [0.3, 0.72]], undefined, 1.2),
    L(bezierPts([0.7, 0.38], [0.7, 0.62], [0.3, 0.46], [0.3, 0.72], 14), 'accent', 1.2),
    C(0.3, 0.2, 0.09),
    C(0.3, 0.8, 0.09),
    C(0.7, 0.3, 0.09, 'accent', 'accent'),
  ],
  check: () => [C(0.5, 0.5, 0.44), L([[0.28, 0.52], [0.44, 0.68], [0.73, 0.34]], undefined, 1.7)],
  cross: () => [C(0.5, 0.5, 0.44), L([[0.33, 0.33], [0.67, 0.67]], undefined, 1.7), L([[0.67, 0.33], [0.33, 0.67]], undefined, 1.7)],
  phone: () => [
    B(0.26, 0.04, 0.48, 0.92, 0.07),
    L([[0.43, 0.11], [0.57, 0.11]], 'dim'),
    Pg([[0.33, 0.2], [0.67, 0.2], [0.67, 0.46], [0.33, 0.46]], 'accent2', 'accent2'),
    L([[0.33, 0.58], [0.67, 0.58]], 'dim'),
    L([[0.33, 0.68], [0.56, 0.68]], 'dim'),
    D(0.5, 0.86, 0.03, 'dim'),
  ],
  bug: () => [
    L([[0.34, 0.42], [0.12, 0.32]]),
    L([[0.32, 0.58], [0.1, 0.58]]),
    L([[0.34, 0.72], [0.12, 0.84]]),
    L([[0.66, 0.42], [0.88, 0.32]]),
    L([[0.68, 0.58], [0.9, 0.58]]),
    L([[0.66, 0.72], [0.88, 0.84]]),
    Pg(arcPts(0.5, 0.58, 0.21, 0, TAU, 24, 0.31).slice(0, -1), undefined, 'bad'),
    L([[0.5, 0.3], [0.5, 0.88]], 'dim', 0.8),
    C(0.5, 0.24, 0.1),
    L([[0.45, 0.16], [0.38, 0.06]], undefined, 0.8),
    L([[0.55, 0.16], [0.62, 0.06]], undefined, 0.8),
  ],
  eye: () => [
    Pg([...bezierPts([0.06, 0.5], [0.28, 0.16], [0.72, 0.16], [0.94, 0.5], 16), ...bezierPts([0.94, 0.5], [0.72, 0.84], [0.28, 0.84], [0.06, 0.5], 16).slice(1, -1)], undefined, 'panel'),
    C(0.5, 0.5, 0.17, 'alt', 'accent2'),
    D(0.5, 0.5, 0.07),
  ],
};

export const KINDS = Object.keys(GLYPHS);
const unknownKind = kind => new Error(`Unknown icon kind "${kind}". Use one of: ${KINDS.join(', ')} (${KINDS.length} kinds)`);

/** Icons whose whole outline carries a meaning color by default. */
const BASE = { heart: 'bad', bolt: 'warn', check: 'good', cross: 'bad' };
const TINT = { panel: 1, bg: 1 };

/**
 * Draw icon `kind` inside rect r (kept square, centered). o: color, p (staged draw-on 0..1), t (scene time: gear spin,
 * clock hands, server LEDs, rocket flame), spin (rad/s of the gear and the clock), alpha, lw.
 */
export function drawIcon(api, kind, r, o = {}) {
  const glyph = GLYPHS[kind];
  if (!glyph) { throw unknownKind(kind); }
  const p = o.p ?? 1;
  const alpha = o.alpha ?? 1;
  if (p <= 0 || alpha <= 0) { return; }
  const side = Math.min(r.w, r.h);
  const ox = r.x + (r.w - side) / 2;
  const oy = r.y + (r.h - side) / 2;
  const map = q => [ox + q[0] * side, oy + q[1] * side];
  const main = o.color ?? BASE[kind] ?? 'ink';
  const lw = o.lw ?? api.style.defaults.lw * clamp(side / 120, 0.85, 1.6);
  const tok = tone => (tone === undefined ? main : tone === 'alt' ? 'accent2' : tone);
  const prims = glyph(o.t ?? 0, o);
  const n = prims.length;
  const seed0 = hash(kind) % 40;
  prims.forEach((pr, i) => {
    const pp = clamp((p - (i / n) * 0.6) / 0.4);
    if (pp <= 0) { return; }
    const col = tok(pr.tone);
    const w = lw * (pr.w ?? 1);
    const seed = seed0 + i * 3 + 1;
    if (pr.k === 'line') { line(api, pr.pts.map(map), { p: pp, color: col, lw: w, alpha, seed }); }
    else if (pr.k === 'poly') {
      poly(api, pr.pts.map(map), { p: pp, stroke: col, fill: pr.f ? tok(pr.f) : null, fillAlpha: pr.f in TINT ? 1 : 0.35, lw: w, alpha, seed });
    }
    else if (pr.k === 'box') {
      const [x, y, bw, bh] = pr.r;
      box(api, { x: ox + x * side, y: oy + y * side, w: bw * side, h: bh * side }, { kind: pr.kind, p: pp, stroke: col, fill: pr.f ? tok(pr.f) : null, lw: w, r: (pr.rad ?? 0) * side, alpha, seed });
    }
    else { dot(api, ...map(pr.c), pr.r * side * pp, col, { alpha }); }
  });
}

// ---- the piece ----------------------------------------------------------------------------------------------------

const SIDES = ['bottom', 'top', 'left', 'right'];
/** Share of the art side reserved on each edge so idle motion (float, bob, sway, pulse) stays inside the rect. */
const IDLE_MARGIN = 0.07;

/** Where the art square and the label go inside rect R. */
function arrange(R, labelSide, lab, mg) {
  let art;
  let at = null;
  if (!lab) {
    const sd = Math.min(R.w, R.h);
    art = { x: R.x + (R.w - sd) / 2, y: R.y + (R.h - sd) / 2, w: sd, h: sd };
  }
  else if (labelSide === 'bottom' || labelSide === 'top') {
    const sd = Math.max(1, Math.min(R.w, R.h - lab.h - lab.gap));
    const y0 = R.y + (R.h - (sd + lab.gap + lab.h)) / 2;
    const bottom = labelSide === 'bottom';
    art = { x: R.x + (R.w - sd) / 2, y: bottom ? y0 : y0 + lab.h + lab.gap, w: sd, h: sd };
    at = { x: R.x + R.w / 2, y: bottom ? y0 + sd + lab.gap + lab.h / 2 : y0 + lab.h / 2, maxW: R.w, align: 'center' };
  }
  else {
    const sd = Math.max(1, Math.min(R.h, R.w - lab.gap - Math.min(lab.tw, R.w * 0.5)));
    const maxW = Math.max(1, R.w - sd - lab.gap);
    const right = labelSide === 'right';
    art = { x: right ? R.x : R.x + R.w - sd, y: R.y + (R.h - sd) / 2, w: sd, h: sd };
    at = { x: right ? R.x + sd + lab.gap : R.x + maxW, y: R.y + R.h / 2, maxW, align: right ? 'left' : 'right' };
  }
  const m = art.w * mg;
  return { art: { x: art.x + m, y: art.y + m, w: art.w - m * 2, h: art.h - m * 2 }, at };
}

const IDLE = {
  float: (t, ph, sd) => ({ dy: Math.sin(t * 1.6 + ph) * sd * 0.045 }),
  bob: (t, ph, sd) => ({ dy: -Math.abs(Math.sin(t * 3 + ph)) * sd * 0.06 }),
  sway: (t, ph) => ({ rot: Math.sin(t * 2 + ph) * 0.06 }),
  pulse: (t, ph) => ({ scale: 1 + 0.05 * Math.sin(t * 4 + ph) }),
};

/**
 * Icon with an optional label. opts: id, kind (one of KINDS), rect | x, y, size (top-left of the piece, icon `size`
 * px) | in | a registered id, at, dur (draw-on, 0.6), color, label, labelSide ('bottom' | 'top' | 'left' | 'right'),
 * labelPx, labelColor, labelW (label width for a 'bottom' | 'top' label, wider than the icon: the label is centered on the
 * icon and the piece rect grows to include it; a side label ignores it, its width is the rect beside the icon), idle ('float' | 'bob' | 'sway' | 'pulse'), spin (rad/s: gear, clock), until (fades out), z.
 * The registered rect covers the icon, the label and the idle motion.
 */
export function icon(s, o) {
  if (!GLYPHS[o.kind]) { throw unknownKind(o.kind); }
  if (o.idle !== undefined && !IDLE[o.idle]) { throw new Error(`Unknown icon idle "${o.idle}". Use one of: ${Object.keys(IDLE).join(', ')}`); }
  const labelSide = o.labelSide ?? 'bottom';
  if (!SIDES.includes(labelSide)) { throw new Error(`Unknown icon labelSide "${labelSide}". Use one of: ${SIDES.join(', ')}`); }
  const id = o.id ?? s.uid('icon');
  const at = o.at ?? 0;
  const dur = o.dur ?? 0.6;
  const mg = o.idle ? IDLE_MARGIN : 0;
  const px = o.labelPx ?? size(s, 'label', 0.7);
  const lab = o.label ? { h: px * 1.5, gap: px * 0.25, tw: textW(s, o.label, px, 'body', 600) } : null;

  let rect0;
  if (o.rect || o.in || (Number.isFinite(o.w) && Number.isFinite(o.h)) || (o.id && s.reg.has(o.id))) {
    rect0 = resolveRect(s, { ...o, id }, 'icon');
  }
  else if (Number.isFinite(o.x) && Number.isFinite(o.y)) {
    const sd = (o.size ?? 160) / (1 - mg * 2);
    const left = labelSide === 'left' || labelSide === 'right';
    rect0 = { x: o.x, y: o.y, w: lab && left ? sd + lab.gap + Math.min(lab.tw, sd * 2.2) : sd, h: lab && !left ? sd + lab.gap + lab.h : sd };
  }
  else { throw new TypeError(`icon "${id}" has no position: pass rect, in, x/y/size or a layout id`); }

  const { art, at: place } = arrange(rect0, labelSide, lab, mg);
  let rect = rect0;
  if (lab && place && Number.isFinite(o.labelW) && (labelSide === 'bottom' || labelSide === 'top')) {
    // A label wider than the icon: centered on it, and the piece rect grows to hold it.
    const extra = Math.max(0, o.labelW - rect0.w);
    rect = { ...rect0, x: rect0.x - extra / 2, w: rect0.w + extra };
    place.maxW = Math.max(place.maxW, o.labelW);
  }
  const tk = textKit(s);
  const spec = lab && tk.make(o.label, place.x, place.y, place.maxW, { px, role: 'body', weight: 600, align: place.align, color: o.labelColor ?? 'ink', at, until: o.until });
  const ph = (hash(id) % 7) * 0.9;
  const [cx, cy] = [art.x + art.w / 2, art.y + art.h / 2];

  return piece(s, { ...o, id, at }, {
    kind: 'icon',
    rect,
    tk,
    container: false,
    draw(api, t) {
      const p = ease.inOut(prog(t, at, dur));
      const move = o.idle ? IDLE[o.idle](t, ph, art.w) : {};
      around(api, cx, cy, move, () => drawIcon(api, o.kind, art, { p, t, alpha: clamp(p * 4), color: o.color, spin: o.spin }));
      if (spec) { drawT(api, spec, { alpha: clamp((p - 0.4) * 2.5) }); }
    },
  });
}

export const pieces = { icon };
