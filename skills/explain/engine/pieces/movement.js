// Movement family: things that travel, burst, drift and dim. Pieces: packets (items along a path or edge), particles
// (burst, confetti, ambient, hearts), burst, parallax (depth doodles that shift against the camera), spotlight (dim all
// but one), splitScreen (two tinted halves that host pieces) and journeyRail (HUD map of the whole story).
// Everything draws through the preset (line, dot, ring, box, poly, text) so the motion is the same in every preset.
// Decoration (packets, particles, burst, parallax, spotlight) reports no QA record: it is not part of the composition.
import { around, boundsOf, box, center, dot, drawT, fitPx, line, path, piece, pointOf, poly, rectRef, ring, size, TAU, textKit } from '../kit.js';
import { clamp, ease, hash, lerp, prog, resolveEase, rng } from '../math.js';
import { drawIcon, KINDS } from './icons.js';

const { pointAt, pathLen, chainPts } = path;
const wrap = (v, m) => ((v % m) + m) % m;
const hasPos = (s, id) => s.reg.has(id);

/** Point where the segment from the rect center toward `toward` leaves the rect grown by gap. */
function edgePoint(r, toward, gap) {
  const [cx, cy] = center(r);
  const dx = toward[0] - cx;
  const dy = toward[1] - cy;
  const k = Math.min(Math.abs(dx) > 1e-6 ? (r.w / 2 + gap) / Math.abs(dx) : 1e9, Math.abs(dy) > 1e-6 ? (r.h / 2 + gap) / Math.abs(dy) : 1e9);
  return [cx + dx * Math.min(k, 0.5), cy + dy * Math.min(k, 0.5)];
}

// ---- packets ------------------------------------------------------------------------------------------------------

const PACKET_SHAPES = ['dot', 'box'];

/** Route points of a packet stream: `edge` (id of an edge item, or a list) or `path` waypoints (ids, [x, y], { id, anchor }). */
function routeOf(s, o) {
  if (o.edge) {
    return [o.edge].flat().flatMap((eid, i) => {
      const it = s.items.find(x => x.id === eid);
      const pts = it?.conn?.pts ?? it?.pts;
      if (!pts) { throw new Error(`packets: no edge item "${eid}" (create the edge first)`); }
      return i === 0 ? pts : pts.slice(1);
    });
  }
  if (!Array.isArray(o.path) || o.path.length < 2) { throw new Error('packets needs path (2+ waypoints: ids, [x, y] or { id, anchor }) or edge'); }
  const n = o.path.length;
  const gap = o.gap ?? 10;
  const plain = o.path.map(w => (typeof w === 'string' ? null : pointOf(s, w)));
  const way = o.path.map((w, i) => {
    if (plain[i]) { return plain[i]; }
    if (!hasPos(s, w)) { throw new Error(`packets: unknown id "${w}" in path`); }
    // Ends of an id path start and leave on the border facing the neighbor; ids in the middle are passed through.
    if (i === 0 || i === n - 1) {
      const nb = o.path[i === 0 ? 1 : n - 2];
      return edgePoint(s.reg.get(w), typeof nb === 'string' ? center(s.reg.get(nb)) : pointOf(s, nb), gap);
    }
    return center(s.reg.get(w));
  });
  return chainPts(way, o.curve ?? 'straight', o.bend ?? -120);
}

/**
 * Packets travelling along a path. opts: id, path (2+ waypoints: ids | [x, y] | { id, anchor }) or edge (id of an edge
 * item), curve ('straight' | 'arc' | 's' | 'sv'), bend (px, arc), at, until (time of the last emission), every (0.35),
 * count (default: from until, else 1), dur (1.2, travel time of one packet), shape ('dot' | 'box' | any icon kind such
 * as 'doc', 'package', 'user'), size (dot radius, else the side of the box or icon), color | colors, trail (3, dots
 * only), track (true: dashed path), trackColor, fadeAt, ping (true: ring on arrival), ease.
 * Exposes pts, arriveAt (first arrival), end and positions(t) -> [{ n, k, x, y, a }] (packets in flight at t).
 */
