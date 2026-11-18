import { around, box, clipTo, cross, dot, drawT, fillRect, fitPx, inset, line, piece, resolveRect, ring, size, spinner, text, textKit, textW, tick } from '../kit.js';
// Systems family: pipeline (CI), gitGraph, machine (belt), fleet (rolling update) and layers. Every piece is built with
// piece() and the style calls, so it draws in any preset; each string (live timers included) goes through QA, and the
// sub-elements others may point at (jobs, commits, servers, layers) are registered as `<id>.<sub>` and reported as parts.
import { clamp, ease, lerp, prog } from '../math.js';
import { drawIcon } from './icons.js';

const wrap1 = x => x - Math.floor(x);
const up = (t, at, d = 0.5) => ease.out(prog(t, at, d));
const stateTok = { wait: 'dim', run: 'warn', ok: 'good', fail: 'bad' };
const need = (cond, msg) => {
  if (!cond) { throw new Error(msg); }
};

/** Shared QA record of a composite: its rect, the visible texts, the inner parts. */
const untilFade = (o, t) => (o.until === undefined ? 1 : 1 - prog(t, o.until, 0.35));
const record = (rect, o, alpha, texts, parts, t) => ({ rect, alpha: alpha * untilFade(o, t), container: true, host: o.in, texts, parts });

// ---- pipeline -----------------------------------------------------------------------------------------------------

const clock = (sec) => {
  const n = Math.floor(sec);
  return n < 60 ? `${n} s` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};

/**
 * CI pipeline: stage columns of job cards. A job waits, runs (spinner, bar, timer) and ends in a check or a cross; a stage
 * header turns green or red when its jobs end and a connector lights up toward the next stage. o: id, rect | in, title,
 * at, runAt (when the first stage starts, at + 1), timeScale (timer seconds shown per real second, 14), gap, stages
 * [{ name, jobs: [{ name, id?, start?, dur (1.5), ok (true), secs? }] }]. Without a job `start`, a stage starts when the
 * previous one ends (jobs 0.15 s apart); `secs` is the time the timer ends on. Registers `<id>.s<N>`, `<id>.j<N>.<M>`
 * (and `<id>.<job id>`). Exposes end and marks.stageEnd = { <stage name>: t }.
 */
