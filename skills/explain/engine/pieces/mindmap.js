import { nearestEdge, rectCenter } from '../layout.js';
// mindMap: radial map. A hub in the middle, branches on an ellipse around it, an optional second level on a wider
// ellipse, all joined by curved connectors that grow outward in order. Nodes are base nodes (ids are `${id}.hub`,
// `${id}.b1`, `${id}.b1.1`, ...), so the camera and edges can target them.
import { ease, hash, prog } from '../math.js';
import { node } from './base.js';

const COLORS = ['accent', 'accent2', 'good', 'warn'];
const asSpec = x => (typeof x === 'string' ? { text: x } : x);
const hit = (a, b, gap) => !(a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y);

/**
 * Pure geometry: rect for the hub, every branch and every leaf, centered in `area`.
 * Node sizes shrink until nothing collides, but never below `minH` per kind (so text keeps fitting). Returns { hub, branches: [{ rect, angle, leaves: [rect] }], k }.
 */
export function mapLayout(branches, area, gap = 18, minH = {}) {
  const n = branches.length;
  const deep = branches.some(b => b.children?.length);
  const cx = area.x + area.w / 2;
  const cy = area.y + area.h / 2;
  const step = 360 / n;
  const start = n % 2 === 0 ? -90 + step / 2 : -90;
  const rad = deg => (deg * Math.PI) / 180;
  const at = (rx, ry, deg, w, h) => ({ x: cx + Math.cos(rad(deg)) * rx - w / 2, y: cy + Math.sin(rad(deg)) * ry - h / 2, w, h });
  const sizes = {
    hub: { w: Math.min(380, area.w * 0.22), h: Math.min(150, area.h * 0.17) },
    branch: { w: Math.min(290, area.w * 0.17), h: Math.min(112, area.h * 0.125) },
    leaf: { w: Math.min(260, area.w * 0.15), h: Math.min(88, area.h * 0.095) },
  };
  const kMin = Math.min(1, Math.max(0.4, ...['hub', 'branch', 'leaf'].map(key => (minH[key] ?? 0) / sizes[key].h)));
  let out = null;
  for (let k = 1; k >= kMin - 1e-9; k = Math.max(kMin, k - 0.05)) {
    const sz = key => ({ w: sizes[key].w * k, h: sizes[key].h * k });
    const outer = deep ? sz('leaf') : sz('branch');
    const rxO = area.w / 2 - outer.w / 2;
    const ryO = area.h / 2 - outer.h / 2;
    const hub = { x: cx - sz('hub').w / 2, y: cy - sz('hub').h / 2, ...sz('hub') };
    const list = branches.map((b, i) => {
      const angle = start + i * step;
      const kids = b.children ?? [];
      const f = !deep ? 1 : kids.length ? 0.5 : 0.8;
      const spread = Math.min(26, (step * 0.8) / Math.max(1, kids.length));
      const leaves = kids.map((_, j) => at(rxO, ryO, angle + (j - (kids.length - 1) / 2) * spread, sz('leaf').w, sz('leaf').h));
      return { angle, rect: at(rxO * f, ryO * f, angle, sz('branch').w, sz('branch').h), leaves };
    });
    out = { hub, branches: list, k };
    const all = [hub, ...list.flatMap(b => [b.rect, ...b.leaves])];
    const clash = all.some((a, i) => all.slice(i + 1).some(b => hit(a, b, gap)));
    if (!clash || k <= kMin) { break; }
  }
  return out;
}

/** Quadratic curve from rect `a` to rect `b`, bent sideways by `bend` of its length, as sampled points. */
export function curve(a, b, bend = 0.16, n = 14) {
  const [ax, ay] = rectCenter(a);
  const [bx, by] = rectCenter(b);
  const ctrl = [(ax + bx) / 2 - (by - ay) * bend, (ay + by) / 2 + (bx - ax) * bend];
  const p0 = nearestEdge(a, ctrl);
  const p1 = nearestEdge(b, ctrl);
  return Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n;
    return [(1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * ctrl[0] + u ** 2 * p1[0], (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * ctrl[1] + u ** 2 * p1[1]];
  });
}