export function packets(s, o) {
  const shape = o.shape ?? 'dot';
  if (!PACKET_SHAPES.includes(shape) && !KINDS.includes(shape)) { throw new Error(`packets: unknown shape "${shape}". Use dot, box or an icon kind: ${KINDS.join(', ')}`); }
  const pts = routeOf(s, o);
  const at = o.at ?? 0;
  const every = o.every ?? 0.35;
  const dur = o.dur ?? 1.2;
  const count = o.count ?? (o.until === undefined ? 1 : Math.floor((o.until - at) / every + 1e-6) + 1);
  const colors = o.colors ?? [o.color ?? 'accent'];
  const glyph = shape !== 'dot';
  const sz = o.size ?? (glyph ? size(s, 'node', 1) : Math.max(5, size(s, 'node', 0.24)));
  const trail = glyph ? 0 : (o.trail ?? 3);
  const e = resolveEase(o.ease, 'inOut');
  const len = pathLen(pts) || 1;
  const end = pts[pts.length - 1];
  const pingOn = o.ping !== false;
  const r0 = glyph ? sz * 0.5 : sz;
  const pingDur = 0.45;
  const last = at + (count - 1) * every + dur;
  const positions = t => Array.from({ length: count }, (_, n) => {
    const k = prog(t, at + n * every, dur);
    if (k <= 0 || k >= 1) { return null; }
    return { n, k, ...pointAt(pts, e(k)) };
  }).filter(Boolean);

  return piece(s, { ...o, id: o.id ?? s.uid('packets') }, {
    kind: 'packets',
    rect: boundsOf(pts, sz),
    z: o.z ?? 2,
    qa: false,
    vis: () => 1,
    end: last + (pingOn ? pingDur : 0),
    extra: { pts, arriveAt: at + dur, positions },
    draw(api, t) {
      const out = o.fadeAt === undefined ? 1 : 1 - prog(t, o.fadeAt, 0.4);
      if (out <= 0) { return; }
      const tp = ease.inOut(prog(t, o.trackAt ?? at - 0.5, 0.6));
      if (o.track !== false && tp > 0) { line(api, pts, { p: tp, color: o.trackColor ?? 'dim', lw: 2, glow: 0, dash: [6, 12], alpha: 0.75 * out }); }
      for (let n = 0; n < count; n++) {
        const start = at + n * every;
        const k = prog(t, start, dur);
        const col = colors[n % colors.length];
        if (k > 0 && k < 1) {
          const edge = Math.min(1, k * 8, (1 - k) * 8) * out;
          for (let j = trail; j >= 1; j--) {
            const q = pointAt(pts, clamp(e(k) - (j * sz * 2) / len));
            dot(api, q.x, q.y, sz * (1 - j / (trail + 1.5)), col, { alpha: 0.45 * (1 - j / (trail + 1)) * edge, glow: 0 });
          }
          const q = pointAt(pts, e(k));
          const rect = { x: q.x - sz / 2, y: q.y - sz / 2, w: sz, h: sz };
          if (!glyph) { dot(api, q.x, q.y, sz, col, { alpha: edge, glow: 16 }); }
          else {
            around(api, q.x, q.y, { scale: Math.min(1, k * 6) }, () => {
              if (shape === 'box') { box(api, rect, { kind: 'round', stroke: col, fill: col, lw: 2, r: sz * 0.18, alpha: edge, seed: 3 }); }
              else { drawIcon(api, shape, rect, { color: col, alpha: edge, t }); }
            });
          }
        }
        else if (k >= 1 && pingOn) {
          const q = prog(t, start + dur, pingDur);
          if (q < 1) { ring(api, end[0], end[1], r0 + q * r0 * 3, { color: col, lw: 2.5, alpha: (1 - q) * out, glow: 0 }); }
        }
      }
    },
  });
}

// ---- particles and burst ------------------------------------------------------------------------------------------

const MODES = ['burst', 'confetti', 'ambient', 'hearts'];
const frame = s => ({ x: 0, y: 0, w: s.W, h: s.H });

/**
 * Seeded particles. opts: id, mode ('burst' | 'confetti' | 'ambient' | 'hearts'), origin (id | [x, y]) or rect (rect | id:
 * the area they fall through, drift in or rise from; default the whole frame), at, dur, until (ambient), count, colors
 * (tokens), size (12), speed (420), gravity (320), seed (default from the id). Pure: every particle comes from rng(seed).
 * Exposes end and sample(t) -> [{ type, x, y, size, alpha, color }] (what is drawn at t).
 */
