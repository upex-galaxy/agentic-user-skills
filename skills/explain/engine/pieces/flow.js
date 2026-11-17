import { grid } from '../layout.js';
// flow: a pipeline of steps in a row or a snake, connected by id, with a dot travelling from step to step.
// Each step has a state: pending (dim), active (accent, while the dot is on it) or done (good). The state follows
// the dot unless a step sets `state` itself. Steps are registered ids (`${id}-1`, ... or their own `id`), so the
// camera and extra edges can target them. The returned item is the travelling dot; steps and links are separate items.
import { clamp, ease, hash, lerp, prog } from '../math.js';
import { fitText } from '../text.js';
import { blockBox, drawTextBlock } from './base.js';

const asSpec = x => (typeof x === 'string' ? { text: x } : x);

/** Position of a point `p` (0..1) along a polyline. */
export function along(pts, p) {
  const lens = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
  let d = lens.reduce((a, b) => a + b, 0) * clamp(p);
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? d / lens[i] : 0;
      return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)];
    }
    d -= lens[i];
  }
  return pts[0];
}

/** Pure geometry: rects for n steps in a row, or a snake (rows alternate direction) with `cols` per row. */
export function flowLayout(n, area, o = {}) {
  const snake = o.layout === 'snake';
  const cols = snake ? Math.min(n, o.cols ?? Math.ceil(n / 2)) : n;
  const rowsN = Math.ceil(n / cols);
  const gapX = o.gap ?? 120;
  const gapY = o.gapY ?? 110;
  const w = Math.min(o.w ?? 560, (area.w - gapX * (cols - 1)) / cols);
  // A flow aims for about 86 % of the area's height, so the scene keeps some air above and below it.
  const h = Math.min(o.h ?? w, w, (area.h * 0.86 - gapY * (rowsN - 1)) / rowsN);
  const L = grid(Array.from({ length: n }, (_, i) => ({ id: String(i) })), { cols, w, h, gapX, gapY, area });
  const rects = Array.from({ length: n }, (_, i) => ({ ...L.rects[i] }));
  if (snake && cols > 1) {
    const pitch = rects[1].x - rects[0].x;
    rects.forEach((r, i) => {
      if (Math.floor(i / cols) % 2 === 1) { r.x = rects[0].x + (cols - 1 - (i % cols)) * pitch; }
    });
  }
  return rects;
}

/**
 * Pipeline. opts: id (prefix, default "flow"), steps [text | { id, text, color, state }], layout 'row' | 'snake', cols,
 * links [[fromId, toId]] (default: consecutive), area, at, step (seconds between step reveals), runAt, per (seconds per link),
 * dwell (seconds on each step), px.
 */
