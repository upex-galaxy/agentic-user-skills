import { around, box, dot, drawT, fillRect, fitPx, line, path, piece, poly, resolveRect, ring, size, text, textKit, textW } from '../kit.js';
// Numbers family: counter, progress, gauge, chart (line | area | bars) and dotGrid. Everything is built with piece()
// and the style calls, so each draws in any preset; every visible string (live values included) goes through QA.
import { clamp, ease, kf, lerp, prog, resolveEase } from '../math.js';

const fadeOut = (o, t) => (o.until === undefined ? 1 : 1 - ease.in(prog(t, o.until, 0.35)));
const fadeIn = (t, at, d = 0.3) => ease.out(prog(t, at, d));

/** Number to text: decimals, prefix, suffix, group separator (Spanish "1.250,5" unless lang is en or sep is given). */
export function formatNumber(v, { decimals = 0, prefix = '', suffix = '', sep = '.' } = {}) {
  const [int, dec] = Math.abs(v).toFixed(decimals).split('.');
  const grouped = sep ? int.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : int;
  const neg = v < 0 && /[1-9]/.test(`${int}${dec ?? ''}`) ? '-' : '';
  return `${prefix}${neg}${grouped}${dec ? `${sep === '.' ? ',' : '.'}${dec}` : ''}${suffix}`;
}

// ---- counter ------------------------------------------------------------------------------------------------------

/**
 * Number that counts. o: rect | in | x,y,w,h, from (0), to, at, dur (1.5) or keys [[t, value]] (a timeline of values
 * instead of from/to), decimals, prefix, suffix, sep, label (small line under), ease, color, px (max), font, until.
 * The number is fitted for the widest value it reaches, so it never overflows; it bumps when it lands.
 */
export function counter(s, o) {
  const rect = resolveRect(s, o, 'counter');
  const at = o.at ?? 0;
  const dur = o.dur ?? 1.5;
  const keys = o.keys?.length ? o.keys : null;
  if (!keys && !Number.isFinite(o.to)) { throw new Error('counter needs "to" (or keys: [[t, value]])'); }
  const from = o.from ?? 0;
  const fn = resolveEase(o.ease, 'out');
  const valueAt = t => (keys ? kf(t, keys, o.ease ?? 'inOut') : lerp(from, o.to, fn(prog(t, at, dur))));
  const endT = keys ? keys[keys.length - 1][0] : at + dur;
  const startT = keys ? Math.min(at, keys[0][0]) : at;
  const final = keys ? keys[keys.length - 1][1] : o.to;
  const sep = o.sep ?? (s.lang === 'en' ? ',' : '.');
  const fmt = v => formatNumber(v, { decimals: o.decimals, prefix: o.prefix, suffix: o.suffix, sep });
  // Widest text the number can show: sample the whole run (values in between can be longer than both ends).
  const samples = keys ? keys.map(k => k[1]) : [from, o.to];
  for (let i = 0; i <= 48; i++) { samples.push(valueAt(startT + ((endT - startT) * i) / 48)); }
  const role = o.font ?? 'display';
  const widest = samples.map(fmt).reduce((a, b) => (textW(s, b, 100, role, 700) >= textW(s, a, 100, role, 700) ? b : a));
  const tk = textKit(s);
  const labelPx = o.label ? fitPx(s, o.label, rect.w, size(s, 'label', 0.85)) : 0;
  const labelH = o.label ? labelPx * 1.5 : 0;
  const numH = rect.h - labelH;
  const px = fitPx(s, widest, rect.w * 0.9, o.px ?? Math.min(numH * 0.78, size(s, 'node', 4.2)), { role, weight: 700 });
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + numH / 2;
  if (o.label) { tk.make(o.label, cx, rect.y + rect.h - labelH / 2, rect.w, { px: labelPx, align: 'center', color: 'dim' }); }
  const vis = t => fadeIn(t, startT) * fadeOut(o, t);
  const cur = t => fmt(valueAt(t));
  return piece(s, o, {
    kind: 'counter',
    rect,
    tk,
    texts: [fmt(samples[0]), fmt(final), widest],
    vis,
    end: endT,
    draw(api, t) {
      const k = 1 + 0.08 * Math.sin(Math.PI * prog(t, endT, 0.4));
      around(api, cx, cy, k, () => text(api, cur(t), cx, cy, { px, role, weight: 700, color: o.color ?? 'accent', align: 'center', glow: 14 }));
      for (const sp of tk.list) { drawT(api, sp); }
    },
    qa(api, t) {
      const str = cur(t);
      const w = textW(s, str, px, role, 700);
      return { rect, alpha: vis(t), container: true, host: o.in, texts: [{ text: str, rect: { x: cx - w / 2, y: cy - px * 0.6, w, h: px * 1.2 }, overflow: w > rect.w + 1, px }, ...tk.qa(t)] };
    },
  });
}