export function pipeline(s, o) {
  const rect = resolveRect(s, o, 'pipeline');
  const id = o.id ?? s.uid('pipeline');
  need(o.stages?.length, 'pipeline needs stages: [{ name, jobs: [{ name, dur, ok }] }]');
  const at = o.at ?? 0;
  const { pad } = s.style.defaults;
  const scale = o.timeScale ?? 14;
  const n = o.stages.length;
  const px = { title: size(s, 'label', 0.9), stage: size(s, 'label', 0.8), job: size(s, 'label', 0.75), timer: size(s, 'label', 0.55) };
  const gapX = o.gap ?? Math.max(pad * 3, 70);
  const gapY = pad * 0.8;
  const colW = (rect.w - gapX * (n - 1)) / n;
  const titleH = o.title ? px.title * 1.8 : 0;
  const headH = px.stage * 2;
  const stages = o.stages.map(st => ({ ...st, jobs: (st.jobs ?? []).map(j => (typeof j === 'string' ? { name: j } : { ...j })) }));
  const maxJobs = Math.max(...stages.map(st => st.jobs.length));
  need(maxJobs > 0, 'pipeline stages need at least one job');
  const body = rect.y + titleH + headH + gapY * 1.4;
  const cardH = Math.min(px.job * 4.8, (rect.y + rect.h - body - (maxJobs - 1) * gapY) / maxJobs);
  const ir = px.job * 0.42;

  let cur = o.runAt ?? at + 1;
  const maxSecs = Math.max(...stages.flatMap(st => st.jobs.map(j => j.secs ?? (j.dur ?? 1.5) * scale)));
  const timerW = Math.max(textW(s, clock(maxSecs), px.timer, 'mono'), textW(s, '88 s', px.timer, 'mono'));
  const tk = textKit(s);
  if (o.title) { tk.make(o.title, rect.x, rect.y + titleH / 2, rect.w, { px: px.title, weight: 700, at }); }
  stages.forEach((st, i) => {
    const x = rect.x + i * (colW + gapX);
    st.rect = { x, y: rect.y + titleH, w: colW, h: headH };
    st.enter = at + i * 0.2;
    st.start = cur;
    st.name = String(st.name);
    st.jobs.forEach((j, k) => {
      j.start = Number.isFinite(j.start) ? j.start : cur + k * 0.15;
      j.dur = j.dur ?? 1.5;
      j.end = j.start + j.dur;
      j.secs = j.secs ?? j.dur * scale;
      j.ok = j.ok !== false;
      j.rect = { x, y: body + k * (cardH + gapY), w: colW, h: cardH };
      j.enter = st.enter + 0.3 + k * 0.1;
      j.cy = j.rect.y + (cardH - 26) / 2;
      const nameX = x + pad + ir * 2 + pad * 0.7;
      j.spec = tk.make(j.name, nameX, j.cy, x + colW - pad - timerW - 10 - nameX, { px: px.job, weight: 600, at: j.enter + 0.15 });
      s.reg.add(`${id}.j${i + 1}.${k + 1}`, j.rect);
      if (j.id) { s.reg.add(`${id}.${j.id}`, j.rect); }
    });
    st.end = st.jobs.length ? Math.max(...st.jobs.map(j => j.end)) : cur;
    st.start = Math.min(st.start, ...st.jobs.map(j => j.start));
    st.ok = st.jobs.every(j => j.ok);
    st.spec = tk.make(st.name, x + pad * 1.4, st.rect.y + headH / 2, colW - pad * 1.4 - headH, { px: px.stage, weight: 700, at: st.enter + 0.15 });
    s.reg.add(`${id}.s${i + 1}`, st.rect);
    cur = st.end + 0.4;
  });
  const timerOf = (j, t) => clock(prog(t, j.start, j.dur) * j.secs);
  const timerSpec = (j, t) => {
    const str = timerOf(j, t);
    const w = textW(s, str, px.timer, 'mono');
    const right = j.rect.x + colW - pad;
    return { text: str, rect: { x: right - w, y: j.cy - px.timer * 0.6, w, h: px.timer * 1.2 }, overflow: false, px: px.timer };
  };
  const endAll = stages[n - 1].end + 0.3;
  const parts = () => stages.flatMap((st, i) => [{ id: `s${i + 1}`, rect: st.rect }, ...st.jobs.map((j, k) => ({ id: `j${i + 1}.${k + 1}`, rect: j.rect }))]);

  return piece(s, { ...o, id }, {
    kind: 'pipeline',
    rect,
    tk,
    texts: stages.flatMap(st => st.jobs.map(j => clock(j.secs))),
    end: endAll,
    marks: { stageEnd: Object.fromEntries(stages.map(st => [st.name, st.end])) },
    parts,
    qa: (_api, t) => record(rect, o, t < at ? 0 : 1, [
      ...tk.qa(t),
      ...stages.flatMap(st => st.jobs.filter(j => t >= j.start && t >= j.enter).map(j => timerSpec(j, t))),
    ], parts(), t),
    draw(api, t) {
      if (o.title) { drawT(api, tk.list[0], { alpha: up(t, at) }); }
      stages.forEach((st, i) => {
        const k = up(t, st.enter);
        if (k <= 0) { return; }
        const f = api.fade(k);
        const done = t >= st.end;
        const tok = done ? (st.ok ? 'good' : 'bad') : t >= st.start ? 'warn' : 'dim';
        box(f, st.rect, { kind: 'pill', p: k, stroke: tok, fill: 'panel', lw: 3, glow: done || t >= st.start ? 10 : 0 });
        drawT(f, st.spec, { color: 'onPanel', alpha: clamp(k * 2 - 1) });
        const ix = st.rect.x + colW - headH * 0.55;
        const iy = st.rect.y + headH / 2;
        if (done) { (st.ok ? tick : cross)(f, ix, iy, headH * 0.55, prog(t, st.end, 0.3), tok, 4); }
        else if (t >= st.start) { spinner(f, ix, iy, headH * 0.2, t, 'warn', 3.5); }
        if (i < n - 1) {
          const x0 = st.rect.x + colW + 8;
          const x1 = stages[i + 1].rect.x - 8;
          const lit = t >= st.end;
          line(f, [[x0, iy], [x1, iy]], { p: k, color: lit ? 'good' : 'dim', lw: lit ? 3.5 : 2.5, head: true, dash: lit ? null : [8, 8], alpha: lit ? 1 : 0.7 });
          const q = prog(t, st.end, 0.5);
          if (lit && q < 1) { dot(f, lerp(x0, x1, ease.inOut(q)), iy, 8, 'good', { glow: 14 }); }
        }
        st.jobs.forEach((j) => {
          const kk = up(t, j.enter);
          if (kk <= 0) { return; }
          const run = prog(t, j.start, j.dur);
          const state = t < j.start ? 'wait' : t < j.end ? 'run' : j.ok ? 'ok' : 'fail';
          const col = stateTok[state];
          const bump = state === 'ok' || state === 'fail' ? 1 + 0.04 * Math.sin(Math.PI * prog(t, j.end, 0.35)) : 1;
          const g = api.fade(kk);
          const cx = j.rect.x + pad + ir;
          around(g, j.rect.x + colW / 2, j.rect.y + cardH / 2, lerp(0.92, 1, kk) * bump, () => {
            box(g, j.rect, { kind: 'round', p: kk, stroke: col, fill: 'panel', lw: state === 'wait' ? 2.5 : 3, glow: state === 'wait' ? 0 : 10 });
            if (state === 'wait') { ring(g, cx, j.cy, ir * 0.8, { color: 'dim', lw: 2.5, glow: 0, alpha: 0.7 }); }
            else if (state === 'run') { spinner(g, cx, j.cy, ir * 0.8, t, 'warn', 3.5); }
            else if (state === 'ok') { tick(g, cx, j.cy, ir * 2, prog(t, j.end, 0.3), 'good', 4); }
            else { cross(g, cx, j.cy, ir * 2, prog(t, j.end, 0.3), 'bad', 4); }
            drawT(g, j.spec, { color: state === 'wait' ? 'dim' : 'onPanel' });
            if (state !== 'wait') {
              const ts = timerSpec(j, t);
              text(g, ts.text, ts.rect.x + ts.rect.w, j.cy, { px: px.timer, role: 'mono', color: col, align: 'right' });
            }
            const bar = { x: j.rect.x + pad, y: j.rect.y + cardH - 20, w: colW - pad * 2, h: 8 };
            fillRect(g, bar, 'dim', 0.25, 4);
            fillRect(g, { ...bar, w: bar.w * run }, state === 'wait' ? 'warn' : col, 1, 4);
          });
        });
      });
    },
  });
}

