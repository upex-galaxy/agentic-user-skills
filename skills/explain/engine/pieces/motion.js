// Object animation helpers for any item id: pulse, shake, highlight, travelDot, morph, expand, squeeze.
// Each is an item that draws on top of the scene using the registered rects, as a pure function of t. The helpers
// that must change the look of an existing item (pulse, shake, morph, expand, squeeze) wrap its draw and qa, so call
// them AFTER the target is created (s.node, s.codeBlock...). Wrapped items report alpha 0 to QA while hidden.
//   s.pulse({ target: 'api', at: 2, times: 2 })              s.shake({ target: 'db', at: 5 })
//   s.highlight({ target: 'api', style: 'glow' | 'underline', at: 3, until: 6 })
//   s.travelDot({ path: ['web', 'api', 'db'], at: 3, dur: 2 })  (or edge: 'a->b', or points: [[x, y], ...])
//   s.morph({ from: 'draft', to: 'final', at: 4 })           s.expand({ target: 'api', title: 'API', lines: [...], at: 4 })
//   s.squeeze({ targets: ['a', 'b', 'c'], into: { id: 'all', text: 'Todo junto' }, at: 5 })
import { clamp, ease, hash, prog, resolveEase } from '../math.js';
import { blockRect, drawFit, fitIn, inflate, lerpRect, pointAt } from './diagram-kit.js';

const centerOf = r => [r.x + r.w / 2, r.y + r.h / 2];
const rectArg = (s, ref, what) => {
  if (ref && typeof ref === 'object') { return ref; }
  if (!ref) { throw new Error(`${what} needs an id or a rect`); }
  return s.reg.get(ref);
};

function targetsOf(s, id) {
  return s.items.filter(it => it.id === id && it.kind !== 'fx' && typeof it.draw === 'function');
}

/**
 * Wrap the draw (and qa) of every item with `id`. mod(t) -> { hide?, dx?, dy?, sx?, sy?, rot? }.
 * The transform pivots on the registered rect's center. Returns the wrapped items (empty when none exist).
 */
export function wrapItems(s, id, mod) {
  const hits = targetsOf(s, id);
  const pivot = s.reg.has(id) ? centerOf(s.reg.get(id)) : [0, 0];
  for (const it of hits) {
    const draw = it.draw;
    const qa = it.qa;
    it.draw = (api, t) => {
      const m = mod(t);
      if (m.hide) { return; }
      const sx = m.sx ?? 1;
      const sy = m.sy ?? sx;
      if (m.dx || m.dy || m.rot || sx !== 1 || sy !== 1) {
        const { ctx } = api;
        ctx.translate(pivot[0] + (m.dx ?? 0), pivot[1] + (m.dy ?? 0));
        if (m.rot) { ctx.rotate(m.rot); }
        ctx.scale(sx, sy);
        ctx.translate(-pivot[0], -pivot[1]);
      }
      draw.call(it, api, t);
    };
    if (qa) {
      it.qa = (api, t) => {
        const rec = qa.call(it, api, t);
        return rec && mod(t).hide ? { ...rec, alpha: 0 } : rec;
      };
    }
  }
  return hits;
}

const need = (s, id, what) => {
  if (!targetsOf(s, id).length) { throw new Error(`${what}: no item "${id}" to animate yet. Create it first (known ids: ${s.reg.ids().join(', ') || 'none'})`); }
};

const fx = (s, o, fn, extra = {}) => {
  const item = { kind: 'fx', id: o.id ?? s.uid('fx'), z: o.z ?? 2, texts: () => [], draw: fn };
  for (const [key, value] of Object.entries(extra)) { if (value !== undefined) { item[key] = value; } }
  return item;
};

/** Bump the target's scale and send rings outward. o: target, at, dur (1.2), times (2), scale (0.08), color, ring (true). */
export function pulse(s, o) {
  need(s, o.target, 'pulse');
  const rect = rectArg(s, o.target);
  const at = o.at ?? 0;
  const dur = o.dur ?? 1.2;
  const times = o.times ?? 2;
  const beat = dur / times;
  const amp = o.scale ?? 0.08;
  const bump = (t) => {
    let w = 0;
    for (let k = 0; k < times; k++) { w = Math.max(w, Math.sin(Math.PI * prog(t, at + k * beat, beat))); }
    return w;
  };
  wrapItems(s, o.target, t => ({ sx: 1 + amp * bump(t) }));
  return s.add(fx(s, o, (api, t) => {
    if (o.ring === false) { return; }
    for (let k = 0; k < times; k++) {
      const u = prog(t, at + k * beat, beat);
      if (u > 0 && u < 1) { api.style.shape(api, inflate(rect, 6 + ease.out(u) * 40), { kind: 'round', p: 1, stroke: o.color ?? 'accent', fill: null, lw: 3, alpha: (1 - u) * 0.9, seed: hash(`${o.target}${k}`) }); }
    }
  }));
}

