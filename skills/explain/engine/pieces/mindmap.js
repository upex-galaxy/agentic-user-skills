import { nearestEdge, rectCenter } from '../layout.js';
// mindMap: radial map. A hub in the middle, branches on an ellipse around it, an optional second level on a wider
// ellipse, all joined by curved connectors that grow outward in order. Nodes are base nodes (ids are `${id}.hub`,
// `${id}.b1`, `${id}.b1.1`, ...), so the camera and edges can target them.
import { ease, hash, prog } from '../math.js';
import { node } from './base.js';

const COLORS = ['accent', 'accent2', 'good', 'warn'];
const asSpec = x => (typeof x === 'string' ? { text: x } : x);

/**
 * Pure geometry: rect for the hub, every branch and every leaf, spread over the whole `area`.
 * Branches split into a right and a left column around the hub (clockwise from the top right: the right column runs
 * down, the left column runs up); each branch sits in its own row slot and its leaves stack beyond it. Column widths
 * and node heights scale with the area, so a big area gives big nodes. `minH` is kept for callers that want a floor.
 * Returns { hub, branches: [{ rect, side, leaves: [rect] }], k: 1 }.
 */
export function mapLayout(branches, area, gap = 18, minH = {}) {
  const n = branches.length;
  const deep = branches.some(b => b.children?.length);
  const cx = area.x + area.w / 2;
  const cy = area.y + area.h / 2;
  const nRight = n === 1 ? 1 : Math.ceil(n / 2);
  const nLeft = n - nRight;
  const rows = Math.max(nRight, nLeft, 1);
  const slot = area.h / rows;
  const kidsMax = Math.max(1, ...branches.map(b => b.children?.length ?? 0));
  const frac = deep ? { hub: 0.22, g1: 0.03, branch: 0.16, g2: 0.03, leaf: 0.17 } : { hub: 0.22, g1: 0.09, branch: 0.3, g2: 0, leaf: 0 };
  const hubW = frac.hub * area.w;
  const bw = frac.branch * area.w;
  const lw = frac.leaf * area.w;
  const g1 = frac.g1 * area.w;
  const g2 = frac.g2 * area.w;
  const hubH = Math.max(minH.hub ?? 0, Math.min(area.h * 0.28, hubW * 0.42));
  const bh = Math.max(minH.branch ?? 0, Math.min(slot * 0.6, bw * 0.45));
  const lh = Math.max(minH.leaf ?? 0, Math.min(slot / kidsMax - gap, lw * 0.4, bh * 0.9));
  const hub = { x: cx - hubW / 2, y: cy - hubH / 2, w: hubW, h: hubH };
  const list = branches.map((b, i) => {
    const side = i < nRight ? 'right' : 'left';
    const row = side === 'right' ? i : nLeft - 1 - (i - nRight);
    const m = side === 'right' ? nRight : nLeft;
    const yc = area.y + (row + 0.5) * (area.h / m);
    const dir = side === 'right' ? 1 : -1;
    const bx = dir > 0 ? cx + hubW / 2 + g1 : cx - hubW / 2 - g1 - bw;
    const lx = dir > 0 ? bx + bw + g2 : bx - g2 - lw;
    const kids = b.children ?? [];
    const pitch = Math.min(area.h / m / Math.max(1, kids.length), lh + gap);
    const leaves = kids.map((_, j) => ({ x: lx, y: yc + (j - (kids.length - 1) / 2) * pitch - lh / 2, w: lw, h: lh }));
    return { side, rect: { x: bx, y: yc - bh / 2, w: bw, h: bh }, leaves };
  });
  return { hub, branches: list, k: 1 };
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
  const pxFor = (r, cap, share) => Math.max(d.minPx, Math.min(d.nodePx * cap, r.h * share));
  const deep = branches.some(b => b.children?.length);
  const at = o.at ?? 0;
  const step = o.step ?? (deep ? 1.1 : 0.7);
  const ids = { hub: `${id}.hub`, branches: [], leaves: [] };

  s.add(node(s, { id: ids.hub, text: hubSpec.text, rect: lay.hub, at, dur: 0.7, color: hubSpec.color ?? 'accent', font: 'display', px: pxFor(lay.hub, 1.9, 0.4) }));
  let tBranch = at + 0.6;
  branches.forEach((b, i) => {
    const color = b.color ?? colors[i % colors.length];
    const bid = `${id}.b${i + 1}`;
    ids.branches.push(bid);
    s.add(curvedEdge(s, `${id}.e${i + 1}`, lay.hub, lay.branches[i].rect, { at: tBranch, dur: 0.5, color, lw: 5, bend: 0.14 }));
    s.add(node(s, { id: bid, text: b.text, rect: lay.branches[i].rect, at: tBranch + 0.35, dur: 0.5, color, font: 'display', px: pxFor(lay.branches[i].rect, 1.7, 0.46), pad: 16 }));
    const leafIds = [];
    (b.children ?? []).map(asSpec).forEach((c, j) => {
      const lid = `${bid}.${j + 1}`;
      const tLeaf = tBranch + 0.85 + j * 0.28;
      leafIds.push(lid);
      s.add(curvedEdge(s, `${id}.e${i + 1}.${j + 1}`, lay.branches[i].rect, lay.branches[i].leaves[j], { at: tLeaf, dur: 0.4, color, lw: 3, bend: 0.08 }));
      s.add(node(s, { id: lid, text: c.text, rect: lay.branches[i].leaves[j], at: tLeaf + 0.3, dur: 0.4, color: c.color ?? color, px: pxFor(lay.branches[i].leaves[j], 1.4, 0.46), pad: 12 }));
    });
    ids.leaves.push(leafIds);
    tBranch += step + Math.max(0, (b.children?.length ?? 0) - 1) * 0.28;
  });
  const rect = area;
  return { kind: 'mindmap', id, z: -2, rect, ids, end: tBranch, texts: () => [], draw() {}, qa: () => null };
}

export const pieces = { mindMap };
