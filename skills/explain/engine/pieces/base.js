import { union } from '../layout.js';
// Base pieces every other piece builds on: node (shape + fitted text), edge (arrow that draws itself, by ids),
// label, group, and code. Each factory is (s, opts) => item, where `s` is the scene builder.
// Items: { kind, id, z, draw(api, t), qa(api, t) -> record, texts() -> strings }.
import { clamp, ease, hash, lerp, prog } from '../math.js';
import { fitText, layoutCode, measure, revealLines, withWidow } from '../text.js';

function fitFor(s, text, rect, o, defaults = {}) {
  const role = o.font ?? defaults.font ?? 'body';
  const d = s.style.defaults;
  return fitText(s.ctx, text, rect, {
    fontFor: px => s.style.font(role, px, o.weight),
    maxPx: o.px ?? defaults.px ?? d.nodePx,
    minPx: o.minPx ?? d.minPx,
    pad: o.pad ?? d.pad,
    lineHeight: o.lineHeight ?? 1.2,
  });
}

/** Bounding box of a fitted text block placed inside `rect`. */
export function blockBox(fit, rect, align = 'center', pad = 0) {
  const h = fit.lines.length * fit.lineH;
  const w = fit.width;
  const x = align === 'center' ? rect.x + (rect.w - w) / 2 : rect.x + pad;
  return withWidow({ x, y: rect.y + (rect.h - h) / 2, w, h }, fit);
}

/** Draw a fitted block line by line; `p` < 1 types it in reading order without reflow. */
export function drawTextBlock(api, fit, rect, o = {}) {
  const { align = 'center', role = 'body', weight, color = 'ink', p = 1, alpha = 1, pad = 0 } = o;
  const shown = p >= 1 ? fit.lines : revealLines(fit.lines, p).shown;
  const top = rect.y + (rect.h - fit.lines.length * fit.lineH) / 2;
  const cx = rect.x + rect.w / 2;
  shown.forEach((line, i) => {
    // While typing, anchor each line at its final left edge so the text never re-centers as it grows.
    let x = align === 'center' ? cx : rect.x + pad;
    let textAlign = align === 'center' ? 'center' : 'left';
    if (p < 1 && align === 'center') {
      x = cx - measure(api.ctx, fit.lines[i], api.style.font(role, fit.px, weight)) / 2;
      textAlign = 'left';
    }
    api.style.text(api, line, x, top + fit.lineH * (i + 0.5), { px: fit.px, role, weight, color, align: textAlign, alpha });
  });
}

function rectFor(s, o, what) {
  if (o.rect) { return o.rect; }
  if (o.id && s.reg.has(o.id)) { return s.reg.get(o.id); }
  if (o.place) {
    const { to, side = 'bottom', gap = 24 } = o.place;
    const r = s.reg.get(to);
    const w = o.w ?? r.w;
    const h = o.h ?? 64;
    const at = {
      bottom: { x: r.x + (r.w - w) / 2, y: r.y + r.h + gap },
      top: { x: r.x + (r.w - w) / 2, y: r.y - gap - h },
      right: { x: r.x + r.w + gap, y: r.y + (r.h - h) / 2 },
      left: { x: r.x - gap - w, y: r.y + (r.h - h) / 2 },
    }[side];
    if (!at) { throw new Error(`${what}: unknown place.side "${side}"`); }
    return { ...at, w, h };
  }
  if ([o.x, o.y, o.w, o.h].every(Number.isFinite)) { return { x: o.x, y: o.y, w: o.w, h: o.h }; }
  throw new Error(`${what} "${o.id ?? ''}" has no position: pass a layout id, rect, x/y/w/h or place`);
}

function register(s, id, rect) {
  return s.reg.has(id) ? s.reg.get(id) : s.reg.add(id, rect);
}

const typeDur = (text, o) => o.typeDur ?? Math.max(0.5, String(text).length * 0.045);