/** Damped horizontal shake of the target. o: target, at, dur (0.7), amp (12 px), cycles (6). */
export function shake(s, o) {
  need(s, o.target, 'shake');
  const at = o.at ?? 0;
  const dur = o.dur ?? 0.7;
  const amp = o.amp ?? 12;
  const cycles = o.cycles ?? 6;
  const off = (t) => {
    const u = prog(t, at, dur);
    return u <= 0 || u >= 1 ? 0 : amp * Math.sin(2 * Math.PI * cycles * u) * (1 - u);
  };
  wrapItems(s, o.target, t => ({ dx: off(t), rot: off(t) * 0.0006 }));
  return s.add(fx(s, o, () => {}));
}

/** Glow (marker block plus outline) or underline on the target. o: target, style, at, dur (0.6), until, color (warn), pad. */
export function highlight(s, o) {
  const rect = rectArg(s, o.target ?? o.id, 'highlight');
  const at = o.at ?? 0;
  const dur = o.dur ?? 0.6;
  const mode = o.style ?? 'glow';
  if (!['glow', 'underline'].includes(mode)) { throw new Error(`highlight: unknown style "${mode}" (use glow or underline)`); }
  const color = o.color ?? 'warn';
  const pad = o.pad ?? 10;
  return s.add(fx(s, o, (api, t) => {
    const p = prog(t, at, dur);
    const out = o.until === undefined ? 0 : prog(t, o.until, 0.4);
    if (p <= 0 || out >= 1) { return; }
    const keep = 1 - out;
    if (mode === 'glow') {
      const breathe = 0.78 + 0.22 * Math.sin(2 * Math.PI * (t - at) * 1.1);
      api.style.highlight(api, inflate(rect, pad), { p: 1, color, alpha: ease.out(p) * breathe * keep });
      return;
    }
    const y = rect.y + rect.h - 6;
    api.style.line(api, [[rect.x + 12, y], [rect.x + rect.w - 12, y]], { p: ease.inOut(p), color, lw: 6, head: false, alpha: keep, seed: hash(`${o.target}u`) });
  }));
}

/** Resolve a travelDot route to points: path (ids), edge (item id or ids), or points. */
export function routePoints(s, o) {
  if (o.points) { return o.points; }
  if (o.edge || o.edges) {
    return [o.edge ?? o.edges].flat().flatMap((eid, i) => {
      const it = s.items.find(x => x.id === eid);
      const pts = it?.conn?.pts ?? it?.pts;
      if (!pts) { throw new Error(`travelDot: no edge item "${eid}"`); }
      return i === 0 ? pts : pts.slice(1);
    });
  }
  const ids = o.path ?? [o.from, o.to];
  if (ids.length < 2 || ids.some(x => !x)) { throw new Error('travelDot needs path (2+ ids), edge or points'); }
  const out = [];
  for (let i = 1; i < ids.length; i++) {
    const c = s.reg.connect(ids[i - 1], ids[i], { gap: o.gap ?? 4 });
    out.push(c.pts[0], c.pts[c.pts.length - 1]);
  }
  return out;
}

