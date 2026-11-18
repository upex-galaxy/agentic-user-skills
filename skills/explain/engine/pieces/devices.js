import { around, box, contain, cross, dot, drawT, fillRect, fitPx, line, piece, pointOf, poly, resolveRect, ring, size, skeleton, spinner, text, textKit, textW, tick } from '../kit.js';
// Devices family: browser and phone frames that host other pieces, a small app screen, a pull request page and the
// mouse pointer. Hosts register `<id>.body` / `<id>.screen`; any piece placed with `in: '<id>.body'` is hosted (QA lets
// it sit inside or on the frame). Sizes come from style.defaults, so every piece renders in every preset.
// s.browser({ id, rect | in, url, typeUrl, at, dur, color })
// s.phone({ id, rect | in, at, dur, tilt, color })
// s.appScreen({ id, rect | in, title, rows: [{ label, value?, on? }], total: { label, from, to, at }, cta, banner, feature })
// s.prPage({ id, rect | in, title, number, from, to, author, stats, labels, checks, reviewers, button, openAt, mergeAt })
// s.cursor({ path: [[t, x, y]], clicks: [t], until })
import { clamp, ease, lerp, prog } from '../math.js';

/** Base text size of a device UI: a share of the label size, never below the preset floor. */
const uiPx = (s, k = 0.6) => Math.max(size(s, 'min'), size(s, 'label', k));
const fadeOut = (o, t, d = 0.35) => (o.until === undefined ? 1 : 1 - prog(t, o.until, d));

const LABELS = {
  es: { draft: 'Borrador', open: 'Abierto', merged: 'Fusionado', merge: 'Fusionar pull request', blocked: 'Esperando checks y revisión', reviewers: 'Revisores', checks: 'Checks', changes: 'Cambios', wants: 'quiere fusionar' },
  en: { draft: 'Draft', open: 'Open', merged: 'Merged', merge: 'Merge pull request', blocked: 'Waiting for checks and review', reviewers: 'Reviewers', checks: 'Checks', changes: 'Changes', wants: 'wants to merge' },
};
const labelsOf = (s, o) => ({ ...(s.lang === 'en' ? LABELS.en : LABELS.es), ...o.labels });

// ---- browser ------------------------------------------------------------------------------------------------------

/**
 * Browser window with a tab bar and a URL pill that types the address. o: id, rect | in, url, typeUrl (true), at,
 * dur (0.7), color, until, z. Registers `<id>.body`, the page area: place pieces with `in: '<id>.body'`.
 */
export function browser(s, o) {
  const id = o.id ?? s.uid('browser');
  const rect = resolveRect(s, { ...o, id }, 'browser');
  const at = o.at ?? 0;
  const dur = o.dur ?? 0.7;
  const color = o.color ?? 'dim';
  const upx = uiPx(s, 0.6);
  const bar = Math.round(upx * 2.5);
  const pill = { x: rect.x + bar * 1.9, y: rect.y + bar * 0.17, w: rect.w - bar * 2.4, h: bar * 0.66 };
  const url = o.url ?? '';
  const tk = textKit(s);
  const spec = url ? tk.make(url, pill.x + bar * 0.7, pill.y + pill.h / 2, pill.w - bar * 0.95, { px: size(s, 'code', 0.7), role: 'mono', color: 'dim', at }) : null;
  const gap = Math.round(bar * 0.16);
  const body = { x: rect.x + gap, y: rect.y + bar + gap, w: rect.w - gap * 2, h: rect.h - bar - gap * 2 };
  s.reg.add(`${id}.body`, body);
  const typeAt = at + dur * 0.6;
  const typeDur = spec && o.typeUrl !== false ? Math.max(0.4, url.length * 0.03) : 0;
  return piece(s, { ...o, id }, {
    kind: 'browser',
    rect,
    tk,
    z: -0.2,
    end: Math.max(at + dur, typeAt + typeDur),
    extra: { body },
    draw(api, t) {
      const p = ease.out(prog(t, at, dur));
      if (p <= 0) { return; }
      box(api, rect, { p, stroke: color, fill: 'panel', lw: 2.5 });
      const a = clamp((p - 0.4) / 0.6);
      if (a <= 0) { return; }
      line(api, [[rect.x + 3, rect.y + bar], [rect.x + rect.w - 3, rect.y + bar]], { p: a, color, lw: 1.5, glow: 0, alpha: 0.7 });
      ['bad', 'warn', 'good'].forEach((c, i) => dot(api, rect.x + bar * 0.52 + i * bar * 0.42, rect.y + bar / 2, bar * 0.11, c, { alpha: a * 0.9 }));
      box(api, pill, { kind: 'pill', stroke: 'dim', fill: null, lw: 1.5, glow: 0, alpha: a * 0.8 });
      dot(api, pill.x + bar * 0.3, pill.y + pill.h / 2, bar * 0.09, 'good', { alpha: a });
      if (spec) { drawT(api, spec, { alpha: a, p: typeDur ? prog(t, typeAt, typeDur) : 1 }); }
    },
  });
}

// ---- phone --------------------------------------------------------------------------------------------------------

/**
 * Phone frame (kept at a 1:2 aspect inside the rect). o: id, rect | in, at, dur (0.7), tilt (degrees the phone starts
 * rotated by and settles from, 0), color, until, z. Registers `<id>.screen`.
 */