export function particles(s, o = {}) {
  const mode = o.mode ?? 'burst';
  if (!MODES.includes(mode)) { throw new Error(`particles: unknown mode "${mode}". Use one of: ${MODES.join(', ')}`); }
  const id = o.id ?? s.uid('particles');
  const area = o.rect ? rectRef(s, o.rect) : frame(s);
  const origin = o.origin ? pointOf(s, o.origin) : center(area);
  const n = o.count ?? (mode === 'ambient' ? 30 : mode === 'hearts' ? 14 : 60);
  const colors = o.colors ?? (mode === 'hearts' ? ['bad', 'accent2', 'warn'] : ['accent', 'accent2', 'good', 'warn']);
  const r = rng(o.seed ?? hash(id));
  const base = o.size ?? 12;
  const parts = Array.from({ length: n }, (_, i) => ({ a: r() * TAU, v: 0.35 + r() * 0.65, size: base * (0.5 + r()), color: colors[i % colors.length], rot: r() * TAU, spin: (r() - 0.5) * 9, x: r(), y: r(), delay: r(), ph: r() * TAU, round: r() < 0.4 }));
  const at = o.at ?? 0;
  const dur = o.dur ?? (mode === 'burst' ? 1.4 : mode === 'hearts' ? 2.4 : 2.8);
  const speed = o.speed ?? 420;
  const gravity = o.gravity ?? 320;
  const fadeEnv = t => ease.out(prog(t, at, 0.8)) * (o.until === undefined ? 1 : 1 - ease.in(prog(t, o.until, 0.5)));

  const sample = (t) => {
    const out = [];
    for (const p of parts) {
      if (mode === 'burst') {
        const u = prog(t, at + p.delay * 0.12, dur);
        if (u <= 0 || u >= 1) { continue; }
        const d = speed * p.v * ease.out(u);
        out.push({ type: p.round ? 'dot' : 'rect', x: origin[0] + Math.cos(p.a) * d, y: origin[1] + Math.sin(p.a) * d + gravity * u * u, size: p.size, rot: p.rot + p.spin * u, alpha: 1 - ease.in(u), color: p.color });
      }
      else if (mode === 'confetti') {
        const u = prog(t, at + p.delay * dur * 0.4, dur * 0.6 + p.v * dur * 0.3);
        if (u <= 0 || u >= 1) { continue; }
        out.push({ type: p.round ? 'dot' : 'rect', x: area.x + p.x * area.w + Math.sin(u * 7 + p.ph) * 34, y: area.y - 30 + u * (area.h + 60), size: p.size, rot: p.rot + p.spin * u * 3, alpha: Math.min(1, (1 - u) * 5), color: p.color });
      }
      else if (mode === 'ambient') {
        const a = (0.22 + 0.16 * Math.sin(t * 1.3 + p.ph)) * fadeEnv(t);
        if (a <= 0) { continue; }
        out.push({ type: p.round ? 'dot' : 'rect', x: area.x + wrap(p.x * area.w + t * 14 * p.v * Math.cos(p.a), area.w), y: area.y + wrap(p.y * area.h - t * 20 * p.v, area.h), size: p.size, rot: p.rot + p.spin * t * 0.1, alpha: a, color: p.color });
      }
      else {
        const tau = t - at - p.delay * 0.6;
        if (tau <= 0 || tau >= dur) { continue; }
        const from = o.origin ? [origin[0] + (p.x - 0.5) * 90, origin[1]] : [area.x + p.x * area.w, area.y + area.h * (0.55 + p.y * 0.45)];
        out.push({ type: 'heart', x: from[0] + Math.sin(tau * 3 + p.ph) * 26, y: from[1] - (120 + p.v * 160) * tau, size: p.size * 2.4 * Math.min(1, tau * 5), rot: 0, alpha: 1 - (tau / dur) ** 2, color: p.color });
      }
    }
    return out;
  };

  return piece(s, { ...o, id }, {
    kind: 'particles',
    z: o.z ?? (mode === 'ambient' ? -2 : 6),
    qa: false,
    vis: () => 1,
    end: mode === 'ambient' ? (o.until ?? at) : at + dur + (mode === 'confetti' ? dur * 0.4 : 0.12),
    extra: { sample },
    draw(api, t) {
      const { ctx } = api;
      for (const p of sample(t)) {
        if (p.type === 'dot') { dot(api, p.x, p.y, p.size / 2, p.color, { alpha: p.alpha, glow: 0 }); }
        else if (p.type === 'heart') { drawIcon(api, 'heart', { x: p.x - p.size / 2, y: p.y - p.size / 2, w: p.size, h: p.size }, { color: p.color, alpha: p.alpha, lw: 2 }); }
        else {
          // Confetti flakes are flat tinted rects: drawn straight with the palette token (motion is the same in every preset).
          ctx.save();
          api.alpha(p.alpha);
          ctx.fillStyle = api.color(p.color);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
          ctx.restore();
        }
      }
    },
  });
}

