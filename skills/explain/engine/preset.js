// Preset contract. A preset is the LOOK of a video: palette, fonts, stroke and fill renderers, textures, transition
// flavor. Motion, layout and pieces never depend on it, so one scene file renders in every preset.
//
// A preset file is `export default ({ math, rough }) => ({ ... })`: a factory with no imports, so a user preset in
// ~/.explain/presets/<name>/preset.js works without the skill's sources. definePreset() resolves it, fills defaults,
// builds color() and font(), installs fallbacks for the optional renderers and validates the result, listing every
// missing member in one error.
import * as math from './math.js';

export const REQUIRED_PALETTE = ['bg', 'ink', 'dim', 'accent', 'accent2', 'good', 'warn', 'bad', 'panel'];
export const REQUIRED_RENDERERS = ['background', 'shape', 'line', 'poly', 'text', 'highlight'];
export const SYNTAX_TOKENS = ['comment', 'string', 'keyword', 'number', 'type', 'fn', 'plain'];

const DEFAULTS = { nodePx: 34, labelPx: 34, codePx: 28, minPx: 18, lw: 3, pad: 18, radius: 18, fillAlpha: 1 };
const DEFAULT_STACKS = { body: 'sans-serif', display: 'sans-serif', mono: 'monospace' };
const DEFAULT_WEIGHTS = { body: 500, display: 700, mono: 500 };
const DEFAULT_BITRATE = 2e6;

// ---- color math (contrast warnings) --------------------------------------------------------------------------------

/** Parse #rgb, #rrggbb, rgb() or rgba() into [r, g, b, a] (0..255, alpha 0..1); null for anything else. */
export function parseColor(c) {
  if (typeof c !== 'string') { return null; }
  let m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) { return [...m[1]].map(h => Number.parseInt(h + h, 16)).concat(1); }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c);
  if (m) {
    const n = Number.parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, m[2] ? Number.parseInt(m[2], 16) / 255 : 1];
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(c.trim());
  if (m) {
    const v = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (v.length >= 3 && v.slice(0, 3).every(Number.isFinite)) { return [v[0], v[1], v[2], Number.isFinite(v[3]) ? v[3] : 1]; }
  }
  return null;
}

/** Composite a (possibly translucent) color over an opaque one. */
const over = (top, under) => [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);

const lum = (c) => {
  const ch = c.slice(0, 3).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};

/** WCAG contrast ratio of two colors (the second is the surface); null when either cannot be parsed. */
export function contrast(fg, bg, base) {
  const f = parseColor(fg);
  let b = parseColor(bg);
  if (!f || !b) { return null; }
  if (b[3] < 1) {
    const under = parseColor(base);
    if (!under) { return null; }
    b = over(b, under);
  }
  const fo = f[3] < 1 ? over(f, b) : f;
  const [hi, lo] = [lum(fo), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---- fallbacks for the optional renderers -------------------------------------------------------------------------

/** Plain-canvas filled rounded rect in a token color. */
function fallbackFill(api, rect, o = {}) {
  const { color = 'accent', alpha = 1, radius = 4 } = o;
  if (alpha <= 0 || rect.w <= 0 || rect.h <= 0) { return; }
  const { ctx } = api;
  ctx.save();
  api.alpha(alpha);
  ctx.fillStyle = api.color(color);
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, Math.min(radius, rect.w / 2, rect.h / 2));
  ctx.fill();
  ctx.restore();
}

/** Plain-canvas filled dot. */
function fallbackDot(api, x, y, r, o = {}) {
  const { color = 'accent', alpha = 1 } = o;
  if (alpha <= 0 || r <= 0) { return; }
  const { ctx } = api;
  ctx.save();
  api.alpha(alpha);
  ctx.fillStyle = api.color(color);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---- definePreset --------------------------------------------------------------------------------------------------

/**
 * Resolve a preset factory (or an already-built preset object) into the style object the engine draws with.
 * kit: { math, rough } handed to the factory (defaults: the engine's math and the global Rough.js when loaded).
 * Returns the style; `style.warnings` lists contrast findings (below 4.5:1). Throws one error naming every missing member.
 */
export function definePreset(factory, kit = {}) {
  if (factory && factory.__preset === true) { return factory; }
  const raw = typeof factory === 'function' ? factory({ math, rough: kit.rough ?? globalThis.rough, ...kit }) : factory;
  if (!raw || typeof raw !== 'object') { throw new Error('A preset must export a factory returning an object: export default ({ math, rough }) => ({ ... })'); }

  const missing = [];
  if (!raw.name) { missing.push('name'); }
  if (!raw.palette || typeof raw.palette !== 'object') { missing.push('palette'); }
  for (const k of REQUIRED_PALETTE) {
    if (raw.palette && raw.palette[k] === undefined) { missing.push(`palette.${k}`); }
  }
  for (const k of REQUIRED_RENDERERS) {
    if (typeof raw[k] !== 'function') { missing.push(`${k}()`); }
  }
  if (!Array.isArray(raw.faces)) { missing.push('faces'); }
  if (missing.length) { throw new Error(`Preset "${raw.name ?? '?'}" is missing: ${missing.join(', ')}`); }

  const palette = { onPanel: raw.palette.ink, onAccent: raw.palette.panel, ...raw.palette };
  const stacks = { ...DEFAULT_STACKS, ...raw.stacks };
  const weights = { ...DEFAULT_WEIGHTS, ...raw.weights };
  const color = tok => palette[tok] ?? palette.syntax?.[tok] ?? tok;
  const style = {
    description: '',
    ...raw,
    palette,
    stacks,
    weights,
    defaults: { ...DEFAULTS, ...raw.defaults },
    export: { bitrate: DEFAULT_BITRATE, ...raw.export },
    transitions: { ...raw.transitions },
    color: raw.color ?? color,
    font: raw.font ?? ((role, px, weight) => `${weight ?? weights[role] ?? weights.body} ${px}px ${stacks[role] ?? stacks.body}`),
    fill: raw.fill ?? fallbackFill,
    dot: raw.dot ?? fallbackDot,
    overlay: raw.overlay ?? (() => {}),
    __preset: true,
  };
  // A legacy top-level sweep / glitch hook doubles as the transition hook of that name.
  if (!style.transitions.sweep && typeof raw.sweep === 'function') { style.transitions.sweep = raw.sweep.bind(style); }
  if (!style.transitions.glitch && typeof raw.glitch === 'function') { style.transitions.glitch = raw.glitch.bind(style); }

  const warnings = [];
  const pairs = [['ink', 'bg', 'bg'], ['onPanel', 'panel', 'panel'], ['onAccent', 'accent', 'accent']];
  for (const [fg, bg, label] of pairs) {
    const r = contrast(palette[fg], palette[bg], palette.bg);
    if (r !== null && r < 4.5) { warnings.push(`contrast ${fg} on ${label} is ${r.toFixed(2)}:1 (under 4.5:1)`); }
  }
  style.warnings = warnings;
  return style;
}
