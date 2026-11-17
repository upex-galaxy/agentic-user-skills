import { grid, nearestEdge, radial, row, union } from '../layout.js';
// `stateMachine`: states as rounded nodes, transitions as labeled curved arrows (self-loops too), and an
// active-state highlight that moves along a path over time.
// s.stateMachine({ states: ['Borrador', { id: 'review', text: 'En revisión' }, 'Publicado'],
//   transitions: [['Borrador', 'review', 'enviar'], ['review', 'Borrador', 'rechazar'], ['Publicado', 'Publicado', 'editar']],
//   path: ['Borrador', 'review', 'Publicado'], pathAt: 4, pathStep: 1.4, layout: 'row' | 'ring' | 'grid', at: 0.3 })
import { clamp, ease, prog } from '../math.js';
import { node } from './base.js';
import { chipItem, chipSize, cubic, inflate, lineItem, pointAt, polyLen, quad } from './diagram-kit.js';

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

const LABEL_STEPS = [0.5, 0.38, 0.62, 0.28, 0.72, 0.2, 0.8, 0.12, 0.88];

/**
 * Pure: a center for every transition label, slid along its own curve until its pill clears the labels already
 * placed and every state. `arcs` is [{ pts, mid, size: { w, h }, fixed }] (a fixed arc, such as a self-loop, keeps its
 * apex). Returns one [x, y] per arc; when nothing is free the least-crowded spot on the curve wins.
 */
export function placeTransitionLabels(arcs, states, bounds) {
  const placed = [];
  const rectAt = (c, size) => ({ x: c[0] - size.w / 2, y: c[1] - size.h / 2, w: size.w, h: size.h });
  const clash = (a, b, m) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
  return arcs.map((arc) => {
    if (!arc.size) { return arc.mid; }
    const cands = arc.fixed
      ? [arc.mid]
      : LABEL_STEPS.map((p) => {
          const q = pointAt(arc.pts, p);
          return [q.x, q.y];
        });
    let best = null;
    for (const c of cands) {
      const r = rectAt([clamp(c[0], bounds.x + arc.size.w / 2, bounds.x + bounds.w - arc.size.w / 2), clamp(c[1], bounds.y + arc.size.h / 2, bounds.y + bounds.h - arc.size.h / 2)], arc.size);
      const hits = placed.filter(p => clash(r, p, 8)).length * 2 + states.filter(st => clash(r, st, 4)).length;
      if (!best || hits < best.hits) { best = { hits, c, r }; }
      if (!hits) { break; }
    }
    placed.push(best.r);
    return best.c;
  });
}

/** Pure: state layout. Returns { rects, bounds }. */
export function stateLayout(states, { area, layout, gap, positions }) {
  const n = states.length;
  const mode = layout ?? (n <= 4 ? 'row' : n <= 6 ? 'ring' : 'grid');
  const size = n <= 3 ? { w: 360, h: 170 } : { w: 290, h: 140 };
  const specs = states.map(st => ({ id: st.id, w: st.w ?? size.w, h: st.h ?? size.h }));
  if (positions) {
    const rects = {};
    for (const sp of specs) {
      const [fx, fy] = positions[sp.id];
      rects[sp.id] = { x: area.x + fx * area.w - sp.w / 2, y: area.y + fy * area.h - sp.h / 2, w: sp.w, h: sp.h };
    }
    return { rects, bounds: union(Object.values(rects)) };
  }
  const opts = { area, gap: gap ?? (mode === 'row' ? 250 : 120) };
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
  const labelAt = placeTransitionLabels(arcs.map(a => ({ pts: a.pts, mid: a.mid, fixed: a.tr.from === a.tr.to, size: a.tr.label ? chipSize(s, a.tr.label) : null })), Object.values(L.rects), area);
  arcs.forEach(({ tr, pts }, i) => {
    const at = tAt + tStep * i;
    s.add(lineItem(s, { id: `${pid}-t${i}`, pts, at, dur: 0.6, color: tr.color ?? 'ink', z: -0.5 }));
    if (tr.label) { s.add(chipItem(s, { id: `${pid}-t${i}-label`, text: tr.label, center: labelAt[i], at: at + 0.35, color: tr.color ?? 'dim', bounds: area })); }
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
