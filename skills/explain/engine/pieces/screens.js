import { blink, box, clipTo, dot, drawT, fillRect, line, piece, resolveRect, size, textKit, textW } from '../kit.js';
// Piece family "screens": code surfaces drawn through the active style. `editor` types code with syntax colors, marks,
// highlights and live edits; `terminal` types commands and streams their output, scrolling when full; `diffView` shows
// a unified diff. All three are containers, report every visible line to QA, and share the `tokenize` tokenizer.
//   s.editor({ id, rect|in, file, title, lines (string | { text, mark: '+' | '-', at }), at, typeAt, cps, edits [{ line, to, at }],
//              highlights [{ line, to?, at, until?, color? }], sidebar | tree, cursorLine, lineNumbers, type, px })
//   s.terminal({ id, rect|in, title, at, typeAt, prompt, cps, px, steps: [{ name?, cmd, at, out, outAt, outStep, wait, pause }] })
//   s.diffView({ id, rect|in, file, stat, lines: [{ op: '+' | '-' | ' ', text }], at, step, px })
import { clamp, ease, lerp, prog } from '../math.js';

// ---- tokenizer -----------------------------------------------------------------------------------------------------

const KEYWORDS = new Set([
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'def',
  'default',
  'else',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'import',
  'in',
  'interface',
  'let',
  'new',
  'null',
  'of',
  'return',
  'static',
  'switch',
  'throw',
  'true',
  'try',
  'type',
  'undefined',
  'var',
  'void',
  'while',
  'yield',
]);
const TOKEN_RE = /(\/\/.*$|#\s.*$|\/\*.*?\*\/)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`[^`]*`?)|(\b\d[\w.]*\b)|([a-z_$][\w$]*)|(\s+)|([^\w\s$"'`])/gi;

/**
 * Split a code line into colored runs [{ text, color }] with color one of the preset syntax tokens
 * (comment, string, keyword, number, type, fn, plain). Good enough for JS, TS, JSX, shell and config snippets.
 * Whitespace joins the run before it, so joining the texts gives the line back.
 */
export function tokenize(str) {
  const out = [];
  const re = new RegExp(TOKEN_RE.source, 'gi');
  let m = re.exec(str);
  while (m) {
    let color = 'plain';
    if (m[1]) { color = 'comment'; }
    else if (m[2]) { color = 'string'; }
    else if (m[3]) { color = 'number'; }
    else if (m[4]) {
      if (KEYWORDS.has(m[4])) { color = 'keyword'; }
      else if (/^[A-Z]/.test(m[4])) { color = 'type'; }
      else if (str[re.lastIndex] === '(') { color = 'fn'; }
    }
    const last = out[out.length - 1];
    if (last && (last.color === color || m[5])) { last.text += m[0]; }
    else { out.push({ text: m[0], color }); }
    m = re.exec(str);
  }
  return out;
}

/** Draw the first n characters of tokenized mono text on the character grid starting at (x, y). */
function drawRuns(api, runs, n, x, y, px, cw, alpha = 1) {
  let used = 0;
  for (const run of runs) {
    if (used >= n) { break; }
    const part = run.text.slice(0, n - used);
    if (part.trim()) { api.style.text(api, part, x + used * cw, y, { px, role: 'mono', color: run.color, alpha }); }
    used += run.text.length;
  }
}

// ---- shared layout -------------------------------------------------------------------------------------------------

/** Window metrics from the style defaults: title bar, inner padding, UI text size (never under the fitting floor). */
function metrics(s) {
  const bar = size(s, 'code', 1.7);
  return { bar, pad: size(s, 'code', 0.5), ui: Math.max(s.style.defaults.minPx, size(s, 'code', 0.8)) };
}

/** Window chrome: panel, title bar rule, three dots. Returns the content alpha (0 while the frame is still drawing on). */
function chrome(api, rect, p, bar, o = {}) {
  box(api, rect, { p, stroke: 'dim', fill: 'panel' });
  const a = clamp((p - 0.4) / 0.6);
  if (a <= 0) { return 0; }
  line(api, [[rect.x + 3, rect.y + bar], [rect.x + rect.w - 3, rect.y + bar]], { color: 'dim', lw: 1.5, glow: 0, alpha: a * 0.6 });
  if (o.dots !== false) { ['bad', 'warn', 'good'].forEach((c, i) => dot(api, rect.x + bar * 0.5 + i * bar * 0.4, rect.y + bar / 2, bar * 0.11, c, { alpha: a * 0.9 })); }
  return clamp((p - 0.5) * 2);
}

/** Largest mono size (from px down to the floor) at which `chars` columns fit maxW and `rows` rows of 1.3x fit maxH. */
function monoFit(s, px, chars, maxW, rows = 0, maxH = Infinity, extraW = 0) {
  const min = s.style.defaults.minPx;
  let q = Math.round(px);
  while (q > min && (extraW * q + chars * textW(s, 'M', q, 'mono') > maxW || rows * q * 1.3 > maxH)) { q -= 1; }
  return { px: q, cw: textW(s, 'M', q, 'mono') };
}

/** Cut a line to `max` characters with an ellipsis (the fallback when the floor size still does not fit). */
const clip = (str, max) => (str.length > max ? `${str.slice(0, Math.max(1, max - 1))}…` : str);

/** Whole characters of a len-long string shown at typing progress p (exact at p = 1 despite float error). */
const typedChars = (len, p) => Math.min(len, Math.floor(len * p + 1e-6));
const lead = str => str.length - str.trimStart().length;
const common = (a, b) => {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) { n++; }
  return n;
};

