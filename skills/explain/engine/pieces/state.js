import { grid, nearestEdge, radial, row, union } from '../layout.js';
// `stateMachine`: states as rounded nodes, transitions as labeled curved arrows (self-loops too), and an
// active-state highlight that moves along a path over time.
// s.stateMachine({ states: ['Borrador', { id: 'review', text: 'En revisión' }, 'Publicado'],
//   transitions: [['Borrador', 'review', 'enviar'], ['review', 'Borrador', 'rechazar'], ['Publicado', 'Publicado', 'editar']],
//   path: ['Borrador', 'review', 'Publicado'], pathAt: 4, pathStep: 1.4, layout: 'auto' (default) | 'row' | 'grid' | 'ring', cols, at: 0.3 })
import { clamp, ease, prog } from '../math.js';
import { node } from './base.js';
import { boxOf, chipItem, chipSize, cubic, inflate, lineItem, pointAt, polyLen, quad } from './diagram-kit.js';

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
  const apex = (o.apex ?? (horizontal ? Math.max(a.h, b.h) / 2 + 50 : 0.2 * d + 40) + 0.12 * Math.max(0, d - 500)) * (o.apexScale ?? 1);
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
export function stateLayout(states, { area, layout, gap, positions, cols, size: boxSize }) {
  const n = states.length;
  const mode = layout && layout !== 'auto' ? layout : (n <= 4 ? 'row' : n <= 6 ? 'ring' : 'grid');
  const size = boxSize ?? (n <= 3 ? { w: 360, h: 170 } : { w: 290, h: 140 });
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
  if (mode === 'grid') { return snakeGrid(specs, { ...opts, gapX: 200, gapY: 150, cols }); }
  return row(specs, opts);
}

/** Grid in reading order that turns at the edge: row 2 runs right to left, so consecutive states stay neighbors. */
function snakeGrid(specs, opts) {
  const g = grid(specs, opts);
  const cols = opts.cols ?? Math.ceil(Math.sqrt(specs.length));
  const cx = specs.slice(0, cols).map(sp => g.rects[sp.id].x + g.rects[sp.id].w / 2);
  const rects = {};
  specs.forEach((sp, n) => {
    const c = n % cols;
    const r = g.rects[sp.id];
    rects[sp.id] = Math.floor(n / cols) % 2 ? { ...r, x: cx[cols - 1 - c] - r.w / 2 } : r;
  });
  return { ...g, rects, bounds: union(Object.values(rects)) };
}

const boxHits = (pts, r, pad = 6) => pts.some(q => q[0] > r.x - pad && q[0] < r.x + r.w + pad && q[1] > r.y - pad && q[1] < r.y + r.h + pad);
const clashRect = (a, b, m = 8) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;

/** Number of places where two polylines cross. */
function crossings(p, q) {
  const side = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  let n = 0;
  for (let i = 1; i < p.length; i++) {
    for (let j = 1; j < q.length; j++) {
      if (side(p[i - 1], p[i], q[j - 1]) !== side(p[i - 1], p[i], q[j]) && side(q[j - 1], q[j], p[i - 1]) !== side(q[j - 1], q[j], p[i])) { n++; }
    }
  }
  return n;
}

/**
 * Pure: route every transition around the states. Tries the default arc, the mirrored one and wider ones and keeps the cheapest:
 * crossing a state, crossing an arc already routed, a label (`sizes[i]` = { w, h }) on top of another label or a state, and
 * bowing into the middle of the layout all cost. A pair A->B / B->A therefore stays apart and a ring bows outward. Returns [{ pts, mid }].
 */
export function routeTransitions(rects, trs, sizes = []) {
  const all = Object.values(rects);
  const bb = union(all);
  const bcx = bb.x + bb.w / 2;
  const bcy = bb.y + bb.h / 2;
  const done = [];
  return trs.map((tr, i) => {
    const a = rects[tr.from];
    const b = rects[tr.to];
    const self = tr.from === tr.to;
    const others = all.filter(r => r !== a && r !== b);
    const down = self && center(a)[1] > bcy + 20;
    const tries = self
      ? [{ down }, { down: !down }]
      : [{ flip: tr.flip }, { flip: !tr.flip }, { flip: tr.flip, apexScale: 1.7 }, { flip: !tr.flip, apexScale: 1.7 }, { flip: tr.flip, apexScale: 2.6 }, { flip: !tr.flip, apexScale: 2.6 }];
    let best = null;
    for (const t of tries) {
      const r = transitionPath(a, b, t);
      const sz = sizes[i];
      const chip = sz ? { x: r.mid[0] - sz.w / 2, y: r.mid[1] - sz.h / 2, w: sz.w, h: sz.h } : null;
      let cost = others.filter(o => boxHits(r.pts, o)).length * 2;
      cost += done.filter(d => (d.mid[0] - r.mid[0]) ** 2 + (d.mid[1] - r.mid[1]) ** 2 < 1600).length;
      cost += done.reduce((n, d) => n + Math.min(2, crossings(r.pts, d.pts)), 0) * 1.5;
      if (chip) { cost += done.filter(d => d.chip && clashRect(chip, d.chip)).length * 2 + all.filter(o => clashRect(chip, o, 4)).length; }
      if (!self && Math.hypot(r.mid[0] - bcx, r.mid[1] - bcy) < Math.hypot((center(a)[0] + center(b)[0]) / 2 - bcx, (center(a)[1] + center(b)[1]) / 2 - bcy)) { cost += 0.3; }
      if (!best || cost < best.cost) { best = { cost, r: { ...r, chip } }; }
      if (!cost) { break; }
    }
    done.push(best.r);
    return { pts: best.r.pts, mid: best.r.mid };
  });
}