/** A dot with a short trail that travels a route. o: path|edge|points, at, dur (2), color, size (18), trail (6), repeat (1), ease, stay. */
export function travelDot(s, o) {
  const pts = routePoints(s, o);
  const at = o.at ?? 0;
  const dur = o.dur ?? 2;
  const repeat = o.repeat ?? 1;
  const e = resolveEase(o.ease, 'inOut');
  const size = o.size ?? 18;
  const trail = o.trail ?? 6;
  const color = o.color ?? 'accent';
  const where = (t) => {
    const u = prog(t, at, dur * repeat) * repeat;
    return e(u >= repeat ? 1 : u - Math.floor(u));
  };
  return s.add(fx(s, o, (api, t) => {
    const u = prog(t, at, dur * repeat);
    if (u <= 0 || (u >= 1 && !o.stay)) { return; }
    const p = where(t);
    const fade = o.stay ? 1 : Math.min(prog(t, at, 0.15), 1 - prog(t, at + dur * repeat - 0.2, 0.2));
    for (let k = trail; k >= 1; k--) {
      const q = pointAt(pts, clamp(p - k * 0.022));
      const r = size * (1 - k / (trail + 2)) * 0.8;
      api.style.shape(api, { x: q.x - r, y: q.y - r, w: r * 2, h: r * 2 }, { kind: 'ellipse', p: 1, stroke: color, fill: color, lw: 1, glow: 4, alpha: (1 - k / (trail + 1)) * 0.45 * fade, seed: k });
    }
    const q = pointAt(pts, p);
    api.style.shape(api, { x: q.x - size, y: q.y - size, w: size * 2, h: size * 2 }, { kind: 'ellipse', p: 1, stroke: color, fill: color, lw: 2, glow: 20, alpha: fade, seed: 9 });
  }));
}

const textOf = (s, id) => targetsOf(s, id).flatMap(it => it.texts?.() ?? []).find(Boolean) ?? '';
const colorOf = (s, id, fallback) => targetsOf(s, id).find(it => it.color)?.color ?? fallback;

function drawScaled(api, fit, rect, sc, alpha, color = 'ink') {
  if (alpha <= 0) { return; }
  drawFit(api, { ...fit, px: fit.px * sc, lineH: fit.lineH * sc }, rect, { alpha, color });
}

/**
 * One rect smoothly becomes another: position, size and corner style, with crossfaded text. The `from` item is hidden
 * from `at`, the `to` item shows when it ends. o: from, to (ids or rects), at, dur (1), fromText, toText, fromShape, toShape, color, toColor, keep.
 */
export function morph(s, o) {
  const a = rectArg(s, o.from, 'morph from');
  const b = rectArg(s, o.to, 'morph to');
  const at = o.at ?? 0;
  const dur = o.dur ?? 1;
  const fromText = o.fromText ?? (typeof o.from === 'string' ? textOf(s, o.from) : '');
  const toText = o.toText ?? (typeof o.to === 'string' ? textOf(s, o.to) : '');
  const fitA = fromText ? fitIn(s, fromText, a, { px: s.style.defaults.nodePx, pad: 14 }) : null;
  const fitB = toText ? fitIn(s, toText, b, { px: s.style.defaults.nodePx, pad: 14 }) : null;
  const ca = o.color ?? 'accent';
  const cb = o.toColor ?? o.color ?? 'accent2';
  const keep = o.keep ?? !(typeof o.to === 'string' && targetsOf(s, o.to).length);
  const k = t => ease.inOut(prog(t, at, dur));
  if (typeof o.from === 'string') { wrapItems(s, o.from, t => ({ hide: t >= at })); }
  if (typeof o.to === 'string') { wrapItems(s, o.to, t => ({ hide: t < at + dur && !keep })); }
  const visible = t => t >= at && (keep || t < at + dur);
  const cur = t => lerpRect(a, b, k(t));
  return s.add(fx(s, o, (api, t) => {
    if (!visible(t)) { return; }
    const q = k(t);
    const r = cur(t);
    const seed = hash(`${o.from}${o.to}`);
    api.style.shape(api, r, { kind: o.fromShape ?? 'round', p: 1, stroke: ca, fill: 'panel', lw: s.style.defaults.lw, alpha: 1 - q, seed });
    api.style.shape(api, r, { kind: o.toShape ?? 'round', p: 1, stroke: cb, fill: 'panel', lw: s.style.defaults.lw, alpha: q, seed: seed + 1 });
    if (fitA) { drawScaled(api, fitA, r, Math.min(1, r.w / a.w, r.h / a.h), 1 - clamp(q / 0.6)); }
    if (fitB) { drawScaled(api, fitB, r, Math.min(1, r.w / b.w, r.h / b.h), clamp((q - 0.4) / 0.6)); }
  }, { texts: () => [fromText, toText].filter(Boolean), qa: (_api, t) => ({ rect: cur(t), alpha: visible(t) ? 1 : 0, texts: [], overlap: true }) }));
}