export function phone(s, o) {
  const id = o.id ?? s.uid('phone');
  const rect = contain(resolveRect(s, { ...o, id }, 'phone'), 0.5);
  if (s.reg.has(id)) { s.reg.replace(id, rect); }
  const at = o.at ?? 0;
  const dur = o.dur ?? 0.7;
  const bz = rect.w * 0.05;
  const top = rect.w * 0.15;
  const bot = rect.w * 0.11;
  const screen = { x: rect.x + bz, y: rect.y + top, w: rect.w - bz * 2, h: rect.h - top - bot };
  s.reg.add(`${id}.screen`, screen);
  const [cx, cy] = [rect.x + rect.w / 2, rect.y + rect.h / 2];
  return piece(s, { ...o, id }, {
    kind: 'phone',
    rect,
    z: -0.2,
    end: at + dur,
    extra: { screen },
    draw(api, t) {
      const p = ease.out(prog(t, at, dur));
      if (p <= 0) { return; }
      const rot = ((o.tilt ?? 0) * Math.PI / 180) * (1 - p);
      around(api, cx, cy, { rot }, () => {
        box(api, rect, { p, stroke: o.color ?? 'dim', fill: 'panel', lw: 3.5, r: rect.w * 0.12 });
        const a = clamp(p * 2 - 1);
        fillRect(api, { x: cx - rect.w * 0.14, y: rect.y + top * 0.4, w: rect.w * 0.28, h: top * 0.18 }, 'dim', a * 0.7, top * 0.09);
        fillRect(api, { x: cx - rect.w * 0.19, y: rect.y + rect.h - bot * 0.55, w: rect.w * 0.38, h: bot * 0.1 }, 'dim', a * 0.6, bot * 0.05);
      });
    },
  });
}

// ---- app screen ---------------------------------------------------------------------------------------------------

/** Number to text with the group separator of the scene language (decimal comma in Spanish). */
function fmtNum(v, { decimals = 0, prefix = '', suffix = '', sep = '.' } = {}) {
  const [int, dec] = Math.abs(v).toFixed(decimals).split('.');
  const neg = v < 0 && /[1-9]/.test(`${int}${dec ?? ''}`) ? '-' : '';
  return `${prefix}${neg}${int.replace(/\B(?=(\d{3})+(?!\d))/g, sep)}${dec ? `${sep === '.' ? ',' : '.'}${dec}` : ''}${suffix}`;
}

/**
 * A small app screen that adapts to a tall (phone) or wide (browser) rect: header with a title, rows (label plus a value
 * or a toggle), a total, a call to action, a banner and one new row. o: id, rect | in, at, title, rows [{ label, value?,
 * on? }], total { label, from, to, at, dur (1.2), prefix, suffix, decimals } (numbers count up, strings swap), cta (text),
 * banner (text | { text, at, color }), feature { label, at, badge } (a row that pops in, switches on and gets a badge),
 * color, until, z. Registers `<id>.total`, `<id>.cta` and `<id>.feature`.
 */
