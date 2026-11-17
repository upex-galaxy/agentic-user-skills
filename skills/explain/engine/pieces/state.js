import { grid, nearestEdge, radial, row, union } from '../layout.js';
// `stateMachine`: states as rounded nodes, transitions as labeled curved arrows (self-loops too), and an
// active-state highlight that moves along a path over time.
// s.stateMachine({ states: ['Borrador', { id: 'review', text: 'En revisión' }, 'Publicado'],
//   transitions: [['Borrador', 'review', 'enviar'], ['review', 'Borrador', 'rechazar'], ['Publicado', 'Publicado', 'editar']],
//   path: ['Borrador', 'review', 'Publicado'], pathAt: 4, pathStep: 1.4, layout: 'row' | 'ring' | 'grid', at: 0.3 })
import { clamp, ease, prog } from '../math.js';
import { node } from './base.js';
import { chipItem, cubic, inflate, lineItem, pointAt, polyLen, quad } from './diagram-kit.js';

const center = r => [r.x + r.w / 2, r.y + r.h / 2];

/** Trim `d` px off both ends of a polyline and resample it (keeps arrow heads clear of the borders). */
export function trimmed(pts, d = 9, n = 28) {
  const len = polyLen(pts);
  if (len < d * 4) { return pts; }
  const a = d / len;
  return Array.from({ length: n + 1 }, (_, i) => {
    const q = pointAt(pts, a + (1 - 2 * a) * (i / n));
    return [q.x, q.y];
  });
}

/**
 * Pure: the path of one transition. Self-loops arch over (or under) the node; others bow to the left of their
 * direction, so a pair A->B / B->A forms two separate arcs. Returns { pts, mid } (mid: the arc's apex).
 */
