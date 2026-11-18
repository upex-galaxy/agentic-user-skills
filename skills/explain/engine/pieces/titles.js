// Title family: titleCard (big title + subtitle written on), caption (bottom bar that types in),
// sectionTag (top-left "02 / 09 Name" marker) and sourceFooter ("Fuente: ..." line, optional on every scene).
// Each factory is (s, opts) => item. Text always goes through fitText; colors are style tokens.
import { bands } from '../bands.js';
import { clamp, ease, hash, prog } from '../math.js';
import { fitText, measure } from '../text.js';
import { blockBox, drawTextBlock, label } from './base.js';

const register = (s, id, rect) => (s.reg.has(id) ? s.reg.get(id) : s.reg.add(id, rect));
const typeDur = (text, o, per = 0.045) => o.typeDur ?? Math.max(0.5, String(text).length * per);
const centered = (area, w, h) => {
  const ww = Math.min(w, area.w);
  const hh = Math.min(h, area.h);
  return { x: area.x + (area.w - ww) / 2, y: area.y + (area.h - hh) / 2, w: ww, h: hh };
};

function fitIn(s, text, rect, o = {}) {
  const d = s.style.defaults;
  return fitText(s.ctx, text, rect, {
    fontFor: px => s.style.font(o.font ?? 'body', px, o.weight),
    maxPx: o.px ?? d.labelPx,
    minPx: o.minPx ?? d.minPx,
    pad: o.pad ?? 0,
    lineHeight: o.lineHeight ?? 1.2,
  });
}

/**
 * Big title with a subtitle, written on. opts: id, title, subtitle, rect | w/h (default centered in the scene area),
 * at, dur, px, subPx, color, subColor, typeDur.
 */
export function titleCard(s, o) {
  const id = o.id ?? s.uid('title');
  const area = o.rect ?? centered(s.area, o.w ?? 1500, o.h ?? 460);
  const rect = register(s, id, area);
  const title = o.title ?? o.text ?? '';
  const sub = o.subtitle ?? '';
  const at = o.at ?? 0;
  const titleH = sub ? rect.h * 0.56 : rect.h;
  const titleRect = { x: rect.x, y: rect.y, w: rect.w, h: titleH };
  const subRect = { x: rect.x, y: rect.y + rect.h * 0.68, w: rect.w, h: rect.h * 0.32 };
  const tFit = fitIn(s, title, titleRect, { font: 'display', px: o.px ?? 120, minPx: 40 });
  const sFit = sub ? fitIn(s, sub, subRect, { px: o.subPx ?? s.style.defaults.labelPx * 1.1 }) : null;
  const titleAt = at + 0.15;
  const titleDur = typeDur(title, o, 0.05);
  const ruleAt = titleAt + titleDur;
  const subAt = ruleAt + 0.3;
  const subDur = sub ? typeDur(sub, o, 0.035) : 0;
  const ruleW = Math.min(rect.w * 0.3, 360);
  const ruleY = rect.y + rect.h * 0.62;
  const seed = hash(id);
  return {
    kind: 'title',
    id,
    z: o.z ?? 1,
    rect,
    texts: () => (sub ? [title, sub] : [title]),
    draw(api, t) {
      const tp = prog(t, titleAt, titleDur);
      if (tp > 0) { drawTextBlock(api, tFit, titleRect, { role: 'display', color: o.color ?? 'ink', p: tp }); }
      if (sub) {
        const rp = ease.inOut(prog(t, ruleAt, 0.5));
        if (rp > 0) { api.style.line(api, [[rect.x + rect.w / 2 - ruleW / 2, ruleY], [rect.x + rect.w / 2 + ruleW / 2, ruleY]], { p: rp, color: 'accent', lw: 5, seed }); }
        const sp = prog(t, subAt, subDur);
        if (sp > 0) { drawTextBlock(api, sFit, subRect, { color: o.subColor ?? 'dim', p: sp }); }
      }
    },
    qa: (api, t) => ({
      rect,
      alpha: prog(t, titleAt, titleDur) > 0 ? 1 : 0,
      texts: [
        { text: title, rect: blockBox(tFit, titleRect), overflow: tFit.overflow, px: tFit.px },
        ...(sFit ? [{ text: sub, rect: blockBox(sFit, subRect), overflow: sFit.overflow, px: sFit.px }] : []),
      ],
    }),
  };
}

/**
 * Bottom caption bar that types in. opts: id, text, rect (default: above the footer line), at, until (fades out),
 * px, color, typeDur. Several captions in one scene should not share the same time window.
 */
export function caption(s, o) {
  const id = o.id ?? s.uid('caption');
  const rect = register(s, id, o.rect ?? { x: 160, y: s.H - 190, w: s.W - 320, h: 96 });
  const text = o.text ?? '';
  const at = o.at ?? 0;
  const fit = fitIn(s, text, rect, { px: o.px ?? s.style.defaults.labelPx * 0.9, pad: s.style.defaults.pad });
  const td = typeDur(text, o, 0.035);
  const typeAt = at + 0.35;
  const barP = t => ease.out(prog(t, at, 0.35));
  const out = t => (o.until === undefined ? 1 : 1 - ease.inOut(prog(t, o.until, 0.4)));
  return {
    kind: 'caption',
    id,
    hud: true,
    z: o.z ?? 5,
    rect,
    end: typeAt + td,
    texts: () => [text],
    draw(api, t) {
      const a = out(t);
      const bp = barP(t);
      if (bp <= 0 || a <= 0) { return; }
      api.style.shape(api, rect, { kind: 'round', p: bp, stroke: o.color ?? 'dim', fill: 'panel', lw: 2.5, alpha: a, seed: hash(id) });
      drawTextBlock(api, fit, rect, { color: o.textColor ?? 'ink', p: prog(t, typeAt, td), alpha: a });
    },
    qa: (api, t) => ({ rect, alpha: barP(t) * out(t), texts: [{ text, rect: blockBox(fit, rect), overflow: fit.overflow, px: fit.px }] }),
  };
}