// ---- gitGraph -----------------------------------------------------------------------------------------------------

/**
 * Commit graph that grows. o: id, rect | in, at, lanes [{ name, color }] (top to bottom), cols (the largest commit col
 * + 1), r (commit radius), commits [{ id, lane (a lane name), col, at (when it pops), parents [commit ids], label, tag }].
 * Lane names are fitted into a left gutter; edges draw from the parent (an S curve across lanes) just before the commit
 * pops; a tag is a pill beside the commit. Registers `<id>.<commit id>` for every commit (a packet or a callout can aim at
 * it). Exposes end and marks.<commit id> = the time that commit appears.
 */
export function gitGraph(s, o) {
  const rect = resolveRect(s, o, 'gitGraph');
  const id = o.id ?? s.uid('git');
  need(o.lanes?.length && o.commits?.length, 'gitGraph needs lanes and commits');
  const at = o.at ?? 0;
  const { pad } = s.style.defaults;
  const lanes = o.lanes.map((l, i) => ({ ...l, name: String(l.name ?? l.id), i }));
  const laneOf = Object.fromEntries(lanes.map(l => [l.name, l]));
  const cols = o.cols ?? Math.max(...o.commits.map(c => c.col)) + 1;
  const tk = textKit(s);
  const R = Math.round(o.r ?? clamp(size(s, 'label', 0.55), 14, 30));
  const cpx = size(s, 'label', 0.62);
  const sideOf = lane => (lanes.length > 1 && lane.i < (lanes.length - 1) / 2 ? -1 : 1);
  // Label and tag band: how far a commit's text reaches past its lane. The top and bottom lanes reserve it inside the rect.
  const reach = c => R + 6 + (c.label ? cpx * 1.2 : 0) + (c.tag ? (c.label ? 10 : 0) + cpx * 1.35 + 10 : 0);
  const need0 = (laneI, side) => Math.max(0, ...o.commits.filter((c) => {
    const lane = laneOf[c.lane];
    return lane && lane.i === laneI && sideOf(lane) === side && (c.label || c.tag);
  }).map(c => reach(c) + 4));
  const needTop = need0(0, -1);
  const needBot = need0(lanes.length - 1, 1);
  // The edge lanes sit half a lane height inside the band; the band makes up the rest of the reach (a few passes settle it).
  let bandTop = 0;
  let bandBot = 0;
  for (let k = 0; k < 6; k++) {
    const half = (rect.h - bandTop - bandBot) / (lanes.length * 2);
    bandTop = needTop ? clamp(needTop - half, 0, rect.h * 0.35) : 0;
    bandBot = needBot ? clamp(needBot - half, 0, rect.h * 0.35) : 0;
  }
  const area = { y: rect.y + bandTop, h: rect.h - bandTop - bandBot };
  for (const l of lanes) { l.y = area.y + (area.h * (l.i + 0.5)) / lanes.length; }
  const lpx = Math.min(size(s, 'label', 0.8), ...lanes.map(l => fitPx(s, l.name, rect.w * 0.27, size(s, 'label', 0.8), { role: 'mono', weight: 700 })));
  const gutter = Math.max(...lanes.map(l => textW(s, l.name, lpx, 'mono', 700))) + pad * 1.5;
  const colW = (rect.w - gutter - pad) / cols;
  const colX = c => rect.x + gutter + colW * (c + 0.5);
  // A text fitted to maxW: shrunk to the minimum size, then shortened with an ellipsis instead of overflowing.
  const fitText = (str, maxW, o2) => {
    const px = fitPx(s, str, maxW, o2.px, o2);
    if (textW(s, str, px, o2.role, o2.weight) <= maxW) { return str; }
    let core = str;
    while (core.length > 1 && textW(s, `${core.trimEnd()}…`, px, o2.role, o2.weight) > maxW) { core = core.slice(0, -1); }
    return `${core.trimEnd()}…`;
  };
  // Where a centered text of width w can sit: inside the rect, `m` px from each edge.
  const clampX = (x, w, m) => clamp(x, rect.x + 3 + m + w / 2, rect.x + rect.w - 3 - m - w / 2);
  for (const l of lanes) { l.spec = tk.make(l.name, rect.x + 4, l.y, gutter - 8, { px: lpx, role: 'mono', weight: 700, color: l.color ?? 'accent', at: at + l.i * 0.15 }); }
  const defaultAt = i => at + 0.5 + i * 0.6;
  // A text may be as wide as the gap to the nearest commit with text on its lane (a lone commit gets its own column and more).
  const roomOf = (c) => {
    const near = o.commits.filter(x => x !== c && x.lane === c.lane && (x.label || x.tag) && x.col !== c.col).map(x => Math.abs(x.col - c.col));
    return Math.max(1, Math.min(...near, 3)) * colW;
  };
  const commits = o.commits.map((c, i) => {
    const lane = laneOf[c.lane];
    need(lane, `gitGraph: commit "${c.id}" names unknown lane "${c.lane}"`);
    const x = colX(c.col);
    const side = sideOf(lane);
    const cm = { ...c, id: String(c.id), x, y: lane.y, lane, at: c.at ?? defaultAt(i), color: c.color ?? lane.color ?? 'accent', side };
    s.reg.add(`${id}.${cm.id}`, { x: x - R - 6, y: lane.y - R - 6, w: R * 2 + 12, h: R * 2 + 12 });
    cm.rect = s.reg.get(`${id}.${cm.id}`);
    if (c.label) {
      const lo = { px: cpx, role: 'mono' };
      const room = roomOf(c) * 0.92;
      const str = fitText(String(c.label), room, lo);
      const w = textW(s, str, fitPx(s, str, room, cpx, lo), 'mono');
      cm.lab = tk.make(str, clampX(x, w, 0), lane.y + side * (R + 6 + cpx * 0.6), room, { px: cpx, role: 'mono', align: 'center', color: 'dim', at: cm.at + 0.1 });
    }
    else { cm.lab = null; }
    if (c.tag) {
      const tpx = cpx;
      const ty = lane.y + side * (R + 6 + (c.label ? cpx * 1.2 + 10 : 0) + tpx * 0.75 + 8);
      const to = { px: tpx, role: 'mono', weight: 700 };
      const maxW = roomOf(c) * 0.92 - 24;
      const str = fitText(String(c.tag), maxW, to);
      const w = textW(s, str, fitPx(s, str, maxW, tpx, to), 'mono', 700);
      cm.tagSpec = tk.make(str, clampX(x, w, 12), ty, maxW, { px: tpx, role: 'mono', weight: 700, align: 'center', color: 'onPanel', at: cm.at + 0.25 });
    }
    return cm;
  });
  const byId = Object.fromEntries(commits.map(c => [c.id, c]));
  const edges = commits.flatMap(c => (c.parents ?? []).map((pid) => {
    const p = byId[pid];
    need(p, `gitGraph: commit "${c.id}" names unknown parent "${pid}"`);
    const mx = (p.x + c.x) / 2;
    const same = p.y === c.y;
    return { c, pts: same ? [[p.x, p.y], [c.x, c.y]] : path4(p, c, mx), color: same ? c.color : (p.lane.i === 0 ? c.color : p.color) };
  }));
  const end = Math.max(...commits.map(c => c.at + (c.tag ? 0.7 : 0.5)));
  const parts = () => commits.map(c => ({ id: c.id, rect: c.rect }));

  return piece(s, { ...o, id }, {
    kind: 'gitGraph',
    rect,
    tk,
    end,
    marks: Object.fromEntries(commits.map(c => [c.id, c.at])),
    parts,
    draw(api, t) {
      for (const l of lanes) {
        const k = ease.inOut(prog(t, at + l.i * 0.15, 0.8));
        if (k <= 0) { continue; }
        line(api, [[rect.x + gutter, l.y], [rect.x + rect.w - pad, l.y]], { p: k, color: 'dim', lw: 2, dash: [4, 12], alpha: 0.6, glow: 0 });
        drawT(api, l.spec, { alpha: clamp(k * 2) });
      }
      for (const e of edges) { line(api, e.pts, { p: ease.inOut(prog(t, e.c.at - 0.45, 0.5)), color: e.color, lw: 4 }); }
      for (const c of commits) {
        const q = prog(t, c.at, 0.45);
        if (q <= 0) { continue; }
        const k = ease.back(q);
        if (q < 1) { ring(api, c.x, c.y, R + q * 30, { color: c.color, lw: 3, alpha: 1 - q, glow: 0 }); }
        around(api, c.x, c.y, k, () => {
          box(api, { x: c.x - R, y: c.y - R, w: R * 2, h: R * 2 }, { kind: 'ellipse', stroke: c.color, fill: 'panel', lw: 4 });
          dot(api, c.x, c.y, R * 0.42, c.color, { glow: 10 });
        });
        if (c.lab) { drawT(api, c.lab, { alpha: clamp(q * 2 - 0.4) }); }
        if (c.tagSpec) {
          const tg = ease.back(prog(t, c.at + 0.25, 0.4));
          if (tg > 0) {
            const sp = c.tagSpec;
            around(api, sp.x, sp.y, tg, () => {
              box(api, { x: sp.rect.x - 12, y: sp.rect.y - 2, w: sp.w + 24, h: sp.rect.h + 4 }, { kind: 'pill', stroke: c.color, fill: 'panel', lw: 2.5 });
              drawT(api, sp, { alpha: clamp(tg) });
            });
          }
        }
      }
    },
  });
}

