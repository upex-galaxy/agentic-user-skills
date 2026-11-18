// timeline: an axis with milestones (label and date beside each dot), a progress fill and a travelling marker driven by t.
// A milestone lights up when the marker reaches it. Layouts: 'row' (one axis, labels alternate above and below), 'snake'
// (2 or 3 rows, each row turns into the next with a curved connector, so the events grow), 'column' (vertical axis, for
// few long labels). The default 'auto' keeps the row while it fills the area and picks a better layout when it would be a thin strip.
import { clamp, ease, hash, lerp, prog } from '../math.js';
import { fitText } from '../text.js';
import { blockBox, drawTextBlock } from './base.js';
import { boxOf, cubic, pointAt, polyLen } from './diagram-kit.js';

const register = (s, id, rect) => (s.reg.has(id) ? s.reg.get(id) : s.reg.add(id, rect));
const asSpec = x => (typeof x === 'string' ? { label: x } : x);
const DOT = 18;
const EXT = 50;

/**
 * Pure geometry of the one-row layout: milestone x positions, label width and which side each label sits on.
 * Labels alternate (above, below, ...); same-side labels are two spacings apart, so width < 2 * spacing keeps them clear.
 */
export function timelineGeometry(n, area) {
  const labelW = clamp(n > 1 ? ((area.w - 280) / (n - 1)) * 1.8 : 420, 170, 440);
  const x0 = area.x + Math.max(labelW / 2, 90);
  const x1 = area.x + area.w - Math.max(labelW / 2, 90);
  const spacing = n > 1 ? (x1 - x0) / (n - 1) : 0;
  const xs = Array.from({ length: n }, (_, i) => (n > 1 ? x0 + i * spacing : (x0 + x1) / 2));
  return { xs, spacing, labelW: n > 1 ? Math.min(labelW, spacing * 1.85) : labelW, sides: xs.map((_, i) => (i % 2 === 0 ? 'above' : 'below')), x0, x1 };
}

/** Pure: how many snake rows `n` events get by default (2 up to 8 events, 3 beyond). */
export const snakeRows = n => (n <= 8 ? 2 : 3);

/** Pure: the events of each snake row and the x of every dot. Rows run left to right, then right to left; only the last row can be short. */
export function snakeGeometry(n, rows, area, margin = 130) {
  const per = Math.ceil(n / rows);
  const x0 = area.x + margin;
  const x1 = area.x + area.w - margin;
  const spacing = per > 1 ? (x1 - x0) / (per - 1) : 0;
  const marks = Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / per);
    const c = i % per;
    return { row, x: row % 2 ? x1 - c * spacing : x0 + c * spacing };
  });
  return { per, rows: Math.ceil(n / per), x0, x1, spacing, marks };
}

/**
 * Timeline. opts: id, milestones [text | { label, date, color }], area, at, dur (travel seconds), to (0..1, how far the
 * marker travels, default 1), px, color, layout ('auto' | 'row' | 'snake' | 'column'), rows (snake rows). Milestone i lights up
 * when the marker passes it.
 */
