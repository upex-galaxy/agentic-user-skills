import { nearestEdge } from '../layout.js';
// `anatomy`: an object drawn from simple shapes, with numbered callouts and leader lines pointing to its parts.
// s.anatomy({ id: 'phone', aspect: 0.55,
//   parts: [{ id: 'body', shape: 'round', x: 0, y: 0, w: 1, h: 1 }, { id: 'screen', x: 0.08, y: 0.1, w: 0.84, h: 0.7, color: 'accent2' }],
//   labels: [{ part: 'screen', text: 'Pantalla' }, { part: 'body', text: 'Carcasa' }], at: 0.3 })
// Part coordinates are fractions (0..1) of the object box. Instead of parts you may pass draw(api, box, p, t) and give
// each label a `target: { x, y, w, h }` in the same fractions. Labels go left or right of the object, spread to avoid overlap.
import { clamp, ease, hash, prog } from '../math.js';
import { node } from './base.js';
import { blockRect, boxOf, drawFit, fitIn, lineItem, TOKENS } from './diagram-kit.js';

const BADGE = 58;
const LABEL_H = 104;

const toWorld = (box, u) => ({ x: box.x + u.x * box.w, y: box.y + u.y * box.h, w: u.w * box.w, h: u.h * box.h });

/** Pure: assign each label a side and a vertical slot. targets: [{ cx, cy }] in world coordinates. */
export function placeLabels({ targets, sides = [], box, column, gap = 14 }) {
  const mid = box.x + box.w / 2;
  const side = targets.map((t, i) => sides[i] ?? (t.cx < mid ? 'left' : 'right'));
  const count = n => side.filter(x => x === n).length;
  // Balance the columns: move the free label closest to the middle until the sides differ by at most two.
  while (Math.abs(count('left') - count('right')) > 2) {
    const from = count('left') > count('right') ? 'left' : 'right';
    const free = side.map((sd, i) => ({ i, sd })).filter(x => x.sd === from && !sides[x.i]).sort((a, b) => Math.abs(targets[a.i].cx - mid) - Math.abs(targets[b.i].cx - mid));
    if (!free.length) { break; }
    side[free[0].i] = from === 'left' ? 'right' : 'left';
  }
  const slots = Array.from({ length: targets.length });
  for (const sd of ['left', 'right']) {
    const idx = side.map((x, i) => (x === sd ? i : -1)).filter(i => i >= 0).sort((a, b) => targets[a].cy - targets[b].cy);
    let prev = column.y - LABEL_H - gap;
    for (const i of idx) {
      const y = Math.max(targets[i].cy - LABEL_H / 2, prev + LABEL_H + gap);
      slots[i] = y;
      prev = y;
    }
    // Pull the stack back up when it ran past the bottom of the column.
    let limit = column.y + column.h - LABEL_H;
    for (const i of [...idx].reverse()) {
      slots[i] = Math.min(slots[i], limit);
      limit = slots[i] - LABEL_H - gap;
    }
  }
  return side.map((sd, i) => ({ side: sd, y: slots[i] }));
}