export function transitionPath(a, b, o = {}) {
  if (a === b || (a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h)) {
    const down = o.down === true;
    const dir = down ? 1 : -1;
    const lh = o.loop ?? 74;
    const y = down ? a.y + a.h : a.y;
    const cx = a.x + a.w / 2;
    const p0 = [cx - a.w * 0.2, y];
    const p1 = [cx + a.w * 0.2, y];
    const c1 = [cx - a.w * 0.42, y + dir * lh * 1.55];
    const c2 = [cx + a.w * 0.42, y + dir * lh * 1.55];
    const pts = cubic(p0, c1, c2, p1);
    return { pts, mid: [cx, y + dir * lh * 1.16] };
  }
  const ca = center(a);
  const cb = center(b);
  const d = Math.hypot(cb[0] - ca[0], cb[1] - ca[1]) || 1;
  const dir = [(cb[0] - ca[0]) / d, (cb[1] - ca[1]) / d];
  const perp = [-dir[1], dir[0]];
  const horizontal = Math.abs(cb[0] - ca[0]) >= Math.abs(cb[1] - ca[1]);
  // Apex offset: clear the node height so a label sitting on the arc does not cover the nodes.
  const apex = o.apex ?? (horizontal ? Math.max(a.h, b.h) / 2 + 50 : 0.2 * d + 40) + 0.12 * Math.max(0, d - 500);
  const sign = o.flip ? -1 : 1;
  const mid = [(ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2];
  const ctrl = [mid[0] + perp[0] * apex * 2 * sign, mid[1] + perp[1] * apex * 2 * sign];
  const p0 = nearestEdge(a, ctrl);
  const p1 = nearestEdge(b, ctrl);
  const pts = trimmed(quad(p0, ctrl, p1));
  const apexPt = pointAt(pts, 0.5);
  return { pts, mid: [apexPt.x, apexPt.y] };
}

/** Pure: state layout. Returns { rects, bounds }. */
export function stateLayout(states, { area, layout, gap, positions }) {
  const n = states.length;
  const mode = layout ?? (n <= 4 ? 'row' : n <= 6 ? 'ring' : 'grid');
  const size = n <= 3 ? { w: 320, h: 130 } : { w: 270, h: 120 };
  const specs = states.map(st => ({ id: st.id, w: st.w ?? size.w, h: st.h ?? size.h }));
  if (positions) {
    const rects = {};
    for (const sp of specs) {
      const [fx, fy] = positions[sp.id];
      rects[sp.id] = { x: area.x + fx * area.w - sp.w / 2, y: area.y + fy * area.h - sp.h / 2, w: sp.w, h: sp.h };
    }
    return { rects, bounds: union(Object.values(rects)) };
  }
  const opts = { area, gap: gap ?? (mode === 'row' ? 230 : 120) };
  if (mode === 'ring') { return radial(specs, { ...opts, aspect: 1.8 }); }
  if (mode === 'grid') { return grid(specs, { ...opts, gapX: 200, gapY: 150 }); }
  return row(specs, opts);
}

/** Pure: which states are lit at time t and where the traveling dot is. `legs[k]` is the arc into path[k] (k >= 1). */
export function activeAt(t, { path, T0, step, tdur, legs }) {
  const lit = path.map((id, k) => {
    const into = k === 0 ? prog(t, T0 - 0.4, 0.4) : prog(t, T0 + k * step - tdur, tdur);
    const out = k + 1 < path.length ? prog(t, T0 + (k + 1) * step - tdur, tdur) : 0;
    return { id, alpha: clamp(into * (1 - out)) };
  });
  let travel = null;
  for (let k = 1; k < path.length; k++) {
    const q = prog(t, T0 + k * step - tdur, tdur);
    if (q > 0 && q < 1) { travel = { k, q, pts: legs[k], ...pointAt(legs[k], ease.inOut(q)) }; }
  }
  return { lit, travel };
}

export const stateMachine = (s, o) => {
  const pid = o.id ?? s.uid('state');
  const area = o.area ?? s.area;
  const states = (o.states ?? []).map(st => (typeof st === 'string' ? { id: st, text: st } : { text: st.id, ...st }));
  if (!states.length) { throw new Error('stateMachine needs states'); }
  const L = stateLayout(states, { area, layout: o.layout, gap: o.gap, positions: o.positions });
  s.reg.addAll(L.rects);
  const at0 = o.at ?? 0;
  const nodeStep = o.nodeStep ?? 0.25;
  const tAt = at0 + nodeStep * states.length + 0.2;
  const tStep = o.transitionStep ?? 0.5;
  const tone = i => ['accent', 'accent2', 'good', 'warn'][i % 4];
  states.forEach((st, i) => s.add(node(s, { id: st.id, text: st.text, at: at0 + nodeStep * i, color: st.color ?? tone(i), shape: 'round' })));

  const bcy = L.bounds.y + L.bounds.h / 2;
  const trs = (o.transitions ?? []).map(raw => (Array.isArray(raw) ? { from: raw[0], to: raw[1], label: raw[2] } : raw));
  const arcs = trs.map((tr, i) => {
    for (const end of [tr.from, tr.to]) { if (!L.rects[end]) { throw new Error(`stateMachine transition ${i}: unknown state "${end}"`); } }
    const a = L.rects[tr.from];
    const b = L.rects[tr.to];
    const self = tr.from === tr.to;
    return { tr, ...transitionPath(a, b, { down: self && center(a)[1] > bcy + 20, flip: tr.flip }) };
  });
  arcs.forEach(({ tr, pts, mid }, i) => {
    const at = tAt + tStep * i;
    s.add(lineItem(s, { id: `${pid}-t${i}`, pts, at, dur: 0.6, color: tr.color ?? 'ink', z: -0.5 }));
    if (tr.label) { s.add(chipItem(s, { id: `${pid}-t${i}-label`, text: tr.label, center: mid, at: at + 0.35, color: tr.color ?? 'dim', bounds: area })); }
  });

  const handle = { states: L.rects, arcs: arcs.map(a => a.pts), end: tAt + tStep * arcs.length };
  const path = o.path ?? [];
  if (path.length) {
    for (const id of path) { if (!L.rects[id]) { throw new Error(`stateMachine path: unknown state "${id}"`); } }
    const step = o.pathStep ?? 1.4;
    const tdur = Math.min(0.9, step * 0.6);
    const T0 = o.pathAt ?? handle.end + 0.4;
    const legs = path.map((id, k) => {
      if (k === 0) { return null; }
      const hit = arcs.find(a => a.tr.from === path[k - 1] && a.tr.to === id);
      if (hit) { return hit.pts; }
      const a = L.rects[path[k - 1]];
      const b = L.rects[id];
      return [nearestEdge(a, center(b)), nearestEdge(b, center(a))];
    });
    const color = o.activeColor ?? 'warn';
    s.add({
      kind: 'fx',
      id: `${pid}-active`,
      z: 1.1,
      texts: () => [],
      draw(api, t) {
        const { lit, travel } = activeAt(t, { path, T0, step, tdur, legs });
        for (const { id, alpha } of lit) {
          if (alpha > 0) { api.style.shape(api, inflate(L.rects[id], 9), { kind: 'round', p: 1, stroke: color, fill: null, lw: s.style.defaults.lw + 2, glow: 24, alpha, seed: 17 }); }
        }
        if (travel) {
          api.style.line(api, travel.pts, { p: travel.q, color, lw: s.style.defaults.lw + 2, head: false, seed: 21 });
          api.style.shape(api, { x: travel.x - 15, y: travel.y - 15, w: 30, h: 30 }, { kind: 'ellipse', p: 1, stroke: color, fill: color, lw: 2, glow: 18, seed: 5 });
        }
      },
    });
    handle.pathEnd = T0 + (path.length - 1) * step;
    handle.legs = legs;
  }
  return { kind: 'stateMachine', id: `${pid}-handle`, z: -2, rect: area, ...handle, texts: () => [], draw() {} };
};

export const pieces = { stateMachine };