export function appScreen(s, o) {
  const id = o.id ?? s.uid('app');
  const rect = resolveRect(s, { ...o, id }, 'appScreen');
  const at = o.at ?? 0;
  const tall = rect.h > rect.w * 1.2;
  const rows = o.rows ?? [];
  const feat = o.feature;
  const total = o.total;
  const banner = typeof o.banner === 'string' ? { text: o.banner } : o.banner;
  const nRows = rows.length + (feat ? 1 : 0);
  // A narrow screen (a phone at video scale) packs tighter: slim padding, a smaller toggle and rows, text allowed a little under the minimum.
  const narrow = tall && rect.w < size(s, 'min') * 11.5;
  const rowK = narrow ? 2.1 : tall ? 2.6 : 2.3;
  const minTxt = narrow ? Math.round(size(s, 'min') * 0.72) : undefined;
  const pxFor = lift => Math.round(Math.max(size(s, 'min'), Math.min(uiPx(s, tall ? 0.8 : 0.85), rect.h / (2.5 + nRows * rowK + lift + (total ? 3.4 : 0) + (o.cta ? 3.3 : 0) + (banner && tall ? 2.9 : 0) + 1.4))));
  const bpxFor = p => Math.round(Math.max(size(s, 'min'), p * 0.62));
  // The badge sits inside the feature row when its label still fits; otherwise it straddles the row's top edge.
  const inlineFor = p => !feat?.badge || textW(s, feat.label, p) <= rect.w - p * (narrow ? 0.45 : 0.9) - p * (narrow ? 0.7 : 1.2) - (p * (narrow ? 1.25 : 1.6) + p * 0.5) - (textW(s, feat.badge, bpxFor(p), 'body', 700) + p * 0.6) - p * 0.4;
  let px = pxFor(0);
  const inline = inlineFor(px) || inlineFor(pxFor(1));
  const lift = inline ? 0 : 1;
  px = pxFor(lift);
  const padX = px * (narrow ? 0.45 : 0.9);
  const ins = narrow ? 0.35 : 0.6;
  const rin = narrow ? 0.5 : 0.8;
  const headH = px * 2.5;
  const tk = textKit(s);
  const sep = s.lang === 'en' ? ',' : '.';
  const color = o.color ?? 'accent';

  const bannerH = px * (tall ? 2.2 : 1.8);
  const bannerW = tall ? rect.w - padX * 2 : rect.w * 0.42 - padX;
  const bannerAt = banner ? (banner.at ?? at + 1) : 0;
  const bpx = bpxFor(px);

  const title = tk.make(o.title ?? 'App', rect.x + padX, rect.y + headH / 2, rect.w - padX * 2 - (banner && !tall ? bannerW + padX : 0), { px: px * 1.15, weight: 700, color: 'onPanel', at });

  const rowH = rowK * px;
  const rowTop = rect.y + headH + px * 0.5;
  const toggleW = px * (narrow ? 1.25 : 1.6);
  const R0 = [...rows, ...(feat ? [{ ...feat, feature: true }] : [])].map((r, i) => {
    const rr = { x: rect.x + padX * 0.5, y: rowTop + i * rowH + (r.feature ? px * lift : 0), w: rect.w - padX, h: rowH - px * 0.4 };
    const start = r.feature ? feat.at : at + 0.2 + i * 0.1;
    if (r.feature) { s.reg.add(`${id}.feature`, rr); }
    const hasToggle = r.feature || r.on !== undefined;
    // The badge is left out when it would take more than half the row.
    const badgeFull = r.feature && feat.badge ? textW(s, feat.badge, bpx, 'body', 700) + px * 0.6 : 0;
    const badgeW = badgeFull && badgeFull <= rr.w * 0.5 ? badgeFull : 0;
    const right = hasToggle ? toggleW + px * 0.5 : 0;
    const vstr = String(r.value);
    const valueW = r.value === undefined ? 0 : Math.min(textW(s, vstr, Math.max(size(s, 'min'), Math.round(px * 0.95)), 'mono') + px * 0.5, Math.max(rr.w * 0.32, textW(s, vstr, size(s, 'min'), 'mono') + px * 0.5));
    const label = tk.make(r.label, rr.x + px * ins, rr.y + rr.h / 2, rr.w - px * ins * 2 - right - (inline ? badgeW + px * 0.4 : 0) - valueW, { px, minPx: minTxt, color: 'onPanel', at: start + 0.05 });
    const value = r.value !== undefined ? tk.make(String(r.value), rr.x + rr.w - px * rin - right, rr.y + rr.h / 2, valueW - px * 0.5, { px: px * 0.95, minPx: minTxt, role: 'mono', color: 'dim', align: 'right', at: start + 0.05 }) : null;
    const badge = badgeW ? tk.make(feat.badge, 0, 0, badgeW, { px: bpx, weight: 700, color: 'warn', align: 'center', at: feat.at + 0.5, track: false }) : null;
    const badgeR = badgeW
      ? { x: rr.x + rr.w - px * rin - (inline ? toggleW + px * 0.5 : 0) - badgeW, y: inline ? rr.y + (rr.h - bpx * 1.6) / 2 : rr.y - bpx, w: badgeW, h: bpx * 1.6 }
      : null;
    if (badge) {
      Object.assign(badge, { x: badgeR.x + badgeW / 2, y: badgeR.y + badgeR.h / 2, rect: { x: badgeR.x + (badgeW - badge.w) / 2, y: badgeR.y + badgeR.h / 2 - badge.px * 0.6, w: badge.w, h: badge.px * 1.2 } });
      tk.list.push(badge);
    }
    return { ...r, rr, start, label, value, badge, badgeR, hasToggle };
  });

  const rowsEnd = rowTop + nRows * rowH + px * lift;
  const gapY = px * 0.5;
  const totalH = px * 3;
  const totalR = { x: rect.x + padX * 0.5, y: rowsEnd + gapY, w: rect.w - padX, h: totalH };
  const ctaH = px * 2.5;
  const ctaR = { x: rect.x + padX, y: tall ? rect.y + rect.h - ctaH - px * 0.8 : (total ? totalR.y + totalH : rowsEnd) + gapY, w: rect.w - padX * 2, h: ctaH };
  const bannerR = tall
    ? { x: rect.x + padX, y: (o.cta ? ctaR.y : rect.y + rect.h) - bannerH - px * 0.7, w: bannerW, h: bannerH }
    : { x: rect.x + rect.w - padX - bannerW, y: rect.y + (headH - bannerH) / 2, w: bannerW, h: bannerH };
  if (total) { s.reg.add(`${id}.total`, totalR); }
  if (o.cta) { s.reg.add(`${id}.cta`, ctaR); }

  // total: numbers count up, strings swap
  const totAt = total?.at;
  const totDur = total?.dur ?? 1.2;
  const numeric = total && Number.isFinite(total.from) && Number.isFinite(total.to);
  const totStart = at + 0.7;
  const totY = totalR.y + totalH * 0.55;
  const fmt = v => fmtNum(v, { decimals: total.decimals ?? ([total.from, total.to].every(Number.isInteger) ? 0 : 2), prefix: total.prefix, suffix: total.suffix, sep });
  const valueAt = t => lerp(total.from, total.to, ease.out(prog(t, totAt ?? Infinity, totDur)));
  const totalLabel = total?.label ? tk.make(total.label, totalR.x + px * 0.8, totY, totalR.w * 0.4, { px: px * 1.1, weight: 700, color: 'onPanel', at: totStart }) : null;
  const valueMaxW = totalR.w * 0.5;
  const valueRight = totalR.x + totalR.w - px * 0.8;
  const swap = total && !numeric
    ? [
        total.from !== undefined && tk.make(String(total.from), valueRight, totY, valueMaxW, { px: px * 1.3, role: 'mono', weight: 700, color: 'onPanel', align: 'right', at: totStart, until: totAt }),
        total.to !== undefined && tk.make(String(total.to), valueRight, totY, valueMaxW, { px: px * 1.3, role: 'mono', weight: 700, color: 'good', align: 'right', at: totAt ?? Infinity }),
      ]
    : [];
  const widest = numeric ? [total.from, total.to, (total.from + total.to) / 2].map(fmt).reduce((a, b) => (b.length > a.length ? b : a)) : '';
  const numPx = numeric ? fitPx(s, widest, valueMaxW, px * 1.3, { role: 'mono', weight: 700 }) : 0;
  const liveRect = (str) => {
    const w = textW(s, str, numPx, 'mono', 700);
    return { x: valueRight - w, y: totY - numPx * 0.6, w, h: numPx * 1.2 };
  };

  // cta
  const ctaSpec = o.cta ? tk.make(o.cta, ctaR.x + ctaR.w / 2, ctaR.y + ctaR.h / 2, ctaR.w - px, { px: px * 1.1, weight: 700, color: 'onAccent', align: 'center', at: at + 0.9 }) : null;
  const bannerSpec = banner ? tk.make(banner.text, bannerR.x + bannerR.w / 2, bannerR.y + bannerR.h / 2, bannerR.w - px * 1.2, { px: px * 1.0, weight: 700, color: 'onPanel', align: 'center', at: bannerAt }) : null;

  const vis = t => (t < at ? 0 : fadeOut(o, t));
  const featEnd = feat ? feat.at + 1.3 : 0;
  const end = Math.max(at + 1.3, totAt !== undefined ? totAt + totDur : 0, featEnd, banner ? bannerAt + 0.5 : 0);

  const toggle = (api, x, y, k) => {
    const r = { x: x - toggleW, y: y - px * 0.6, w: toggleW, h: px * 1.2 };
    const on = k > 0.5;
    fillRect(api, r, on ? 'good' : 'dim', on ? 0.35 : 0.2, r.h / 2);
    box(api, r, { kind: 'pill', stroke: on ? 'good' : 'dim', fill: null, lw: 2, glow: on ? 8 : 0 });
    dot(api, lerp(r.x + r.h / 2, r.x + r.w - r.h / 2, ease.inOut(k)), y, r.h * 0.32, on ? 'good' : 'dim');
  };

  return piece(s, { ...o, id }, {
    kind: 'appScreen',
    rect,
    tk,
    vis,
    end,
    marks: { ...(feat && { feature: feat.at }), ...(total && totAt !== undefined && { total: totAt + totDur }) },
    texts: numeric ? [fmt(total.from), fmt(total.to)] : [],
    draw(api, t) {
      const a = ease.out(prog(t, at, 0.5));
      fillRect(api, { x: rect.x, y: rect.y, w: rect.w, h: headH }, color, 0.16 * a, px * 0.4);
      drawT(api, title, { alpha: a });
      for (const r of R0) {
        const st = prog(t, r.start, 0.4);
        if (st <= 0) { continue; }
        const k = r.feature ? ease.back(prog(t, r.start, 0.6)) : ease.out(st);
        const al = clamp(prog(t, r.start, 0.3));
        const f = api.fade(al);
        around(f, r.rr.x + r.rr.w / 2, r.rr.y + r.rr.h / 2, r.feature ? lerp(0.6, 1, k) : 1, () => {
          if (r.feature) { fillRect(f, r.rr, 'good', 0.12, px * 0.5); }
          box(f, r.rr, { stroke: r.feature ? 'good' : 'dim', fill: null, lw: r.feature ? 2.5 : 1.5, glow: r.feature ? 12 : 0, alpha: r.feature ? 1 : 0.7 });
          drawT(f, r.label);
          if (r.value) { drawT(f, r.value); }
          if (r.hasToggle) { toggle(f, r.rr.x + r.rr.w - px * rin, r.rr.y + r.rr.h / 2, r.feature ? prog(t, feat.at + 0.9, 0.35) : (r.on ? 1 : 0)); }
        });
        if (r.badge) {
          const bk = ease.back(prog(t, feat.at + 0.5, 0.45));
          if (bk > 0) {
            around(api, r.badgeR.x + r.badgeR.w / 2, r.badgeR.y + r.badgeR.h / 2, bk, () => {
              box(api, r.badgeR, { kind: 'pill', stroke: 'warn', fill: 'panel', lw: 2 });
              drawT(api, r.badge);
            });
          }
        }
      }
      if (total) {
        const k = ease.out(prog(t, totStart, 0.4));
        line(api, [[totalR.x, totalR.y], [totalR.x + totalR.w, totalR.y]], { color: 'dim', lw: 2, alpha: k * 0.6, glow: 0 });
        if (totalLabel) { drawT(api, totalLabel, { alpha: k }); }
        if (numeric) {
          const done = totAt !== undefined && t >= totAt + totDur;
          const bump = 1 + 0.07 * Math.sin(Math.PI * prog(t, totAt + totDur, 0.4));
          around(api, valueRight - textW(s, fmt(valueAt(t)), numPx, 'mono', 700) / 2, totY, bump, () => text(api, fmt(valueAt(t)), valueRight, totY, { px: numPx, role: 'mono', weight: 700, color: done ? 'good' : 'onPanel', align: 'right', alpha: k }));
        }
        else {
          const sw = totAt === undefined ? 0 : ease.inOut(prog(t, totAt, 0.5));
          if (swap[0]) { drawT(api, swap[0], { alpha: k * (1 - sw), dy: -sw * px * 1.2 }); }
          if (swap[1] && sw > 0) { drawT(api, swap[1], { alpha: sw, dy: (1 - sw) * px * 1.2 }); }
        }
      }
      if (ctaSpec) {
        const k = ease.back(prog(t, at + 0.9, 0.4));
        if (k > 0) {
          around(api, ctaR.x + ctaR.w / 2, ctaR.y + ctaR.h / 2, k, () => {
            box(api, ctaR, { kind: 'pill', stroke: 'accent', fill: 'accent', lw: 2 });
            drawT(api, ctaSpec);
          });
        }
      }
      if (bannerSpec) {
        const k = ease.back(prog(t, bannerAt, 0.5));
        if (k > 0) {
          const bc = banner.color ?? 'good';
          const dy = (1 - k) * px * (tall ? 4 : -4);
          const f = api.fade(clamp(k));
          fillRect(f, { ...bannerR, y: bannerR.y + dy }, bc, 0.22, bannerH / 2);
          box(f, { ...bannerR, y: bannerR.y + dy }, { kind: 'pill', stroke: bc, fill: null, lw: 2 });
          drawT(f, bannerSpec, { dy });
        }
      }
    },
    qa(_api, t) {
      const texts = tk.qa(t);
      if (numeric && t >= totStart) {
        const str = fmt(valueAt(t));
        const r = liveRect(str);
        texts.push({ text: str, rect: r, overflow: r.w > valueMaxW + 1, px: numPx });
      }
      return { rect, alpha: vis(t), container: true, host: o.in, texts };
    },
  });
}

