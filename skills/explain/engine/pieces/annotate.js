import { around, boundsOf, box, cross, dot, drawT, life, line, path, piece, poly, pop, rectRef, resolveRect, ring, size, spinner, textKit, textW, tick } from '../kit.js';
// Annotate family: kineticText (words that enter one by one), callout (note with a hand arrow to a target), stamp
// (verdict slammed on), bubble (speech or review comment), chip (status pill that flips state) and scribble (hand-drawn
// circle, underline or box around an element). Everything draws through the style calls and tokens, so each piece
// moves the same way in every preset; every visible string goes to QA.
import { clamp, ease, hash, lerp, prog } from '../math.js';
import { blockBox, drawTextBlock } from './base.js';
import { fitIn } from './diagram-kit.js';
import { drawIcon, KINDS } from './icons.js';

const MARGIN = 28;
const key = w => w.replace(/[.,:;!?()"'«»]/g, '').toLowerCase();

// ---- kinetic text -------------------------------------------------------------------------------------------------

export const KINETIC_MODES = ['pop', 'rise', 'drop', 'slam', 'slide'];

/**
 * Text with markup to lines of words: `*word*` (or `*two words*`) is emphasis, `|` or a newline breaks the line.
 * Returns [[{ text, emph }]] (punctuation stays with its word).
 */
export function parseMarkup(text) {
  let on = false;
  return String(text).split(/\||\n/).map(src => src.trim().split(/\s+/).filter(Boolean).map((tok) => {
    if (tok.startsWith('*')) { on = true; }
    const emph = on;
    if (/\*[.,:;!?)"'»]*$/.test(tok) && tok.replace(/\*/g, '').length > 0) { on = false; }
    return { text: tok.replace(/\*/g, ''), emph };
  }).filter(w => w.text));
}

/**
 * Words that enter one by one. o: text (markup: `*word*` = emphasis in accent, `|` = line break) | lines [str], rect | in,
 * mode (pop | rise | drop | slam | slide, default rise), step (0.09 s per word), at, until (the words leave),
 * px (largest size, 3 x nodePx), emphasis ({ word: token }), emphColor (accent), color (ink), underline ([words]: a hand
 * underline drawn on once the words are in), underlineColor, align (center | left), weight (700), lineHeight (1.25).
 * The size is the largest that fits the rect (words wrap, down to minPx).
 */
export function kineticText(s, o) {
  const mode = o.mode ?? 'rise';
  if (!KINETIC_MODES.includes(mode)) { throw new Error(`kineticText: unknown mode "${mode}" (use ${KINETIC_MODES.join(', ')})`); }
  if (o.text === undefined && !Array.isArray(o.lines)) { throw new Error('kineticText needs text (or lines)'); }
  const rect = resolveRect(s, o, 'kineticText');
  const at = o.at ?? 0;
  const step = o.step ?? 0.09;
  const weight = o.weight ?? 700;
  const lh = Math.max(1.15, o.lineHeight ?? 1.25);
  const source = parseMarkup(o.lines ? o.lines.join('|') : o.text);
  const dur = mode === 'slam' ? 0.28 : 0.5;
  const emphasis = Object.fromEntries(Object.entries(o.emphasis ?? {}).map(([k, v]) => [key(k), v]));
  const colorOf = w => emphasis[key(w.text)] ?? (w.emph ? (o.emphColor ?? 'accent') : (o.color ?? 'ink'));
  const underline = new Set((o.underline ?? []).map(key));

  const layout = (px) => {
    const space = Math.max(px * 0.22, textW(s, ' ', px, 'display', weight) * 1.1);
    const lines = [];
    for (const src of source) {
      let cur = { words: [], w: 0 };
      for (const word of src) {
        const w = textW(s, word.text, px, 'display', weight);
        if (cur.words.length && cur.w + space + w > rect.w) {
          lines.push(cur);
          cur = { words: [], w: 0 };
        }
        cur.words.push({ ...word, w, dx: cur.words.length ? cur.w + space : 0 });
        cur.w = cur.words.length > 1 ? cur.w + space + w : w;
      }
      lines.push(cur);
    }
    return { lines, h: lines.length * px * lh, w: Math.max(0, ...lines.map(l => l.w)) };
  };
  const minPx = s.style.defaults.minPx;
  let px = Math.max(minPx, Math.round(o.px ?? size(s, 'node', 3)));
  let lay = layout(px);
  while (px > minPx && (lay.h > rect.h || lay.w > rect.w)) {
    px -= 1;
    lay = layout(px);
  }
  const overflow = lay.h > rect.h + 0.5 || lay.w > rect.w + 0.5;
  const lineH = px * lh;
  const top = rect.y + (rect.h - lay.h) / 2;
  const words = [];
  lay.lines.forEach((ln, li) => {
    const x0 = o.align === 'left' ? rect.x : rect.x + (rect.w - ln.w) / 2;
    for (const w of ln.words) { words.push({ ...w, x: x0 + w.dx, cy: top + lineH * (li + 0.5), start: at + words.length * step, color: colorOf(w) }); }
  });
  const lastIn = at + Math.max(0, words.length - 1) * step + dur;
  const ulStart = lastIn - 0.1;
  const ulWords = words.filter(w => underline.has(key(w.text)));
  const end = ulWords.length ? ulStart + (ulWords.length - 1) * 0.15 + 0.5 : lastIn;
  const OUT = 0.3;
  const outOf = (t, i) => (o.until === undefined ? 0 : ease.in(prog(t, o.until + i * 0.035, OUT)));
  const gone = o.until === undefined ? Infinity : o.until + words.length * 0.035 + OUT;
  const vis = t => (t < at || t >= gone ? 0 : 1);

  return piece(s, o, {
    kind: 'kinetic',
    rect,
    texts: source.map(l => l.map(w => w.text).join(' ')),
    vis,
    end,
    extra: { px, words: words.map(w => ({ text: w.text, emph: w.emph, color: w.color, x: w.x, cy: w.cy, w: w.w, start: w.start })) },
    draw(api, t) {
      words.forEach((wd, i) => {
        const q = prog(t, wd.start, dur);
        const out = outOf(t, i);
        if (q <= 0 || out >= 1) { return; }
        const k = ease.back(q);
        const sign = i % 2 ? 1 : -1;
        const move = {
          pop: { scale: Math.max(0.01, lerp(0.3, 1, k)), dy: (1 - ease.out(q)) * px * 0.4, rot: (1 - ease.out(q)) * 0.18 * sign },
          rise: { dy: (1 - k) * px * 0.7 },
          drop: { dy: (k - 1) * px * 0.7 },
          slam: { scale: lerp(2.4, 1, ease.out(q)) * (1 - 0.07 * Math.sin(Math.PI * prog(t, wd.start + dur, 0.3))) },
          slide: { dx: (1 - ease.out(q)) * -px * 1.2 },
        }[mode];
        const cx = wd.x + wd.w / 2;
        around(api, cx, wd.cy, { ...move, dy: (move.dy ?? 0) + out * px * 0.4 }, () => {
          api.style.text(api, wd.text, cx, wd.cy, { px, role: 'display', weight, color: wd.color, align: 'center', alpha: clamp(q * 2.5) * (1 - out), glow: wd.color === (o.color ?? 'ink') ? 0 : 14 });
        });
      });
      ulWords.forEach((wd, j) => {
        const p = ease.inOut(prog(t, ulStart + j * 0.15, 0.5));
        const out = outOf(t, words.indexOf(wd));
        if (p <= 0 || out >= 1) { return; }
        const y = wd.cy + px * 0.46;
        const col = emphasis[key(wd.text)] ?? (wd.emph ? (o.emphColor ?? 'accent') : (o.underlineColor ?? 'accent'));
        line(api, [[wd.x, y], [wd.x + wd.w * 0.5, y + px * 0.04], [wd.x + wd.w, y - px * 0.02]], { p, color: col, lw: Math.max(4, px * 0.06), alpha: 1 - out, seed: hash(wd.text) % 40 });
      });
    },
    qa(_api, t) {
      const texts = [];
      words.forEach((wd, i) => {
        if (t >= wd.start && outOf(t, i) < 0.5) { texts.push({ text: wd.text, rect: { x: wd.x, y: wd.cy - px * 0.55, w: wd.w, h: px * 1.1 }, overflow: overflow || wd.w > rect.w + 1, px }); }
      });
      return { rect, alpha: vis(t), container: true, host: o.in, texts };
    },
  });
}

// ---- callout ------------------------------------------------------------------------------------------------------

const SIDES = ['right', 'left', 'top', 'bottom'];
const OPPOSITE = { right: 'left', left: 'right', top: 'bottom', bottom: 'top' };
const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** A callout or scribble target to { rect, point } (point only for an anchor or an [x, y] target). */
function targetOf(s, target, what) {
  if (Array.isArray(target)) { return { rect: { x: target[0], y: target[1], w: 0, h: 0 }, point: target }; }
  if (typeof target === 'string') {
    if (!s.reg.has(target)) { throw new Error(`${what}: unknown target "${target}" (known: ${s.reg.ids().join(', ') || 'none'})`); }
    return { rect: s.reg.get(target) };
  }
  if (target && target.id !== undefined && target.w === undefined) {
    const rect = rectRef(s, target.id);
    if (!rect) { throw new Error(`${what}: unknown target "${target.id}"`); }
    return { rect, point: target.anchor ? s.reg.anchor(target.id, target.anchor) : undefined };
  }
  if (target && Number.isFinite(target.w)) { return { rect: target }; }
  throw new Error(`${what} needs a target: an id, a [x, y] point, { id, anchor } or a rect`);
}

/**
 * Note with a curved hand arrow to a target. o: target (id | [x, y] | { id, anchor } | rect), text, side (right | left | top
 * | bottom: where the note sits, default right; flips when it would leave the frame), dist (gap between target and note),
 * w, h (note size; default fits the text), rect (explicit note rect), bend (px the arrow bows, 0 = straight, default 0.2
 * of its length), color (warn), px, at, until. The note never overlaps the target; the arrow ends at the target edge.
 * Exposes `arrow` ({ pts, from, to }).
 */
export function callout(s, o) {
  const { rect: T, point } = targetOf(s, o.target, 'callout');
  const side0 = o.side ?? 'right';
  if (!SIDES.includes(side0)) { throw new Error(`callout: unknown side "${side0}" (use ${SIDES.join(', ')})`); }
  const d = s.style.defaults;
  const text = o.text ?? '';
  const pad = d.pad;
  const px = o.px ?? size(s, 'label', 0.9);
  const dist = o.dist ?? size(s, 'label', 2.2);
  const probeW = o.w ?? Math.min(560, Math.max(260, textW(s, text, px, 'body', 600) + pad * 2 + 8));
  const w = probeW;
  const h = o.h ?? Math.max(px * 2, fitIn(s, text, { x: 0, y: 0, w, h: 1000 }, { px, pad, weight: 600, lineHeight: 1.2 }).height + pad * 2);
  const [tx, ty] = [T.x + T.w / 2, T.y + T.h / 2];
  const place = side => ({
    right: { x: T.x + T.w + dist, y: ty - h / 2 + (o.shift ?? 0), w, h },
    left: { x: T.x - dist - w, y: ty - h / 2 + (o.shift ?? 0), w, h },
    top: { x: tx - w / 2 + (o.shift ?? 0), y: T.y - dist - h, w, h },
    bottom: { x: tx - w / 2 + (o.shift ?? 0), y: T.y + T.h + dist, w, h },
  })[side];
  const inFrame = r => r.x >= MARGIN && r.y >= MARGIN && r.x + r.w <= s.W - MARGIN && r.y + r.h <= s.H - MARGIN;
  const keep = r => ({ ...r, x: clamp(r.x, MARGIN, s.W - MARGIN - r.w), y: clamp(r.y, MARGIN, s.H - MARGIN - r.h) });
  let side = side0;
  let rect;
  if (o.rect) { rect = rectRef(s, o.rect); }
  else {
    rect = place(side);
    if (!inFrame(rect) && inFrame(place(OPPOSITE[side]))) { side = OPPOSITE[side]; rect = place(side); }
    rect = keep(rect);
    if (hits(rect, T) && T.w > 0) { throw new Error(`callout: no room for the note beside "${typeof o.target === 'string' ? o.target : 'the target'}" on side ${side0}: pass side, dist, w, h or rect`); }
  }
  // Arrow: from the note edge facing the target to a point just outside the target edge.
  const [rx, ry] = [rect.x + rect.w / 2, rect.y + rect.h / 2];
  const horizontal = Math.abs(rx - tx) / (rect.w / 2 + T.w / 2 + 1) > Math.abs(ry - ty) / (rect.h / 2 + T.h / 2 + 1);
  const from = horizontal ? [rx > tx ? rect.x : rect.x + rect.w, clamp(ry, rect.y + rect.h * 0.2, rect.y + rect.h * 0.8)] : [clamp(rx, rect.x + rect.w * 0.2, rect.x + rect.w * 0.8), ry > ty ? rect.y : rect.y + rect.h];
  const edge = point ?? (horizontal ? [rx > tx ? T.x + T.w : T.x, clamp(from[1], T.y, T.y + T.h)] : [clamp(from[0], T.x, T.x + T.w), ry > ty ? T.y + T.h : T.y]);
  const gap = Math.max(6, d.lw * 2);
  const len = Math.hypot(from[0] - edge[0], from[1] - edge[1]) || 1;
  const to = [edge[0] + ((from[0] - edge[0]) / len) * gap, edge[1] + ((from[1] - edge[1]) / len) * gap];
  const arrowLen = Math.hypot(from[0] - to[0], from[1] - to[1]);
  const bend = o.bend ?? (arrowLen < 40 ? 0 : arrowLen * 0.2 * (horizontal ? (rx > tx ? 1 : -1) : (ry > ty ? -1 : 1)));
  const pts = bend ? path.linkPts(from, to, 'arc', bend) : [from, to];
  const at = o.at ?? 0;
  const color = o.color ?? 'warn';
  const fit = fitIn(s, text, rect, { px, pad, weight: 600, lineHeight: 1.2 });
  const seed = hash(text) % 40;

  return piece(s, { z: 5, ...o }, {
    kind: 'callout',
    rect,
    texts: [text],
    container: false,
    end: at + 0.8,
    extra: { arrow: { pts, from, to }, side },
    draw(api, t) {
      const k = pop(t, at, 0.4);
      if (k > 0) {
        around(api, ...from, k, () => {
          box(api, rect, { stroke: color, fill: 'panel', lw: d.lw + 1, seed });
          drawTextBlock(api, fit, rect, { weight: 600, color: 'onPanel', alpha: clamp(k) });
        });
      }
      const p = ease.inOut(prog(t, at + 0.25, 0.5));
      if (p > 0) { line(api, pts, { p, color, lw: d.lw + 1, head: true, smooth: true, seed }); }
    },
    qa: (_api, t) => ({ rect, alpha: t < at ? 0 : o.until === undefined ? 1 : 1 - prog(t, o.until, 0.35), container: false, host: o.in, texts: [{ text, rect: blockBox(fit, rect), overflow: fit.overflow, px: fit.px }] }),
  });
}

// ---- stamp --------------------------------------------------------------------------------------------------------

/**
 * Verdict slammed onto the scene with an overshoot and an impact ring. o: text, rect | cx, cy (sized to the text), at, until,
 * color (good), rot (radians, -0.14), px (1.3 x nodePx).
 */
export function stamp(s, o) {
  const text = o.text ?? '';
  const px = o.px ?? size(s, 'node', 1.3);
  const w0 = textW(s, text, px, 'display', 700) + px * 1.3;
  const h0 = px * 1.8;
  const rect = Number.isFinite(o.cx) && Number.isFinite(o.cy) ? { x: o.cx - w0 / 2, y: o.cy - h0 / 2, w: w0, h: h0 } : resolveRect(s, o, 'stamp');
  const at = o.at ?? 0;
  const rot = o.rot ?? -0.14;
  const [cx, cy] = [rect.x + rect.w / 2, rect.y + rect.h / 2];
  const color = o.color ?? 'good';
  const tk = textKit(s);
  const sp = tk.make(text, cx, cy + 2, rect.w - px * 0.8, { px, role: 'display', weight: 700, align: 'center', color });
  const bw = Math.abs(rect.w * Math.cos(rot)) + Math.abs(rect.h * Math.sin(rot));
  const bh = Math.abs(rect.w * Math.sin(rot)) + Math.abs(rect.h * Math.cos(rot));
  const lw = s.style.defaults.lw;
  return piece(s, { z: 6, ...o }, {
    kind: 'stamp',
    rect,
    tk,
    end: at + 0.6,
    draw(api, t) {
      const k = prog(t, at, 0.22);
      if (k <= 0) { return; }
      const land = prog(t, at + 0.22, 0.4);
      const sc = lerp(3, 1, ease.in(k)) * (1 - 0.08 * Math.sin(Math.PI * land));
      const f = api.fade(clamp(k * 2.5));
      if (land > 0 && land < 1) {
        const g = ease.out(land) * 56;
        box(f, { x: rect.x - g, y: rect.y - g, w: rect.w + g * 2, h: rect.h + g * 2 }, { stroke: color, fill: null, lw: lw + 1, alpha: 1 - land, seed: 7 });
      }
      around(f, cx, cy, { scale: sc, rot }, () => {
        box(f, rect, { stroke: color, fill: 'panel', lw: lw * 2, seed: 142 });
        box(f, { x: rect.x + 10, y: rect.y + 10, w: rect.w - 20, h: rect.h - 20 }, { stroke: color, fill: null, lw: Math.max(2, lw * 0.8), seed: 143 });
        drawT(f, sp, { glow: 12 });
      });
    },
    qa: (_api, t) => ({ rect: { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh }, alpha: t < at ? 0 : o.until === undefined ? 1 : 1 - prog(t, o.until, 0.35), container: true, host: o.in, texts: tk.qa(t) }),
  });
}

// ---- bubble -------------------------------------------------------------------------------------------------------

const TAILS = ['left', 'right', 'top', 'bottom'];

/**
 * Speech or review bubble. o: rect | in, text, initials (an avatar circle), side (left | right: where the avatar sits),
 * tail (left | right | top | bottom | none: which edge carries the tail; default toward the avatar, else bottom),
 * tailAt (0..1 along that edge; default aligned with the avatar), typing (seconds of "..." before the text, 0.6),
 * color (accent2), px, at, until. The avatar, tail and text all stay inside the rect.
 */
export function bubble(s, o) {
  const rect = resolveRect(s, o, 'bubble');
  const text = o.text ?? '';
  const at = o.at ?? 0;
  const typing = o.typing ?? 0.6;
  const color = o.color ?? 'accent2';
  const d = s.style.defaults;
  const hasAv = o.initials !== undefined;
  const side = o.side ?? 'left';
  if (!['left', 'right'].includes(side)) { throw new Error(`bubble: unknown side "${side}" (use left, right)`); }
  const tailSide = o.tail ?? (hasAv ? side : 'bottom');
  if (tailSide !== 'none' && !TAILS.includes(tailSide)) { throw new Error(`bubble: unknown tail "${tailSide}" (use ${TAILS.join(', ')}, none)`); }
  const tl = tailSide === 'none' ? 0 : Math.round(size(s, 'label', 0.5));
  const av = hasAv ? Math.max(8, Math.min(size(s, 'label', 0.75), rect.h / 2 - 2)) : 0;
  const ax = side === 'left' ? rect.x + av : rect.x + rect.w - av;
  const ay = rect.y + av + 2;
  // Body: the rect minus the avatar column and the room the tail needs.
  const body = { ...rect };
  if (hasAv) {
    const col = av * 2 + (tailSide === side ? tl : 0) + 12;
    body.w -= col;
    if (side === 'left') { body.x += col; }
  }
  if (tailSide !== 'none' && !(hasAv && tailSide === side)) {
    if (tailSide === 'left') { body.x += tl; body.w -= tl; }
    else if (tailSide === 'right') { body.w -= tl; }
    else if (tailSide === 'top') { body.y += tl; body.h -= tl; }
    else { body.h -= tl; }
  }
  const base = tl * 1.2;
  const horiz = tailSide === 'left' || tailSide === 'right';
  const lo = (horiz ? body.y : body.x) + base;
  const hi = (horiz ? body.y + body.h : body.x + body.w) - base;
  const along = horiz ? (hasAv && tailSide === side && o.tailAt === undefined ? ay : body.y + body.h * (o.tailAt ?? 0.3)) : body.x + body.w * (o.tailAt ?? 0.2);
  const at0 = clamp(along, Math.min(lo, hi), Math.max(lo, hi));
  const inside = 3; // the tail base sits slightly inside the body so its fill hides the body stroke
  const edgeX = tailSide === 'left' ? body.x : body.x + body.w;
  const edgeY = tailSide === 'top' ? body.y : body.y + body.h;
  const dirX = tailSide === 'left' ? -1 : 1;
  const dirY = tailSide === 'top' ? -1 : 1;
  const tail = tailSide === 'none'
    ? null
    : horiz
      ? { b0: [edgeX - dirX * inside, at0 - base / 2], tip: [edgeX + dirX * tl, at0], b1: [edgeX - dirX * inside, at0 + base / 2] }
      : { b0: [at0 - base / 2, edgeY - dirY * inside], tip: [at0, edgeY + dirY * tl], b1: [at0 + base / 2, edgeY - dirY * inside] };
  const pad = Math.round(d.pad * 0.9);
  const fit = fitIn(s, text, body, { px: o.px ?? size(s, 'label', 0.95), pad, lineHeight: 1.22 });
  const tk = textKit(s);
  if (hasAv) { tk.make(o.initials, ax, ay + 1, av * 1.7, { px: av * 0.9, weight: 700, align: 'center', color, minPx: 8 }); }
  const shownAt = at + 0.3 + typing;
  const origin = tail ? tail.tip : [body.x + body.w / 2, body.y + body.h / 2];
  const phase = (hash(o.id ?? text) % 60) / 10;
  const seed = hash(text) % 40;
  const lw = d.lw;

  return piece(s, { z: 3, ...o }, {
    kind: 'bubble',
    rect,
    tk,
    texts: [text],
    end: shownAt + Math.max(0.4, text.length * 0.025),
    extra: { body, tail },
    draw(api, t) {
      const k = pop(t, at, 0.45);
      if (k <= 0) { return; }
      const f = api.fade(clamp(k * 2));
      if (hasAv) {
        ring(f, ax, ay, av * Math.max(0.01, k), { color, lw, glow: 0 });
        drawT(f, tk.list[0], { alpha: clamp(k) });
      }
      around(f, origin[0], origin[1], Math.max(0.01, k), () => {
        box(f, body, { stroke: color, fill: 'panel', lw, seed });
        if (tail) {
          poly(f, [tail.b0, tail.tip, tail.b1], { stroke: null, fill: 'panel', closed: true });
          line(f, [tail.b0, tail.tip, tail.b1], { color, lw, glow: 0, seed });
        }
        if (typing > 0 && t < shownAt) {
          for (let i = 0; i < 3; i++) { dot(f, body.x + body.w / 2 + (i - 1) * body.h * 0.18, body.y + body.h / 2 + Math.sin(t * 9 + phase - i * 0.9) * body.h * 0.05, Math.max(4, body.h * 0.06), color); }
        }
        else { drawTextBlock(f, fit, body, { align: 'left', pad, color: 'onPanel', p: prog(t, shownAt, Math.max(0.4, text.length * 0.025)) }); }
      });
    },
    qa: (_api, t) => ({
      rect,
      alpha: t < at ? 0 : o.until === undefined ? 1 : 1 - prog(t, o.until, 0.35),
      container: true,
      host: o.in,
      texts: [...tk.qa(t), ...(t >= shownAt ? [{ text, rect: blockBox(fit, body, 'left', pad), overflow: fit.overflow, px: fit.px }] : [])],
    }),
  });
}

// ---- chip ---------------------------------------------------------------------------------------------------------

const CHIP_ICONS = ['spinner', 'dot', ...KINDS];
const FLIP = 0.34;

/**
 * Status pill. o: text, x (left) | cx (center) with y (top) | cy (center), in any mix | rect | in, color (accent), solid (filled with the color), mono,
 * icon (check | cross | spinner | dot | any icon kind), px, at, until, states ([{ at, text, color, icon, solid }]: the pill
 * flips to the next state at `at` with a small morph; each state inherits what it leaves out from the one before).
 * The pill keeps one size, fitted to the widest state. `in: '<id>'` names the QA host (a chip inside a splitScreen half:
 * `in: 'split.left'`) and does not move the chip when a coordinate is given.
 */
export function chip(s, o) {
  const d = s.style.defaults;
  const px = o.px ?? size(s, 'label', 0.7);
  const role = o.mono ? 'mono' : 'body';
  const first = { at: undefined, text: o.text ?? '', color: o.color ?? 'accent', icon: o.icon, solid: Boolean(o.solid) };
  const list = [first];
  for (const st of [...(o.states ?? [])].sort((a, b) => a.at - b.at)) {
    const prev = list[list.length - 1];
    if (!Number.isFinite(st.at)) { throw new TypeError('chip states need an "at" time'); }
    list.push({ at: st.at, text: st.text ?? prev.text, color: st.color ?? prev.color, icon: st.icon === undefined ? prev.icon : st.icon, solid: st.solid ?? prev.solid });
  }
  for (const st of list) {
    if (st.icon && !CHIP_ICONS.includes(st.icon)) { throw new Error(`chip: unknown icon "${st.icon}". Use one of: ${CHIP_ICONS.join(', ')}`); }
  }
  // Text on a solid fill: the preset's onAccent over accent, the panel color over the status colors (it contrasts with them in every preset).
  const onSolid = st => (st.color === 'accent' ? 'onAccent' : 'panel');
  const iconW = px * 1.1;
  const gap = px * 0.35;
  const slot = st => (st.icon ? iconW + gap : 0);
  const h = o.rect?.h ?? Math.round(px * 2);
  const widest = Math.max(...list.map(st => textW(s, st.text, px, role, 600) + slot(st)));
  const w = o.rect?.w ?? Math.ceil(widest + px * 1.6);
  // Position: any mix of a horizontal (cx | x) and a vertical (cy | y) coordinate; `in` then only names the host.
  const hx = Number.isFinite(o.cx) ? o.cx - w / 2 : Number.isFinite(o.x) ? o.x : undefined;
  const vy = Number.isFinite(o.cy) ? o.cy - h / 2 : Number.isFinite(o.y) ? o.y : undefined;
  const rect = o.rect
    ? resolveRect(s, o, 'chip')
    : hx !== undefined && vy !== undefined
      ? { x: hx, y: vy, w, h }
      : o.in || (Number.isFinite(o.w) && Number.isFinite(o.h)) || (o.id && s.reg.has(o.id))
        ? resolveRect(s, o, 'chip')
        : (() => { throw new TypeError(`chip "${o.id ?? ''}" has no position: pass x | cx and y | cy, rect, in or a layout id`); })();
  const [cx, cy] = [rect.x + rect.w / 2, rect.y + rect.h / 2];
  const at = o.at ?? 0;
  const tk = textKit(s);
  const specs = list.map((st, i) => {
    const maxW = rect.w - px * 1.6 - slot(st);
    const color = st.solid ? onSolid(st) : 'ink';
    const probe = tk.make(st.text, 0, cy, maxW, { px, role, weight: 600, color, track: false });
    const x = cx - (slot(st) + probe.w) / 2 + slot(st);
    const from = i === 0 ? undefined : st.at + FLIP / 2;
    const to = i + 1 < list.length ? list[i + 1].at + FLIP / 2 : undefined;
    return tk.make(st.text, x, cy, maxW, { px, role, weight: 600, color, align: 'left', at: from, until: to });
  });
  const stateAt = (t) => {
    let n = 0;
    list.forEach((st, i) => { if (i > 0 && t >= st.at + FLIP / 2) { n = i; } });
    return n;
  };
  const vis = t => life(t, at, o.until, 0.2, 0.35);

  return piece(s, { z: 2, ...o }, {
    kind: 'chip',
    rect,
    tk,
    vis,
    container: false,
    end: Math.max(at + 0.45, ...list.slice(1).map(st => st.at + FLIP + 0.3)),
    marks: Object.fromEntries(list.slice(1).map((st, i) => [`state${i + 1}`, st.at])),
    draw(api, t) {
      const n = stateAt(t);
      const st = list[n];
      let sy = 1;
      let bump = 0;
      for (const nx of list.slice(1)) {
        const q = prog(t, nx.at, FLIP);
        if (q > 0 && q < 1) {
          sy = Math.max(0.04, Math.abs(Math.cos(Math.PI * q)));
          bump = 0.08 * Math.sin(Math.PI * q);
        }
      }
      around(api, cx, cy, { scale: Math.max(0.01, pop(t, at, 0.4)) * (1 + bump), sy }, () => {
        box(api, rect, { kind: 'pill', stroke: st.color, fill: st.solid ? st.color : 'panel', lw: d.lw, seed: 181 });
        if (st.icon) {
          const ic = st.solid ? onSolid(st) : st.color;
          const sp = specs[n];
          const [ix, iy] = [sp.x - gap - iconW / 2, cy];
          const since = n === 0 ? at + 0.25 : st.at + FLIP;
          if (st.icon === 'spinner') { spinner(api, ix, iy, iconW * 0.38, t, ic, Math.max(2.5, d.lw)); }
          else if (st.icon === 'dot') { dot(api, ix, iy, iconW * 0.28, ic); }
          else if (st.solid && st.icon === 'check') { tick(api, ix, iy, iconW * 1.3, ease.inOut(prog(t, since, 0.35)), ic, Math.max(3, d.lw + 1)); }
          else if (st.solid && st.icon === 'cross') { cross(api, ix, iy, iconW * 1.3, ease.inOut(prog(t, since, 0.35)), ic, Math.max(3, d.lw + 1)); }
          else { drawIcon(api, st.icon, { x: ix - iconW / 2, y: iy - iconW / 2, w: iconW, h: iconW }, { color: ic, p: ease.inOut(prog(t, since, 0.35)), t, lw: Math.max(2.5, d.lw) }); }
        }
        drawT(api, specs[n]);
      });
    },
  });
}

// ---- scribble -----------------------------------------------------------------------------------------------------

const SCRIBBLES = ['circle', 'underline', 'box'];

/**
 * Hand-drawn emphasis around an element. o: target (id | rect), kind (circle | underline | box, default circle), at,
 * dur (0.6), until, color (accent), pad, lw. The circle and the box are container records that own the target.
 */
export function scribble(s, o) {
  const kind = o.kind ?? 'circle';
  if (!SCRIBBLES.includes(kind)) { throw new Error(`scribble: unknown kind "${kind}" (use ${SCRIBBLES.join(', ')})`); }
  const { rect: T } = targetOf(s, o.target, 'scribble');
  const d = s.style.defaults;
  const pad = o.pad ?? size(s, 'min', 0.5);
  const lw = o.lw ?? Math.round(d.lw * 1.6);
  const at = o.at ?? 0;
  const dur = o.dur ?? 0.6;
  const color = o.color ?? 'accent';
  const seed = hash(typeof o.target === 'string' ? o.target : `${T.x},${T.y}`) % 40;
  const [cx, cy] = [T.x + T.w / 2, T.y + T.h / 2];
  const strokes = [];
  if (kind === 'circle') {
    const rx = (T.w / 2) * 1.3 + pad;
    const ry = (T.h / 2) * 1.32 + pad;
    const a0 = -2.2;
    const sweep = Math.PI * 2 * 1.08;
    strokes.push(Array.from({ length: 49 }, (_, i) => {
      const k = i / 48;
      const a = a0 + sweep * k;
      const f = 1 + 0.035 * Math.sin(2.3 * a + 1) + k * 0.07;
      return [cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f];
    }));
  }
  else if (kind === 'underline') {
    const [x0, x1, y] = [T.x - pad, T.x + T.w + pad, T.y + T.h + pad * 0.6];
    strokes.push([[x0, y], [x0 + (x1 - x0) * 0.5, y + 5], [x1, y - 2]]);
    strokes.push([[x1, y + 9], [x0 + (x1 - x0) * 0.2, y + 14]]);
  }
  else {
    const [x0, y0, x1, y1] = [T.x - pad, T.y - pad, T.x + T.w + pad, T.y + T.h + pad];
    strokes.push([[x0 - 3, y0 + 2], [x1 + 4, y0 - 2], [x1 + 2, y1 + 3], [x0 - 4, y1 - 1], [x0 + 1, y0 - 7]]);
  }
  const rect = boundsOf(strokes.flat(), lw / 2 + 1);
  const solidTarget = kind !== 'underline';
  return piece(s, { z: 4, ...o }, {
    kind: 'scribble',
    rect,
    container: solidTarget,
    contains: typeof o.target === 'string' ? [o.target] : undefined,
    end: at + dur,
    draw(api, t) {
      const p = ease.inOut(prog(t, at, dur));
      if (p <= 0) { return; }
      strokes.forEach((pts, i) => {
        const q = strokes.length === 1 ? p : i === 0 ? clamp(p * 1.6) : clamp(p * 2.5 - 1.5);
        if (q > 0) { line(api, pts, { p: q, color, lw, smooth: kind !== 'box', seed: seed + i * 3 }); }
      });
    },
  });
}

export const pieces = { kineticText, callout, stamp, bubble, chip, scribble };