// ---- editor --------------------------------------------------------------------------------------------------------

/**
 * Code editor window: optional file tree, tab, line numbers, syntax colors, lines that type themselves with a caret,
 * '+' / '-' marks, highlight bands and live edits (a line erases back to the common prefix and retypes).
 * Lines marked '-' are existing code (shown at once); the rest type in order at `cps` characters per second, a line
 * with its own `at` starts then. Registers `<id>.l<n>` per line and `<id>.body`. Exposes `end`: typing, marks and edits
 * are complete at that time.
 */
export function editor(s, o) {
  const rect = resolveRect(s, o, 'editor');
  const id = o.id ?? s.uid('editor');
  const at = o.at ?? 0;
  const { bar, pad, ui } = metrics(s);
  const tabH = o.file ? Math.round(bar * 0.85) : 0;
  const tk = textKit(s);
  const open = at + 0.2;

  const entries = (o.tree ?? o.sidebar ?? []).map((e) => {
    const raw = String(e);
    const name = raw.trim().replace(/\*$/, '');
    return { name, depth: lead(raw) / 2, active: raw.trim().endsWith('*') || (o.file !== undefined && name === o.file) };
  });
  const lines = (o.lines ?? []).map(l => (typeof l === 'string' ? { text: l } : { ...l, text: String(l.text ?? '') }));
  const n = Math.max(lines.length, 1);
  const edits = (o.edits ?? []).map(e => ({ erase: 0.4, ...e, to: String(e.to) })).sort((a, b) => a.at - b.at);

  // Sidebar width follows the widest name at the UI size, never more than 28% of the window.
  const sideCw = textW(s, 'M', ui, 'mono');
  const side = entries.length ? Math.min(rect.w * 0.28, Math.max(...entries.map(e => (e.name.length + e.depth * 2) * sideCw)) + pad * 2.4) : 0;
  const bodyX = rect.x + side;
  const codeTop = rect.y + bar + tabH + pad * 0.6;
  const avail = rect.y + rect.h - pad * 0.6 - codeTop;
  const widest = Math.max(8, ...lines.map(l => l.text.length), ...edits.map(e => e.to.length));
  const digits = String(n).length;
  const hasMarks = lines.some(l => l.mark) || edits.length > 0;
  const numbers = o.lineNumbers !== false;
  // Gutter = mark column + line numbers + padding, all in character widths so it scales with the fitted size.
  const gutterK = (hasMarks ? 1.4 : 0) + (numbers ? (digits + 0.8) * 0.8 : 0);
  const fit = monoFit(s, o.px ?? size(s, 'code', 1.25), widest, rect.w - side - pad * 1.6, n, avail, gutterK);
  const { px, cw } = fit;
  const gutter = gutterK * cw + pad;
  const codeX = bodyX + gutter;
  const codeW = rect.x + rect.w - pad - codeX;
  const maxChars = Math.max(4, Math.floor(codeW / cw));
  const lineH = Math.min(px * 1.6, avail / n);
  const rowY = i => codeTop + lineH * (i + 0.5);
  const body = { x: bodyX, y: rect.y + bar + tabH, w: rect.w - side, h: rect.h - bar - tabH };
  s.reg.add(`${id}.body`, body);
  lines.forEach((_, i) => s.reg.add(`${id}.l${i + 1}`, { x: codeX - pad * 0.5, y: rowY(i) - lineH / 2, w: codeW + pad * 0.5, h: lineH }));

  // Timeline: typed lines in order, pre-existing ('-') lines at once, marks, edits.
  const cps = o.cps ?? 26;
  const typing = o.type !== false;
  const typeAt = o.typeAt ?? at + 0.9;
  let cursor = typeAt;
  let end = typeAt;
  const rows = lines.map((l, i) => {
    const row = { ...l, i, indent: lead(l.text), runs: tokenize(l.text), y: rowY(i) };
    const existing = !typing || l.mark === '-' || l.typed === false;
    if (existing) {
      row.existing = true;
      row.start = at + 0.5 + Math.min(i, 12) * 0.04;
      row.dur = 0;
    }
    else {
      row.start = l.at ?? cursor;
      row.dur = Math.max(0.05, (l.text.length - row.indent) / cps);
      cursor = row.start + row.dur + (l.pause ?? 0.12);
      end = Math.max(end, row.start + row.dur);
    }
    row.markAt = l.markAt ?? l.at ?? (existing ? typeAt : row.start);
    if (l.mark) { end = Math.max(end, row.markAt + 0.35); }
    return row;
  });
  const hist = rows.map(r => r.text);
  const steps = edits.map((e) => {
    const from = hist[e.line - 1] ?? '';
    const keep = common(from, e.to);
    const typeD = e.type ?? Math.max(0.3, (e.to.length - keep) / cps);
    hist[e.line - 1] = e.to;
    const step = { ...e, from, keep, typeD, end: e.at + e.erase + typeD };
    end = Math.max(end, step.end);
    return step;
  });
  const hls = (o.highlights ?? []).map((h) => {
    const [from, to] = Array.isArray(h.lines) ? h.lines : [h.line ?? h.lines, h.to];
    return { ...h, from, to: to ?? from, color: h.color ?? 'warn' };
  });

  // Texts QA sees: each line from when it appears, swapped by its edits.
  const extra = [];
  rows.forEach((r, i) => {
    const mine = steps.filter(e => e.line === i + 1);
    const shown = clip(r.text, maxChars);
    if (shown !== r.text) { extra.push(r.text); }
    tk.make(shown, codeX, rowY(i), codeW, { role: 'mono', px, at: r.existing ? r.start + 0.15 : r.start, until: mine[0]?.at });
    mine.forEach((e, k) => {
      const d = clip(e.to, maxChars);
      if (d !== e.to) { extra.push(e.to); }
      tk.make(d, codeX, rowY(i), codeW, { role: 'mono', px, at: e.at, until: mine[k + 1]?.at });
    });
  });
  const title = o.title ? tk.make(o.title, rect.x + rect.w / 2, rect.y + bar / 2, rect.w * 0.4, { px: ui, align: 'center', color: 'dim', at: open }) : null;
  const tab = o.file ? tk.make(o.file, bodyX + pad, rect.y + bar + tabH / 2, rect.w * 0.5, { role: 'mono', px: ui, at: open }) : null;
  const sideRows = entries.length ? Math.min(ui * 1.7, (rect.h - bar - pad) / entries.length) : 0;
  const sideSpecs = entries.map((e, i) => tk.make(e.name, rect.x + pad + e.depth * ui * 0.9, rect.y + bar + pad * 0.5 + sideRows * (i + 0.5), side - pad * 1.6 - e.depth * ui * 0.9, { role: 'mono', px: ui, color: e.active ? 'accent' : 'dim', at: open }));

  /** State of line i at t: shown string, characters shown, whether an edit is running, whether it was changed. */
  const lineAt = (i, t) => {
    const r = rows[i];
    let str = r.text;
    let chars = r.existing ? str.length : lead(str) + typedChars(str.length - r.indent, prog(t, r.start, r.dur));
    let changed = false;
    for (const e of steps) {
      if (e.line !== i + 1 || t < e.at) { continue; }
      const ep = prog(t, e.at, e.erase);
      if (ep < 1) { return { str: e.from, chars: Math.round(lerp(e.from.length, e.keep, ep)), editing: true, changed: true }; }
      const tp = prog(t, e.at + e.erase, e.typeD);
      if (tp < 1) { return { str: e.to, chars: Math.round(lerp(e.keep, e.to.length, tp)), editing: true, changed: true }; }
      str = e.to;
      chars = e.to.length;
      changed = true;
    }
    return { str, chars, editing: false, changed };
  };
  const tokCache = new Map();
  const runs = (str) => {
    if (!tokCache.has(str)) { tokCache.set(str, tokenize(clip(str, maxChars))); }
    return tokCache.get(str);
  };
  const typedRows = rows.filter(r => !r.existing);

  return piece(s, { ...o, id }, {
    kind: 'editor',
    rect,
    tk,
    texts: extra,
    end,
    extra: { body },
    draw(api, t) {
      const p = ease.out(prog(t, at, 0.6));
      const a = chrome(api, rect, p, bar, { dots: true });
      if (a <= 0) { return; }
      if (title) { drawT(api, title, { alpha: a }); }
      if (side) {
        line(api, [[bodyX, rect.y + bar], [bodyX, rect.y + rect.h - 3]], { color: 'dim', lw: 1.5, glow: 0, alpha: a * 0.6 });
        sideSpecs.forEach((sp, i) => {
          const k = ease.out(prog(t, at + 0.35 + i * 0.07, 0.3));
          if (entries[i].active) { fillRect(api, { x: rect.x + 8, y: sp.y - sideRows * 0.46, w: side - 16, h: sideRows * 0.92 }, 'accent', 0.14 * k, 6); }
          drawT(api, sp, { alpha: a * k, dx: (1 - k) * -12 });
        });
      }
      if (tab) {
        const k = ease.out(prog(t, at + 0.3, 0.3));
        fillRect(api, { x: bodyX, y: rect.y + bar, w: tab.w + pad * 3.2, h: tabH }, 'accent', 0.1 * a * k, 0);
        line(api, [[bodyX, rect.y + bar + tabH], [bodyX + tab.w + pad * 3.2, rect.y + bar + tabH]], { color: 'accent', lw: 2.5, alpha: a * k });
        drawT(api, tab, { alpha: a * k });
        if (steps.some(e => t >= e.at)) { dot(api, tab.x + tab.w + pad * 1.2, tab.y, ui * 0.2, 'warn', { alpha: a }); }
      }
      clipTo(api, { x: bodyX + 2, y: codeTop - pad * 0.3, w: rect.w - side - 4, h: avail + pad * 0.6 }, () => {
        for (const h of hls) {
          if (t < h.at) { continue; }
          const fade = 1 - (h.until === undefined ? 0 : prog(t, h.until, 0.3));
          if (fade <= 0) { continue; }
          const top = rowY(h.from - 1) - lineH / 2;
          api.style.highlight(api, { x: codeX - pad * 0.15, y: top + 3, w: codeW + pad * 0.1, h: (h.to - h.from + 1) * lineH - 6 }, { p: prog(t, h.at, 0.4), color: h.color, alpha: a * fade, seed: h.from + 5 });
        }
        let caret = null;
        rows.forEach((r, i) => {
          const y = r.y;
          const st = lineAt(i, t);
          const appear = r.existing ? ease.out(prog(t, r.start, 0.25)) : (t >= r.start ? 1 : 0);
          const mk = r.mark ? ease.out(prog(t, r.markAt, 0.35)) : 0;
          if (r.mark && mk > 0) {
            const tok = r.mark === '+' ? 'good' : 'bad';
            fillRect(api, { x: bodyX + 6, y: y - lineH / 2 + 2, w: (rect.w - side - 12) * mk, h: lineH - 4 }, tok, 0.16 * a, 5);
            api.style.text(api, r.mark, bodyX + pad * 0.5 + cw * 0.6, y, { px, role: 'mono', color: tok, align: 'center', alpha: a * mk });
          }
          if (st.changed) {
            const ck = ease.out(prog(t, steps.find(e => e.line === i + 1 && t >= e.at)?.at ?? 0, 0.3));
            fillRect(api, { x: bodyX + 6, y: y - lineH / 2 + 2, w: rect.w - side - 12, h: lineH - 4 }, 'good', 0.1 * a * ck, 5);
            fillRect(api, { x: bodyX + 6, y: y - lineH / 2 + 2, w: 5, h: lineH - 4 }, 'good', a * ck, 2);
          }
          if (numbers) { api.style.text(api, String(i + 1), codeX - pad * 0.7, y, { px: px * 0.8, role: 'mono', color: st.changed ? 'good' : 'dim', align: 'right', alpha: a * 0.8 * (r.existing ? appear : 1) }); }
          if (appear <= 0) { return; }
          drawRuns(api, runs(st.str), st.chars, codeX, y, px, cw, a * appear);
          if (st.editing) { caret = { x: codeX + st.chars * cw + 2, y, solid: true }; }
        });
        if (!caret && typedRows.length) {
          const cur = [...typedRows].reverse().find(r => t >= r.start);
          if (cur && t < end + 0.6) {
            const done = t >= cur.start + cur.dur;
            if (!done || blink(t, cur.start, 2.2)) { caret = { x: codeX + lineAt(cur.i, t).chars * cw + 2, y: cur.y, solid: !done }; }
          }
        }
        if (!caret && o.cursorLine && rows[o.cursorLine - 1] && t >= typeAt && blink(t, typeAt, 2.2)) { caret = { x: codeX + lineAt(o.cursorLine - 1, t).chars * cw + 2, y: rowY(o.cursorLine - 1), solid: false }; }
        if (caret) { fillRect(api, { x: caret.x, y: caret.y - px * 0.6, w: Math.max(3, px * 0.5), h: px * 1.2 }, 'accent', a * 0.9, 2); }
      });
    },
  });
}