/** Default panel: centered in the scene area. */
const panelRect = s => ({ x: s.area.x + s.area.w * 0.16, y: s.area.y + s.area.h * 0.1, w: s.area.w * 0.68, h: s.area.h * 0.8 });

/**
 * A node opens into a larger panel with a title and lines, and can close again.
 * o: target, at, dur (0.9), rect (final panel), title, lines [], closeAt, color, id (registers the panel rect).
 */
export function expand(s, o) {
  need(s, o.target, 'expand');
  const src = rectArg(s, o.target, 'expand target');
  const panel = o.rect ?? panelRect(s);
  if (o.id && !s.reg.has(o.id)) { s.reg.add(o.id, panel); }
  const at = o.at ?? 0;
  const dur = o.dur ?? 0.9;
  const lines = o.lines ?? [];
  const color = o.color ?? colorOf(s, o.target, 'accent');
  const srcText = textOf(s, o.target);
  const srcFit = srcText ? fitIn(s, srcText, src, { px: s.style.defaults.nodePx, pad: 14 }) : null;
  const titleRect = { x: panel.x + 40, y: panel.y + 26, w: panel.w - 80, h: 92 };
  const titleFit = o.title ? fitIn(s, o.title, titleRect, { font: 'display', px: Math.round(s.style.defaults.labelPx * 1.15), pad: 0 }) : null;
  const bodyTop = panel.y + (o.title ? 140 : 40);
  const rowH = lines.length ? Math.min(96, (panel.y + panel.h - 36 - bodyTop) / lines.length) : 0;
  const rows = lines.map((text, i) => {
    const rect = { x: panel.x + 96, y: bodyTop + rowH * i, w: panel.w - 136, h: rowH - 8 };
    return { text, rect, fit: fitIn(s, text, rect, { px: Math.round(s.style.defaults.labelPx * 0.8), pad: 0 }) };
  });
  const open = t => ease.inOut(prog(t, at, dur));
  const closed = t => (o.closeAt === undefined ? 0 : ease.inOut(prog(t, o.closeAt, dur)));
  const k = t => clamp(open(t) - closed(t));
  wrapItems(s, o.target, t => ({ hide: k(t) > 0 }));
  const rowAlpha = (t, i) => (o.closeAt === undefined ? 1 : 1 - closed(t)) * ease.out(prog(t, at + dur + 0.15 * i, 0.35));
  return s.add(fx(s, o, (api, t) => {
    const q = k(t);
    if (q <= 0) { return; }
    const r = lerpRect(src, panel, q);
    api.style.shape(api, r, { kind: 'round', p: 1, stroke: color, fill: 'panel', lw: s.style.defaults.lw + 0.5, seed: hash(`${o.target}x`) });
    if (srcFit) { drawScaled(api, srcFit, r, Math.min(1, r.w / src.w, r.h / src.h), 1 - clamp(q * 3)); }
    const a = clamp((q - 0.75) / 0.25);
    if (titleFit && a > 0) { drawFit(api, titleFit, titleRect, { align: 'left', role: 'display', color, alpha: a }); }
    rows.forEach((row, i) => {
      const ra = rowAlpha(t, i) * a;
      if (ra <= 0) { return; }
      const cy = row.rect.y + row.rect.h / 2;
      api.style.shape(api, { x: panel.x + 52, y: cy - 9, w: 18, h: 18 }, { kind: 'ellipse', p: 1, stroke: color, fill: color, lw: 1.5, glow: 6, alpha: ra, seed: 3 + i });
      drawFit(api, row.fit, row.rect, { align: 'left', alpha: ra });
    });
  }, {
    id: o.id ? `${o.id}-panel` : undefined,
    texts: () => [o.title, ...lines, srcText].filter(Boolean),
    qa: (_api, t) => {
      const q = k(t);
      const full = q >= 0.99 ? [...(titleFit ? [{ text: o.title, rect: blockRect(titleFit, titleRect, 'left'), overflow: titleFit.overflow, px: titleFit.px }] : []), ...rows.map(r => ({ text: r.text, rect: blockRect(r.fit, r.rect, 'left'), overflow: r.fit.overflow, px: r.fit.px }))] : [];
      return { rect: lerpRect(src, panel, q), alpha: q > 0 ? 1 : 0, texts: full, container: true, overlap: true };
    },
  }));
}