/** S curve from commit p to commit c through the horizontal midpoint mx. */
function path4(p, c, mx) {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const k = i / 24;
    const m = 1 - k;
    pts.push([m ** 3 * p.x + 3 * m * m * k * mx + 3 * m * k * k * mx + k ** 3 * c.x, m ** 3 * p.y + 3 * m * m * k * p.y + 3 * m * k * k * c.y + k ** 3 * c.y]);
  }
  return pts;
}

// ---- machine ------------------------------------------------------------------------------------------------------

/**
 * Inputs ride a conveyor belt into a machine; it works and one output comes out the other side. o: id, rect | in, at,
 * inputs [{ kind, label, color }] (icon kinds), output { kind, label, color }, machine { kind ('gear'), label },
 * feedStep (0.8), travel (1.3), processDur (1.6). Registers `<id>.machine` and `<id>.out`. Exposes end and
 * marks { processStart, processEnd }.
 */
export function machine(s, o) {
  const rect = resolveRect(s, o, 'machine');
  const id = o.id ?? s.uid('machine');
  const inputs = o.inputs ?? [];
  need(inputs.length, 'machine needs inputs: [{ kind, label }]');
  const at = o.at ?? 0;
  const { pad } = s.style.defaults;
  const out = o.output ?? { kind: 'package' };
  const mach = o.machine ?? {};
  const travel = o.travel ?? 1.3;
  const feedStep = o.feedStep ?? 0.8;
  const processDur = o.processDur ?? 1.6;
  const bh = clamp(rect.h * 0.055, 18, 34);
  const beltY = rect.y + rect.h - bh * 2 - 16;
  const sz = Math.min((beltY - rect.y) * 0.34, 150);
  const M = { x: rect.x + rect.w * 0.37, y: rect.y + 4, w: rect.w * 0.26, h: beltY - rect.y - 4 };
  const outSz = sz * 1.2;
  const tk = textKit(s);
  const lpx0 = size(s, 'label', 0.6);
  const dist0 = M.x - (rect.x + sz / 2);
  const spacing = (dist0 / travel) * feedStep;
  const labW = Math.min(spacing * 0.9, sz * 2);
  const lpx = Math.min(lpx0, ...inputs.filter(x => x.label).map(x => fitPx(s, x.label, labW, lpx0, { role: 'mono' })));
  const x0 = rect.x + Math.max(sz, ...inputs.filter(x => x.label).map(x => Math.min(labW, textW(s, x.label, lpx, 'mono')))) / 2;
  const x2 = rect.x + rect.w - Math.max(outSz, out.label ? Math.min(outSz * 2, textW(s, out.label, size(s, 'label', 0.7), 'mono', 700)) : 0) / 2;
  const cy = beltY - sz / 2 - 4;
  const feeds = inputs.map((inp, i) => ({ ...inp, start: at + 0.9 + i * feedStep, w: inp.label ? textW(s, inp.label, lpx, 'mono') : 0 }));
  const processStart = feeds[0].start + travel * 0.8;
  const processEnd = feeds[feeds.length - 1].start + travel + processDur;
  const outEnd = processEnd + travel;
  const outRect = { x: x2 - outSz / 2, y: beltY - outSz - 4, w: outSz, h: outSz };
  s.reg.add(`${id}.machine`, M);
  s.reg.add(`${id}.out`, outRect);
  if (mach.label) { tk.make(mach.label, M.x + M.w / 2, M.y + M.h * 0.1, M.w - pad * 2, { px: size(s, 'label', 0.8), weight: 700, align: 'center', color: 'onPanel', at: at + 0.6 }); }
  const outLab = out.label ? tk.make(out.label, x2, outRect.y - size(s, 'label', 0.7) * 0.8, rect.x + rect.w - x2 + outSz, { px: size(s, 'label', 0.7), role: 'mono', weight: 700, align: 'center', color: out.color ?? 'good', at: outEnd - 0.2 }) : null;
  const feedX = (f, t) => x0 + (M.x + 4 - x0) * prog(t, f.start, travel);
  const inLabelRec = (f, t) => {
    const x = feedX(f, t);
    return { text: f.label, rect: { x: x - f.w / 2, y: cy - sz / 2 - lpx * 1.4, w: f.w, h: lpx * 1.2 }, overflow: f.w > labW + 1, px: lpx };
  };
  const flying = (f, t) => t >= f.start && t < f.start + travel;
  // The label fades before its right edge reaches the machine wall (the wall clips the icon, not the words).
  const labelAlpha = (f, t) => clamp((M.x - 6 - (feedX(f, t) + f.w / 2)) / (lpx * 2));
  const beltRun = t => clamp(t - (at + 0.6), 0, outEnd - at - 0.6);

  return piece(s, { ...o, id }, {
    kind: 'machine',
    rect,
    tk,
    texts: feeds.map(f => f.label),
    end: outEnd,
    marks: { processStart, processEnd },
    parts: () => [{ id: 'machine', rect: M }, { id: 'out', rect: outRect }],
    qa: (_api, t) => record(rect, o, t < at ? 0 : 1, [...tk.qa(t), ...feeds.filter(f => f.label && flying(f, t) && labelAlpha(f, t) > 0.05).map(f => inLabelRec(f, t))], [{ id: 'machine', rect: M }, { id: 'out', rect: outRect }], t),
    draw(api, t) {
      const p = ease.out(prog(t, at, 0.6));
      if (p <= 0) { return; }
      const belt = { x: rect.x, y: beltY, w: rect.w, h: bh };
      const phase = beltRun(t) * 150;
      box(api, belt, { kind: 'pill', p, stroke: 'dim', fill: 'panel', lw: 3.5 });
      if (p >= 1) {
        clipTo(api, inset(belt, 3), () => {
          for (let x = belt.x - 60 + ((phase % 48) + 48) % 48; x < belt.x + belt.w; x += 48) { line(api, [[x, belt.y + 6], [x - 12, belt.y + bh - 6]], { color: 'dim', lw: 3, alpha: 0.7, glow: 0 }); }
        }, bh / 2);
        const wr = bh * 0.5;
        for (let i = 0; i < 6; i++) {
          const wx = belt.x + 40 + ((belt.w - 80) * i) / 5;
          const wy = belt.y + bh + wr + 2;
          const a = phase / 16 + i;
          box(api, { x: wx - wr, y: wy - wr, w: wr * 2, h: wr * 2 }, { kind: 'ellipse', stroke: 'dim', fill: 'panel', lw: 2.5 });
          line(api, [[wx - Math.cos(a) * wr * 0.6, wy - Math.sin(a) * wr * 0.6], [wx + Math.cos(a) * wr * 0.6, wy + Math.sin(a) * wr * 0.6]], { color: 'dim', lw: 2.5, glow: 0 });
        }
      }
      // Inputs ride the belt and vanish into the machine's left wall.
      clipTo(api, { x: rect.x - 20, y: rect.y - 20, w: M.x + 8 - rect.x + 20, h: rect.h + 40 }, () => {
        for (const f of feeds) {
          if (!flying(f, t)) { continue; }
          const u = prog(t, f.start, travel);
          const x = feedX(f, t);
          const g = api.fade(Math.min(1, u * 6, (1 - u) * 4));
          drawIcon(g, f.kind ?? 'doc', { x: x - sz / 2, y: cy - sz / 2, w: sz, h: sz }, { color: f.color ?? 'accent', t });
          if (f.label) { text(api.fade(Math.min(1, u * 6) * labelAlpha(f, t)), f.label, x, cy - sz / 2 - lpx * 0.8, { px: lpx, role: 'mono', color: 'ink', align: 'center' }); }
        }
      });
      // Output: comes out of the right wall and stops at the end of the belt.
      const ou = prog(t, processEnd, travel);
      if (ou > 0) {
        const x = lerp(M.x + M.w - outSz / 2, x2, ease.out(ou));
        const land = 1 + 0.08 * Math.sin(Math.PI * prog(t, outEnd, 0.35));
        clipTo(api, { x: M.x + M.w - 6, y: rect.y - 20, w: rect.x + rect.w - M.x - M.w + 26, h: rect.h + 40 }, () => {
          around(api, x, beltY - 4, land, () => drawIcon(api, out.kind ?? 'package', { x: x - outSz / 2, y: outRect.y, w: outSz, h: outSz }, { color: out.color ?? 'good', t }));
        });
        if (outLab) { drawT(api, outLab, { alpha: ease.out(prog(t, outEnd - 0.2, 0.4)) }); }
      }
      // Machine: shakes and spins its gears while it works.
      const working = t >= processStart && t < processEnd;
      const wobble = working ? 1 + 0.012 * Math.sin(t * 26) : 1;
      const spinT = clamp(t - processStart, 0, processEnd - processStart);
      around(api, M.x + M.w / 2, M.y + M.h, { sx: wobble * lerp(0.92, 1, p), sy: 2 - wobble }, () => {
        box(api, M, { kind: 'round', p, stroke: 'accent2', fill: 'panel', lw: 4.5 });
        if (p < 1) { return; }
        const g = Math.min(M.w * 0.4, M.h * 0.3);
        if (mach.kind && mach.kind !== 'gear') { drawIcon(api, mach.kind, { x: M.x + M.w / 2 - g * 0.7, y: M.y + M.h * 0.5 - g * 0.7, w: g * 1.4, h: g * 1.4 }, { color: 'accent2', t, spin: 2 }); }
        else {
          drawIcon(api, 'gear', { x: M.x + M.w * 0.32 - g / 2, y: M.y + M.h * 0.4 - g / 2, w: g, h: g }, { color: 'accent2', t: spinT, spin: 2.6 });
          drawIcon(api, 'gear', { x: M.x + M.w * 0.68 - g * 0.36, y: M.y + M.h * 0.56 - g * 0.36, w: g * 0.72, h: g * 0.72 }, { color: 'accent', t: spinT + 0.2, spin: -3.6 });
        }
        if (mach.label) { drawT(api, tk.list[0], { alpha: clamp((p - 0.9) * 10) }); }
        const bar = { x: M.x + pad * 1.2, y: M.y + M.h * 0.86, w: M.w - pad * 2.4, h: 14 };
        fillRect(api, bar, 'dim', 0.3, 7);
        fillRect(api, { ...bar, w: bar.w * prog(t, processStart, processEnd - processStart) }, t >= processEnd ? 'good' : 'warn', 1, 7);
      });
    },
  });
}