/**
 * One burst of dots or sparks with a ring. opts: id, origin | target (id | [x, y]), at, dur (1.1), count (24), radius
 * (220), colors, gravity (140), size (5, dot radius), shape ('dot' | 'spark'), seed. Exposes end.
 */
export function burst(s, o) {
  const id = o.id ?? s.uid('burst');
  const where = o.origin ?? o.target;
  if (where === undefined) { throw new Error('burst needs origin or target (an id or [x, y])'); }
  const [ox, oy] = pointOf(s, where);
  const shape = o.shape ?? 'dot';
  if (!['dot', 'spark'].includes(shape)) { throw new Error(`burst: unknown shape "${shape}". Use dot or spark`); }
  const r = rng(o.seed ?? hash(id));
  const colors = o.colors ?? ['accent', 'accent2', 'good', 'warn'];
  const parts = Array.from({ length: o.count ?? 24 }, (_, i) => ({ a: r() * TAU, v: 0.35 + r() * 0.65, s: 0.5 + r(), c: colors[i % colors.length], d: r() * 0.15 }));
  const at = o.at ?? 0;
  const dur = o.dur ?? 1.1;
  const radius = o.radius ?? 220;
  const g = o.gravity ?? 140;
  const px = o.size ?? Math.max(4, size(s, 'node', 0.15));
  return piece(s, { ...o, id }, {
    kind: 'burst',
    z: o.z ?? 7,
    qa: false,
    vis: () => 1,
    end: at + dur + 0.15,
    draw(api, t) {
      for (const p of parts) {
        const k = prog(t, at + p.d, dur);
        if (k <= 0 || k >= 1) { continue; }
        const d = ease.out(k) * radius * p.v;
        const x = ox + Math.cos(p.a) * d;
        const y = oy + Math.sin(p.a) * d + g * k * k;
        const al = 1 - k * k;
        if (shape === 'spark') {
          const l = 18 * (1 - k);
          line(api, [[x, y], [x - Math.cos(p.a) * l, y - Math.sin(p.a) * l]], { color: p.c, lw: 2.5 * p.s, glow: 0, alpha: al, seed: 5 });
        }
        else { dot(api, x, y, px * p.s * (1 - k * 0.5), p.c, { alpha: al, glow: 10 }); }
      }
      const f = prog(t, at, 0.5);
      if (f > 0 && f < 1) { ring(api, ox, oy, 10 + f * radius * 0.5, { color: colors[0], lw: 3, alpha: 1 - f, glow: 0 }); }
    },
  });
}

// ---- parallax -----------------------------------------------------------------------------------------------------

const KINDS_PARALLAX = ['shapes', 'dots', 'rings'];
const SHAPE_CYCLE = ['ring', 'plus', 'tri', 'square'];

/**
 * Background doodles on depth layers: they drift, and far layers follow the camera less, so a camera move shifts them
 * against the content. Decoration: reports no QA record. opts: id, kind ('shapes' | 'dots' | 'rings'), layers (3),
 * count (8 per layer), seed, colors, drift (px/s, 14), alpha (1, scales the default), at, until, z (-5).
 * Exposes marks(t) -> [{ x, y, depth, type }] (world positions at t).
 */
