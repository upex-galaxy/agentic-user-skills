import { around, center, line, mapRecord } from '../kit.js';
// Wrappers: animate, enter, exit, reveal. Each takes ALREADY CREATED items by id (`targets: id | [ids]`, also the ids a
// composite registers) and wraps their draw and qa, so call them AFTER the targets exist. They return a small item of
// their own that draws nothing (kind 'fx', `end` = when the motion has finished).
//   s.animate({ targets, x, y, scale, rot, alpha: [[t, v], ...], origin: 'center' | [x, y] | id, ease })
//        x and y are px offsets, rot is in degrees, t is scene-local seconds; each channel is its own keyframe list.
//   s.enter({ targets, at, dur, from: 'left' | 'right' | 'top' | 'bottom' | 'pop' | 'fade' | 'spin', dist, ease })
//   s.exit({ targets, at, dur, to: (same names), dist, ease })
//   s.reveal({ targets, at, dur, shape: 'wipe' | 'wipe-y' | 'iris' | 'scan' | 'blinds', dir, origin, color, slats, ease })
// QA follows the motion: the record is mapped through the same transform at t and its alpha multiplied, so a moved or
// scaled rect is checked where it really is. An enter or exit that is passing through the area outside the frame is not
// checked while it travels (it starts or ends off frame on purpose). A reveal reports the target as hidden until it is
// past progress 0.5. Wrappers stack: later wrappers are applied on top of earlier ones.
import { clamp, ease, kf, prog, resolveEase } from '../math.js';

const MARGIN = 24;
const SIDES = ['left', 'right', 'top', 'bottom'];
const MODES = [...SIDES, 'pop', 'fade', 'spin'];
const SHAPES = ['wipe', 'wipe-y', 'iris', 'scan', 'blinds'];
const SHOWN = 0.001;

function targetsOf(s, targets, what) {
  const ids = [targets].flat().filter(Boolean);
  if (!ids.length) { throw new Error(`${what}: needs targets (an id or an array of ids)`); }
  const hits = [];
  for (const id of ids) {
    const found = s.items.filter(it => it.id === id && it.kind !== 'fx' && typeof it.draw === 'function');
    if (!found.length) { throw new Error(`${what}: no item "${id}" yet. Create it first (known ids: ${s.reg.ids().join(', ') || 'none'})`); }
    hits.push(...found);
  }
  return hits;
}

