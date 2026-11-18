// Drawing kit shared by every piece: rects, path math, style-call primitives, scopes, timing, text fitting and the
// piece() item factory. Everything draws through the active style (shape, line, poly, text, fill, dot) or through
// color tokens, so a piece written with this kit renders in any preset.
import { clamp, ease, lerp, prog } from './math.js';
import { SOUND_KINDS } from './sound-kinds.js';
import { measure } from './text.js';

export const TAU = Math.PI * 2;

// ---- rects and points ---------------------------------------------------------------------------------------------

export const R = (x, y, w, h) => ({ x, y, w, h });
/** Rect shrunk by dx (and dy) on every side. */
export const inset = (r, dx, dy = dx) => ({ x: r.x + dx, y: r.y + dy, w: r.w - dx * 2, h: r.h - dy * 2 });
/** Fractional sub-rect of r: frac(r, 0.1, 0.2, 0.5, 0.5). */
export const frac = (r, fx, fy, fw, fh) => ({ x: r.x + r.w * fx, y: r.y + r.h * fy, w: r.w * fw, h: r.h * fh });
export const center = r => [r.x + r.w / 2, r.y + r.h / 2];
/** Largest rect of aspect ar (w / h) centered in r. */
export function contain(r, ar) {
  const w = Math.min(r.w, r.h * ar);
  const h = w / ar;
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}
/** An id or a rect to a rect. */
export const rectRef = (s, ref) => (typeof ref === 'string' ? s.reg.get(ref) : ref);
/** Bounding rect of points, padded by pad. */
export function boundsOf(pts, pad = 0) {
  const xs = pts.map(p => p[0]);
  const ys = pts.map(p => p[1]);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
}

/** A piece's rect: `rect` (object or id), `in` id with `inset`, x/y/w/h, or its own registered id. */
export function resolveRect(s, o, what = 'piece') {
  if (o.rect) { return rectRef(s, o.rect); }
  if (o.in) { return inset(s.reg.get(o.in), o.inset ?? 0); }
  if ([o.x, o.y, o.w, o.h].every(Number.isFinite)) { return { x: o.x, y: o.y, w: o.w, h: o.h }; }
  if (o.id && s.reg.has(o.id)) { return s.reg.get(o.id); }
  throw new Error(`${what} "${o.id ?? ''}" has no position: pass rect, in, x/y/w/h or a layout id`);
}

/** An id, an [x, y] point, a rect or { id, anchor } to a point (rect center unless an anchor is named). */
export function pointOf(s, v, anchor) {
  if (Array.isArray(v)) { return v; }
  if (typeof v === 'string') { return anchor ? s.reg.anchor(v, anchor) : center(s.reg.get(v)); }
  if (v && v.id !== undefined && v.w === undefined) { return pointOf(s, v.id, v.anchor ?? anchor); }
  return center(v);
}

// ---- path math ----------------------------------------------------------------------------------------------------

/** Points of an elliptical arc (radians, 0 = right, clockwise on screen). */
function arcPts(cx, cy, r, a0, a1, n = 24, ry = r) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = lerp(a0, a1, i / n);
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * ry];
  });
}

/** Cubic bezier sampled to n + 1 points. */
function bezierPts(p0, c1, c2, p1, n = 28) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const k = i / n;
    const m = 1 - k;
    return [0, 1].map(j => m ** 3 * p0[j] + 3 * m * m * k * c1[j] + 3 * m * k * k * c2[j] + k ** 3 * p1[j]);
  });
}

/** Path between two points: curve 'straight' | 'arc' (bows by `bend` px, negative = up) | 's' (horizontal S) | 'sv' (vertical S). */
function linkPts(a, b, curve = 'straight', bend = -120) {
  if (curve === 'arc') {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const c = [(a[0] + b[0]) / 2 - (dy / l) * bend, (a[1] + b[1]) / 2 + (dx / l) * bend];
    const toward = (p, k) => [lerp(p[0], c[0], k), lerp(p[1], c[1], k)];
    return bezierPts(a, toward(a, 0.66), toward(b, 0.66), b);
  }
  if (curve === 's') {
    const mx = (a[0] + b[0]) / 2;
    return bezierPts(a, [mx, a[1]], [mx, b[1]], b);
  }
  if (curve === 'sv') {
    const my = (a[1] + b[1]) / 2;
    return bezierPts(a, [a[0], my], [b[0], my], b);
  }
  return [a, b];
}

