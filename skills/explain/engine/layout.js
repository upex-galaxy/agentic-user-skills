// Layout helpers: compute positions and sizes so authors never hand-place coordinates.
// Every element has an id and anchors; connect() derives edge endpoints from anchors.

const DEFAULT_W = 280;
const DEFAULT_H = 140;

export const rectCenter = r => [r.x + r.w / 2, r.y + r.h / 2];

/** Union bounding box of rects. */
export function union(rects) {
  const x0 = Math.min(...rects.map(r => r.x));
  const y0 = Math.min(...rects.map(r => r.y));
  const x1 = Math.max(...rects.map(r => r.x + r.w));
  const y1 = Math.max(...rects.map(r => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Named anchor points of a rect: top, bottom, left, right, center and the four corners. */
export function anchors(r) {
  const [cx, cy] = rectCenter(r);
  return {
    top: [cx, r.y],
    bottom: [cx, r.y + r.h],
    left: [r.x, cy],
    right: [r.x + r.w, cy],
    center: [cx, cy],
    tl: [r.x, r.y],
    tr: [r.x + r.w, r.y],
    bl: [r.x, r.y + r.h],
    br: [r.x + r.w, r.y + r.h],
  };
}

/** Point on the rect border where the line from its center toward `p` leaves the rect. */
export function nearestEdge(r, p) {
  const [cx, cy] = rectCenter(r);
  const dx = p[0] - cx;
  const dy = p[1] - cy;
  if (dx === 0 && dy === 0) { return [cx, r.y]; }
  const kx = dx === 0 ? Infinity : r.w / 2 / Math.abs(dx);
  const ky = dy === 0 ? Infinity : r.h / 2 / Math.abs(dy);
  const k = Math.min(kx, ky);
  return [cx + dx * k, cy + dy * k];
}

/** Id -> rect registry for one scene. Unknown ids throw, so typos fail at build time. */
export function createRegistry() {
  const rects = new Map();
  const reg = {
    add(id, rect) {
      if (rects.has(id)) { throw new Error(`Duplicate element id "${id}"`); }
      rects.set(id, { x: rect.x, y: rect.y, w: rect.w, h: rect.h });
      return rects.get(id);
    },
    /** Swap a registered rect for a new object (items keep the object they were built with). */
    replace(id, rect) {
      if (!rects.has(id)) { throw new Error(`Unknown element id "${id}"`); }
      rects.set(id, { x: rect.x, y: rect.y, w: rect.w, h: rect.h });
    },
    addAll(map) {
      for (const [id, r] of Object.entries(map)) { reg.add(id, r); }
    },
    has: id => rects.has(id),
    get(id) {
      const r = rects.get(id);
      if (!r) { throw new Error(`Unknown element id "${id}" (known: ${[...rects.keys()].join(', ') || 'none'})`); }
      return r;
    },
    ids: () => [...rects.keys()],
    anchor: (id, name) => anchors(reg.get(id))[name],
    connect: (from, to, opts) => connect(reg, from, to, opts),
  };
  return reg;
}

function resolveSide(rect, other, name) {
  if (name === 'edge') { return nearestEdge(rect, rectCenter(other)); }
  const a = anchors(rect)[name];
  if (!a) { throw new Error(`Unknown anchor "${name}"`); }
  return a;
}

function autoSides(a, b) {
  const [ax, ay] = rectCenter(a);
  const [bx, by] = rectCenter(b);
  const horiz = Math.abs(bx - ax) / (a.w / 2 + b.w / 2);
  const vert = Math.abs(by - ay) / (a.h / 2 + b.h / 2);
  if (horiz >= vert) { return bx >= ax ? ['right', 'left'] : ['left', 'right']; }
  return by >= ay ? ['bottom', 'top'] : ['top', 'bottom'];
}

function shorten(pts, gap) {
  if (!gap || pts.length < 2) { return pts; }
  const out = pts.map(p => [...p]);
  const move = (i, j) => {
    const dx = out[j][0] - out[i][0];
    const dy = out[j][1] - out[i][1];
    const d = Math.hypot(dx, dy);
    if (d > gap * 2) {
      out[i][0] += (dx / d) * gap;
      out[i][1] += (dy / d) * gap;
    }
  };
  move(0, 1);
  move(out.length - 1, out.length - 2);
  return out;
}

/**
 * Edge endpoints between two registered elements.
 * opts: { from, to } anchor names ('auto' | 'edge' | top|bottom|left|right|center|tl|tr|bl|br),
 *       route 'straight' | 'elbow', gap (px kept clear of each border, default 6).
 * Returns { pts, from: {id, anchor, point}, to: {...}, length }.
 */
export function connect(reg, fromId, toId, opts = {}) {
  const { from: fa = 'auto', to: ta = 'auto', route = 'straight', gap = 6 } = opts;
  const a = reg.get(fromId);
  const b = reg.get(toId);
  const [autoFrom, autoTo] = autoSides(a, b);
  const fromName = fa === 'auto' ? autoFrom : fa;
  const toName = ta === 'auto' ? autoTo : ta;
  const p0 = resolveSide(a, b, fromName);
  const p1 = resolveSide(b, a, toName);
  let pts = [p0, p1];
  if (route === 'elbow') {
    const horizontal = fromName === 'left' || fromName === 'right';
    pts = horizontal
      ? [p0, [(p0[0] + p1[0]) / 2, p0[1]], [(p0[0] + p1[0]) / 2, p1[1]], p1]
      : [p0, [p0[0], (p0[1] + p1[1]) / 2], [p1[0], (p0[1] + p1[1]) / 2], p1];
  }
  pts = shorten(pts, gap);
  const length = pts.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
  return {
    pts,
    length,
    from: { id: fromId, anchor: fromName, point: p0 },
    to: { id: toId, anchor: toName, point: p1 },
  };
}

// ---------- layouts ----------

function normalize(items, opts) {
  return items.map((it) => {
    const spec = typeof it === 'string' ? { id: it } : it;
    return { ...spec, w: spec.w ?? opts.w ?? DEFAULT_W, h: spec.h ?? opts.h ?? DEFAULT_H };
  });
}

/**
 * Shared finishing step. `raw` is a list of {id, x, y, w, h} laid out around the origin.
 * With `area`: shrink uniformly when the layout does not fit, then center it in the area.
 * Without: translate so the top-left corner of the bounds sits at opts.x, opts.y.
 */
function finish(raw, opts, extra = {}) {
  const b0 = union(raw);
  let k = 1;
  if (opts.area && opts.fit !== false) {
    k = Math.min(1, opts.area.w / b0.w, opts.area.h / b0.h);
    // `fill` (set when the author passed no area): a layout that fills under 70 % of the area grows to about 80 %.
    if (opts.fill && k === 1) {
      const r = Math.max(b0.w / opts.area.w, b0.h / opts.area.h);
      if (r > 0 && r < 0.7) { k = Math.min(2.2, 0.8 / r); }
    }
  }
  const scaled = raw.map(r => ({ ...r, x: (r.x - b0.x) * k, y: (r.y - b0.y) * k, w: r.w * k, h: r.h * k }));
  const b1 = union(scaled);
  let ox = opts.x ?? 0;
  let oy = opts.y ?? 0;
  if (opts.area) {
    const place = opts.place ?? 'center'; // center | top (centered, top aligned) | start (top-left)
    ox = opts.area.x + (place === 'start' ? 0 : (opts.area.w - b1.w) / 2);
    oy = opts.area.y + (place === 'center' ? (opts.area.h - b1.h) / 2 : 0);
  }
  const list = scaled.map(r => ({ ...r, x: r.x + ox, y: r.y + oy }));
  const rects = {};
  for (const r of list) { rects[r.id] = { x: r.x, y: r.y, w: r.w, h: r.h }; }
  return { rects, list, bounds: union(list), scale: k, ...extra };
}

function alignOffset(size, box, align) {
  if (align === 'start') { return 0; }
  if (align === 'end') { return box - size; }
  return (box - size) / 2;
}

/** Items left to right. opts: gap, align (start|center|end on the cross axis), w/h defaults, area|x,y. */
export function row(items, opts = {}) {
  const list = normalize(items, opts);
  const gap = opts.gap ?? 40;
  const H = Math.max(...list.map(i => i.h));
  let x = 0;
  const raw = list.map((i) => {
    const r = { id: i.id, x, y: alignOffset(i.h, H, opts.align ?? 'center'), w: i.w, h: i.h };
    x += i.w + gap;
    return r;
  });
  return finish(raw, opts);
}

/** Items top to bottom. Same options as row. */
export function stack(items, opts = {}) {
  const list = normalize(items, opts);
  const gap = opts.gap ?? 32;
  const W = Math.max(...list.map(i => i.w));
  let y = 0;
  const raw = list.map((i) => {
    const r = { id: i.id, x: alignOffset(i.w, W, opts.align ?? 'center'), y, w: i.w, h: i.h };
    y += i.h + gap;
    return r;
  });
  return finish(raw, opts);
}

/** Items in rows of `cols`, each centered in a uniform cell (the largest item). opts: cols, gapX, gapY. */
export function grid(items, opts = {}) {
  const list = normalize(items, opts);
  const cols = opts.cols ?? Math.ceil(Math.sqrt(list.length));
  const gapX = opts.gapX ?? opts.gap ?? 40;
  const gapY = opts.gapY ?? opts.gap ?? 40;
  const cw = Math.max(...list.map(i => i.w));
  const ch = Math.max(...list.map(i => i.h));
  const raw = list.map((i, n) => {
    const c = n % cols;
    const r = Math.floor(n / cols);
    return { id: i.id, x: c * (cw + gapX) + (cw - i.w) / 2, y: r * (ch + gapY) + (ch - i.h) / 2, w: i.w, h: i.h };
  });
  return finish(raw, opts);
}

/**
 * Items on an ellipse around an optional hub. opts: hub {id,w,h}, radius (minimum), aspect (rx/ry, default 1.5),
 * start (degrees, default -90 = top), gap. The ring radius grows until neighbors and the hub do not collide.
 */
export function radial(items, opts = {}) {
  const list = normalize(items, opts);
  const hub = opts.hub ? normalize([opts.hub], opts)[0] : null;
  const gap = opts.gap ?? 40;
  const aspect = opts.aspect ?? 1.5;
  const n = list.length;
  const half = i => Math.hypot(i.w, i.h) / 2;
  const maxHalf = Math.max(...list.map(half));
  let r = opts.radius ?? 0;
  if (n > 1) { r = Math.max(r, (2 * maxHalf + gap) / (2 * Math.sin(Math.PI / n)) / aspect); }
  if (hub) { r = Math.max(r, (half(hub) + maxHalf + gap) / aspect); }
  r = Math.max(r, maxHalf);
  const start = ((opts.start ?? -90) * Math.PI) / 180;
  const raw = list.map((i, k) => {
    const a = start + (k / n) * Math.PI * 2;
    return { id: i.id, x: Math.cos(a) * r * aspect - i.w / 2, y: Math.sin(a) * r - i.h / 2, w: i.w, h: i.h };
  });
  if (hub) { raw.push({ id: hub.id, x: -hub.w / 2, y: -hub.h / 2, w: hub.w, h: hub.h }); }
  return finish(raw, opts);
}

/**
 * Tidy tree. root: {id, w?, h?, children: [...]}. opts: dir 'down' | 'right', gapX (siblings), gapY (levels).
 * The result also carries `edges`: [parentId, childId] pairs ready for connect().
 */
export function tree(root, opts = {}) {
  const dir = opts.dir ?? 'down';
  const gapX = opts.gapX ?? 48;
  const gapY = opts.gapY ?? 90;
  const flip = dir === 'right';
  const size = (n) => {
    const spec = { ...n, w: n.w ?? opts.w ?? DEFAULT_W, h: n.h ?? opts.h ?? DEFAULT_H };
    return flip ? { ...spec, w: spec.h, h: spec.w } : spec;
  };
  const edges = [];
  const raw = [];
  const levelH = [];
  const measureTree = (n, depth) => {
    const s = size(n);
    levelH[depth] = Math.max(levelH[depth] ?? 0, s.h);
    const kids = (n.children ?? []).map(c => measureTree(c, depth + 1));
    const kidsW = kids.reduce((a, k) => a + k.span, 0) + gapX * Math.max(0, kids.length - 1);
    return { n, s, kids, span: Math.max(s.w, kidsW), kidsW, depth };
  };
  const m = measureTree(root, 0);
  const levelY = [];
  let acc = 0;
  levelH.forEach((h, d) => {
    levelY[d] = acc;
    acc += h + gapY;
  });
  const place = (node, left) => {
    const cx = left + node.span / 2;
    raw.push({ id: node.n.id, x: cx - node.s.w / 2, y: levelY[node.depth] + (levelH[node.depth] - node.s.h) / 2, w: node.s.w, h: node.s.h });
    let x = left + (node.span - node.kidsW) / 2;
    for (const k of node.kids) {
      edges.push([node.n.id, k.n.id]);
      place(k, x);
      x += k.span + gapX;
    }
  };
  place(m, 0);
  const out = flip ? raw.map(r => ({ id: r.id, x: r.y, y: r.x, w: r.h, h: r.w })) : raw;
  return finish(out, opts, { edges });
}