export function parallax(s, o = {}) {
  const kind = o.kind ?? 'shapes';
  if (!KINDS_PARALLAX.includes(kind)) { throw new Error(`parallax: unknown kind "${kind}". Use one of: ${KINDS_PARALLAX.join(', ')}`); }
  const id = o.id ?? s.uid('parallax');
  const r = rng(o.seed ?? hash(id));
  const layers = o.layers ?? 3;
  const colors = o.colors ?? ['accent', 'accent2', 'dim'];
  const base = size(s, 'node', 0.4);
  const parts = [];
  for (let l = 0; l < layers; l++) {
    const depth = (l + 1) / layers; // 1 = near
    for (let i = 0; i < (o.count ?? 8); i++) {
      parts.push({ depth, x: r(), y: r(), size: (base * 0.5 + r() * base * 0.9) * (0.5 + depth * 0.5), c: colors[Math.floor(r() * colors.length)], ph: r() * TAU, type: kind === 'dots' ? 'dot' : kind === 'rings' ? 'ring' : SHAPE_CYCLE[parts.length % SHAPE_CYCLE.length] });
    }
  }
  const { W, H } = s;
  const drift = o.drift ?? 14;
  const at = o.at ?? 0;
  const env = t => ease.out(prog(t, at, 0.8)) * (o.until === undefined ? 1 : 1 - ease.in(prog(t, o.until, 0.5)));
  const marks = (t) => {
    const cam = s.camera.at(t);
    return parts.map((p) => {
      const far = 1 - p.depth * 0.75;
      return {
        x: wrap(p.x * (W + 200) - t * drift * p.depth, W + 200) - 100 + (cam.x - W / 2) * far,
        y: p.y * H + Math.sin(t * 0.5 + p.ph) * 10 * p.depth + (cam.y - H / 2) * far,
        depth: p.depth,
        type: p.type,
        size: p.size,
        c: p.c,
        al: (0.1 + 0.22 * p.depth) * (0.7 + 0.3 * Math.sin(t * 1.3 + p.ph)) * (o.alpha ?? 1) * 1.6,
      };
    });
  };
  return piece(s, { ...o, id }, {
    kind: 'parallax',
    z: o.z ?? -5,
    qa: false,
    vis: () => 1,
    end: at,
    extra: { marks },
    draw(api, t) {
      const k = env(t);
      if (k <= 0) { return; }
      for (const m of marks(t)) {
        const a = clamp(m.al * k, 0, 1);
        const z = m.size;
        const lo = { color: m.c, lw: 1.5, glow: 0, alpha: a, seed: 11 };
        if (m.type === 'dot') { dot(api, m.x, m.y, z * 0.3, m.c, { alpha: a }); }
        else if (m.type === 'ring') { ring(api, m.x, m.y, z * 0.5, lo); }
        else if (m.type === 'plus') {
          line(api, [[m.x - z / 2, m.y], [m.x + z / 2, m.y]], lo);
          line(api, [[m.x, m.y - z / 2], [m.x, m.y + z / 2]], lo);
        }
        else if (m.type === 'tri') { line(api, [[m.x, m.y - z / 2], [m.x + z / 2, m.y + z * 0.4], [m.x - z / 2, m.y + z * 0.4], [m.x, m.y - z / 2]], lo); }
        else { line(api, [[m.x - z / 2, m.y - z / 2], [m.x + z / 2, m.y - z / 2], [m.x + z / 2, m.y + z / 2], [m.x - z / 2, m.y + z / 2], [m.x - z / 2, m.y - z / 2]], lo); }
      }
    },
  });
}

// ---- spotlight ----------------------------------------------------------------------------------------------------

/**
 * Dim everything except one target. opts: id, target (id | rect), at, until, pad (16), strength (0.62), color (warn,
 * the outline). Decoration over the content: reports no QA record. Exposes end.
 */