// ---- fleet --------------------------------------------------------------------------------------------------------

/**
 * Servers behind a load balancer updated one at a time (a rolling update): each one drains, flips to the new version and
 * passes its check while traffic keeps flowing to the rest. o: id, rect | in, at, count (3), cols (count), from ('v1'),
 * to ('v2'), lb (true: draw the balancer; a string is its label, default 'LB'), startAt (at + 1.5), step (1.5), flipDur
 * (0.7). Registers `<id>.s<N>` and `<id>.lb`. Exposes end and marks.flip<N> = when server N shows the new version.
 */
export function fleet(s, o) {
  const rect = resolveRect(s, o, 'fleet');
  const id = o.id ?? s.uid('fleet');
  const at = o.at ?? 0;
  const n = o.count ?? 3;
  need(n >= 1, 'fleet needs count >= 1');
  const cols = Math.min(o.cols ?? n, n);
  const rows = Math.ceil(n / cols);
  const from = String(o.from ?? 'v1');
  const to = String(o.to ?? 'v2');
  const startAt = o.startAt ?? at + 1.5;
  const step = o.step ?? 1.5;
  const flipDur = o.flipDur ?? 0.7;
  const hasLb = o.lb !== false && o.lb !== 0;
  const lbText = typeof o.lb === 'string' ? o.lb : 'LB';
  const { pad } = s.style.defaults;
  const tk = textKit(s);
  const lbPx = size(s, 'label', 0.8);
  const lbH = hasLb ? lbPx * 2.2 : 0;
  const lbGap = hasLb ? lbPx * 2 : 0;
  const gap = pad * 1.6;
  const top = rect.y + lbH + lbGap;
  const cw = Math.min(320, (rect.w - gap * (cols - 1)) / cols);
  const ch = Math.min((rect.y + rect.h - top - gap * (rows - 1)) / rows, cw * 1.2);
  const gx = rect.x + (rect.w - (cw * cols + gap * (cols - 1))) / 2;
  const lb = { x: rect.x + rect.w / 2 - Math.min(rect.w * 0.25, 210), y: rect.y, w: Math.min(rect.w * 0.5, 420), h: lbH };
  if (hasLb) {
    s.reg.add(`${id}.lb`, lb);
    tk.make(lbText, lb.x + lb.w / 2, lb.y + lb.h / 2, lb.w - pad * 2, { px: lbPx, weight: 700, align: 'center', color: 'onPanel', at: at + 0.4 });
  }
  const vpx = Math.min(size(s, 'label', 1), ch * 0.2);
  const first = Math.min(n, cols);
  const cards = Array.from({ length: n }, (_, i) => {
    const r = { x: gx + (i % cols) * (cw + gap), y: top + Math.floor(i / cols) * (ch + gap), w: cw, h: ch };
    const u0 = startAt + i * step;
    const mid = u0 + 0.35 + flipDur / 2;
    const enter = at + 0.3 + i * 0.15;
    const cx = r.x + r.w / 2;
    const vy = r.y + r.h * 0.66;
    s.reg.add(`${id}.s${i + 1}`, r);
    return {
      r,
      cx,
      u0,
      mid,
      enter,
      end: u0 + 0.35 + flipDur + 0.45,
      old: tk.make(from, cx, vy, r.w * 0.86, { px: vpx, role: 'mono', weight: 700, align: 'center', color: 'onPanel', at: enter + 0.15, until: mid }),
      neu: tk.make(to, cx, vy, r.w * 0.86, { px: vpx, role: 'mono', weight: 700, align: 'center', color: 'good', at: mid }),
      line: i < first ? [[lb.x + lb.w / 2 + (i - (first - 1) / 2) * pad * 2, lb.y + lb.h + 4], [cx, r.y - 6]] : null,
    };
  });
  const parts = () => [...(hasLb ? [{ id: 'lb', rect: lb }] : []), ...cards.map((c, i) => ({ id: `s${i + 1}`, rect: c.r }))];
  const end = cards[n - 1].end;

  return piece(s, { ...o, id }, {
    kind: 'fleet',
    rect,
    tk,
    end,
    marks: Object.fromEntries(cards.map((c, i) => [`flip${i + 1}`, c.mid])),
    parts,
    draw(api, t) {
      const p = up(t, at);
      if (p <= 0) { return; }
      if (hasLb) {
        const g = api.fade(p);
        box(g, lb, { kind: 'pill', p, stroke: 'accent', fill: 'panel', lw: 3.5 });
        drawT(g, tk.list[0], { alpha: clamp(p * 2 - 1) });
      }
      cards.forEach((c, i) => {
        const k = ease.back(prog(t, c.enter, 0.45));
        if (k <= 0) { return; }
        const updating = t >= c.u0 && t < c.end;
        const isNew = t >= c.mid;
        const tok = updating ? 'warn' : isNew ? 'good' : 'accent2';
        if (c.line) {
          const lit = up(t, at + 0.6 + i * 0.15, 0.4);
          line(api, c.line, { p: lit, color: updating ? 'dim' : tok, lw: 3.5, dash: updating ? [6, 12] : null, alpha: updating ? 0.6 : 1, glow: 0 });
          if (!updating && t > at + 1.1) {
            for (let j = 0; j < 2; j++) {
              const u = wrap1((t - at) * 0.9 + i * 0.37 + j * 0.5);
              dot(api, lerp(c.line[0][0], c.line[1][0], u), lerp(c.line[0][1], c.line[1][1], u), 6, 'ink', { alpha: Math.min(1, u * 6, (1 - u) * 6) * 0.9 });
            }
          }
        }
        const fp = prog(t, c.u0 + 0.35, flipDur);
        const sx = Math.max(0.04, Math.abs(Math.cos(Math.PI * fp))) * lerp(0.85, 1, clamp(k));
        const g = api.fade(clamp(k * 2));
        around(g, c.cx, c.r.y + c.r.h / 2, { sx, sy: lerp(0.85, 1, clamp(k)) }, () => {
          box(g, c.r, { kind: 'round', stroke: tok, fill: 'panel', lw: isNew ? 4 : 3, glow: isNew || updating ? 10 : 0 });
          const is = Math.min(c.r.w * 0.5, c.r.h * 0.4);
          drawIcon(g, 'server', { x: c.cx - is / 2, y: c.r.y + c.r.h * 0.07, w: is, h: is }, { color: tok, t: t + i });
          drawT(g, isNew ? c.neu : c.old);
          const hy = c.r.y + c.r.h * 0.88;
          if (updating) { spinner(g, c.cx, hy, vpx * 0.3, t, 'warn', 3.5); }
          else if (isNew) { tick(g, c.cx, hy, vpx * 0.7, prog(t, c.end, 0.3), 'good', 4); }
          else { dot(g, c.cx, hy, 7, 'accent2', { alpha: 0.6 + 0.4 * Math.sin(t * 3 + i) }); }
        });
      });
    },
    qa: (_api, t) => record(rect, o, up(t, at), tk.qa(t), parts(), t),
  });
}