export const anatomy = (s, o) => {
  const id = o.id ?? s.uid('anatomy');
  const area = o.area ?? s.area;
  const at0 = o.at ?? 0;
  const parts = o.parts ?? [];
  const labels = (o.labels ?? []).map((l, i) => ({ n: i + 1, ...l }));
  const h = Math.min(area.h * 0.92, o.maxH ?? 700, (area.w * 0.4) / (o.aspect ?? 1));
  const w = h * (o.aspect ?? 1);
  const box = { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h };
  s.reg.add(id, box);
  const partStep = o.partStep ?? 0.14;
  const objEnd = at0 + partStep * Math.max(1, parts.length) + 0.7;

  if (o.draw) {
    const k = t => ease.out(prog(t, at0, 0.8));
    s.add({
      kind: 'node',
      id: `${id}.object`,
      z: 0,
      rect: box,
      texts: () => [],
      draw(api, t) {
        const p = k(t);
        if (p > 0) { o.draw(api, box, p, t); }
      },
      qa: (_api, t) => ({ rect: box, alpha: k(t), texts: [], overlap: true }),
    });
  }
  parts.forEach((p, i) => {
    const rect = toWorld(box, p);
    const pid = `${id}.${p.id}`;
    s.reg.add(pid, rect);
    const at = at0 + partStep * i;
    const fit = p.text ? fitIn(s, p.text, rect, { px: p.px ?? s.style.defaults.nodePx, pad: 8 }) : null;
    const k = t => ease.out(prog(t, at, 0.5));
    s.add({
      kind: 'node',
      id: pid,
      z: i * 0.001,
      rect,
      texts: () => (p.text ? [p.text] : []),
      draw(api, t) {
        const a = k(t);
        if (a <= 0) { return; }
        api.style.shape(api, rect, { kind: p.shape ?? 'round', p: a, stroke: p.color ?? TOKENS[i % TOKENS.length], fill: p.fill === undefined ? 'panel' : p.fill, lw: s.style.defaults.lw, seed: hash(pid) });
        if (fit) { drawFit(api, fit, rect, { alpha: clamp((a - 0.4) / 0.6), color: p.textColor ?? 'ink' }); }
      },
      qa: (_api, t) => ({ rect, alpha: k(t), texts: fit ? [{ text: p.text, rect: blockRect(fit, rect), overflow: fit.overflow, px: fit.px }] : [], overlap: true }),
    });
  });

  const targets = labels.map((l) => {
    if (l.target) { return toWorld(box, l.target); }
    if (!s.reg.has(`${id}.${l.part}`)) { throw new Error(`anatomy label ${l.n}: unknown part "${l.part}" (parts: ${parts.map(p => p.id).join(', ')})`); }
    return s.reg.get(`${id}.${l.part}`);
  });
  const colW = Math.min(o.labelW ?? 520, (area.w - box.w) / 2 - 90);
  const spots = placeLabels({ targets: targets.map(r => ({ cx: r.x + r.w / 2, cy: r.y + r.h / 2 })), sides: labels.map(l => l.side), box, column: area });
  const step = o.step ?? 0.9;
  const handle = { box, labels: [], end: objEnd };
  labels.forEach((l, i) => {
    const { side, y } = spots[i];
    const at = l.at ?? objEnd + i * step;
    const left = side === 'left';
    const colX = left ? box.x - 90 - colW : box.x + box.w + 90;
    const badge = { x: left ? colX + colW - BADGE : colX, y: y + (LABEL_H - BADGE) / 2, w: BADGE, h: BADGE };
    const textRect = { x: left ? colX : colX + BADGE + 18, y, w: colW - BADGE - 18, h: LABEL_H };
    const color = l.color ?? TOKENS[i % TOKENS.length];
    const lid = `${id}.label${l.n}`;
    s.reg.add(lid, textRect);
    const fit = fitIn(s, l.text ?? '', textRect, { px: Math.round(s.style.defaults.labelPx * 0.8), pad: 0 });
    const k = t => ease.out(prog(t, at + 0.35, 0.5));
    const from = [left ? badge.x + BADGE : badge.x, badge.y + BADGE / 2];
    const tr = targets[i];
    const edge = nearestEdge(tr, from);
    const center = [tr.x + tr.w / 2, tr.y + tr.h / 2];
    const tip = [edge[0] + (center[0] - edge[0]) * 0.18, edge[1] + (center[1] - edge[1]) * 0.18];
    s.add(lineItem(s, { id: `${id}.leader${l.n}`, pts: [from, tip], at, dur: 0.5, color, head: false, z: 1 }));
    s.add({
      kind: 'edge',
      id: `${id}.dot${l.n}`,
      z: 1.1,
      rect: { x: tip[0] - 9, y: tip[1] - 9, w: 18, h: 18 },
      texts: () => [],
      draw(api, t) {
        const p = ease.out(prog(t, at + 0.4, 0.3));
        if (p > 0) { api.style.shape(api, { x: tip[0] - 8 * p, y: tip[1] - 8 * p, w: 16 * p, h: 16 * p }, { kind: 'ellipse', p: 1, stroke: color, fill: color, lw: 1.5, glow: 8, seed: 4 }); }
      },
      qa: (_api, t) => ({ rect: { x: tip[0] - 9, y: tip[1] - 9, w: 18, h: 18 }, alpha: ease.out(prog(t, at + 0.4, 0.3)), texts: [], overlap: true }),
    });
    s.add(node(s, { id: `${id}.badge${l.n}`, text: String(l.n), rect: badge, shape: 'ellipse', at, dur: 0.4, color, px: 34, font: 'display', pad: 8 }));
    s.add({
      kind: 'label',
      id: lid,
      z: 1.2,
      rect: textRect,
      texts: () => [l.text ?? ''],
      draw(api, t) {
        const p = k(t);
        if (p > 0) { drawFit(api, fit, textRect, { align: left ? 'right' : 'left', alpha: p }); }
      },
      qa: (_api, t) => ({ rect: textRect, alpha: k(t), texts: [{ text: l.text ?? '', rect: blockRect(fit, textRect, left ? 'right' : 'left'), overflow: fit.overflow, px: fit.px }] }),
    });
    handle.labels.push({ n: l.n, side, badge, textRect, tip, box: boxOf([from, tip]) });
    handle.end = Math.max(handle.end, at + 0.9);
  });
  return { kind: 'anatomy', id: `${id}-handle`, z: -2, rect: box, ...handle, texts: () => [], draw() {} };
};

export const pieces = { anatomy };