// ---- pull request page --------------------------------------------------------------------------------------------

/**
 * Pull request page. o: id, rect | in, at, title, number, from, to (branch names), author, stats { add, del }, labels,
 * checks [{ name, start, end, ok }], reviewers [{ name, initials, approveAt }], button (text of a call to action: the
 * page starts as a draft and `openAt` is the click that opens it and brings in the checks), mergeAt (the merge click:
 * the badge flips to merged). The merge button unlocks when every check passed and every reviewer approved. Registers
 * `<id>.badge` (alias `.status`), `.checks`, `.reviewers`, `.merge` (alias `.button`, the same spot). Exposes end and
 * marks { open, ready, merge }.
 */
export function prPage(s, o) {
  const id = o.id ?? s.uid('pr');
  const rect = resolveRect(s, { ...o, id }, 'prPage');
  const at = o.at ?? 0;
  const lb = labelsOf(s, o);
  const checks = o.checks ?? [];
  const reviewers = o.reviewers ?? [];
  const hasButton = Boolean(o.button);
  const openAt = hasButton ? (o.openAt ?? at + 1.8) : (o.openAt ?? at);
  const mergeAt = o.mergeAt ?? Infinity;
  const base = hasButton ? openAt : at;
  const tOpen = hasButton ? openAt + 0.2 : at;
  const tMerged = mergeAt + 0.45;
  const allOk = checks.every(c => c.ok !== false);
  const ready = allOk ? Math.max(0, ...checks.map(c => c.end ?? Infinity), ...reviewers.map(r => r.approveAt ?? Infinity)) : Infinity;

  // text size: as large as the height allows
  const rowChk = 2.0;
  const rowRev = 2.5;
  const needL = 1.9 + checks.length * rowChk + 0.3 + 0.5 + 2.4;
  const needR = 1.9 + reviewers.length * rowRev + 0.3;
  const need = 1.3 + 1.9 + 0.35 + 2.0 + 0.8 + Math.max(needL, needR);
  const px = Math.round(Math.max(size(s, 'min'), Math.min(uiPx(s, 0.78), rect.h / need)));
  const pad = px * 0.85;
  const x0 = rect.x + pad;
  const W = rect.w - pad * 2;
  const tk = textKit(s);

  // header: title and number, then state badge, "wants to merge" and the two branch chips
  const titlePx = px * 1.4;
  const y1 = rect.y + pad * 0.8 + titlePx * 0.65;
  const title = tk.make(o.title ?? 'Pull request', x0, y1, W * 0.8, { px: titlePx, weight: 700, color: 'onPanel', at });
  const num = tk.make(`#${o.number ?? 128}`, title.x + title.w + px * 0.5, y1, Math.max(px * 3, W - title.w - px), { px: titlePx * 0.9, color: 'dim', at });
  const bh = px * 2;
  const y2 = rect.y + pad * 0.8 + titlePx * 1.3 + px * 0.35 + bh / 2;
  const bpx = Math.round(px * 0.95);
  const stateLabels = [hasButton && lb.draft, lb.open, lb.merged].filter(Boolean);
  const badge = { x: x0, y: y2 - bh / 2, w: Math.max(...stateLabels.map(l => textW(s, l, bpx, 'body', 700))) + px * 2.3, h: bh };
  const tone = { draft: 'dim', open: 'good', merged: 'accent2' };
  const stateSpec = (label, name, from, until) => tk.make(label, badge.x + badge.w / 2 + px * 0.5, y2, badge.w - px * 2.2, { px: bpx, weight: 700, align: 'center', color: tone[name], at: from, until });
  const states = [
    ...(hasButton ? [stateSpec(lb.draft, 'draft', at, tOpen)] : []),
    stateSpec(lb.open, 'open', tOpen, tMerged),
    stateSpec(lb.merged, 'merged', tMerged, undefined),
  ];
  const fromStr = o.from ?? 'feature';
  const toStr = o.to ?? 'main';
  const chipW = str => textW(s, str, bpx, 'mono') + px * 1.4;
  const fromR = { x: 0, y: y2 - bh * 0.42, w: chipW(fromStr), h: bh * 0.84 };
  const toR = { ...fromR, w: chipW(toStr) };
  const wantsW = textW(s, lb.wants, bpx);
  const rowW = wants => badge.w + px * 0.6 + (wants ? wantsW + px * 0.6 : 0) + fromR.w + px * 2.6 + toR.w;
  const showWants = rowW(true) <= W;
  let cx = badge.x + badge.w + px * 0.6;
  const wants = showWants ? tk.make(lb.wants, cx, y2, wantsW + 2, { px: bpx, color: 'dim', at: at + 0.35 }) : null;
  if (showWants) { cx += wantsW + px * 0.6; }
  fromR.x = cx;
  toR.x = fromR.x + fromR.w + px * 2.6;
  const fromT = tk.make(fromStr, fromR.x + fromR.w / 2, y2, fromR.w - px, { px: bpx, role: 'mono', align: 'center', color: 'accent', at: at + 0.35 });
  const toT = tk.make(toStr, toR.x + toR.w / 2, y2, toR.w - px, { px: bpx, role: 'mono', align: 'center', color: 'onPanel', at: at + 0.35 });
  const authorSpec = o.author && toR.x + toR.w + px * 1.2 + textW(s, o.author, bpx) < rect.x + rect.w - pad
    ? tk.make(o.author, rect.x + rect.w - pad, y2, W * 0.25, { px: bpx, color: 'dim', align: 'right', at: at + 0.45 })
    : null;

  // columns
  const top = rect.y + pad * 0.8 + titlePx * 1.3 + px * 0.35 + bh + px * 0.8;
  const bottom = rect.y + rect.h - pad * 0.8;
  const lw = W * 0.6;
  const gap = px * 1.1;
  const rx = x0 + lw + gap;
  const rw = W - lw - gap;
  const btnH = px * 2.4;
  const merge = { x: x0, y: bottom - btnH, w: lw, h: btnH };
  const chkAvail = merge.y - px * 0.5 - top;
  const chkRow = Math.min(px * rowChk, Math.max(px * 1.5, (chkAvail - px * 2.2) / Math.max(checks.length, 1)));
  const chk = { x: x0, y: top, w: lw, h: px * 1.9 + chkRow * checks.length + px * 0.3 };
  const rev = { x: rx, y: top, w: rw, h: px * 1.9 + px * rowRev * reviewers.length + px * 0.3 };
  const stAvail = bottom - (rev.y + rev.h + px * 0.5);
  const st = { x: rx, y: rev.y + rev.h + px * 0.5, w: rw, h: Math.min(stAvail, px * 4.6) };
  const showStats = Boolean(o.stats) && stAvail >= px * 4.6;
  s.reg.add(`${id}.badge`, badge);
  s.reg.add(`${id}.status`, badge);
  s.reg.add(`${id}.checks`, chk);
  s.reg.add(`${id}.reviewers`, rev);
  s.reg.add(`${id}.merge`, merge);
  s.reg.add(`${id}.button`, merge);

  // staging: the checks side waits for the click when there is a button
  const sA = i => at + 0.15 + i * 0.12;
  const sB = i => base + 0.15 + i * 0.12;
  const mergeShow = sB(6);
  const chkTitle = tk.make(lb.checks, chk.x + px * 0.9, chk.y + px * 0.95, chk.w - px * 1.8, { px: px * 0.9, weight: 700, color: 'dim', at: sB(3) });
  const chkT = checks.map((c, i) => tk.make(c.name, chk.x + px * 2.9, chk.y + px * 1.9 + chkRow * (i + 0.5), chk.w - px * 2.9 - px * 3.8, { px, role: 'mono', color: 'onPanel', at: sB(4 + i * 0.5) }));
  const btnSpec = hasButton ? tk.make(o.button, merge.x + merge.w / 2, merge.y + btnH / 2, merge.w - px * 1.5, { px: px * 1.1, weight: 700, align: 'center', color: 'onAccent', at: at + 1.1, until: openAt + 0.4 }) : null;
  const okSpec = tk.make(lb.merge, merge.x + merge.w / 2, merge.y + btnH / 2, merge.w - px * 1.5, { px: px * 1.1, weight: 700, align: 'center', color: 'good', at: Math.max(ready, mergeShow) });
  const noSpec = ready > mergeShow ? tk.make(lb.blocked, merge.x + merge.w / 2, merge.y + btnH / 2, merge.w - px * 1.5, { px, align: 'center', color: 'dim', at: mergeShow, until: ready }) : null;
  const revTitle = tk.make(lb.reviewers, rev.x + px * 0.9, rev.y + px * 0.95, rev.w - px * 1.8, { px: px * 0.9, weight: 700, color: 'dim', at: sA(4) });
  const av = px * 1.0;
  const revRow = px * rowRev;
  const revT = reviewers.map((r, i) => {
    const cy = rev.y + px * 1.9 + revRow * (i + 0.5);
    const initials = r.initials ?? r.name.slice(0, 2).toUpperCase();
    return {
      cy,
      init: tk.make(initials, rev.x + px * 0.9 + av, cy + 1, av * 1.7, { px: av * 0.85, weight: 700, align: 'center', color: 'accent2', at: sA(5 + i * 0.5) }),
      name: tk.make(r.name, rev.x + px * 0.9 + av * 2 + px * 0.7, cy, rev.w - px * 0.9 - av * 2 - px * 0.7 - px * 2.8, { px, color: 'onPanel', at: sA(5 + i * 0.5) }),
    };
  });
  const stTitle = showStats ? tk.make(lb.changes, st.x + px * 0.9, st.y + px * 0.95, st.w - px * 1.8, { px: px * 0.9, weight: 700, color: 'dim', at: sA(5) }) : null;
  const stAdd = showStats ? tk.make(`+${o.stats.add}`, st.x + px * 0.9, st.y + px * 2.5, st.w * 0.45, { px: px * 1.05, role: 'mono', color: 'good', at: sA(5) }) : null;
  const stDel = showStats ? tk.make(`-${o.stats.del}`, st.x + st.w - px * 0.9, st.y + px * 2.5, st.w * 0.45, { px: px * 1.05, role: 'mono', color: 'bad', align: 'right', at: sA(5) }) : null;

  const vis = t => (t < at ? 0 : fadeOut(o, t));
  const end = Math.max(at + 1.5, ready < Infinity ? ready + 0.5 : 0, mergeAt < Infinity ? mergeAt + 0.8 : 0, hasButton ? openAt + 1.2 : 0);
  const chkOn = t => t >= sB(3);

  return piece(s, { ...o, id }, {
    kind: 'prPage',
    rect,
    tk,
    vis,
    end,
    marks: { ...(hasButton && { open: openAt }), ...(ready < Infinity && { ready }), ...(mergeAt < Infinity && { merge: mergeAt }) },
    parts: t => [
      { id: 'badge', rect: badge, solid: true },
      { id: 'status', rect: badge },
      ...(chkOn(t) ? [{ id: 'checks', rect: chk, solid: true }] : []),
      ...(t >= sA(4) ? [{ id: 'reviewers', rect: rev, solid: true }] : []),
      ...(hasButton && t < openAt + 0.4 ? [{ id: 'button', rect: merge, solid: true }] : []),
      ...(t >= mergeShow ? [{ id: 'merge', rect: merge, solid: true }] : []),
    ],
    draw(api, t) {
      const stA = i => ease.out(prog(t, sA(i), 0.45));
      const stB = i => ease.out(prog(t, sB(i), 0.45));
      const stg0 = stA(0);
      drawT(api, title, { alpha: stg0, dx: (1 - stg0) * -px });
      drawT(api, num, { alpha: stg0 });
      // state badge: squashes and flips at the click (draft to open) and at the merge (open to merged)
      const flip = k => prog(t, k, 0.4);
      const sq = [hasButton ? flip(openAt) : 0, flip(mergeAt + 0.25)].reduce((m, f) => (f > 0 && f < 1 ? Math.abs(1 - f * 2) : m), 1);
      const name = t >= tMerged ? 'merged' : t >= tOpen ? 'open' : 'draft';
      const bc = tone[name];
      const a1 = stA(1);
      around(api, badge.x + badge.w / 2, badge.y + badge.h / 2, { sy: Math.max(0.02, sq) }, () => {
        fillRect(api, badge, bc, 0.16 * a1, bh / 2);
        box(api, badge, { kind: 'pill', stroke: bc, fill: null, lw: 2.5, alpha: a1 });
        dot(api, badge.x + px * 0.95, badge.y + badge.h / 2, px * 0.3, bc, { alpha: a1 });
        for (const sp of states) {
          if (t >= sp.at && (sp.until === undefined || t < sp.until)) { drawT(api, sp, { alpha: a1 }); }
        }
      });
      const a2 = stA(2);
      if (wants) { drawT(api, wants, { alpha: a2 }); }
      for (const [r, sp, c] of [[fromR, fromT, 'accent'], [toR, toT, 'ink']]) {
        fillRect(api, r, c, 0.1 * a2, px * 0.4);
        box(api, r, { stroke: c, fill: null, lw: 1.5, glow: 0, alpha: a2 * 0.8 });
        drawT(api, sp, { alpha: a2 });
      }
      line(api, [[fromR.x + fromR.w + px * 0.4, y2], [toR.x - px * 0.5, y2]], { p: stA(3), color: 'dim', lw: 2.5, head: true, glow: 0 });
      if (authorSpec) { drawT(api, authorSpec, { alpha: stA(3) }); }
      // draft: the description is still a placeholder, the call to action waits for the click
      if (hasButton) {
        const hold = 1 - ease.out(prog(t, openAt + 0.1, 0.4));
        skeleton(api.fade(hold), { x: chk.x, y: chk.y + px * 0.2, w: chk.w * 0.9, h: px * 4.2 }, 3, prog(t, at + 0.5, 0.7), { h: px * 0.6 });
      }
      // checks card
      if (chkOn(t)) {
        box(api, chk, { p: stB(3), stroke: 'dim', fill: null, lw: 1.5, glow: 0, alpha: 0.9 });
        drawT(api, chkTitle, { alpha: stB(3) });
        checks.forEach((c, i) => {
          const k = stB(4 + i * 0.5);
          const f = api.fade(k);
          const cy = chkT[i].y;
          const cxx = chk.x + px * 1.4;
          const r = px * 0.5;
          if (t < (c.start ?? 0)) { ring(f, cxx, cy, r, { color: 'dim', lw: 2, alpha: 0.7, glow: 0 }); }
          else if (t < (c.end ?? Infinity)) { spinner(f, cxx, cy, r, t, 'warn', 3); }
          else if (c.ok === false) { cross(f, cxx, cy, px * 1.3, prog(t, c.end, 0.3), 'bad', 3.5); }
          else { tick(f, cxx, cy, px * 1.2, prog(t, c.end, 0.3), 'good', 3.5); }
          drawT(api, chkT[i], { alpha: k });
          if (t >= (c.start ?? 0)) {
            const bw = px * 3.2;
            const bx = chk.x + chk.w - bw - px * 0.9;
            const dur = Number.isFinite(c.end) ? c.end - (c.start ?? 0) : 1e9;
            fillRect(f, { x: bx, y: cy - px * 0.2, w: bw, h: px * 0.4 }, 'dim', 0.25, px * 0.2);
            fillRect(f, { x: bx, y: cy - px * 0.2, w: bw * prog(t, c.start ?? 0, dur), h: px * 0.4 }, t >= (c.end ?? Infinity) ? (c.ok === false ? 'bad' : 'good') : 'warn', 1, px * 0.2);
          }
        });
      }
      // reviewers card
      box(api, rev, { p: stA(4), stroke: 'dim', fill: null, lw: 1.5, glow: 0, alpha: 0.9 });
      drawT(api, revTitle, { alpha: stA(4) });
      reviewers.forEach((r, i) => {
        const k = stA(5 + i * 0.5);
        const f = api.fade(k);
        const ok = t >= (r.approveAt ?? Infinity);
        ring(f, rev.x + px * 0.9 + av, revT[i].cy, av, { color: ok ? 'good' : 'accent2', lw: 2.5, glow: 6 });
        drawT(api, revT[i].init, { alpha: k, color: ok ? 'good' : 'accent2' });
        drawT(api, revT[i].name, { alpha: k });
        if (ok) { tick(f, rev.x + rev.w - px * 1.4, revT[i].cy, px * 1.3, prog(t, r.approveAt, 0.35), 'good', 3.5); }
        else { dot(f, rev.x + rev.w - px * 1.4, revT[i].cy, px * 0.3, 'warn', { alpha: 0.5 + 0.5 * Math.sin(t * 5) }); }
      });
      // diff stats
      if (showStats) {
        const k = stA(5);
        box(api, st, { p: k, stroke: 'dim', fill: null, lw: 1.5, glow: 0, alpha: 0.9 });
        drawT(api, stTitle, { alpha: k });
        const g = ease.out(prog(t, at + 1.2, 0.9));
        const tot = (o.stats.add + o.stats.del) || 1;
        const sf = api.fade(k);
        text(sf, `+${Math.round(o.stats.add * g)}`, stAdd.x, stAdd.y, { px: stAdd.px, role: 'mono', color: 'good', align: 'left' });
        text(sf, `-${Math.round(o.stats.del * g)}`, stDel.x, stDel.y, { px: stDel.px, role: 'mono', color: 'bad', align: 'right' });
        const by = st.y + px * 3.5;
        const bw = st.w - px * 1.8;
        fillRect(sf, { x: st.x + px * 0.9, y: by, w: Math.max(0, bw * (o.stats.add / tot) * g - 3), h: px * 0.45 }, 'good', 1, px * 0.2);
        fillRect(sf, { x: st.x + px * 0.9 + bw * (o.stats.add / tot), y: by, w: bw * (o.stats.del / tot) * g, h: px * 0.45 }, 'bad', 1, px * 0.2);
      }
      // the call to action, then the merge button in the same spot
      if (hasButton && btnSpec) {
        const bp = ease.back(prog(t, at + 1.1, 0.45));
        const gone = ease.in(prog(t, openAt + 0.1, 0.3));
        if (bp > 0 && gone < 1) {
          const press = prog(t, openAt - 0.12, 0.12) * (1 - prog(t, openAt, 0.2));
          const f = api.fade(1 - gone);
          around(f, merge.x + merge.w / 2, merge.y + merge.h / 2, bp * (1 - press * 0.08), () => {
            box(f, merge, { stroke: 'accent', fill: 'accent', lw: 3 });
            drawT(f, btnSpec);
          });
        }
      }
      const k = stB(6);
      if (k > 0) {
        const can = t >= ready;
        const un = ease.out(prog(t, ready, 0.5));
        const press = t >= mergeAt ? 1 - 0.05 * Math.sin(Math.PI * prog(t, mergeAt, 0.3)) : 1;
        const done = t >= mergeAt + 0.3;
        const f = api.fade(k);
        around(f, merge.x + merge.w / 2, merge.y + merge.h / 2, press, () => {
          if (can) {
            fillRect(f, merge, done ? 'accent2' : 'good', (done ? 0.3 : 0.14 + 0.08 * Math.sin(t * 4)) * un, px * 0.6);
            box(f, merge, { stroke: done ? 'accent2' : 'good', fill: null, lw: 3 });
            drawT(f, okSpec, { color: done ? 'accent2' : 'good' });
          }
          else {
            box(f, merge, { stroke: 'dim', fill: null, lw: 2, glow: 0, dash: [10, 8], alpha: 0.8 });
            if (noSpec) { drawT(f, noSpec); }
          }
        });
      }
    },
  });
}