/** Waypoints joined into one polyline with the same curve between each pair (no duplicate joint points). */
function chainPts(points, curve = 'straight', bend = -120) {
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const seg = linkPts(points[i - 1], points[i], curve, bend);
    out.push(...(i === 1 ? seg : seg.slice(1)));
  }
  return out;
}

const segLen = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
function pathLen(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) { l += segLen(pts[i - 1], pts[i]); }
  return l;
}

/** Point and heading at fraction k (0..1) of a polyline: { x, y, a } (a in radians). */
function pointAt(pts, k) {
  let d = clamp(k) * pathLen(pts);
  for (let i = 1; i < pts.length; i++) {
    const l = segLen(pts[i - 1], pts[i]);
    if (d <= l || i === pts.length - 1) {
      const q = l ? clamp(d / l) : 0;
      const [p0, p1] = [pts[i - 1], pts[i]];
      return { x: lerp(p0[0], p1[0], q), y: lerp(p0[1], p1[1], q), a: Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) };
    }
    d -= l;
  }
  return { x: pts[0][0], y: pts[0][1], a: 0 };
}

/** Path math for scene files: arcPts, bezierPts, linkPts, chainPts, pointAt, pathLen. */
export const path = { arcPts, bezierPts, linkPts, chainPts, pointAt, pathLen };

// ---- style-call primitives ----------------------------------------------------------------------------------------

export const box = (api, r, o = {}) => api.style.shape(api, r, { kind: 'round', ...o });
export const line = (api, pts, o = {}) => api.style.line(api, pts, { lw: 3, glow: 8, ...o });
export const text = (api, str, x, y, o = {}) => api.style.text(api, str, x, y, o);
export const poly = (api, pts, o = {}) => api.style.poly(api, pts, o);

/** Flat filled rect in a token color (bars, tints, slabs) through style.fill. */
export function fillRect(api, r, color = 'accent', alpha = 1, radius = 4) {
  if (alpha <= 0 || r.w <= 0 || r.h <= 0) { return; }
  api.style.fill(api, r, { color, alpha, radius });
}

/** Filled dot (particles, LEDs, packets) through style.dot. o: alpha, glow. */
export function dot(api, x, y, r, color = 'accent', o = {}) {
  const alpha = o.alpha ?? 1;
  if (alpha <= 0 || r <= 0) { return; }
  api.style.dot(api, x, y, r, { color, alpha, glow: o.glow });
}

/** Circle or arc outline drawn on with p. o: from, to (radians), color, lw, p, alpha, glow, dash. */
export function ring(api, cx, cy, r, o = {}) {
  const a0 = o.from ?? -Math.PI / 2;
  const a1 = o.to ?? a0 + TAU;
  line(api, arcPts(cx, cy, r, a0, a1, Math.max(12, Math.round(Math.abs(a1 - a0) * 8))), { color: o.color ?? 'accent', lw: o.lw ?? 3, p: o.p ?? 1, alpha: o.alpha ?? 1, glow: o.glow ?? 8, dash: o.dash });
}

/** Check mark drawn on with p inside a box of side `size` centered on (cx, cy). */
export function tick(api, cx, cy, size, p, color = 'good', lw = 4) {
  const k = size / 2;
  line(api, [[cx - k * 0.6, cy + k * 0.05], [cx - k * 0.15, cy + k * 0.5], [cx + k * 0.65, cy - k * 0.45]], { p, color, lw });
}

/** Cross drawn on with p. */
export function cross(api, cx, cy, size, p, color = 'bad', lw = 4) {
  const k = size * 0.3;
  line(api, [[cx - k, cy - k], [cx + k, cy + k]], { p: clamp(p * 2), color, lw });
  line(api, [[cx + k, cy - k], [cx - k, cy + k]], { p: clamp(p * 2 - 1), color, lw });
}

/** Rotating arc over a faint track: the "running" state of a job. */
export function spinner(api, cx, cy, r, t, color = 'warn', lw = 3.5, alpha = 1) {
  const a = t * 5;
  ring(api, cx, cy, r, { color: 'dim', lw: lw * 0.6, alpha: alpha * 0.35, glow: 0 });
  ring(api, cx, cy, r, { from: a, to: a + 1.9 + Math.sin(t * 3) * 0.6, color, lw, alpha });
}