// ---- progress -----------------------------------------------------------------------------------------------------

/**
 * Horizontal progress bar. o: rect, at, dur (2), from (0), to (1) as fractions, label (above, left), pct (true: percent
 * above, right), segments (n: the fill advances in n steps), color, doneColor (good, when full), linear, until.
 */
export function progress(s, o) {
  const rect = resolveRect(s, o, 'progress');
  const at = o.at ?? 0;
  const dur = o.dur ?? 2;
  const from = o.from ?? 0;
  const to = o.to ?? 1;
  const showPct = o.pct !== false;
  const hasHead = Boolean(o.label) || showPct;
  const headPx = size(s, 'label', 0.85);
  const headH = hasHead ? Math.min(rect.h * 0.6, headPx * 1.5) : 0;
  const bar = { x: rect.x, y: rect.y + headH + (hasHead ? 4 : 0), w: rect.w, h: Math.max(12, rect.h - headH - (hasHead ? 4 : 0)) };
  const pctW = showPct ? textW(s, '100 %', headPx, 'mono') + 12 : 0;
  const tk = textKit(s);
  if (o.label) { tk.make(o.label, rect.x, rect.y + headH / 2, rect.w - pctW - 16, { px: headPx }); }
  const f = o.linear ? t => prog(t, at, dur) : t => ease.inOut(prog(t, at, dur));
  const valueAt = (t) => {
    let k = lerp(from, to, f(t));
    if (o.segments) { k = Math.floor(k * o.segments + 1e-6) / o.segments; }
    return k;
  };
  const pctText = t => `${Math.round(valueAt(t) * 100)} %`;
  const vis = t => fadeIn(t, at) * fadeOut(o, t);
  return piece(s, o, {
    kind: 'progress',
    rect,
    tk,
    texts: showPct ? [pctText(at + dur + 1)] : [],
    vis,
    end: at + dur,
    draw(api, t) {
      const k = valueAt(t);
      const col = k >= 0.999 ? (o.doneColor ?? 'good') : (o.color ?? 'accent');
      for (const sp of tk.list) { drawT(api, sp); }
      if (showPct) { text(api, pctText(t), rect.x + rect.w, rect.y + headH / 2, { px: headPx, role: 'mono', weight: 700, color: col, align: 'right' }); }
      fillRect(api, bar, 'dim', 0.22, bar.h / 2);
      fillRect(api, { ...bar, w: Math.max(0, bar.w * k) }, col, 1, bar.h / 2);
      box(api, bar, { kind: 'pill', stroke: col, fill: null, lw: 2, glow: 10 });
      const raw = prog(t, at, dur);
      if (raw > 0 && raw < 1) { dot(api, bar.x + bar.w * k, bar.y + bar.h / 2, bar.h * 0.55, 'ink', { alpha: 0.9, glow: 18 }); }
    },
    qa(api, t) {
      const str = pctText(t);
      const w = textW(s, str, headPx, 'mono', 700);
      const pct = showPct ? [{ text: str, rect: { x: rect.x + rect.w - w, y: rect.y + headH / 2 - headPx * 0.6, w, h: headPx * 1.2 }, overflow: false, px: headPx }] : [];
      return { rect, alpha: vis(t), container: true, host: o.in, texts: [...pct, ...tk.qa(t)] };
    },
  });
}

// ---- gauge --------------------------------------------------------------------------------------------------------

/**
 * Radial gauge (a 270 degree dial) that fills to `to` (0..1) with the value in the middle. o: rect, to (1), at, dur
 * (1.5), label (under the dial), suffix (' %'), scale (100: the number shown at full), color, until.
 */