// ---- terminal ------------------------------------------------------------------------------------------------------

/**
 * Terminal window: typed commands with a caret, output streamed line by line, the view scrolls when it fills.
 * A step is { name?, cmd, at, out (string | string[] | { text, color }[]), outAt, outStep (0.12), wait (0.3 between the
 * typed command and its output), pause (0.45 before the next step) }; a step without `cmd` only prints (a log).
 * Exposes `end` and `marks`: for every step, by index and by name, the time its output finished. Lines that scroll out
 * stop being reported to QA.
 */
export function terminal(s, o) {
  const rect = resolveRect(s, o, 'terminal');
  const id = o.id ?? s.uid('terminal');
  const at = o.at ?? 0;
  const { bar, pad, ui } = metrics(s);
  const tk = textKit(s);
  const prompt = `${o.prompt ?? '$'} `;
  const cps = o.cps ?? 22;
  const body = { x: rect.x + pad, y: rect.y + bar + pad * 0.5, w: rect.w - pad * 2, h: rect.h - bar - pad * 1.2 };
  s.reg.add(`${id}.body`, body);

  const rows = [];
  const marks = {};
  let cursor = o.typeAt ?? at + 0.9;
  let end = cursor;
  (o.steps ?? []).forEach((st, si) => {
    if (st.at !== undefined) { cursor = st.at; }
    let typed = cursor;
    if (st.cmd !== undefined && st.cmd !== null) {
      const d = Math.max(0.2, String(st.cmd).length / cps);
      rows.push({ cmd: true, text: String(st.cmd), at: cursor, dur: d, color: 'onPanel' });
      typed = cursor + d;
      cursor = typed + (st.wait ?? 0.3);
    }
    const outs = [].concat(st.out ?? []).flatMap(l => (typeof l === 'string' ? l.split('\n').map(text => ({ text })) : [l]));
    const outAt = st.outAt ?? cursor;
    const outStep = st.outStep ?? 0.12;
    outs.forEach((l, i) => rows.push({ text: String(l.text), at: outAt + i * outStep, dur: 0, color: l.color ?? st.color ?? 'dim' }));
    const done = outs.length ? outAt + (outs.length - 1) * outStep + 0.18 : typed;
    marks[si] = done;
    if (st.name) { marks[st.name] = done; }
    end = Math.max(end, done);
    cursor = Math.max(done, outs.length ? outAt + outs.length * outStep : cursor) + (st.pause ?? 0.45);
  });

  const widest = Math.max(8, ...rows.map(r => r.text.length + (r.cmd ? prompt.length : 0)));
  const { px, cw } = monoFit(s, o.px ?? size(s, 'code', 1.1), widest, body.w);
  const lineH = px * 1.5;
  const cap = Math.max(1, Math.floor(body.h / lineH));
  const maxChars = Math.max(4, Math.floor(body.w / cw));
  const shown = rows.map(r => clip(r.text, r.cmd ? maxChars - prompt.length : maxChars));
  const title = tk.make(o.title ?? 'terminal', rect.x + rect.w / 2, rect.y + bar / 2, rect.w * 0.5, { role: 'mono', px: ui, align: 'center', color: 'dim', at: at + 0.2 });
  const extra = rows.filter((r, i) => shown[i] !== r.text).map(r => r.text);

  const scrollAt = t => rows.reduce((k, r, i) => (i >= cap ? k + ease.out(prog(t, r.at, 0.25)) : k), 0);
  const rowY = (i, t) => body.y + lineH * (i + 0.5 - scrollAt(t));
  const vis = t => (t < at ? 0 : o.until === undefined ? 1 : 1 - prog(t, o.until, 0.35));
  const insideBody = (y) => { const top = y - px * 0.6; return top >= body.y - 1 && top + px * 1.2 <= body.y + body.h + 1; };

  return piece(s, { ...o, id }, {
    kind: 'terminal',
    rect,
    tk,
    vis,
    texts: [...rows.map(r => r.text), ...extra],
    end,
    marks,
    extra: { body },
    qa(_api, t) {
      const live = [];
      rows.forEach((r, i) => {
        if (t < r.at || !shown[i]) { return; }
        const y = rowY(i, t);
        if (!insideBody(y)) { return; }
        const w = (shown[i].length + (r.cmd ? prompt.length : 0)) * cw;
        live.push({ text: shown[i], rect: { x: body.x, y: y - px * 0.6, w, h: px * 1.2 }, overflow: w > body.w + 1, px });
      });
      return { rect, alpha: vis(t), container: true, host: o.in, texts: [...tk.qa(t), ...live] };
    },
    draw(api, t) {
      const p = ease.out(prog(t, at, 0.6));
      const a = chrome(api, rect, p, bar);
      if (a <= 0) { return; }
      drawT(api, title, { alpha: a });
      clipTo(api, { x: rect.x + 4, y: rect.y + bar + 3, w: rect.w - 8, h: rect.h - bar - 8 }, () => {
        let caret = null;
        if (rows[0]?.cmd && t < rows[0].at) { caret = { x: body.x + prompt.length * cw, y: rowY(0, t), solid: false, idle: true }; }
        if (caret) { api.style.text(api, prompt, body.x, caret.y, { px, role: 'mono', color: 'good', alpha: a }); }
        rows.forEach((r, i) => {
          if (t < r.at) { return; }
          const y = rowY(i, t);
          if (y < body.y - lineH || y > body.y + body.h + lineH) { return; }
          if (r.cmd) {
            const chars = typedChars(shown[i].length, prog(t, r.at, r.dur));
            api.style.text(api, prompt, body.x, y, { px, role: 'mono', color: 'good', alpha: a });
            drawRuns(api, [{ text: shown[i], color: r.color }], chars, body.x + prompt.length * cw, y, px, cw, a);
            const next = rows[i + 1];
            if (!next || t < next.at) { caret = { x: body.x + (prompt.length + chars) * cw + 2, y, solid: t < r.at + r.dur }; }
            else { caret = null; }
          }
          else {
            api.style.text(api, shown[i], body.x, y, { px, role: 'mono', color: r.color, alpha: a * ease.out(prog(t, r.at, 0.18)) });
            caret = null;
          }
        });
        if (caret && (caret.solid || blink(t, 0, 2.2))) { fillRect(api, { x: caret.x, y: caret.y - px * 0.6, w: cw * 0.6, h: px * 1.2 }, 'good', a * 0.9, 2); }
      });
    },
  });
}