/** Shape with fitted text. opts: id, text, at, dur, shape (round|rect|ellipse|pill), color, fill, font, px, type, overlap. */
export function node(s, o) {
  if (!o.id) { throw new Error('node needs an id'); }
  const rect = register(s, o.id, rectFor(s, o, 'node'));
  const text = o.text ?? '';
  const at = o.at ?? 0;
  const dur = o.dur ?? 0.6;
  const kind = o.shape ?? 'round';
  const stroke = o.color ?? 'accent';
  // Big nodes (a scaled layout) get bigger text: up to 1.7x the style's node size, about 28 % of the node height.
  const nodePx = s.style.defaults.nodePx;
  const fit = fitFor(s, text, rect, o, { px: Math.max(nodePx, Math.min(nodePx * 1.7, rect.h * 0.28)) });
  const typeAt = o.typeAt ?? at + dur * 0.6;
  const td = typeDur(text, o);
  const appear = t => ease.out(prog(t, at, dur));
  return {
    kind: 'node',
    id: o.id,
    z: o.z ?? 0,
    rect,
    texts: () => [text],
    draw(api, t) {
      const p = appear(t);
      if (p <= 0) { return; }
      const { ctx } = api;
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      ctx.translate(cx, cy);
      ctx.scale(lerp(0.92, 1, p), lerp(0.92, 1, p));
      ctx.translate(-cx, -cy);
      api.style.shape(api, rect, { kind, p, stroke, fill: o.fill === undefined ? 'panel' : o.fill, lw: s.style.defaults.lw, seed: hash(o.id) });
      const tp = o.type ? prog(t, typeAt, td) : clamp((p - 0.35) / 0.65);
      if (tp > 0) { drawTextBlock(api, fit, rect, { role: o.font ?? 'body', weight: o.weight, color: o.textColor ?? 'ink', p: o.type ? tp : 1, alpha: o.type ? 1 : tp }); }
    },
    qa: (api, t) => ({ rect, alpha: appear(t), texts: [{ text, rect: blockBox(fit, rect), overflow: fit.overflow, px: fit.px }], overlap: o.overlap, overlapWith: o.overlapWith }),
  };
}

/** Arrow between two registered ids that draws itself. opts: from, to (ids), fromAnchor, toAnchor, route, gap, at, dur, color, head, dash. */
export function edge(s, o) {
  if (!o.from || !o.to) { throw new Error('edge needs from and to ids'); }
  const id = o.id ?? `${o.from}->${o.to}`;
  const conn = s.reg.connect(o.from, o.to, { from: o.fromAnchor, to: o.toAnchor, route: o.route, gap: o.gap });
  const at = o.at ?? 0;
  const dur = o.dur ?? 0.8;
  const xs = conn.pts.map(q => q[0]);
  const ys = conn.pts.map(q => q[1]);
  const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  const lw = o.lw ?? s.style.defaults.lw + 1;
  return {
    kind: 'edge',
    id,
    z: o.z ?? -0.5,
    rect: box,
    conn,
    texts: () => [],
    draw(api, t) {
      const p = ease.inOut(prog(t, at, dur));
      api.style.line(api, conn.pts, { p, color: o.color ?? 'dim', lw, head: o.head ?? true, dash: o.dash, seed: hash(id) });
    },
    qa: (api, t) => ({ rect: box, alpha: ease.inOut(prog(t, at, dur)), texts: [], overlap: true }),
  };
}

/** Free text. opts: id?, text, rect | x/y/w/h | place {to, side, gap}, at, dur, px, font, align, color, type. */
export function label(s, o) {
  const id = o.id ?? s.uid('label');
  const rect = register(s, id, rectFor(s, { ...o, id: undefined }, 'label'));
  const text = o.text ?? '';
  const at = o.at ?? 0;
  const dur = o.dur ?? 0.5;
  const align = o.align ?? 'center';
  const fit = fitFor(s, text, rect, o, { px: s.style.defaults.labelPx });
  const td = typeDur(text, o);
  const typeAt = o.typeAt ?? at;
  const vis = t => (o.type ? (prog(t, typeAt, td) > 0 ? 1 : 0) : ease.out(prog(t, at, dur)));
  return {
    kind: 'label',
    id,
    z: o.z ?? 1,
    rect,
    texts: () => [text],
    draw(api, t) {
      const v = vis(t);
      if (v <= 0) { return; }
      drawTextBlock(api, fit, rect, { align, role: o.font ?? 'body', weight: o.weight, color: o.color ?? 'ink', p: o.type ? prog(t, typeAt, td) : 1, alpha: o.type ? 1 : v, pad: 0 });
    },
    qa: (api, t) => ({ rect, alpha: vis(t), texts: [{ text, rect: blockBox(fit, rect, align), overflow: fit.overflow, px: fit.px }], overlap: o.overlap, overlapWith: o.overlapWith }),
  };
}