export function gauge(s, o) {
  const rect = resolveRect(s, o, 'gauge');
  const at = o.at ?? 0;
  const dur = o.dur ?? 1.5;
  const to = o.to ?? 1;
  const scale = o.scale ?? 100;
  const suffix = o.suffix ?? ' %';
  const labelPx = o.label ? fitPx(s, o.label, rect.w, size(s, 'label', 0.85)) : 0;
  const labelH = o.label ? labelPx * 1.6 : 0;
  const r = Math.max(8, Math.min(rect.w, rect.h - labelH) / 2 - 12);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + (rect.h - labelH) / 2;
  const lw = Math.max(8, r * 0.14);
  const valueAt = t => to * ease.inOut(prog(t, at, dur));
  const str = t => `${Math.round(valueAt(t) * scale)}${suffix}`;
  const role = 'display';
  const full = `${Math.round(to * scale)}${suffix}`;
  const px = fitPx(s, full, r * 1.3, r * 0.55, { role, weight: 700 });
  const tk = textKit(s);
  if (o.label) { tk.make(o.label, cx, rect.y + rect.h - labelH / 2, rect.w, { px: labelPx, align: 'center', color: 'dim' }); }
  const A0 = Math.PI * 0.75;
  const SPAN = Math.PI * 1.5;
  const vis = t => fadeIn(t, at) * fadeOut(o, t);
  return piece(s, o, {
    kind: 'gauge',
    rect,
    tk,
    texts: [str(at + dur + 1)],
    vis,
    end: at + dur,
    draw(api, t) {
      const k = valueAt(t);
      const col = o.color ?? 'accent';
      ring(api, cx, cy, r, { from: A0, to: A0 + SPAN, color: 'dim', lw, alpha: 0.35, glow: 0 });
      if (k > 0.002) { ring(api, cx, cy, r, { from: A0, to: A0 + SPAN * k, color: col, lw, glow: 16 }); }
      text(api, str(t), cx, cy, { px, role, weight: 700, color: col, align: 'center', glow: 10 });
      for (const sp of tk.list) { drawT(api, sp); }
    },
    qa(api, t) {
      const v = str(t);
      const w = textW(s, v, px, role, 700);
      return { rect, alpha: vis(t), container: true, host: o.in, texts: [{ text: v, rect: { x: cx - w / 2, y: cy - px * 0.6, w, h: px * 1.2 }, overflow: w > r * 1.5, px }, ...tk.qa(t)] };
    },
  });
}

// ---- chart --------------------------------------------------------------------------------------------------------

const fmtVal = v => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/**
 * Chart that draws itself. o: rect, type ('line' | 'area' | 'bars'), data (numbers, or an array of number arrays for
 * several lines), labels (under the x axis), colors (per bar or per line), title, yMax, at, dur (2), step (bars appear
 * one by one every `step` seconds; default spreads them over dur), mark { i, text, color } (event marker on a line or
 * area point), until.
 */