// ---- diff view -----------------------------------------------------------------------------------------------------

/**
 * Unified diff card: file name and stat in the header, rows that slide in one by one, added rows tinted good and
 * removed rows tinted bad, syntax colors from `tokenize`. lines: [{ op: '+' | '-' | ' ', text }]. Registers `<id>.l<n>`.
 * Exposes `end` (the last row is in).
 */
export function diffView(s, o) {
  const rect = resolveRect(s, o, 'diffView');
  const id = o.id ?? s.uid('diff');
  const at = o.at ?? 0;
  const { bar, pad, ui } = metrics(s);
  const tk = textKit(s);
  const lines = (o.lines ?? []).map(l => ({ op: l.op === '+' || l.op === '-' ? l.op : ' ', text: String(l.text ?? '') }));
  const n = Math.max(lines.length, 1);
  const avail = rect.h - bar - pad;
  const { px, cw } = monoFit(s, o.px ?? size(s, 'code', 1.2), Math.max(8, ...lines.map(l => l.text.length)), rect.w - pad * 2, n, avail, 2.4);
  const lineH = Math.min(px * 1.7, avail / n);
  const codeX = rect.x + pad + cw * 2.4;
  const codeW = rect.x + rect.w - pad - codeX;
  const maxChars = Math.max(4, Math.floor(codeW / cw));
  const step = o.step ?? 0.15;
  const rowRect = i => ({ x: rect.x + 8, y: rect.y + bar + pad / 2 + i * lineH, w: rect.w - 16, h: lineH });
  const rowAt = i => at + 0.5 + i * step;
  lines.forEach((_, i) => s.reg.add(`${id}.l${i + 1}`, rowRect(i)));

  const file = o.file ? tk.make(o.file, rect.x + pad, rect.y + bar / 2, rect.w * 0.6, { role: 'mono', px: ui, color: 'dim', at: at + 0.2 }) : null;
  const stat = o.stat ? tk.make(o.stat, rect.x + rect.w - pad, rect.y + bar / 2, rect.w * 0.3, { role: 'mono', px: ui, color: 'dim', align: 'right', at: at + 0.2 }) : null;
  const extra = [];
  const rows = lines.map((l, i) => {
    const shown = clip(l.text, maxChars);
    if (shown !== l.text) { extra.push(l.text); }
    tk.make(shown, codeX, rowRect(i).y + lineH / 2, codeW, { role: 'mono', px, at: rowAt(i) });
    return { ...l, runs: tokenize(shown), shown };
  });

  return piece(s, { ...o, id }, {
    kind: 'diffView',
    rect,
    tk,
    texts: extra,
    end: lines.length ? rowAt(lines.length - 1) + 0.4 : at + 0.6,
    draw(api, t) {
      const p = ease.out(prog(t, at, 0.6));
      const a = chrome(api, rect, p, bar, { dots: false });
      if (a <= 0) { return; }
      if (file) { drawT(api, file, { alpha: a }); }
      if (stat) { drawT(api, stat, { alpha: a }); }
      clipTo(api, { x: rect.x + 3, y: rect.y + bar + 2, w: rect.w - 6, h: rect.h - bar - 5 }, () => {
        rows.forEach((l, i) => {
          const k = ease.out(prog(t, rowAt(i), 0.35));
          if (k <= 0) { return; }
          const r = rowRect(i);
          const y = r.y + lineH / 2;
          const tok = l.op === '+' ? 'good' : l.op === '-' ? 'bad' : null;
          const dx = (1 - k) * 30;
          if (tok) {
            fillRect(api, { x: r.x + dx, y: r.y + 2, w: r.w, h: r.h - 4 }, tok, 0.18 * a * k, 5);
            api.style.text(api, l.op, rect.x + pad + cw * 0.5 + dx, y, { px, role: 'mono', weight: 700, color: tok, align: 'center', alpha: a * k });
          }
          drawRuns(api, l.runs, l.shown.length, codeX + dx, y, px, cw, a * k * (l.op === '-' ? 0.75 : 1));
        });
      });
    },
  });
}

export const pieces = { editor, terminal, diffView };