/**
 * Scene heading in the band above the content area, typed in. HUD: the camera never moves it.
 * opts: id (default "heading"), text, rect, at (0.2), px (the larger of 76 and 1.55x the style's label size), color, type (true), typeDur.
 */
export function heading(s, o) {
  const text = o.text ?? o.title ?? '';
  const item = label(s, { id: o.id ?? 'heading', text, rect: o.rect ?? bands(s.W, s.H).heading, px: o.px ?? Math.max(76, s.style.defaults.labelPx * 1.55), font: 'display', type: o.type ?? true, typeDur: o.typeDur, at: o.at ?? 0.2, color: o.color });
  return { ...item, kind: 'heading', hud: true, zoomFade: true, z: o.z ?? 4 };
}

const pad2 = n => String(n).padStart(2, '0');

/** Section marker "02 / 09 Name" pinned top-left. opts: id, index, total, name (or text), at, x, y, px, color. */
export function sectionTag(s, o) {
  const id = o.id ?? s.uid('section');
  const num = o.text ? '' : `${pad2(o.index ?? 1)} / ${pad2(o.total ?? 1)}`;
  const name = o.text ?? o.name ?? '';
  const full = num ? `${num} ${name}`.trim() : name;
  const px0 = o.px ?? s.style.defaults.labelPx * 0.66;
  const fit = fitIn(s, full, { w: 900, h: px0 * 2 }, { px: px0, weight: 600 });
  const font = s.style.font('body', fit.px, 600);
  const numW = num ? measure(s.ctx, num, font) : 0;
  const gap = num ? fit.px * 0.7 : 0;
  const nameW = measure(s.ctx, name, font);
  const padX = 26;
  const h = fit.px * 1.2 + 24;
  const w = numW + gap + nameW + padX * 2;
  const rect = register(s, id, { x: o.x ?? 64, y: o.y ?? 48, w, h });
  const at = o.at ?? 0;
  const p = t => ease.out(prog(t, at, 0.5));
  const lineH = fit.px * 1.2;
  return {
    kind: 'tag',
    id,
    hud: true,
    z: o.z ?? 4,
    rect,
    texts: () => [full],
    draw(api, t) {
      const k = p(t);
      if (k <= 0) { return; }
      api.style.shape(api, rect, { kind: 'pill', p: k, stroke: 'dim', fill: 'panel', lw: 2, seed: hash(id) });
      const y = rect.y + rect.h / 2;
      const alpha = clamp((k - 0.4) / 0.6);
      if (num) { api.style.text(api, num, rect.x + padX, y, { px: fit.px, weight: 700, color: o.color ?? 'accent', alpha }); }
      api.style.text(api, name, rect.x + padX + numW + gap, y, { px: fit.px, weight: 600, color: 'ink', alpha });
    },
    qa: (api, t) => ({ rect, alpha: p(t), texts: [{ text: full, rect: { x: rect.x + padX, y: rect.y + (h - lineH) / 2, w: numW + gap + nameW, h: lineH }, overflow: fit.overflow, px: fit.px }] }),
  };
}

const SPANISH = /\b(?:el|la|los|las|de|del|que|en|un|una|con|para|por|se|es|como|cómo|qué|y)\b/gi;
const ENGLISH = /\b(?:the|of|and|to|in|is|a|an|with|for|how|what|that|it|are)\b/gi;

/** 'es' when the texts read as Spanish (accents, inverted marks or more Spanish than English function words), else 'en'. */
export function detectLang(texts) {
  const all = texts.filter(Boolean).join(' ');
  if (/[áéíóúñü¿¡]/i.test(all)) { return 'es'; }
  return (all.match(SPANISH) ?? []).length > (all.match(ENGLISH) ?? []).length ? 'es' : 'en';
}

/**
 * Source line pinned bottom-left, small and dim. opts: id, text, rect, at, dur, px, lang, prefix. The prefix is
 * "Fuente: " for Spanish and "Source: " otherwise; the language is `lang` here, else `lang` on the video spec,
 * else detected from the video title and the texts already in the scene.
 */
export function sourceFooter(s, o) {
  const id = o.id ?? s.uid('source');
  const rect = register(s, id, o.rect ?? { x: 80, y: s.H - 78, w: s.W - 160, h: 44 });
  const raw = o.text ?? '';
  const lang = o.lang ?? s.lang ?? detectLang([s.title, raw, ...s.items.flatMap(it => it.texts?.() ?? [])]);
  const prefix = o.prefix ?? (lang === 'es' ? 'Fuente: ' : 'Source: ');
  const text = /^(?:fuente|source)\b/i.test(raw) ? raw : `${prefix}${raw}`;
  const at = o.at ?? 0;
  const dur = o.dur ?? 0.6;
  const fit = fitIn(s, text, rect, { px: o.px ?? s.style.defaults.labelPx * 0.5, minPx: 14 });
  const a = t => ease.out(prog(t, at, dur));
  return {
    kind: 'source',
    id,
    hud: true,
    z: o.z ?? 1,
    rect,
    texts: () => [text],
    draw(api, t) {
      const k = a(t);
      if (k > 0) { drawTextBlock(api, fit, rect, { align: 'left', color: 'dim', alpha: k }); }
    },
    qa: (api, t) => ({ rect, alpha: a(t), texts: [{ text, rect: blockBox(fit, rect, 'left'), overflow: fit.overflow, px: fit.px }] }),
  };
}

export const pieces = { titleCard, heading, caption, sectionTag, sourceFooter };