export function spotlight(s, o) {
  const id = o.id ?? s.uid('spot');
  if (o.target === undefined) { throw new Error('spotlight needs a target (an id or a rect)'); }
  const r0 = rectRef(s, o.target);
  const pad = o.pad ?? 16;
  const r = { x: r0.x - pad, y: r0.y - pad, w: r0.w + pad * 2, h: r0.h + pad * 2 };
  const at = o.at ?? 0;
  const k = t => ease.inOut(prog(t, at, 0.5)) * (o.until === undefined ? 1 : 1 - ease.inOut(prog(t, o.until, 0.5)));
  return piece(s, { ...o, id }, {
    kind: 'spotlight',
    z: o.z ?? 5.5,
    qa: false,
    vis: () => 1,
    end: at + 0.7,
    draw(api, t) {
      const v = k(t);
      if (v <= 0) { return; }
      const { ctx } = api;
      ctx.save();
      api.alpha((o.strength ?? 0.62) * v);
      ctx.fillStyle = api.color('bg');
      ctx.beginPath();
      ctx.rect(-4000, -4000, 12000, 12000);
      ctx.roundRect(r.x, r.y, r.w, r.h, 18);
      ctx.fill('evenodd');
      ctx.restore();
      box(api, r, { stroke: o.color ?? 'warn', fill: null, lw: 3, alpha: v, p: ease.inOut(prog(t, at, 0.7)), seed: 17 });
    },
  });
}

// ---- splitScreen --------------------------------------------------------------------------------------------------

/**
 * Split an area in two tinted halves with a divider that draws itself. opts: id, area (rect | id, default s.area), ratio
 * (0.5), slant (px the divider leans, 0), gap (48), left / right ({ color, label }), at, dur (0.7).
 * Registers `<id>.left` and `<id>.right` (the inner rects below the labels) so pieces can go `in:` them.
 */
export function splitScreen(s, o = {}) {
  const id = o.id ?? s.uid('split');
  const area = o.area ? rectRef(s, o.area) : s.area;
  const ratio = o.ratio ?? 0.5;
  const gap = o.gap ?? 48;
  const slant = o.slant ?? 0;
  const L = o.left ?? {};
  const Rt = o.right ?? {};
  const px = size(s, 'label', 0.7);
  const labelH = L.label || Rt.label ? Math.round(px * 1.5) : 0;
  const cx = area.x + area.w * ratio;
  const half = gap / 2 + Math.abs(slant) / 2;
  const left = { x: area.x, y: area.y + labelH, w: cx - area.x - half, h: area.h - labelH };
  const right = { x: cx + half, y: area.y + labelH, w: area.x + area.w - cx - half, h: area.h - labelH };
  s.reg.add(`${id}.left`, left);
  s.reg.add(`${id}.right`, right);
  const at = o.at ?? 0;
  const dur = o.dur ?? 0.7;
  const pad = 26;
  const top = [cx + slant / 2, area.y - pad];
  const bottom = [cx - slant / 2, area.y + area.h + pad];
  const tk = textKit(s);
  const labelY = area.y + labelH / 2;
  const sides = [
    { o: L, tok: L.color ?? 'accent', dir: -1, pts: [[area.x - pad, area.y - pad], [top[0] - gap / 3, top[1]], [bottom[0] - gap / 3, bottom[1]], [area.x - pad, bottom[1]]], spec: L.label && tk.make(L.label, area.x + 8, labelY, left.w - 16, { px, weight: 700, color: L.color ?? 'accent', at }) },
    { o: Rt, tok: Rt.color ?? 'accent2', dir: 1, pts: [[top[0] + gap / 3, top[1]], [area.x + area.w + pad, area.y - pad], [area.x + area.w + pad, bottom[1]], [bottom[0] + gap / 3, bottom[1]]], spec: Rt.label && tk.make(Rt.label, area.x + area.w - 8, labelY, right.w - 16, { px, weight: 700, align: 'right', color: Rt.color ?? 'accent2', at }) },
  ];
  return piece(s, { ...o, id }, {
    kind: 'split',
    rect: area,
    tk,
    z: o.z ?? -2,
    vis: () => 1,
    end: at + dur + 0.1,
    draw(api, t) {
      const p = ease.out(prog(t, at, dur));
      if (p <= 0) { return; }
      const { ctx } = api;
      for (const h of sides) {
        ctx.save();
        ctx.translate(h.dir * (1 - p) * 240, 0);
        poly(api, h.pts, { closed: true, stroke: null, fill: h.tok, fillAlpha: 0.12, lw: 0, alpha: p, seed: 21 });
        ctx.restore();
        if (h.spec) { drawT(api, h.spec, { alpha: clamp(p * 2 - 1) }); }
      }
      line(api, [top, bottom], { p: ease.inOut(prog(t, at + 0.1, 0.6)), color: 'dim', lw: 4, glow: 0, seed: 22 });
    },
  });
}