// ---- cursor -------------------------------------------------------------------------------------------------------

const POINTER = [[0, 0], [0, 22], [5.5, 17], [9.5, 26], [13, 24.5], [9, 15.5], [16, 15.5]];

/**
 * Mouse pointer drawn through the style. o: path [[t, x, y] | [t, 'id' | { id, anchor }]] (keyframes, eased between
 * them), clicks [t] (ripple and press), color, until, z. Exposes pos(t) and end.
 */
export function cursor(s, o) {
  const keys = (o.path ?? []).map(e => (typeof e[1] === 'number' ? e : [e[0], ...pointOf(s, e[1], e[2])]));
  if (!keys.length) { throw new Error('cursor needs a path: [[t, x, y], ...]'); }
  const clicks = o.clicks ?? [];
  const pos = (t) => {
    if (t <= keys[0][0]) { return [keys[0][1], keys[0][2]]; }
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const k = ease.inOut(prog(t, keys[i - 1][0], keys[i][0] - keys[i - 1][0]));
        return [lerp(keys[i - 1][1], keys[i][1], k), lerp(keys[i - 1][2], keys[i][2], k)];
      }
    }
    const last = keys[keys.length - 1];
    return [last[1], last[2]];
  };
  const k = size(s, 'label', 0.85) / 26;
  const vis = t => prog(t, keys[0][0], 0.25) * fadeOut(o, t, 0.3);
  return piece(s, o, {
    kind: 'cursor',
    z: 8,
    vis,
    end: Math.max(keys[keys.length - 1][0], ...clicks.map(c => c + 0.6)),
    marks: clicks.length ? { click: clicks[0] } : undefined,
    extra: { pos, clicks },
    draw(api, t) {
      const [x, y] = pos(t);
      let press = 1;
      for (const c of clicks) {
        const q = prog(t, c, 0.6);
        if (q > 0 && q < 1) {
          ring(api, x, y, (10 + q * 46) * k, { color: o.color ?? 'accent', lw: 3, alpha: 1 - q });
          ring(api, x, y, (6 + q * 24) * k, { color: 'ink', lw: 2, alpha: (1 - q) * 0.7, glow: 0 });
          press = 1 - 0.2 * Math.sin(Math.PI * clamp(q * 2.5));
        }
      }
      around(api, x, y, press, () => poly(api, POINTER.map(q => [x + q[0] * k, y + q[1] * k]), { closed: true, stroke: 'bg', fill: 'ink', fillAlpha: 1, lw: 1.5 + k * 0.5, glow: 0 }));
    },
  });
}

export const pieces = { browser, phone, appScreen, prPage, cursor };