const scaleRect = (r, f) => ({ x: r.x * f, y: r.y * f, w: r.w * f, h: r.h * f });

/** Pure: the base layout of one mode, scaled so states plus routed arcs fill the area, and centered. Returns { rects, arcs, bounds, f }. */
export function planStates(states, trs, area, mode, o = {}) {
  const sizes = o.sizes ?? [];
  const base = stateLayout(states, { area: null, layout: mode, gap: o.gap, cols: o.cols, size: o.size }).rects;
  const make = (f) => {
    const rects = {};
    for (const [id, r] of Object.entries(base)) { rects[id] = scaleRect(r, f); }
    const arcs = routeTransitions(rects, trs, sizes);
    const b = union([...Object.values(rects), ...arcs.map(a => boxOf(a.pts))]);
    return { rects, arcs, b };
  };
  let f = 1;
  let m = make(f);
  for (let i = 0; i < 6; i++) {
    const g = Math.min(area.w / m.b.w, area.h / m.b.h);
    f = clamp(f * g * 0.985, 0.4, 1.6);
    m = make(f);
  }
  const dx = area.x + (area.w - m.b.w) / 2 - m.b.x;
  const dy = area.y + (area.h - m.b.h) / 2 - m.b.y;
  const shift = r => ({ ...r, x: r.x + dx, y: r.y + dy });
  const rects = Object.fromEntries(Object.entries(m.rects).map(([id, r]) => [id, shift(r)]));
  const arcs = m.arcs.map(a => ({ pts: a.pts.map(q => [q[0] + dx, q[1] + dy]), mid: [a.mid[0] + dx, a.mid[1] + dy] }));
  return { rects, arcs, bounds: shift(m.b), f };
}

/**
 * Pure: the layout "auto" picks. Every candidate (row, two or three snake rows, ring) is scored by how big its nodes come out times
 * how much of the area height it uses (full credit from 60 %); the one-row layout stays unless an alternative scores over 10 % better. Returns the plan plus its `mode`.
 */
export function autoStatePlan(states, trs, area, o = {}) {
  const n = states.length;
  const cands = [{ mode: 'row' }];
  // A ring puts a two-way pair on one short chord, which crowds both arcs; the other layouts keep them on opposite sides.
  const twoWay = trs.some(a => a.from !== a.to && trs.some(b => b.from === a.to && b.to === a.from));
  if (n >= 3 && !twoWay) { cands.push({ mode: 'ring' }); }
  if (n >= 4) { cands.push({ mode: 'grid', cols: Math.ceil(n / 2) }); }
  if (n >= 7) { cands.push({ mode: 'grid', cols: Math.ceil(n / 3) }); }
  // Auto layouts use taller nodes than the one-row default, so the text grows with the height they gain.
  const size = n <= 3 ? { w: 380, h: 210 } : n <= 5 ? { w: 300, h: 190 } : { w: 280, h: 170 };
  const plans = cands.map(c => ({ ...c, ...planStates(states, trs, area, c.mode, { ...o, cols: c.cols, size, gap: c.mode === 'row' ? 200 : o.gap }) }));
  // Nodes size and height share together: a layout that is big but a thin strip does not win.
  const score = p => p.f * Math.min(1, p.bounds.h / (area.h * 0.6));
  const best = plans.reduce((x, p) => (score(p) > score(x) ? p : x));
  return score(plans[0]) >= score(best) * 0.9 ? plans[0] : best;
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
  const trs = (o.transitions ?? []).map(raw => (Array.isArray(raw) ? { from: raw[0], to: raw[1], label: raw[2] } : raw));
  const ids = new Set(states.map(st => st.id));
  trs.forEach((tr, i) => {
    for (const end of [tr.from, tr.to]) { if (!ids.has(end)) { throw new Error(`stateMachine transition ${i}: unknown state "${end}"`); } }
  });
  const sizes = trs.map(tr => (tr.label ? chipSize(s, tr.label) : null));
  const auto = !o.positions && (!o.layout || o.layout === 'auto');
  let L;
  let routed;
  if (auto) {
    const plan = autoStatePlan(states, trs, area, { gap: o.gap, sizes });
    L = { rects: plan.rects, bounds: plan.bounds, mode: plan.mode };
    routed = plan.arcs;
  }
  else {
    L = stateLayout(states, { area, layout: o.layout, gap: o.gap, positions: o.positions, cols: o.cols });
    routed = routeTransitions(L.rects, trs, sizes);
  }
  s.reg.addAll(L.rects);
  const at0 = o.at ?? 0;
  const nodeStep = o.nodeStep ?? 0.25;
  const tAt = at0 + nodeStep * states.length + 0.2;
  const tStep = o.transitionStep ?? 0.5;
  const tone = i => ['accent', 'accent2', 'good', 'warn'][i % 4];
  states.forEach((st, i) => s.add(node(s, { id: st.id, text: st.text, at: at0 + nodeStep * i, color: st.color ?? tone(i), shape: 'round' })));

  const arcs = trs.map((tr, i) => ({ tr, ...routed[i] }));
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