/** Placeholder text: `rows` grey bars of varying width, revealed with p. o: widths, h, color, alpha. */
export function skeleton(api, rect, rows, p = 1, o = {}) {
  const widths = o.widths ?? [0.92, 0.78, 0.86, 0.6, 0.82, 0.7];
  const gap = rect.h / rows;
  const h = Math.min(o.h ?? 14, gap * 0.5);
  for (let i = 0; i < rows; i++) {
    const k = clamp(p * rows - i);
    if (k > 0) { fillRect(api, { x: rect.x, y: rect.y + gap * i + (gap - h) / 2, w: rect.w * widths[i % widths.length] * lerp(0.6, 1, k), h }, o.color ?? 'dim', (o.alpha ?? 0.4) * k, h / 2); }
  }
}

// ---- scopes -------------------------------------------------------------------------------------------------------

/** Run fn with a transform around (cx, cy). o: scale, sx, sy, dx, dy, rot (a number is a plain scale). */
export function around(api, cx, cy, o, fn) {
  const { scale = 1, sx = 1, sy = 1, dx = 0, dy = 0, rot = 0 } = typeof o === 'number' ? { scale: o } : o;
  const { ctx } = api;
  ctx.save();
  ctx.translate(cx + dx, cy + dy);
  if (rot) { ctx.rotate(rot); }
  ctx.scale(scale * sx, scale * sy);
  ctx.translate(-cx, -cy);
  fn();
  ctx.restore();
}

/** Run fn with drawing clipped to r (rounded when radius is given). */
export function clipTo(api, r, fn, radius = 0) {
  const { ctx } = api;
  ctx.save();
  ctx.beginPath();
  if (radius) { ctx.roundRect(r.x, r.y, r.w, r.h, radius); }
  else { ctx.rect(r.x, r.y, r.w, r.h); }
  ctx.clip();
  fn();
  ctx.restore();
}

// ---- timing -------------------------------------------------------------------------------------------------------

/** Overshooting 0..1 entrance progress. */
export const pop = (t, at, dur = 0.45) => ease.back(prog(t, at, dur));
/** Fade in at `at`, fade out at `until` (when given). */
export const life = (t, at, until, fadeIn = 0.3, fadeOut = 0.35) => ease.out(prog(t, at, fadeIn)) * (until === undefined ? 1 : 1 - ease.in(prog(t, until, fadeOut)));
/** Cursor blink: false before `at`, then on/off at 2 Hz starting on. */
export const blink = (t, at = 0, hz = 2) => t >= at && Math.floor((t - at) * hz) % 2 === 0;

// ---- sizes and text -----------------------------------------------------------------------------------------------

/** Pixel size of a role (node | label | code | min) from the style defaults times k. */
export const size = (s, role, k = 1) => Math.round(s.style.defaults[`${role}Px`] * k);
export const textW = (s, str, px, role = 'body', weight) => measure(s.ctx, str, s.style.font(role, px, weight));

/** Largest size (at most max, at least o.minPx) at which str fits maxW on one line. o: role, weight, minPx. */
export function fitPx(s, str, maxW, max, o = {}) {
  let px = Math.round(max);
  const min = o.minPx ?? s.style.defaults.minPx;
  while (px > min && textW(s, str, px, o.role, o.weight) > maxW) { px -= 1; }
  return px;
}

/**
 * Text kit of one piece. make() fits one line to maxW (shrinks to minPx, then flags overflow) and records it so the
 * piece reports every string and box to QA. A spec may carry at / until: qa(t) lists only what is visible at t.
 */
export function textKit(s) {
  const list = [];
  return {
    list,
    /** (str, x, yCenter, maxW, { px, minPx, role, weight, align, color, at, until, track }) -> spec */
    make(str, x, y, maxW, o = {}) {
      const role = o.role ?? 'body';
      const px = fitPx(s, str, maxW, o.px ?? size(s, 'label'), { role, weight: o.weight, minPx: o.minPx });
      const w = textW(s, str, px, role, o.weight);
      const align = o.align ?? 'left';
      const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      const spec = { str, x, y, px, role, weight: o.weight, align, w, color: o.color ?? 'ink', at: o.at, until: o.until, overflow: w > maxW + 1, rect: { x: x0, y: y - px * 0.6, w, h: px * 1.2 } };
      if (o.track !== false) { list.push(spec); }
      return spec;
    },
    /** Visible texts at t: [{ text, rect, overflow, px }]. */
    qa: (t = Infinity) => list.filter(sp => t >= (sp.at ?? 0) && (sp.until === undefined || t < sp.until)).map(sp => ({ text: sp.str, rect: sp.rect, overflow: sp.overflow, px: sp.px })),
    strings: () => list.map(sp => sp.str),
  };
}