/** Frame around registered ids. opts: id, children (ids), pad, title, at, dur, color. Drawn behind its children. */
export function group(s, o) {
  if (!o.id || !o.children?.length) { throw new Error('group needs an id and children'); }
  const pad = o.pad ?? 28;
  const titleH = o.title ? 44 : 0;
  const u = union(o.children.map(id => s.reg.get(id)));
  const rect = register(s, o.id, { x: u.x - pad, y: u.y - pad - titleH, w: u.w + pad * 2, h: u.h + pad * 2 + titleH });
  const at = o.at ?? 0;
  const dur = o.dur ?? 0.7;
  const titleRect = { x: rect.x + 16, y: rect.y + 6, w: rect.w - 32, h: titleH - 6 };
  const fit = o.title ? fitFor(s, o.title, titleRect, { ...o, pad: 0 }, { px: s.style.defaults.labelPx * 0.8 }) : null;
  return {
    kind: 'group',
    id: o.id,
    z: o.z ?? -1,
    rect,
    contains: o.children,
    texts: () => (o.title ? [o.title] : []),
    draw(api, t) {
      const p = ease.out(prog(t, at, dur));
      if (p <= 0) { return; }
      api.style.shape(api, rect, { kind: 'round', p, stroke: o.color ?? 'dim', fill: null, lw: 2.5, dash: [14, 10], alpha: p, seed: hash(o.id) });
      if (fit) { drawTextBlock(api, fit, titleRect, { align: 'left', color: o.color ?? 'dim', alpha: p }); }
    },
    qa: (api, t) => ({
      rect,
      alpha: ease.out(prog(t, at, dur)),
      container: true,
      contains: o.children,
      texts: fit ? [{ text: o.title, rect: blockBox(fit, titleRect, 'left'), overflow: fit.overflow, px: fit.px }] : [],
    }),
  };
}

/** Code block in a panel. opts: id, lines (string | {text, color}), rect | place, at, dur, highlight [indexes], hlAt, type. */
export function code(s, o) {
  if (!o.id) { throw new Error('code needs an id'); }
  const rect = register(s, o.id, rectFor(s, o, 'code'));
  const at = o.at ?? 0;
  const dur = o.dur ?? 0.6;
  const lines = o.lines ?? [];
  const lay = layoutCode(s.ctx, lines, rect, { fontFor: px => s.style.font('mono', px), maxPx: o.px ?? s.style.defaults.codePx, minPx: s.style.defaults.minPx - 4, highlight: o.highlight ?? [] });
  const flat = lay.rows.map(r => r.text);
  const total = flat.reduce((n, l) => n + l.length, 0);
  const typeAt = o.typeAt ?? at + dur;
  const td = o.typeDur ?? Math.max(0.6, total * 0.03);
  const hlAt = o.hlAt ?? typeAt + td + 0.2;
  const panel = t => ease.out(prog(t, at, dur));
  return {
    kind: 'code',
    id: o.id,
    z: o.z ?? 0,
    rect,
    texts: () => flat,
    draw(api, t) {
      const p = panel(t);
      if (p <= 0) { return; }
      api.style.shape(api, rect, { kind: 'round', p, stroke: o.color ?? 'dim', fill: 'panel', lw: 2.5, seed: hash(o.id) });
      const tp = o.type === false ? 1 : prog(t, typeAt, td);
      const shown = revealLines(flat, tp).shown;
      lay.rows.forEach((row, i) => {
        const y = rect.y + row.y;
        if (row.hl) { api.style.highlight(api, { x: rect.x + lay.pad / 2, y: y - lay.lineH / 2, w: rect.w - lay.pad, h: lay.lineH }, { p: prog(t, hlAt, 0.4) * (shown[i].length === row.text.length ? 1 : 0) }); }
        api.style.text(api, shown[i], rect.x + lay.pad, y, { px: lay.px, role: 'mono', color: row.color ?? 'ink', alpha: p });
      });
    },
    qa: (api, t) => ({
      rect,
      alpha: panel(t),
      container: true,
      texts: [{ text: flat.join('\n'), rect: { x: rect.x + lay.pad, y: rect.y + lay.pad, w: Math.min(lay.widest, rect.w - lay.pad * 2), h: flat.length * lay.lineH }, overflow: lay.overflow, px: lay.px }],
    }),
  };
}

export const basePieces = { node, edge, label, group, code };