export function chart(s, o) {
  const rect = resolveRect(s, o, 'chart');
  const at = o.at ?? 0;
  const dur = o.dur ?? 2;
  const type = o.type ?? 'line';
  if (!['line', 'area', 'bars'].includes(type)) { throw new Error(`chart type must be line, area or bars, got "${type}"`); }
  const bars = type === 'bars';
  const series = Array.isArray(o.data?.[0]) ? o.data : [o.data ?? []];
  const n = Math.max(...series.map(x => x.length));
  if (!n || !Number.isFinite(n)) { throw new Error('chart needs data'); }
  const yMax = o.yMax ?? Math.max(...series.flat()) * 1.18;
  const textPx = size(s, 'label', 0.72);
  const tk = textKit(s);
  const titlePx = o.title ? fitPx(s, o.title, rect.w - 16, size(s, 'label', 0.9), { weight: 700 }) : 0;
  const titleH = o.title ? titlePx * 1.7 : 0;
  if (o.title) { tk.make(o.title, rect.x + 8, rect.y + titleH / 2, rect.w - 16, { px: titlePx, weight: 700, color: 'dim' }); }
  const labelH = o.labels?.length ? textPx * 2 : 0;
  const plot = { x: rect.x + 14, y: rect.y + titleH + 14, w: rect.w - 28, h: rect.h - titleH - labelH - 28 };
  const base = plot.y + plot.h;
  const xs = i => (bars ? plot.x + (plot.w / n) * (i + 0.5) : plot.x + 24 + ((plot.w - 48) * i) / Math.max(1, n - 1));
  const ys = v => base - (v / yMax) * plot.h;
  const palette = ['accent', 'accent2', 'good', 'warn'];
  const colorOf = i => o.colors?.[i] ?? (bars ? o.color ?? 'accent' : o.color && i === 0 ? o.color : palette[i % palette.length]);
  const t0 = at + 0.4;
  const step = o.step ?? (dur * 0.7) / n;
  const barDur = 0.5;
  const barAt = i => t0 + i * step;
  const pts = series.map(sr => sr.map((v, i) => [xs(i), ys(v)]));
  // x labels: one per point when counts match, otherwise spread evenly
  const labs = o.labels ?? [];
  labs.forEach((l, i) => {
    const idx = labs.length === n || bars ? i : Math.round((i * (n - 1)) / Math.max(1, labs.length - 1));
    const slot = Math.min(plot.w / labs.length, 420);
    tk.make(l, xs(idx), rect.y + rect.h - labelH / 2 - 2, slot, { px: textPx, align: 'center', color: 'dim', at: at + 0.2 });
  });
  // bars: one value label per bar, visible once the bar has grown
  if (bars) { series[0].forEach((v, i) => tk.make(fmtVal(v), xs(i), ys(v) - textPx * 0.95, (plot.w / n) * 0.9, { px: textPx, weight: 700, align: 'center', role: 'mono', color: 'ink', at: barAt(i) + barDur * 0.6 })); }
  // line / area: fraction of the path length at which the marker point is reached, then the time it takes
  const draw0 = t0;
  const lineP = t => ease.inOut(prog(t, draw0, dur));
  let markAt = 0;
  const mk = !bars && o.mark ? o.mark : null;
  if (mk) {
    const sp = pts[0];
    if (!sp[mk.i]) { throw new Error(`chart mark.i ${mk.i} is outside the data (0..${sp.length - 1})`); }
    const frac = path.pathLen(sp.slice(0, mk.i + 1)) / (path.pathLen(sp) || 1);
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (ease.inOut(mid) < frac) { lo = mid; }
      else { hi = mid; }
    }
    markAt = draw0 + hi * dur;
    const [px0, py0] = sp[mk.i];
    const mpx = textPx * 1.05;
    const next = sp[mk.i + 1];
    const mw = Math.min(textW(s, mk.text, mpx, 'body', 700) + 4, 420);
    // Keep the label clear of the line: beside the point, on the side the line leaves from.
    const room = rect.x + rect.w - 6 - (px0 + 22);
    const side = next && room >= mw ? 'right' : 'center';
    const below = Boolean(next) && next[1] < py0;
    const my = below ? py0 + 40 : py0 - 40;
    if (side === 'right') { tk.make(mk.text, px0 + 22, my, Math.min(420, room), { px: mpx, weight: 700, align: 'left', color: mk.color ?? 'good', at: markAt }); }
    else { tk.make(mk.text, clamp(px0, rect.x + mw / 2 + 6, rect.x + rect.w - mw / 2 - 6), py0 - 44, 420, { px: mpx, weight: 700, align: 'center', color: mk.color ?? 'good', at: markAt }); }
  }
  const endT = bars ? barAt(n - 1) + barDur : Math.max(draw0 + dur, markAt + (mk ? 0.4 : 0));
  const vis = t => fadeIn(t, at, 0.5) * fadeOut(o, t);
  const textSpecs = tk.list;
  return piece(s, o, {
    kind: 'chart',
    rect,
    tk,
    vis,
    end: endT,
    draw(api, t) {
      const ax = ease.out(prog(t, at, 0.6));
      line(api, [[plot.x, plot.y], [plot.x, base], [plot.x + plot.w, base]], { p: ax, color: 'dim', lw: 2, glow: 0 });
      for (let g = 1; g <= 3; g++) { line(api, [[plot.x, base - (plot.h * g) / 3.4], [plot.x + plot.w, base - (plot.h * g) / 3.4]], { p: ax, color: 'dim', lw: 1, glow: 0, dash: [4, 10], alpha: 0.5 }); }
      if (bars) {
        const bw = (plot.w / n) * 0.56;
        series[0].forEach((v, i) => {
          const k = ease.back(prog(t, barAt(i), barDur));
          if (k <= 0) { return; }
          const h = Math.max(0, (v / yMax) * plot.h * k);
          const r = { x: xs(i) - bw / 2, y: base - h, w: bw, h };
          const c = colorOf(i);
          fillRect(api, r, c, 0.3, 5);
          box(api, r, { kind: 'rect', stroke: c, fill: null, lw: 2.5 });
        });
      }
      else {
        const p = lineP(t);
        if (p > 0) {
          pts.forEach((sp, si) => {
            const c = colorOf(si);
            const tip = path.pointAt(sp, p);
            const total = path.pathLen(sp) || 1;
            if (type === 'area') {
              const shown = [sp[0]];
              let acc = 0;
              for (let i = 1; i < sp.length && acc / total < p; i++) {
                acc += Math.hypot(sp[i][0] - sp[i - 1][0], sp[i][1] - sp[i - 1][1]);
                shown.push(acc / total <= p ? sp[i] : [tip.x, tip.y]);
              }
              poly(api, [...shown, [shown[shown.length - 1][0], base], [sp[0][0], base]], { fill: c, fillAlpha: 0.18, stroke: null });
            }
            line(api, sp, { color: c, lw: 4, glow: 14, p });
            let run = 0;
            sp.forEach((q, i) => {
              if (i) { run += Math.hypot(q[0] - sp[i - 1][0], q[1] - sp[i - 1][1]); }
              if (run / total <= p - 0.01 && i) { dot(api, q[0], q[1], 5, c, { glow: 6 }); }
            });
            if (p < 1) { dot(api, tip.x, tip.y, 8, 'ink', { glow: 16 }); }
          });
        }
        if (mk) {
          const m = ease.back(prog(t, markAt, 0.4));
          if (m > 0) {
            const [mx, my] = pts[0][mk.i];
            ring(api, mx, my, 14 * m, { color: mk.color ?? 'good', lw: 3 });
          }
        }
      }
      for (const sp of textSpecs) {
        if (t >= (sp.at ?? 0)) { drawT(api, sp, { alpha: clamp((t - (sp.at ?? 0)) / 0.3) }); }
      }
    },
    qa: (api, t) => ({ rect, alpha: vis(t), container: true, host: o.in, texts: tk.qa(t) }),
  });
}

