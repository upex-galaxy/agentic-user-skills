// Pure time and number helpers shared by every engine module. No wall-clock anywhere.

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;
/** Progress 0..1 of the time window [at, at + dur]. */
export const prog = (t, at, dur) => (dur <= 0 ? (t >= at ? 1 : 0) : clamp((t - at) / dur));

export const ease = {
  linear: k => k,
  in: k => k * k * k,
  out: k => 1 - (1 - k) ** 3,
  inOut: k => (k < 0.5 ? 4 * k ** 3 : 1 - ((-2 * k + 2) ** 3) / 2),
  sine: k => 0.5 - Math.cos(Math.PI * k) / 2,
  back: (k) => {
    const c = 1.70158;
    return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2;
  },
  bounce: (k) => {
    const n = 7.5625;
    const d = 2.75;
    if (k < 1 / d) { return n * k * k; }
    if (k < 2 / d) { return n * (k -= 1.5 / d) * k + 0.75; }
    if (k < 2.5 / d) { return n * (k -= 2.25 / d) * k + 0.9375; }
    return n * (k -= 2.625 / d) * k + 0.984375;
  },
  elastic: k => (k === 0 || k === 1 ? k : 2 ** (-10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};
ease.lin = ease.linear;

/** Accepts an easing name or a function; falls back to `fallback`. */
export function resolveEase(e, fallback = 'out') {
  if (typeof e === 'function') { return e; }
  return ease[e] ?? ease[fallback];
}

/** Curried tween: tween(from, to, start, dur, ease) returns a function of time. */
export function tween(from, to, start, dur, e = 'out') {
  const fn = resolveEase(e);
  return t => lerp(from, to, fn(prog(t, start, dur)));
}

/** Direct tween value at time t. */
export function val(t, from, to, start, dur, e = 'out') {
  return tween(from, to, start, dur, e)(t);
}

/** Start times for a staggered reveal: n items, first at `start`, then every `step` seconds. */
export function stagger(n, start = 0, step = 0.2) {
  const count = Array.isArray(n) ? n.length : n;
  return Array.from({ length: count }, (_, i) => start + i * step);
}

/** Keyframes: kf(t, [[0, v0], [2, v1], [5, v2]], easing) interpolates between keys. */
export function kf(t, keys, e = 'inOut') {
  const fn = resolveEase(e, 'inOut');
  if (t <= keys[0][0]) { return keys[0][1]; }
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) { return lerp(keys[i - 1][1], keys[i][1], fn(prog(t, keys[i - 1][0], keys[i][0] - keys[i - 1][0]))); }
  }
  return keys[keys.length - 1][1];
}

/** mulberry32: seeded random in [0, 1). Keeps render(t) pure. */
export function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable positive integer seed from a string. */
export function hash(str) {
  let h = 7;
  for (const c of String(str)) { h = (h * 31 + c.charCodeAt(0)) | 0; }
  return Math.abs(h) || 1;
}

/** "#rrggbb" + alpha -> "rgba(r,g,b,a)". Other color strings pass through unchanged. */
export function hexA(color, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) { return color; }
  const n = Number.parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