/** Draw a text spec. o: alpha, color, p (typewriter 0..1), glow, dx, dy. */
export function drawT(api, sp, o = {}) {
  const typing = o.p !== undefined && o.p < 1;
  if (typing && o.p <= 0) { return; }
  const str = typing ? sp.str.slice(0, Math.ceil(sp.str.length * o.p)) : sp.str;
  api.style.text(api, str, (typing ? sp.rect.x : sp.x) + (o.dx ?? 0), sp.y + (o.dy ?? 0), { px: sp.px, role: sp.role, weight: sp.weight, color: o.color ?? sp.color, align: typing ? 'left' : sp.align, alpha: o.alpha ?? 1, glow: o.glow });
}

// ---- sound options ------------------------------------------------------------------------------------------------

/** Validate a `sound` option (true | false | a kind string, or undefined); returns it. Throws naming the kinds. */
export function checkSound(v, what = 'sound') {
  if (v === undefined || typeof v === 'boolean' || SOUND_KINDS.includes(v)) { return v; }
  throw new Error(`${what}: unknown sound "${v}". Use true, false or one of: ${SOUND_KINDS.join(', ')}`);
}

// ---- piece factory ------------------------------------------------------------------------------------------------

/**
 * Wrap a piece definition into an engine item. def: kind, rect, draw(api, t), tk, texts, vis(t), z, hud, zoomFade, end,
 * marks, parts(t), contains, container (default true), qa (false | fn), extra, cues ([{ t, kind, gain? }]: sound cues in
 * scene-local seconds). Registers rect under the id unless a layout did; default vis is 0 before o.at, 1 after, fading
 * out over 0.35 s from o.until. The item keeps o.at, o.sound (true | false | a sound kind) and the cues for engine.events().
 */
export function piece(s, o, def) {
  const id = o.id ?? s.uid(def.kind);
  const { rect, tk } = def;
  if (rect && !s.reg.has(id)) { s.reg.add(id, rect); }
  const at = o.at ?? 0;
  const vis = def.vis ?? (t => (t < at ? 0 : o.until === undefined ? 1 : 1 - prog(t, o.until, 0.35)));
  const extraTexts = (def.texts ?? []).filter(x => x !== undefined && x !== null && x !== '').map(String);
  const item = {
    kind: def.kind,
    id,
    z: o.z ?? def.z ?? 0,
    hud: (o.hud ?? def.hud) === true,
    rect,
    draw(api, t) {
      const v = vis(t);
      if (v > 0) { def.draw(v < 1 ? api.fade(v) : api, t); }
    },
    texts: () => [...(tk ? tk.strings() : []), ...extraTexts],
  };
  item.at = at;
  if (o.sound !== undefined) { item.sound = checkSound(o.sound, `${def.kind} "${id}"`); }
  if (def.cues) { item.cues = def.cues; }
  const zoomFade = o.zoomFade ?? def.zoomFade;
  if (zoomFade !== undefined) { item.zoomFade = zoomFade; }
  if (def.end !== undefined) { item.end = def.end; }
  if (def.marks) { item.marks = def.marks; }
  if (rect && def.qa !== false) {
    item.qa = typeof def.qa === 'function'
      ? def.qa
      : (_api, t) => ({ rect, alpha: vis(t), container: def.container !== false, contains: def.contains, host: o.in, texts: tk ? tk.qa(t) : [], parts: def.parts?.(t) });
  }
  return { ...item, ...def.extra };
}

/** Map a QA record through a rect -> rect function: rect, texts[].rect and parts[].rect. */
export function mapRecord(rec, m) {
  if (!rec) { return rec; }
  return {
    ...rec,
    rect: m(rec.rect),
    ...(rec.texts && { texts: rec.texts.map(x => ({ ...x, rect: m(x.rect) })) }),
    ...(rec.parts && { parts: rec.parts.map(x => ({ ...x, rect: m(x.rect) })) }),
  };
}
