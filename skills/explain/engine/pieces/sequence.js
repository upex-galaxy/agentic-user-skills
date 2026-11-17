// `sequence`: actors as lifeline heads across the top, messages as arrows that draw in order.
// s.sequence({ actors: ['Cliente', 'API', { id: 'db', text: 'Base de datos' }],
//   messages: [{ from: 'Cliente', to: 'API', text: 'POST /login' }, { from: 'API', to: 'Cliente', text: '200 OK', kind: 'return' }],
//   activation: true, at: 0.3, step: 0.9 })
// Message kinds: 'sync' (solid, accent), 'async' (dashed, accent2), 'return' (dashed, dim). Layout comes from the area.
import { clamp, ease, hash, prog } from '../math.js';
import { label, node } from './base.js';
import { boxOf, lineItem } from './diagram-kit.js';

const KINDS = {
  sync: { color: 'accent', dash: null },
  async: { color: 'accent2', dash: [16, 10] },
  return: { color: 'dim', dash: [10, 9] },
};

/** Pure layout: where every head, lifeline and message row sits. Exported for tests. */
export function sequenceLayout({ actors, messages, area, headH = 90 }) {
  const n = actors.length;
  const cw = area.w / n;
  const headW = Math.min(300, cw - 40);
  const xs = actors.map((_, i) => area.x + cw * (i + 0.5));
  const heads = actors.map((a, i) => ({ id: a.id, x: xs[i], rect: { x: xs[i] - headW / 2, y: area.y, w: headW, h: headH } }));
  const top = area.y + headH + 46;
  const bottom = area.y + area.h - 16;
  const rowH = Math.min(120, (bottom - top) / Math.max(1, messages.length));
  const ys = messages.map((_, i) => top + rowH * (i + 0.5));
  return { cw, headW, xs, heads, ys, rowH, top, bottom };
}

export const sequence = (s, o) => {
  const pid = o.id ?? s.uid('seq');
  const area = o.area ?? s.area;
  const actors = (o.actors ?? []).map(a => (typeof a === 'string' ? { id: a, text: a } : { text: a.id, ...a }));
  if (actors.length < 2) { throw new Error('sequence needs at least two actors'); }
  const index = Object.fromEntries(actors.map((a, i) => [a.id, i]));
  const messages = (o.messages ?? []).map((m, i) => {
    for (const end of [m.from, m.to]) { if (!(end in index)) { throw new Error(`sequence message ${i}: unknown actor "${end}" (actors: ${actors.map(a => a.id).join(', ')})`); } }
    return { kind: 'sync', ...m };
  });
  const L = sequenceLayout({ actors, messages, area });
  const at0 = o.at ?? 0;
  const step = o.step ?? 0.9;
  const dur = o.msgDur ?? 0.6;
  const headEnd = at0 + 0.25 * (actors.length - 1) + 0.6;
  const tone = i => ['accent', 'accent2', 'good', 'warn'][i % 4];
  const msgAt = i => o.times?.[i] ?? headEnd + 0.2 + i * step;
  const handle = { heads: {}, messages: [], end: headEnd };

  actors.forEach((a, i) => {
    const at = at0 + 0.25 * i;
    s.add(node(s, { id: a.id, text: a.text, rect: L.heads[i].rect, at, color: a.color ?? tone(i), font: 'display', px: Math.round(s.style.defaults.nodePx * 0.8) }));
    s.add(lineItem(s, { id: `${pid}-life-${a.id}`, pts: [[L.xs[i], L.heads[i].rect.y + L.heads[i].rect.h], [L.xs[i], L.bottom]], at: at + 0.4, dur: 0.9, color: 'dim', head: false, dash: [8, 12], z: -0.8 }));
    handle.heads[a.id] = L.heads[i].rect;
  });

  // Activation bars: from a sync/async arrival until the next return that leaves the same actor (or one row later).
  const bars = [];
  if (o.activation) {
    messages.forEach((m, i) => {
      if (m.kind === 'return' || m.from === m.to) { return; }
      const j = messages.findIndex((r, k) => k > i && r.kind === 'return' && r.from === m.to);
      bars.push({ actor: m.to, from: i, to: j < 0 ? i : j, extra: j < 0 ? L.rowH * 0.6 : 0 });
    });
    for (const b of o.activations ?? []) { bars.push({ extra: 0, ...b }); }
  }
  const barW = 22;
  bars.forEach((b, k) => {
    const x = L.xs[index[b.actor]];
    const y0 = L.ys[b.from] - 4;
    const y1 = L.ys[b.to] + 4 + (b.extra ?? 0);
    const rect = { x: x - barW / 2, y: y0, w: barW, h: y1 - y0 };
    const at = msgAt(b.from) + dur * 0.5;
    const bdur = Math.max(0.4, msgAt(b.to) - at + dur * 0.5);
    const grow = t => ease.inOut(prog(t, at, bdur));
    s.add({
      kind: 'edge',
      id: `${pid}-act-${k}`,
      z: -0.2,
      rect,
      texts: () => [],
      draw(api, t) {
        const p = grow(t);
        if (p > 0) { api.style.shape(api, { ...rect, h: rect.h * p }, { kind: 'rect', p: 1, stroke: tone(index[b.actor]), fill: 'panel', lw: 2.5, seed: hash(`${pid}-act-${k}`) }); }
      },
      qa: (_api, t) => ({ rect, alpha: grow(t), texts: [], overlap: true }),
    });
  });

  messages.forEach((m, i) => {
    const kind = KINDS[m.kind];
    if (!kind) { throw new Error(`sequence message ${i}: unknown kind "${m.kind}" (use ${Object.keys(KINDS).join(', ')})`); }
    const id = `${pid}-m${i}`;
    const y = L.ys[i];
    const x0 = L.xs[index[m.from]];
    const x1 = L.xs[index[m.to]];
    const self = m.from === m.to;
    const at = msgAt(i);
    // Arrows stop at the activation bar edge when there is one, so heads do not hide behind it.
    const inset = o.activation ? barW / 2 : 0;
    const dir = x1 >= x0 ? 1 : -1;
    const pts = self
      ? [[x0 + inset, y - 4], [x0 + 70, y - 4], [x0 + 70, y + 30], [x0 + inset, y + 30]]
      : [[x0 + dir * inset, y], [x1 - dir * inset, y]];
    s.add(lineItem(s, { id, pts, at, dur, color: m.color ?? kind.color, dash: kind.dash, z: 0.2 }));
    if (m.text) {
      const lh = clamp(L.rowH * 0.5, 40, 64);
      const lw = self ? Math.min(360, L.cw - 100) : Math.abs(x1 - x0) - 44;
      const rect = self
        ? { x: x0 + 84, y: y - lh / 2 + 12, w: lw, h: lh }
        : { x: Math.min(x0, x1) + 22, y: y - lh - 6, w: lw, h: lh };
      s.add(label(s, { id: `${id}-text`, text: m.text, rect, at: at + 0.15, dur: 0.4, px: Math.round(s.style.defaults.labelPx * 0.72), pad: 0, color: m.kind === 'return' ? 'dim' : 'ink', align: 'center' }));
    }
    handle.messages.push({ id, y, at, box: boxOf(pts) });
    handle.end = Math.max(handle.end, at + dur);
  });
  return { kind: 'sequence', id: pid, z: -2, rect: area, handle, ...handle, texts: () => [], draw() {} };
};

export const pieces = { sequence };