function curvedEdge(s, id, a, b, o) {
  const pts = curve(a, b, o.bend);
  const xs = pts.map(q => q[0]);
  const ys = pts.map(q => q[1]);
  const rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  const p = t => ease.inOut(prog(t, o.at, o.dur));
  return {
    kind: 'edge',
    id,
    z: -0.5,
    rect,
    pts,
    texts: () => [],
    draw: (api, t) => api.style.line(api, pts, { p: p(t), color: o.color, lw: o.lw, seed: hash(id) }),
    qa: (api, t) => ({ rect, alpha: p(t), texts: [], overlap: true }),
  };
}

/**
 * Radial mind map. opts: id (prefix, default "map"), hub (text | { text }), branches [text | { text, color, children: [text | { text }] }],
 * area (default scene area), at, step (seconds per branch), colors.
 * Returns a marker item with `.ids` ({ hub, branches: [id], leaves: [[id]] }); the nodes and curves are separate items.
 */
export function mindMap(s, o) {
  const id = o.id ?? s.uid('map');
  const hubSpec = asSpec(o.hub ?? { text: '' });
  const branches = (o.branches ?? []).map(asSpec);
  if (!branches.length) { throw new Error('mindMap needs branches'); }
  const area = o.area ?? o.rect ?? s.area;
  const colors = o.colors ?? COLORS;
  const d = s.style.defaults;
  const line = d.minPx * 1.2 + 2;
  const lay = mapLayout(branches, area, 18, { hub: line + 2 * d.pad, branch: line + 32, leaf: line + 24 });
  const deep = branches.some(b => b.children?.length);
  const at = o.at ?? 0;
  const step = o.step ?? (deep ? 1.1 : 0.7);
  const ids = { hub: `${id}.hub`, branches: [], leaves: [] };

  s.add(node(s, { id: ids.hub, text: hubSpec.text, rect: lay.hub, at, dur: 0.7, color: hubSpec.color ?? 'accent', font: 'display', px: d.nodePx * 1.15 }));
  let tBranch = at + 0.6;
  branches.forEach((b, i) => {
    const color = b.color ?? colors[i % colors.length];
    const bid = `${id}.b${i + 1}`;
    ids.branches.push(bid);
    s.add(curvedEdge(s, `${id}.e${i + 1}`, lay.hub, lay.branches[i].rect, { at: tBranch, dur: 0.5, color, lw: 5, bend: 0.16 }));
    s.add(node(s, { id: bid, text: b.text, rect: lay.branches[i].rect, at: tBranch + 0.35, dur: 0.5, color, font: 'display', px: d.nodePx, pad: 16 }));
    const leafIds = [];
    (b.children ?? []).map(asSpec).forEach((c, j) => {
      const lid = `${bid}.${j + 1}`;
      const tLeaf = tBranch + 0.85 + j * 0.28;
      leafIds.push(lid);
      s.add(curvedEdge(s, `${id}.e${i + 1}.${j + 1}`, lay.branches[i].rect, lay.branches[i].leaves[j], { at: tLeaf, dur: 0.4, color, lw: 3, bend: 0.1 }));
      s.add(node(s, { id: lid, text: c.text, rect: lay.branches[i].leaves[j], at: tLeaf + 0.3, dur: 0.4, color: c.color ?? color, px: d.nodePx * 0.8, pad: 12 }));
    });
    ids.leaves.push(leafIds);
    tBranch += step + Math.max(0, (b.children?.length ?? 0) - 1) * 0.28;
  });
  const rect = area;
  return { kind: 'mindmap', id, z: -2, rect, ids, end: tBranch, texts: () => [], draw() {}, qa: () => null };
}

export const pieces = { mindMap };