function rectOfItem(s, it, what) {
  if (it.rect) { return it.rect; }
  if (s.reg.has(it.id)) { return s.reg.get(it.id); }
  const pts = it.conn?.pts ?? it.pts;
  if (pts?.length) {
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  throw new Error(`${what}: item "${it.id}" has no rect to pivot on`);
}

function originOf(s, origin, rect, what) {
  if (origin === undefined || origin === 'center') { return center(rect); }
  if (Array.isArray(origin)) { return origin; }
  if (typeof origin === 'string' && s.reg.has(origin)) { return center(s.reg.get(origin)); }
  throw new Error(`${what}: origin "${origin}" is not 'center', [x, y] or a registered id`);
}

/** Bounding rect of r after the transform m = { dx, dy, rot, sx, sy } about pivot [px, py]. */
function mapRect(r, m, pivot) {
  const [px, py] = pivot;
  const c = Math.cos(m.rot ?? 0);
  const sn = Math.sin(m.rot ?? 0);
  const sx = m.sx ?? 1;
  const sy = m.sy ?? sx;
  const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].map(([x, y]) => {
    const a = (x - px) * sx;
    const b = (y - py) * sy;
    return [px + (m.dx ?? 0) + a * c - b * sn, py + (m.dy ?? 0) + a * sn + b * c];
  });
  const xs = pts.map(p => p[0]);
  const ys = pts.map(p => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * Wrap draw and qa of each target. spec(rect, it) -> { pivot, mod(t) } with mod(t) -> { dx, dy, rot (rad), sx, sy,
 * alpha, clip?(ctx), after?(api), hideQa?, transient? }.
 */
function wrap(s, targets, what, spec) {
  for (const it of targetsOf(s, targets, what)) {
    const rect = rectOfItem(s, it, what);
    const { pivot, mod } = spec(rect, it);
    const draw = it.draw;
    const qa = it.qa;
    it.draw = (api, t) => {
      const m = mod(t);
      const alpha = m.alpha ?? 1;
      if (alpha <= SHOWN || m.skip) { return; }
      const inner = alpha < 1 ? api.fade(alpha) : api;
      around(api, pivot[0], pivot[1], { sx: m.sx ?? 1, sy: m.sy ?? m.sx ?? 1, dx: m.dx ?? 0, dy: m.dy ?? 0, rot: m.rot ?? 0 }, () => {
        if (m.clip) {
          api.ctx.save();
          api.ctx.beginPath();
          m.clip(api.ctx);
          api.ctx.clip();
          draw.call(it, inner, t);
          api.ctx.restore();
        }
        else { draw.call(it, inner, t); }
        m.after?.(api);
      });
    };
    if (typeof qa === 'function') {
      it.qa = (api, t) => {
        const rec = qa.call(it, api, t);
        if (!rec) { return rec; }
        const m = mod(t);
        const map = r => mapRect(r, m, pivot);
        const out = mapRecord(rec, map);
        let alpha = rec.alpha * (m.alpha ?? 1);
        if (m.hideQa) { alpha = 0; }
        else if (m.transient) {
          const b = out.rect;
          if (b.x < MARGIN || b.y < MARGIN || b.x + b.w > s.W - MARGIN || b.y + b.h > s.H - MARGIN) { alpha = 0; }
        }
        return { ...out, alpha };
      };
    }
  }
}

const fxItem = (s, o, end) => ({ kind: 'fx', id: o.id ?? s.uid('wrap'), z: o.z ?? 2, texts: () => [], draw: () => {}, end });

const keys = (v, name) => {
  if (v === undefined) { return null; }
  if (typeof v === 'number') { return [[0, v]]; }
  if (!Array.isArray(v) || !v.length || v.some((k, i) => !Array.isArray(k) || !Number.isFinite(k[0]) || !Number.isFinite(k[1]) || (i > 0 && k[0] < v[i - 1][0]))) {
    throw new Error(`animate: ${name} must be a list of [t, value] keyframes with ascending t, got ${JSON.stringify(v)}`);
  }
  return v;
};

/** Keyframes on the targets. o: targets, x, y (px offsets), scale, rot (degrees), alpha: [[t, value], ...], origin, ease (inOut). */
export function animate(s, o = {}) {
  const kx = keys(o.x, 'x');
  const ky = keys(o.y, 'y');
  const ks = keys(o.scale, 'scale');
  const kr = keys(o.rot, 'rot');
  const ka = keys(o.alpha, 'alpha');
  if (!kx && !ky && !ks && !kr && !ka) { throw new Error('animate: give at least one of x, y, scale, rot, alpha'); }
  const e = resolveEase(o.ease, 'inOut');
  const get = (k, t, d) => (k ? kf(t, k, e) : d);
  wrap(s, o.targets, 'animate', (rect) => {
    const pivot = originOf(s, o.origin, rect, 'animate');
    return {
      pivot,
      mod: t => ({
        dx: get(kx, t, 0),
        dy: get(ky, t, 0),
        sx: get(ks, t, 1),
        rot: get(kr, t, 0) * Math.PI / 180,
        alpha: clamp(get(ka, t, 1)),
      }),
    };
  });
  const last = Math.max(0, ...[kx, ky, ks, kr, ka].filter(Boolean).map(k => k[k.length - 1][0]));
  return s.add(fxItem(s, o, last));
}

/** Shared by enter and exit: h(t) = hiddenness 0..1 (1 = fully gone), sign +1 enter / exit. */
function slide(s, o, what, mode, enter) {
  if (!MODES.includes(mode)) { throw new Error(`${what}: unknown ${enter ? 'from' : 'to'} "${mode}" (use ${MODES.join(', ')})`); }
  const at = o.at ?? 0;
  const dur = o.dur ?? (enter ? 0.7 : 0.5);
  const e = resolveEase(o.ease, enter ? (mode === 'pop' ? 'back' : 'out') : 'in');
  wrap(s, o.targets, what, (rect) => {
    const full = { left: rect.x + rect.w, right: s.W - rect.x, top: rect.y + rect.h, bottom: s.H - rect.y }[mode];
    const dist = o.dist ?? full;
    return {
      pivot: center(rect),
      mod(t) {
        const u = prog(t, at, dur);
        const h = enter ? 1 - e(u) : e(u);
        const fade = enter ? ease.out(clamp(u / 0.4)) : 1 - ease.in(clamp((u - 0.6) / 0.4));
        const m = { alpha: u <= 0 ? (enter ? 0 : 1) : u >= 1 ? (enter ? 1 : 0) : fade, transient: u > 0 && u < 1 };
        if (mode === 'left') { m.dx = -dist * h; }
        else if (mode === 'right') { m.dx = dist * h; }
        else if (mode === 'top') { m.dy = -dist * h; }
        else if (mode === 'bottom') { m.dy = dist * h; }
        else if (mode === 'pop') { m.sx = Math.max(0.01, 1 - 0.8 * h); }
        else if (mode === 'spin') { m.rot = (enter ? -1 : 1) * Math.PI * h; m.sx = Math.max(0.01, 1 - 0.7 * h); }
        return m;
      },
    };
  });
  return s.add(fxItem(s, o, at + dur));
}

/** Target arrives. Invisible (and not checked) before `at`. o: targets, at (0), dur (0.7), from (left), dist (px, default: from beyond the frame), ease. */
export function enter(s, o = {}) {
  return slide(s, o, 'enter', o.from ?? 'fade', true);
}

/** Target leaves and stays invisible. o: targets, at (0), dur (0.5), to (fade), dist (px, default: out of the frame), ease. */
export function exit(s, o = {}) {
  return slide(s, o, 'exit', o.to ?? 'fade', false);
}

function clipFor(shape, dir, rect, p, pivot, slats) {
  const pad = 60;
  const { x, y, w, h } = rect;
  if (shape === 'iris') {
    const far = Math.max(...[[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([cx, cy]) => Math.hypot(cx - pivot[0], cy - pivot[1])));
    return ctx => ctx.arc(pivot[0], pivot[1], far * p + 2, 0, Math.PI * 2);
  }
  if (shape === 'blinds') {
    const vertical = dir === 'left' || dir === 'right';
    const n = Math.max(2, slats);
    return (ctx) => {
      for (let i = 0; i < n; i++) {
        if (vertical) {
          const sw = w / n;
          const a = dir === 'left' ? x + i * sw : x + (i + 1) * sw - sw * p;
          ctx.rect(a - (p >= 0.98 ? pad : 0), y - pad, sw * p + (p >= 0.98 ? pad * 2 : 0), h + pad * 2);
        }
        else {
          const sh = h / n;
          const a = dir === 'top' ? y + i * sh : y + (i + 1) * sh - sh * p;
          ctx.rect(x - pad, a - (p >= 0.98 ? pad : 0), w + pad * 2, sh * p + (p >= 0.98 ? pad * 2 : 0));
        }
      }
    };
  }
  return (ctx) => {
    if (dir === 'left') { ctx.rect(x - pad, y - pad, pad + w * p, h + pad * 2); }
    else if (dir === 'right') { ctx.rect(x + w * (1 - p), y - pad, pad + w * p, h + pad * 2); }
    else if (dir === 'top') { ctx.rect(x - pad, y - pad, w + pad * 2, pad + h * p); }
    else { ctx.rect(x - pad, y + h * (1 - p), w + pad * 2, pad + h * p); }
  };
}

/**
 * Clip the target while it opens. o: targets, at (0), dur (0.9), shape (wipe | wipe-y | iris | scan | blinds), dir
 * (wipe: left | right, wipe-y: top | bottom, scan: any side, blinds: left/right = vertical slats, top/bottom = horizontal),
 * origin (iris centre: 'center' | [x, y] | id), color (scan line, accent), slats (8), ease (inOut).
 * QA treats the target as hidden until the reveal passes progress 0.5.
 */
export function reveal(s, o = {}) {
  const shape = o.shape ?? 'wipe';
  if (!SHAPES.includes(shape)) { throw new Error(`reveal: unknown shape "${shape}" (use ${SHAPES.join(', ')})`); }
  const dir = o.dir ?? (shape === 'wipe-y' ? 'top' : shape === 'blinds' ? 'top' : 'left');
  if (!SIDES.includes(dir)) { throw new Error(`reveal: unknown dir "${dir}" (use ${SIDES.join(', ')})`); }
  const at = o.at ?? 0;
  const dur = o.dur ?? 0.9;
  const e = resolveEase(o.ease, 'inOut');
  wrap(s, o.targets, 'reveal', (rect) => {
    const pivot = originOf(s, o.origin, rect, 'reveal');
    const color = o.color ?? 'accent';
    return {
      pivot: center(rect),
      mod(t) {
        const p = e(prog(t, at, dur));
        if (p <= 0) { return { alpha: 0, hideQa: true }; }
        const m = { alpha: 1, hideQa: p <= 0.5 };
        if (p >= 1) { return m; }
        m.clip = clipFor(shape, dir, rect, p, pivot, o.slats ?? 8);
        if (shape === 'scan') {
          m.after = (api) => {
            const { x, y, w, h } = rect;
            const edge = { left: [[x + w * p, y], [x + w * p, y + h]], right: [[x + w * (1 - p), y], [x + w * (1 - p), y + h]], top: [[x, y + h * p], [x + w, y + h * p]], bottom: [[x, y + h * (1 - p)], [x + w, y + h * (1 - p)]] }[dir];
            line(api, edge, { color, lw: 4, head: false, alpha: Math.min(1, (1 - p) * 4) });
          };
        }
        return m;
      },
    };
  });
  return s.add(fxItem(s, o, at + dur));
}

export const pieces = { animate, enter, exit, reveal };