export function timeline(s, o) {
  const id = o.id ?? s.uid('timeline');
  const items = (o.milestones ?? o.items ?? []).map(asSpec);
  if (!items.length) { throw new Error('timeline needs milestones'); }
  const n = items.length;
  const area = o.area ?? o.rect ?? s.area;
  const d = s.style.defaults;
  const basePx = o.px ?? d.labelPx * (area.h >= 560 ? 1.1 : 0.95);
  const fontFor = size => s.style.font('body', size, 600);
  const fitLabel = (it, w, h, px) => fitText(s.ctx, it.label, { w, h }, { fontFor, maxPx: px, minPx: d.minPx, lineHeight: 1.2 });
  const fitDate = (it, w, px) => (it.date ? fitText(s.ctx, it.date, { w, h: px }, { fontFor, maxPx: px * 0.8, minPx: d.minPx - 4, lineHeight: 1.2 }) : null);
  const labelH = f => f.lines.length * f.lineH + 6;
  const dateH = f => f.lines.length * f.lineH + 4;
  const finish = (m) => {
    const rects = [...m.labels, ...m.dates.filter(Boolean)];
    const boxes = [boxOf(m.axis), ...rects, ...m.marks.map(q => ({ x: q.x - DOT, y: q.y - DOT, w: DOT * 2, h: DOT * 2 }))];
    const x0 = Math.min(...boxes.map(r => r.x));
    const y0 = Math.min(...boxes.map(r => r.y));
    m.rect = { x: x0, y: y0, w: Math.max(...boxes.map(r => r.x + r.w)) - x0, h: Math.max(...boxes.map(r => r.y + r.h)) - y0 };
    m.worst = Math.min(...m.fits.map(f => f.px)) / m.px;
    return m;
  };
  /** Marks, path and axis from per-mark dot positions; `rowOf` groups marks into runs joined by curved connectors. */
  const assemble = (m, marks, runs, ext) => {
    const path = [];
    runs.forEach((run, r) => {
      const a = marks[run[0]];
      const b = marks[run[run.length - 1]];
      if (r > 0) {
        const prev = marks[runs[r - 1].at(-1)];
        const sgn = r % 2 ? 1 : -1;
        const bulge = 100 * sgn;
        path.push(...cubic([prev.x, prev.y], [prev.x + bulge, prev.y], [prev.x + bulge, a.y], [a.x, a.y]).slice(1));
      }
      else { path.push([a.x, a.y]); }
      path.push([b.x, b.y]);
    });
    const first = path[0];
    const second = path[1] ?? first;
    const last = path.at(-1);
    const before = path.at(-2) ?? last;
    const unit = (p, q) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [(q[0] - p[0]) / l, (q[1] - p[1]) / l]; };
    const u0 = unit(second, first);
    const u1 = unit(before, last);
    m.path = path;
    m.len = polyLen(path);
    m.axis = [[first[0] + u0[0] * ext, first[1] + u0[1] * ext], ...path, [last[0] + u1[0] * ext, last[1] + u1[1] * ext]];
    m.marks = marks.map((q) => {
      let best = { d: Infinity, at: 0 };
      let acc = 0;
      for (let i = 1; i < path.length; i++) {
        const seg = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
        const dx = path[i][0] - path[i - 1][0];
        const dy = path[i][1] - path[i - 1][1];
        const k = seg ? clamp(((q.x - path[i - 1][0]) * dx + (q.y - path[i - 1][1]) * dy) / (seg * seg)) : 0;
        const dist = Math.hypot(path[i - 1][0] + dx * k - q.x, path[i - 1][1] + dy * k - q.y);
        if (dist < best.d - 1e-6) { best = { d: dist, at: acc + seg * k }; }
        acc += seg;
      }
      return { ...q, at: best.at };
    });
    return m;
  };
  const stemOf = (q, rect, side) => {
    if (side === 'above') { return [[q.x, q.y - DOT], [q.x, rect.y + rect.h + 4]]; }
    if (side === 'below') { return [[q.x, q.y + DOT], [q.x, rect.y - 4]]; }
    return [[q.x + DOT, q.y], [rect.x - 4, q.y]];
  };

  // One axis, labels alternate above and below (the original layout).
  const rowModel = () => {
    const g = timelineGeometry(n, area);
    const axisY = area.y + area.h / 2;
    const px = basePx;
    const dateW = Math.min(g.labelW, Math.max(g.spacing * 0.9, 120));
    const fits = items.map(it => fitLabel(it, g.labelW, px * 1.2 * 3, px));
    const dateFits = items.map(it => fitDate(it, dateW, px));
    // Taller areas get longer stems, so the strip uses more of the height; never so long that a label leaves the area.
    const labelMaxH = Math.max(...fits.map(labelH));
    const stem = Math.max(40, Math.min(clamp(area.h * 0.26, 74, 170), area.h / 2 - labelMaxH - 14));
    const labels = items.map((it, i) => ({ x: g.xs[i] - g.labelW / 2, y: g.sides[i] === 'above' ? axisY - stem - labelH(fits[i]) : axisY + stem, w: g.labelW, h: labelH(fits[i]) }));
    const dates = items.map((it, i) => (it.date ? { x: g.xs[i] - dateW / 2, y: g.sides[i] === 'above' ? axisY + 26 : axisY - 26 - dateH(dateFits[i]), w: dateW, h: dateH(dateFits[i]) } : null));
    const marks = g.xs.map(x => ({ x, y: axisY }));
    const m = { layout: 'row', px, fits, dateFits, labels, dates, align: 'center' };
    m.stems = marks.map((q, i) => stemOf(q, labels[i], g.sides[i]));
    return finish(assemble(m, marks, [marks.map((_, i) => i)], EXT));
  };

  // Several rows joined by curved connectors; labels below the dots, dates above, end labels pulled inward off the connectors.
  const snakeModelAt = (rows, px) => {
    const g = snakeGeometry(n, rows, area);
    const labelW = Math.min(g.spacing * 0.92 || 520, 520);
    const inward = (i) => {
      // A dot whose row continues through a connector (incoming at the row start, outgoing at the row end) keeps its text clear of it.
      const q = g.marks[i];
      const c = i % g.per;
      const goesRight = q.row % 2 === 0;
      const first = c === 0 && q.row > 0;
      const last = (c === g.per - 1 && q.row < g.rows - 1) || false;
      const out = (first && !goesRight) || (last && goesRight) ? 1 : (first && goesRight) || (last && !goesRight) ? -1 : 0;
      return out;
    };
    // End labels slide inward off the connector, so they are narrower to leave their neighbor clear.
    const widthOf = (i, w) => (inward(i) ? Math.min(w, g.spacing * 0.5 || w) : w);
    const dateW = Math.min(labelW, Math.max(g.spacing * 0.9, 160));
    const fits = items.map((it, i) => fitLabel(it, widthOf(i, labelW), px * 1.2 * 2, px));
    const dateFits = items.map((it, i) => fitDate(it, widthOf(i, dateW), px));
    // One row needs its dates above, the dot, the stem and its labels below, plus air before the next row.
    const need = Math.max(0, ...dateFits.filter(Boolean).map(dateH)) + Math.max(...fits.map(labelH)) + DOT * 2 + 38 + 44;
    const rowGap = Math.max(area.h / g.rows, need);
    const build = (y0) => {
      const marks = g.marks.map(q => ({ x: q.x, y: y0 + q.row * rowGap }));
      const run = marks.map((q, i) => ({ q, i }));
      const place = (w, f, i) => {
        const side = inward(i);
        const shift = side ? -side * Math.max(0, f.width / 2 - 22) : 0;
        return marks[i].x + shift - w / 2;
      };
      const labels = items.map((it, i) => ({ x: place(labelW, fits[i], i), y: marks[i].y + DOT + 26, w: labelW, h: labelH(fits[i]) }));
      const dates = items.map((it, i) => (it.date ? { x: place(dateW, dateFits[i], i), y: marks[i].y - DOT - 12 - dateH(dateFits[i]), w: dateW, h: dateH(dateFits[i]) } : null));
      const runs = Array.from({ length: g.rows }, (_, r) => run.filter(e => g.marks[e.i].row === r).map(e => e.i));
      const m = { layout: 'snake', px, fits, dateFits, labels, dates, align: 'center' };
      m.stems = marks.map((q, i) => stemOf(q, labels[i], 'below'));
      return finish(assemble(m, marks, runs, EXT));
    };
    const first = build(area.y + rowGap / 2);
    return build(area.y + rowGap / 2 + (area.y + area.h / 2 - (first.rect.y + first.rect.h / 2)));
  };
  // Biggest text first; shrink until the rows fit the area.
  const snakeModel = (rows) => {
    let px = Math.min(basePx * 1.3, d.labelPx * 1.5);
    let m = snakeModelAt(rows, px);
    while (m.rect.h > area.h && px > d.minPx) {
      px = Math.max(d.minPx, px * 0.93);
      m = snakeModelAt(rows, px);
    }
    return m;
  };

  // Vertical axis, dates left of it and labels to its right (left aligned).
  const columnModel = () => {
    const top = area.y + 60;
    const spacing = n > 1 ? (area.h - 120) / (n - 1) : 0;
    const px = Math.min(basePx * 1.45, spacing ? spacing * 0.5 : basePx * 1.45);
    const labelW = Math.min(area.w * 0.5, 900);
    const dateW = 300;
    const fits = items.map(it => fitLabel(it, labelW, (spacing || 120) * 0.92, px));
    const dateFits = items.map(it => fitDate(it, dateW, px));
    const axisX = area.x + area.w * 0.42;
    const marks = items.map((_, i) => ({ x: axisX, y: n > 1 ? top + i * spacing : area.y + area.h / 2 }));
    const labels = items.map((it, i) => ({ x: axisX + DOT + 36, y: marks[i].y - labelH(fits[i]) / 2, w: labelW, h: labelH(fits[i]) }));
    const dates = items.map((it, i) => (it.date ? { x: axisX - DOT - 36 - dateFits[i].width - 8, y: marks[i].y - dateH(dateFits[i]) / 2, w: dateFits[i].width + 8, h: dateH(dateFits[i]) } : null));
    const m = { layout: 'column', px, fits, dateFits, labels, dates, align: 'left' };
    m.stems = marks.map((q, i) => stemOf(q, labels[i], 'right'));
    finish(assemble(m, marks, [marks.map((_, i) => i)], EXT));
    // Center the whole block horizontally in the area.
    const dx = area.x + (area.w - m.rect.w) / 2 - m.rect.x;
    const mv = r => (r ? { ...r, x: r.x + dx } : r);
    const sh = p => [p[0] + dx, p[1]];
    return { ...m, labels: m.labels.map(mv), dates: m.dates.map(mv), marks: m.marks.map(q => ({ ...q, x: q.x + dx })), path: m.path.map(sh), axis: m.axis.map(sh), stems: m.stems.map(st => st.map(sh)), rect: mv(m.rect) };
  };

  const pick = () => {
    const want = o.layout ?? 'auto';
    if (want === 'row' || n === 1) { return rowModel(); }
    if (want === 'snake') { return snakeModel(o.rows ?? snakeRows(n)); }
    if (want === 'column') { return columnModel(); }
    const row = rowModel();
    if (n <= 5 && row.rect.h >= area.h * 0.55 && row.worst >= 0.9) { return row; }
    // Few events with long labels read better down the page; many events wrap into rows.
    return n <= 4 ? columnModel() : snakeModel(snakeRows(n));
  };
  const M = pick();
  const rect = register(s, id, M.rect);
  const at = o.at ?? 0;
  const travelAt = at + 0.8;
  const travel = o.dur ?? 4;
  const to = o.to ?? 1;
  const first = M.marks[0].at;
  const lastAt = M.marks[n - 1].at;
  // Distance travelled along the path (px, from the first dot) at time t.
  const dist = t => lerp(first, lerp(first, lastAt, to), ease.inOut(prog(t, travelAt, travel)));
  const reach = (t, i) => ease.out(clamp((dist(t) - M.marks[i].at + 28) / 90));
  const axisP = t => ease.inOut(prog(t, at, 0.7));
  const along = dd => pointAt(M.path, dd / (M.len || 1));
  const trimmed = (pts, dd) => {
    const out = [pts[0]];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc + seg >= dd) { out.push([lerp(pts[i - 1][0], pts[i][0], seg ? (dd - acc) / seg : 0), lerp(pts[i - 1][1], pts[i][1], seg ? (dd - acc) / seg : 0)]); return out; }
      acc += seg;
      out.push(pts[i]);
    }
    return out;
  };
  const filled = M.path;
  const dot = (x, y, r) => ({ x: x - r, y: y - r, w: r * 2, h: r * 2 });
  return {
    kind: 'timeline',
    id,
    z: o.z ?? 0,
    rect,
    layout: M.layout,
    texts: () => [...items.map(it => it.label), ...items.filter(it => it.date).map(it => it.date)],
    draw(api, t) {
      const ap = axisP(t);
      if (ap <= 0) { return; }
      const seed = hash(id);
      api.style.line(api, M.axis, { p: ap, color: 'dim', lw: 5, head: true, seed });
      const dd = dist(t);
      if (dd > first + 1) { api.style.line(api, trimmed(filled, dd - first), { p: 1, color: o.color ?? 'accent', lw: 7, seed: seed + 1 }); }
      items.forEach((it, i) => {
        const r = reach(t, i);
        const color = it.color ?? o.color ?? 'accent';
        api.style.shape(api, dot(M.marks[i].x, M.marks[i].y, DOT), { kind: 'ellipse', p: ap, stroke: r > 0.5 ? color : 'dim', fill: r > 0.5 ? color : 'panel', lw: 3, seed: seed + i });
        if (r <= 0) { return; }
        api.style.line(api, M.stems[i], { p: r, color: 'dim', lw: 2.5, head: false, seed: seed + 20 + i });
        drawTextBlock(api, M.fits[i], M.labels[i], { align: M.align, weight: 600, color: 'ink', alpha: r });
        if (M.dates[i]) { drawTextBlock(api, M.dateFits[i], M.dates[i], { align: M.align === 'left' ? 'center' : 'center', weight: 600, color: it.color ?? o.color ?? 'accent', alpha: r }); }
      });
      const mk = along(dd);
      api.style.shape(api, dot(mk.x, mk.y, 22), { kind: 'ellipse', p: 1, stroke: o.color ?? 'accent', fill: 'ink', lw: 4, glow: 22, seed: seed + 99 });
    },
    qa: (api, t) => ({
      rect,
      alpha: axisP(t),
      container: true,
      texts: [
        ...items.map((it, i) => ({ text: it.label, rect: blockBox(M.fits[i], M.labels[i], M.align), overflow: M.fits[i].overflow, px: M.fits[i].px })),
        ...items.flatMap((it, i) => (M.dates[i] ? [{ text: it.date, rect: blockBox(M.dateFits[i], M.dates[i]), overflow: M.dateFits[i].overflow, px: M.dateFits[i].px }] : [])),
      ],
    }),
  };
}

export const pieces = { timeline };