export function flow(s, o) {
  const prefix = o.id ?? 'flow';
  const steps = (o.steps ?? []).map(asSpec);
  if (steps.length < 2) { throw new Error('flow needs at least two steps'); }
  const n = steps.length;
  const ids = steps.map((st, i) => st.id ?? `${prefix}-${i + 1}`);
  const area = o.area ?? o.rect ?? s.area;
  const d = s.style.defaults;
  const rects = flowLayout(n, area, o);
  rects.forEach((r, i) => s.reg.add(ids[i], r));
  const at = o.at ?? 0;
  const stepGap = o.step ?? 0.35;
  const per = o.per ?? 0.9;
  const dwell = o.dwell ?? 0.45;
  const runAt = o.runAt ?? at + n * stepGap + 0.6;
  const links = (o.links ?? ids.slice(1).map((to, i) => [ids[i], to])).map(([a, b], k) => {
    const from = ids.indexOf(a);
    const to = ids.indexOf(b);
    if (from < 0 || to < 0) { throw new Error(`flow link ${a} -> ${b} names an unknown step`); }
    const start = runAt + k * (per + dwell);
    return { a, b, from, to, start, end: start + per, conn: s.reg.connect(a, b, { gap: 8 }), appear: at + Math.max(from, to) * stepGap + 0.2 };
  });
  // Arrival and departure time per step, derived from the link schedule.
  const arrive = ids.map(() => Infinity);
  const depart = ids.map(() => Infinity);
  arrive[links[0].from] = runAt - dwell;
  for (const l of links) {
    arrive[l.to] = Math.min(arrive[l.to], l.end);
    depart[l.from] = Math.min(depart[l.from], l.start);
  }
  arrive.forEach((a, i) => { if (a === Infinity) { arrive[i] = links[links.length - 1].end; } });
  depart.forEach((v, i) => { if (v === Infinity) { depart[i] = arrive[i] + dwell; } });
  const stateAt = (i, t) => {
    if (steps[i].state) { return steps[i].state; }
    return t < arrive[i] ? 'pending' : t < depart[i] ? 'active' : 'done';
  };
  const STROKE = { pending: 'dim', active: 'accent', done: 'good' };

  steps.forEach((st, i) => {
    const rect = rects[i];
    const fit = fitText(s.ctx, st.text, rect, { fontFor: px => s.style.font('body', px), maxPx: o.px ?? d.nodePx, minPx: d.minPx, pad: d.pad, lineHeight: 1.2 });
    const appear = t => ease.out(prog(t, at + i * stepGap, 0.5));
    s.add({
      kind: 'node',
      id: `${ids[i]}.step`,
      z: 0,
      rect,
      texts: () => [st.text],
      draw(api, t) {
        const p = appear(t);
        if (p <= 0) { return; }
        const state = stateAt(i, t);
        const { ctx } = api;
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        ctx.translate(cx, cy);
        ctx.scale(lerp(0.92, 1, p), lerp(0.92, 1, p));
        ctx.translate(-cx, -cy);
        const color = st.color && state !== 'pending' ? st.color : STROKE[state];
        api.style.shape(api, rect, { kind: 'round', p, stroke: color, fill: 'panel', lw: d.lw + (state === 'active' ? 1.5 : 0), glow: state === 'active' ? 22 : state === 'done' ? 8 : 4, seed: hash(ids[i]) });
        if (state === 'active') { api.style.highlight(api, rect, { p: ease.out(clamp((t - arrive[i]) / 0.3)), color: st.color ?? 'accent', seed: hash(ids[i]) }); }
        drawTextBlock(api, fit, rect, { color: state === 'pending' ? 'dim' : 'ink', alpha: clamp((p - 0.35) / 0.65) });
      },
      qa: (api, t) => ({ rect, alpha: appear(t), texts: [{ text: st.text, rect: blockBox(fit, rect), overflow: fit.overflow, px: fit.px }] }),
    });
  });

  links.forEach((l, k) => {
    const pts = l.conn.pts;
    const xs = pts.map(q => q[0]);
    const ys = pts.map(q => q[1]);
    const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    const base = t => ease.inOut(prog(t, l.appear, 0.5));
    s.add({
      kind: 'edge',
      id: `${prefix}.link-${k + 1}`,
      z: -0.5,
      rect: box,
      conn: l.conn,
      texts: () => [],
      draw(api, t) {
        api.style.line(api, pts, { p: base(t), color: 'dim', lw: d.lw + 1, head: true, seed: hash(`${prefix}${k}`) });
        const run = ease.inOut(prog(t, l.start, l.end - l.start));
        if (run > 0) { api.style.line(api, pts, { p: run, color: 'accent', lw: d.lw + 2, head: run >= 1, seed: hash(`${prefix}${k}`) }); }
      },
      qa: (api, t) => ({ rect: box, alpha: base(t), texts: [], overlap: true }),
    });
  });

  // The travelling dot: visible only while it rides a link, easing in and out at the step borders.
  const live = t => links.find(l => t >= l.start && t <= l.end);
  const dotR = 13;
  const dotState = (t) => {
    const l = live(t);
    if (!l) { return { alpha: 0, box: { x: 0, y: 0, w: 0, h: 0 } }; }
    const p = ease.inOut(prog(t, l.start, l.end - l.start));
    const [x, y] = along(l.conn.pts, p);
    return { alpha: clamp(Math.min(p * 8, (1 - p) * 8) + 0.001), box: { x: x - dotR, y: y - dotR, w: dotR * 2, h: dotR * 2 } };
  };
  return {
    kind: 'flow',
    id: prefix,
    z: 3,
    rect: { x: Math.min(...rects.map(r => r.x)), y: Math.min(...rects.map(r => r.y)), w: Math.max(...rects.map(r => r.x + r.w)) - Math.min(...rects.map(r => r.x)), h: Math.max(...rects.map(r => r.y + r.h)) - Math.min(...rects.map(r => r.y)) },
    ids,
    end: links[links.length - 1].end + dwell,
    texts: () => [],
    draw(api, t) {
      const st = dotState(t);
      if (st.alpha <= 0.002) { return; }
      api.style.shape(api, st.box, { kind: 'ellipse', p: 1, stroke: 'accent', fill: 'accent', lw: 3, glow: 26, alpha: st.alpha, seed: 5 });
    },
    qa(api, t) {
      const st = dotState(t);
      return { rect: st.box, alpha: st.alpha > 0.002 ? st.alpha : 0, texts: [], overlap: true };
    },
  };
}

export const pieces = { flow };