// ---- dotGrid ------------------------------------------------------------------------------------------------------

/**
 * Grid of dots that fill one by one (tests passing, hosts updated). o: rect, rows, cols, at, dur (2), fail (indices
 * that turn out bad), color (good), until.
 */
export function dotGrid(s, o) {
  const rect = resolveRect(s, o, 'dotGrid');
  const { rows, cols } = o;
  if (!(rows > 0 && cols > 0)) { throw new Error('dotGrid needs rows and cols'); }
  const at = o.at ?? 0;
  const dur = o.dur ?? 2;
  const total = rows * cols;
  const cw = rect.w / cols;
  const ch = rect.h / rows;
  const rad = Math.min(cw, ch) * 0.34;
  const fail = new Set(o.fail ?? []);
  const vis = t => fadeIn(t, at - 0.3, 0.3) * fadeOut(o, t);
  return piece(s, o, {
    kind: 'dotGrid',
    rect,
    vis,
    end: at + dur,
    draw(api, t) {
      const done = prog(t, at, dur) * total;
      for (let i = 0; i < total; i++) {
        const x = rect.x + cw * ((i % cols) + 0.5);
        const y = rect.y + ch * (Math.floor(i / cols) + 0.5);
        const k = clamp(done - i);
        if (k <= 0) { ring(api, x, y, rad * 0.7, { color: 'dim', lw: 2, alpha: 0.55, glow: 0 }); }
        else { dot(api, x, y, rad * (0.8 + 0.4 * Math.sin(Math.PI * k) + 0.2 * k), fail.has(i) ? 'bad' : (o.color ?? 'good'), { glow: 8 }); }
      }
    },
  });
}

export const pieces = { counter, progress, gauge, chart, dotGrid };