// ---- journeyRail --------------------------------------------------------------------------------------------------

/**
 * HUD rail that shows where we are in the story: one dot per step, a line that fills up to the active one. Screen
 * space (the camera never moves it) and zoomFade: it fades out while the camera zooms from 1 to 1.15. By default it
 * sits in the top band to the right of the section tag (when one was added before it), clear of the heading, the
 * caption and the footer. opts: id, steps (labels), active (0), from (active - 1: where the line starts), at (0.25),
 * rect, labelPx (0.6 x the preset labelPx, at least its minPx), z. Exposes marks.arrive and end.
 */
export function journeyRail(s, o) {
  const steps = o.steps ?? [];
  const n = steps.length;
  if (n < 2) { throw new Error('journeyRail needs steps (2+ labels)'); }
  const active = o.active ?? 0;
  const from = o.from ?? Math.max(0, active - 1);
  const at = o.at ?? 0.25;
  const dotY = 22;
  // Step labels: 0.6 of the preset's label size (never under its minPx), so sketch's handwriting stays readable.
  const px = o.labelPx ?? Math.max(s.style.defaults.minPx, size(s, 'label', 0.6));
  const h = Math.round(dotY + 18 + px * 1.2 + 6);
  const tag = s.items.find(it => it.kind === 'tag' && it.rect);
  const x0 = tag ? tag.rect.x + tag.rect.w + 40 : 560;
  const rect = o.rect ?? { x: x0, y: 28, w: s.W - 64 - x0, h };
  const step = rect.w / n;
  const xs = i => rect.x + step * (i + 0.5);
  const y = rect.y + dotY;
  const tk = textKit(s);
  const lpx = Math.min(...steps.map(st => fitPx(s, st, step - 8, px, { weight: 600 })));
  const labs = steps.map((st, i) => tk.make(st, xs(i), y + 18 + lpx * 0.6, step - 8, { px: lpx, weight: i === active ? 700 : 500, align: 'center', color: i === active ? 'accent' : i < active ? 'ink' : 'dim' }));
  const arrive = at + 0.9;
  return piece(s, { ...o, id: o.id ?? s.uid('rail'), hud: true, zoomFade: true }, {
    kind: 'rail',
    rect,
    tk,
    z: o.z ?? 4,
    container: false,
    vis: t => ease.out(prog(t, 0, 0.4)),
    end: arrive,
    marks: { arrive },
    draw(api, t) {
      const k = ease.inOut(prog(t, at, 0.9));
      const head = lerp(xs(from), xs(active), k);
      line(api, [[xs(0), y], [xs(n - 1), y]], { color: 'dim', lw: 2, glow: 0, alpha: 0.5, seed: 31 });
      if (head > xs(0) + 1) { line(api, [[xs(0), y], [head, y]], { color: 'accent', lw: 3.5, seed: 32 }); }
      steps.forEach((_, i) => {
        const done = xs(i) <= head + 0.5;
        const isActive = i === active && k >= 1;
        dot(api, xs(i), y, 9, 'bg');
        ring(api, xs(i), y, isActive ? 9 : 6.5, { color: done ? 'accent' : 'dim', lw: 2.5, glow: done ? 8 : 0 });
        if (done) { dot(api, xs(i), y, isActive ? 4.5 : 3, 'accent'); }
        if (isActive) {
          const pg = (t % 1.6) / 1.6;
          ring(api, xs(i), y, 9 + pg * 16, { color: 'accent', lw: 2, alpha: 1 - pg, glow: 0 });
        }
        drawT(api, labs[i], { alpha: i === active ? lerp(0.5, 1, k) : i < active ? 0.8 : 0.55, color: i === active && k < 1 ? 'dim' : undefined });
      });
      if (k > 0 && k < 1) { dot(api, head, y, 8, 'ink', { glow: 20 }); }
    },
  });
}

export const pieces = { packets, particles, burst, parallax, spotlight, splitScreen, journeyRail };