// ---- layers -------------------------------------------------------------------------------------------------------

/**
 * Slabs that drop in and stack (a tech stack, image layers). o: id, rect | in, at, step (0.5), layers [{ text, color }]
 * with the BOTTOM layer first. Registers `<id>.l<N>` (N = 1 is the bottom). Exposes end.
 */
export function layers(s, o) {
  const rect = resolveRect(s, o, 'layers');
  const id = o.id ?? s.uid('layers');
  need(o.layers?.length, 'layers needs layers: [{ text, color }]');
  const at = o.at ?? 0;
  const step = o.step ?? 0.5;
  const { pad, radius } = s.style.defaults;
  const n = o.layers.length;
  const gap = pad * 0.6;
  const h = (rect.h - gap * (n - 1)) / n;
  const drop = Math.min(160, rect.h * 0.5);
  const tk = textKit(s);
  const items = o.layers.map((ly, i) => {
    const r = { x: rect.x, y: rect.y + rect.h - h * (i + 1) - gap * i, w: rect.w, h };
    s.reg.add(`${id}.l${i + 1}`, r);
    const la = at + i * step;
    const spec = tk.make(String(ly.text), r.x + r.w / 2, r.y + r.h / 2, r.w - pad * 3, { px: Math.min(size(s, 'label', 1), h * 0.5), weight: 700, align: 'center', color: 'onPanel', at: la + 0.2 });
    return { ...ly, r, la, spec };
  });
  const parts = () => items.map((it, i) => ({ id: `l${i + 1}`, rect: it.r }));
  return piece(s, { ...o, id }, {
    kind: 'layers',
    rect,
    tk,
    end: at + (n - 1) * step + 0.55,
    parts,
    draw(api, t) {
      for (const it of items) {
        const k = prog(t, it.la, 0.55);
        if (k <= 0) { continue; }
        const dy = -(1 - ease.bounce(k)) * drop;
        const f = api.fade(clamp(k * 3));
        const r = { ...it.r, y: it.r.y + dy };
        const col = it.color ?? 'accent2';
        box(f, r, { kind: 'round', stroke: col, fill: 'panel', lw: 3.5, r: radius });
        fillRect(f, inset(r, 4), col, 0.22, radius);
        drawT(f, it.spec, { dy });
      }
    },
  });
}

export const pieces = { pipeline, gitGraph, machine, fleet, layers };