/**
 * Several nodes merge into one. The targets slide and shrink into the merged rect, then the merged node appears.
 * o: targets (ids), into ({ id?, text, rect?, color } or an existing id), at, dur (1.2). Edges that touch a target are hidden from `at`.
 */
export function squeeze(s, o) {
  const ids = o.targets ?? [];
  if (ids.length < 2) { throw new Error('squeeze needs at least two targets'); }
  ids.forEach(id => need(s, id, 'squeeze'));
  const rects = ids.map(id => s.reg.get(id));
  const at = o.at ?? 0;
  const dur = o.dur ?? 1.2;
  const into = typeof o.into === 'string' ? { id: o.into } : (o.into ?? {});
  const known = into.id && s.reg.has(into.id);
  let merged = into.rect ?? (known ? s.reg.get(into.id) : null);
  if (!merged) {
    const cs = rects.map(centerOf);
    const cx = cs.reduce((n, c) => n + c[0], 0) / cs.length;
    const cy = cs.reduce((n, c) => n + c[1], 0) / cs.length;
    const w = Math.max(...rects.map(r => r.w)) * 1.15;
    const h = Math.max(...rects.map(r => r.h)) * 1.15;
    merged = { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  if (into.id && !known) { s.reg.add(into.id, merged); }
  const text = into.text ?? (known ? textOf(s, into.id) : '');
  const fit = text ? fitIn(s, text, merged, { px: s.style.defaults.nodePx, pad: 14 }) : null;
  const fits = ids.map(id => ({ text: textOf(s, id), color: colorOf(s, id, 'accent') })).map((g, i) => ({ ...g, fit: g.text ? fitIn(s, g.text, rects[i], { px: s.style.defaults.nodePx, pad: 14 }) : null }));
  const slide = t => ease.inOut(prog(t, at, dur * 0.7));
  const born = t => ease.back(prog(t, at + dur * 0.6, dur * 0.4));
  for (const id of ids) { wrapItems(s, id, t => ({ hide: t >= at })); }
  for (const it of s.items) {
    if (it.kind === 'edge' && it.conn && (ids.includes(it.conn.from.id) || ids.includes(it.conn.to.id)) && !(into.id && (it.conn.from.id === into.id || it.conn.to.id === into.id))) {
      const draw = it.draw;
      it.draw = (api, t) => { if (t < at) { draw.call(it, api, t); } };
    }
  }
  if (known) { wrapItems(s, into.id, t => ({ hide: t < at + dur * 0.9 })); }
  const color = into.color ?? 'accent';
  return s.add(fx(s, o, (api, t) => {
    if (t < at) { return; }
    const k = slide(t);
    const ghost = 1 - clamp((k - 0.75) / 0.25);
    if (ghost > 0) {
      ids.forEach((id, i) => {
        const r = lerpRect(rects[i], merged, k);
        api.style.shape(api, r, { kind: 'round', p: 1, stroke: fits[i].color, fill: 'panel', lw: s.style.defaults.lw, alpha: ghost, seed: hash(id) });
        if (fits[i].fit) { drawScaled(api, fits[i].fit, r, Math.min(1, r.w / rects[i].w, r.h / rects[i].h), (1 - clamp(k * 2)) * ghost); }
      });
    }
    if (known) { return; }
    const b = born(t);
    if (b <= 0) { return; }
    const r = lerpRect({ x: merged.x + merged.w * 0.04, y: merged.y + merged.h * 0.04, w: merged.w * 0.92, h: merged.h * 0.92 }, merged, clamp(b));
    api.style.shape(api, r, { kind: 'round', p: 1, stroke: color, fill: 'panel', lw: s.style.defaults.lw, alpha: clamp(b), seed: hash(`${into.id}m`) });
    if (fit) { drawFit(api, fit, r, { alpha: clamp((b - 0.3) / 0.7) }); }
  }, {
    kind: known ? 'fx' : 'node',
    id: !known && into.id ? into.id : undefined,
    rect: merged,
    texts: () => (text ? [text] : []),
    qa: known ? undefined : (_api, t) => ({ rect: merged, alpha: clamp(born(t)), texts: fit ? [{ text, rect: blockRect(fit, merged), overflow: fit.overflow, px: fit.px }] : [], overlap: true }),
  }));
}

export const pieces = { pulse, shake, highlight, travelDot, morph, expand, squeeze };
