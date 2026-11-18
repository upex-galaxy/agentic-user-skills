// Sound effects synth, mixer and loudness meter. Pure functions over Float32Array; no Web Audio, no I/O, no clock.
// The same code runs in bun test, in the preview page and in the export, and a mix is bit-exact for the same inputs
// (noise comes from a seeded mulberry32). Mix rate SR, stereo; narration clips arrive at CLIP_SR mono.
//
// Voice params (one voice per sound kind; a preset's `sound.voices.<kind>` overrides any subset):
//   wave    'sine' | 'triangle' | 'square' | 'saw' | null   tone oscillator; null = noise only
//   f0      Hz (20..16000)                                  start pitch
//   f1      Hz (20..16000) | null                           pitch glide target (exponential); null = no glide
//   glide   s (0.001..2) | null                             time to reach f1; null = the whole dur
//   attack  s (0..2)                                        rise time (sine-squared curve)
//   decay   s (0.005..3)                                    exponential fall after the attack, time to -60 dB
//   dur     s (0.01..2)                                     length of one hit (2 ms fades at both ends)
//   noise   0..1                                            noise share of the source (0 tone, 1 noise)
//   filter  { type: 'lp'|'bp'|'hp', f: Hz | [from, to], q (0.1..20) } | null   state-variable filter, f sweeps over dur
//   crush   bits (2..16) | null                             bit-crush of the filtered source
//   fm      { ratio (0.01..16), depth (0..20 rad) } | null  phase modulation of the tone by a sine at f * ratio
//   repeat  { n (1..8), gap s (0..0.5), step semitones (-24..24), fade (0..1) } | null   hits n times, gap apart,
//           each `step` semitones above the previous and `fade` times as loud (claps, rolls, two-note chimes)
//   gain    0..1                                            level of this kind against the others
// A sound block is { gain (0..1, bus trim), voices: { <kind>: params }, space: { delay s, feedback, wet } }.
import { rng } from './math.js';
import { SOUND_KINDS } from './sound-kinds.js';

/** Mix sample rate, Hz (stereo). */
export const SR = 48000;
/** Narration clip sample rate, Hz (mono). */
export const CLIP_SR = 24000;

const TAU = Math.PI * 2;
const FADE = 0.002;
const SILENT = Number.NEGATIVE_INFINITY;
const db = x => (x > 0 ? 20 * Math.log10(x) : SILENT);
const fromDb = d => 10 ** (d / 20);

// Defaults: soft, short and musical. Pitches sit on an A440 scale so chained effects stay consonant.
const VOICE_BASE = { wave: 'sine', f0: 440, f1: null, glide: null, attack: 0.002, decay: 0.12, dur: 0.16, noise: 0, filter: null, crush: null, fm: null, repeat: null, gain: 0.6 };
const VOICES = {
  pop: { wave: 'triangle', f0: 523.25, f1: 784, glide: 0.035, attack: 0.002, decay: 0.08, dur: 0.12, noise: 0.03, filter: { type: 'lp', f: 3800, q: 0.7 }, gain: 0.55 },
  tick: { wave: 'sine', f0: 1975.5, f1: 1760, glide: 0.02, attack: 0.001, decay: 0.03, dur: 0.05, noise: 0.12, filter: { type: 'bp', f: 2400, q: 0.9 }, gain: 0.35 },
  blip: { wave: 'sine', f0: 1318.5, attack: 0.002, decay: 0.08, dur: 0.11, fm: { ratio: 2, depth: 0.5 }, gain: 0.4 },
  sparkle: { wave: 'sine', f0: 2093, attack: 0.001, decay: 0.07, dur: 0.09, fm: { ratio: 3, depth: 0.8 }, filter: { type: 'hp', f: 1200, q: 0.7 }, repeat: { n: 3, gap: 0.05, step: 5, fade: 0.7 }, gain: 0.3 },
  hit: { wave: 'sine', f0: 196, f1: 82.4, glide: 0.07, attack: 0.001, decay: 0.16, dur: 0.22, noise: 0.25, filter: { type: 'lp', f: [2600, 700], q: 0.7 }, gain: 0.75 },
  stamp: { wave: 'sine', f0: 146.8, f1: 55, glide: 0.09, attack: 0.001, decay: 0.22, dur: 0.3, noise: 0.35, filter: { type: 'lp', f: [1800, 400], q: 0.8 }, gain: 0.85 },
  ding: { wave: 'sine', f0: 1046.5, attack: 0.003, decay: 0.42, dur: 0.48, fm: { ratio: 3.5, depth: 0.35 }, gain: 0.4 },
  whoosh: { wave: null, attack: 0.14, decay: 0.24, dur: 0.4, noise: 1, filter: { type: 'bp', f: [350, 2800], q: 1.1 }, gain: 0.45 },
  glitch: { wave: 'square', f0: 220, f1: 110, glide: 0.08, attack: 0.001, decay: 0.09, dur: 0.1, noise: 0.45, crush: 5, filter: { type: 'lp', f: 4200, q: 0.7 }, repeat: { n: 2, gap: 0.06, step: -5, fade: 0.8 }, gain: 0.3 },
  riser: { wave: 'sine', f0: 330, f1: 1320, attack: 0.85, decay: 0.2, dur: 1.05, noise: 0.55, filter: { type: 'bp', f: [500, 4500], q: 0.9 }, gain: 0.35 },
  swell: { wave: 'triangle', f0: 220, attack: 0.5, decay: 0.6, dur: 1.15, noise: 0.06, fm: { ratio: 1.5, depth: 0.3 }, filter: { type: 'lp', f: [500, 2200], q: 0.7 }, gain: 0.35 },
  success: { wave: 'triangle', f0: 659.25, attack: 0.003, decay: 0.22, dur: 0.26, filter: { type: 'lp', f: 3500, q: 0.7 }, repeat: { n: 2, gap: 0.1, step: 5, fade: 1 }, gain: 0.45 },
  fail: { wave: 'triangle', f0: 392, attack: 0.004, decay: 0.26, dur: 0.3, filter: { type: 'lp', f: 1600, q: 0.7 }, repeat: { n: 2, gap: 0.14, step: -3, fade: 0.9 }, gain: 0.45 },
};

/** Engine defaults: a voice for every kind in SOUND_KINDS, a 0 dB bus trim and a short, damped room. */
export const DEFAULT_SOUND = Object.freeze({
  gain: 1,
  voices: Object.fromEntries(SOUND_KINDS.map(k => [k, { ...VOICE_BASE, ...VOICES[k] }])),
  space: { delay: 0.09, feedback: 0.22, wet: 0.12 },
});

const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = v => (Array.isArray(v) ? v.slice() : plain(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v);
// Deep merge: objects merge key by key, arrays and explicit nulls replace, undefined keeps the base.
function merge(base, over) {
  if (!plain(over)) { return over === undefined ? clone(base) : clone(over); }
  const out = plain(base) ? clone(base) : {};
  for (const [k, v] of Object.entries(over)) {
    if (v !== undefined) { out[k] = plain(v) && plain(out[k]) ? merge(out[k], v) : clone(v); }
  }
  return out;
}

/** The defaults deep-merged with a preset's partial `sound` block: { gain, voices, space }. Unknown kinds are ignored. */
export function resolveSound(presetSound) {
  const s = plain(presetSound) ? presetSound : {};
  const voices = Object.fromEntries(SOUND_KINDS.map(k => [k, merge(DEFAULT_SOUND.voices[k], s.voices?.[k])]));
  return { gain: Number.isFinite(s.gain) ? s.gain : DEFAULT_SOUND.gain, voices, space: merge(DEFAULT_SOUND.space, s.space) };
}

// Validation table: [name, check(value) -> ok, rule text].
const num = (lo, hi) => v => Number.isFinite(v) && v >= lo && v <= hi;
const orNull = f => v => v === null || f(v);
const int = (lo, hi) => v => Number.isInteger(v) && v >= lo && v <= hi;
const sub = (spec, v, where, out) => {
  if (!plain(v)) { out.push(`${where} must be an object or null`); return; }
  for (const k of Object.keys(v)) {
    if (!spec[k]) { out.push(`${where}.${k} is not a known param (${Object.keys(spec).join(', ')})`); }
    else if (!spec[k][0](v[k])) { out.push(`${where}.${k} must be ${spec[k][1]}`); }
  }
};
const FILTER_SPEC = {
  type: [v => ['lp', 'bp', 'hp'].includes(v), '\'lp\', \'bp\' or \'hp\''],
  f: [v => num(20, 20000)(v) || (Array.isArray(v) && v.length === 2 && v.every(num(20, 20000))), 'Hz from 20 to 20000, or [from, to]'],
  q: [num(0.1, 20), 'a number from 0.1 to 20'],
};
const FM_SPEC = { ratio: [num(0.01, 16), 'a number from 0.01 to 16'], depth: [num(0, 20), 'a number from 0 to 20'] };
const REPEAT_SPEC = {
  n: [int(1, 8), 'an integer from 1 to 8'],
  gap: [num(0, 0.5), 'seconds from 0 to 0.5'],
  step: [num(-24, 24), 'semitones from -24 to 24'],
  fade: [num(0, 1), 'a number from 0 to 1'],
};
const VOICE_SPEC = {
  wave: [v => v === null || ['sine', 'triangle', 'square', 'saw'].includes(v), '\'sine\', \'triangle\', \'square\', \'saw\' or null'],
  f0: [num(20, 16000), 'Hz from 20 to 16000'],
  f1: [orNull(num(20, 16000)), 'Hz from 20 to 16000, or null'],
  glide: [orNull(num(0.001, 2)), 'seconds from 0.001 to 2, or null'],
  attack: [num(0, 2), 'seconds from 0 to 2'],
  decay: [num(0.005, 3), 'seconds from 0.005 to 3'],
  dur: [num(0.01, 2), 'seconds from 0.01 to 2'],
  noise: [num(0, 1), 'a number from 0 to 1'],
  filter: [() => true, ''],
  crush: [orNull(int(2, 16)), 'an integer number of bits from 2 to 16, or null'],
  fm: [() => true, ''],
  repeat: [() => true, ''],
  gain: [num(0, 1), 'a number from 0 to 1'],
};
const NESTED = { filter: FILTER_SPEC, fm: FM_SPEC, repeat: REPEAT_SPEC };
const SPACE_SPEC = {
  delay: [num(0.01, 1), 'seconds from 0.01 to 1'],
  feedback: [num(0, 0.9), 'a number from 0 to 0.9'],
  wet: [num(0, 1), 'a number from 0 to 1'],
};

/** Problems in a preset's partial `sound` block: unknown kinds or params, values out of range. [] when valid. */
export function soundProblems(presetSound) {
  const out = [];
  if (presetSound === undefined) { return out; }
  if (!plain(presetSound)) { return ['sound must be an object']; }
  for (const k of Object.keys(presetSound)) {
    if (!['gain', 'voices', 'space'].includes(k)) { out.push(`sound.${k} is not a known member (gain, voices, space)`); }
  }
  if (presetSound.gain !== undefined && !num(0, 1)(presetSound.gain)) { out.push('sound.gain must be a number from 0 to 1'); }
  if (presetSound.space !== undefined) {
    if (plain(presetSound.space)) { sub(SPACE_SPEC, presetSound.space, 'sound.space', out); }
    else { out.push('sound.space must be an object'); }
  }
  const voices = presetSound.voices;
  if (voices === undefined) { return out; }
  if (!plain(voices)) { return [...out, 'sound.voices must be an object']; }
  for (const [kind, v] of Object.entries(voices)) {
    const where = `sound.voices.${kind}`;
    if (!SOUND_KINDS.includes(kind)) { out.push(`${where} is not a known sound kind (${SOUND_KINDS.join(', ')})`); continue; }
    if (!plain(v)) { out.push(`${where} must be an object`); continue; }
    for (const p of Object.keys(v)) {
      if (!VOICE_SPEC[p]) { out.push(`${where}.${p} is not a known param (${Object.keys(VOICE_SPEC).join(', ')})`); }
      else if (NESTED[p]) { if (v[p] !== null) { sub(NESTED[p], v[p], `${where}.${p}`, out); } }
      else if (!VOICE_SPEC[p][0](v[p])) { out.push(`${where}.${p} must be ${VOICE_SPEC[p][1]}`); }
    }
    const full = merge(DEFAULT_SOUND.voices[kind], v);
    if (Number.isFinite(full.attack) && Number.isFinite(full.dur) && full.attack >= full.dur) { out.push(`${where}.attack must be shorter than dur`); }
  }
  return out;
}

// Oscillators on a phase in cycles. Square and saw carry a polyBLEP step correction so they do not alias harshly.
const blep = (p, dt) => {
  if (p < dt) { const x = p / dt; return x + x - x * x - 1; }
  if (p > 1 - dt) { const x = (p - 1) / dt; return x * x + x + x + 1; }
  return 0;
};
const frac = x => x - Math.floor(x);
const OSC = {
  sine: p => Math.sin(TAU * p),
  triangle: p => 1 - 4 * Math.abs(frac(p + 0.25) - 0.5),
  saw: (p, dt) => { const q = frac(p + 0.5); return 2 * q - 1 - blep(q, dt); },
  square: (p, dt) => { const q = frac(p); return (q < 0.5 ? 1 : -1) + blep(q, dt) - blep(frac(q + 0.5), dt); },
};

// One hit of a voice into `out` at sample `off`, pitch times `mul`, level `amp`. `rand` is the voice's noise source.
function renderHit(v, out, off, mul, amp, rand) {
  const len = Math.round(v.dur * SR);
  const osc = v.wave ? OSC[v.wave] : null;
  const f0 = v.f0 * mul;
  const f1 = v.f1 === null || v.f1 === undefined ? f0 : v.f1 * mul;
  const glide = Math.max(1, Math.round((v.glide ?? v.dur) * SR));
  const ratio = f1 / f0;
  const fm = v.fm && v.fm.depth > 0 ? v.fm : null;
  const flt = v.filter ?? null;
  const [fa, fb] = flt ? (Array.isArray(flt.f) ? flt.f : [flt.f, flt.f]) : [0, 0];
  const k = flt ? 1 / (flt.q ?? 0.707) : 0;
  const steps = v.crush ? 2 ** (v.crush - 1) : 0;
  const atk = Math.round(v.attack * SR);
  const fall = 6.907755 / Math.max(1, v.decay * SR);
  const edge = Math.max(1, Math.round(FADE * SR));
  let ph = 0;
  let mph = 0;
  let ic1 = 0;
  let ic2 = 0;
  let g = 0;
  let a1 = 0;
  let a2 = 0;
  let a3 = 0;
  const coef = (fc) => {
    g = Math.tan(Math.PI * Math.min(fc, SR * 0.45) / SR);
    a1 = 1 / (1 + g * (g + k));
    a2 = g * a1;
    a3 = g * a2;
  };
  if (flt) { coef(fa); }
  for (let i = 0; i < len && off + i < out.length; i++) {
    const f = i < glide ? f0 * ratio ** (i / glide) : f1;
    const dt = f / SR;
    let tone = 0;
    if (osc) {
      const pm = fm ? fm.depth * Math.sin(TAU * mph) / TAU : 0;
      tone = osc(ph + pm, dt);
      ph = frac(ph + dt);
      if (fm) { mph = frac(mph + dt * fm.ratio); }
    }
    let s = tone * (1 - v.noise) + (v.noise > 0 ? (rand() * 2 - 1) * v.noise : 0);
    if (flt) {
      if (fa !== fb && (i & 15) === 0) { coef(fa * (fb / fa) ** (i / len)); }
      const v3 = s - ic2;
      const v1 = a1 * ic1 + a2 * v3;
      const v2 = ic2 + a2 * ic1 + a3 * v3;
      ic1 = 2 * v1 - ic1;
      ic2 = 2 * v2 - ic2;
      s = flt.type === 'lp' ? v2 : flt.type === 'bp' ? v1 * k : s - k * v1 - v2;
    }
    if (steps) { s = Math.round(s * steps) / steps; }
    let env = i < atk ? Math.sin(Math.PI / 2 * i / atk) ** 2 : Math.exp(-(i - atk) * fall);
    if (i < edge) { env *= i / edge; }
    if (len - i <= edge) { env *= (len - 1 - i) / edge; }
    out[off + i] += s * env * amp;
  }
}

/** One effect as mono Float32Array at SR. Deterministic per (kind, voice, seed); `voice` may be partial. */
export function synth(kind, voice, seed = 0) {
  const base = DEFAULT_SOUND.voices[kind] ?? VOICE_BASE;
  const v = merge(base, voice ?? {});
  const rep = v.repeat ?? null;
  const n = rep ? Math.max(1, Math.round(rep.n ?? 1)) : 1;
  const gap = rep?.gap ?? 0;
  const out = new Float32Array(Math.round(((n - 1) * gap + v.dur) * SR));
  const rand = rng((seed * 7919 + (SOUND_KINDS.indexOf(kind) + 2) * 104729) | 0);
  const acc = new Float64Array(out.length);
  for (let r = 0; r < n; r++) {
    renderHit(v, acc, Math.round(r * gap * SR), 2 ** ((rep?.step ?? 0) * r / 12), v.gain * (rep?.fade ?? 1) ** r, rand);
  }
  for (let i = 0; i < out.length; i++) { out[i] = acc[i]; }
  return out;
}

const priority = (kind) => {
  const i = SOUND_KINDS.indexOf(kind);
  return i < 0 ? SOUND_KINDS.length : i;
};
// Index of the event to drop among `idx`: the lowest-priority kind, the latest among equals.
const victim = (list, idx) => idx.reduce((a, b) => {
  const pa = priority(list[a].kind);
  const pb = priority(list[b].kind);
  return pb < pa || (pb === pa && list[b].t >= list[a].t) ? b : a;
});

/**
 * Merge and thin effect events (sorted by t). A same-kind event within `window` of the previous one of its kind merges
 * into the group's first event (gains summed, capped at 1), so a chained run becomes one sound. Then at most `perSecond`
 * in any [a, a + 1) window and `perScene` per sceneIndex survive, dropping by SOUND_KINDS order. Returns a new array.
 */
export function coalesce(events, { window = 0.12, perSecond = 3, perScene = 12 } = {}) {
  const groups = [];
  const last = new Map();
  for (const ev of events) {
    const prev = last.get(ev.kind);
    if (prev && ev.t - prev.t <= window) {
      prev.group.gain = Math.min(1, prev.group.gain + (ev.gain ?? 1));
      prev.t = ev.t;
      continue;
    }
    const group = { ...ev, gain: Math.min(1, ev.gain ?? 1) };
    groups.push(group);
    last.set(ev.kind, { group, t: ev.t });
  }
  let list = groups;
  for (;;) {
    let drop = -1;
    for (let i = 0; i < list.length && drop < 0; i++) {
      const idx = [];
      for (let j = i; j < list.length && list[j].t - list[i].t < 1; j++) { idx.push(j); }
      if (idx.length > perSecond) { drop = victim(list, idx); }
    }
    if (drop < 0) {
      const byScene = new Map();
      list.forEach((ev, i) => {
        const key = ev.sceneIndex ?? ev.scene;
        byScene.set(key, [...(byScene.get(key) ?? []), i]);
      });
      for (const idx of byScene.values()) {
        if (idx.length > perScene) { drop = victim(list, idx); break; }
      }
    }
    if (drop < 0) { return list; }
    list = list.filter((_, i) => i !== drop);
  }
}

// Half-band low-pass for 2x upsampling: 31 taps (4k+3), Blackman-windowed sinc, centred (zero delay). Every even
// tap but the centre is zero, so even outputs copy the input and odd outputs use the 16 odd taps, normalized to sum 1.
const HB = (() => {
  const M = 15;
  const odd = [];
  for (let n = 1; n <= M; n += 2) {
    const x = Math.PI * n / 2;
    const w = 0.42 + 0.5 * Math.cos(Math.PI * n / (M + 1)) + 0.08 * Math.cos(2 * Math.PI * n / (M + 1));
    odd.push(Math.sin(x) / x * w);
  }
  const sum = 2 * odd.reduce((a, b) => a + b, 0);
  return odd.map(h => h / sum);
})();

/** A 24 kHz mono clip at 48 kHz through a fixed symmetric half-band FIR (31 taps, zero delay). */
export function upsample2x(pcm24k) {
  const n = pcm24k.length;
  const out = new Float32Array(n * 2);
  const at = i => (i >= 0 && i < n ? pcm24k[i] : 0);
  for (let i = 0; i < n; i++) {
    out[2 * i] = pcm24k[i];
    // Output 2i+1 sits between inputs i and i+1: tap h[2m+1] pairs input i-m with input i+1+m.
    let s = 0;
    for (let m = 0; m < HB.length; m++) { s += HB[m] * (at(i - m) + at(i + 1 + m)); }
    out[2 * i + 1] = s;
  }
  return out;
}

// K-weighting biquads for a sample rate, from the BS.1770 analog prototypes (pre-filter shelf, then RLB high-pass).
/** BS.1770 K-weighting coefficients for `sr`: [{ b: [b0, b1, b2], a: [1, a1, a2] }, ...]. */
export function kWeights(sr = SR) {
  let K = Math.tan(Math.PI * 1681.974450955533 / sr);
  const Vh = 10 ** (3.999843853973347 / 20);
  const Vb = Vh ** 0.4996667741545416;
  let Q = 0.7071752369554196;
  let a0 = 1 + K / Q + K * K;
  const shelf = { b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
  K = Math.tan(Math.PI * 38.13547087602444 / sr);
  Q = 0.5003270373238773;
  a0 = 1 + K / Q + K * K;
  const hp = { b: [1, -2, 1], a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
  return [shelf, hp];
}

// Squared K-weighted samples summed per 100 ms segment, one channel.
function segmentEnergy(x, sr, seg, kw) {
  const out = new Float64Array(Math.floor(x.length / seg));
  const [s, h] = kw;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < out.length * seg; i++) {
    const x0 = x[i];
    const y0 = s.b[0] * x0 + s.b[1] * x1 + s.b[2] * x2 - s.a[1] * y1 - s.a[2] * y2;
    const z0 = y0 - 2 * y1 + y2 - h.a[1] * z1 - h.a[2] * z2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    z2 = z1;
    z1 = z0;
    out[(i / seg) | 0] += z0 * z0;
  }
  return out;
}

// Mean square (L + R summed) of each 400 ms block, 75 % overlap. `right` may be null (one channel).
function blockPower(left, right, sr) {
  const seg = Math.round(sr * 0.1);
  const kw = kWeights(sr);
  const l = segmentEnergy(left, sr, seg, kw);
  const r = right ? segmentEnergy(right, sr, seg, kw) : null;
  const out = [];
  for (let j = 0; j + 4 <= l.length; j++) {
    let e = 0;
    for (let q = j; q < j + 4; q++) { e += l[q] + (r ? r[q] : 0); }
    out.push(e / (seg * 4));
  }
  return out;
}
const lufs = p => (p > 0 ? -0.691 + 10 * Math.log10(p) : SILENT);

/** Momentary loudness (LUFS) of each 400 ms block at 75 % overlap, BS.1770 K-weighted. */
export function blockLoudness(left, right, sr = SR) {
  return blockPower(left, right, sr).map(lufs);
}

/** BS.1770-4 integrated loudness (absolute gate -70 LUFS, relative gate -10 LU) and sample peak (dBFS). */
export function loudness(left, right, sr = SR) {
  const blocks = blockPower(left, right, sr);
  const mean = list => list.reduce((a, b) => a + b, 0) / list.length;
  const abs = blocks.filter(p => lufs(p) > -70);
  let integrated = SILENT;
  if (abs.length) {
    const gate = lufs(mean(abs)) - 10;
    const rel = abs.filter(p => lufs(p) > gate);
    integrated = rel.length ? lufs(mean(rel)) : SILENT;
  }
  let peak = 0;
  for (const ch of [left, right]) {
    for (let i = 0; i < (ch?.length ?? 0); i++) { const a = Math.abs(ch[i]); if (a > peak) { peak = a; } }
  }
  return { integrated, peak: db(peak) };
}

// Sliding minimum over [i - r, i + r] with a monotonic deque, O(n).
function slidingMin(x, r) {
  const n = x.length;
  const out = new Float64Array(n);
  const dq = new Int32Array(n);
  let head = 0;
  let tail = 0;
  let next = 0;
  for (let i = 0; i < n; i++) {
    for (; next < n && next <= i + r; next++) {
      while (tail > head && x[dq[tail - 1]] >= x[next]) { tail--; }
      dq[tail++] = next;
    }
    while (dq[head] < i - r) { head++; }
    out[i] = x[dq[head]];
  }
  return out;
}

/**
 * Look-ahead peak limiter, linked stereo, in place and offline (no delay line). The gain is a box-smoothed sliding
 * minimum of the required gain, so it never exceeds it, then releases over `release` s; a final clamp guarantees the
 * ceiling. Returns the deepest gain reduction in dB (0 when idle).
 */
export function limit(left, right, ceilingDb = -2, { lookahead = 0.003, release = 0.08 } = {}) {
  const n = left.length;
  const ceil = Math.fround(fromDb(ceilingDb) * (1 - 1e-6));
  const need = new Float64Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    const a = Math.max(Math.abs(left[i]), Math.abs(right[i]));
    need[i] = a > ceil ? ceil / a : 1;
    if (a > ceil) { any = true; }
  }
  if (!any) { return 0; }
  const r = Math.max(1, Math.round(lookahead * SR / 2));
  const m = slidingMin(need, r);
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { pre[i + 1] = pre[i] + m[i]; }
  const rel = Math.exp(-1 / (release * SR));
  let g = 1;
  let deepest = 1;
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - r);
    const hi = Math.min(n, i + r + 1);
    const smooth = Math.min(need[i], (pre[hi] - pre[lo]) / (hi - lo));
    g = Math.min(smooth, 1 - (1 - g) * rel);
    if (g < deepest) { deepest = g; }
    left[i] = Math.max(-ceil, Math.min(ceil, left[i] * g));
    right[i] = Math.max(-ceil, Math.min(ceil, right[i] * g));
  }
  return db(deepest);
}

// Feedback delay on the effects bus, in place: a damped echo that stands in for a room.
function applySpace(left, right, space) {
  const d = Math.round((space?.delay ?? 0) * SR);
  const wet = space?.wet ?? 0;
  if (!(d > 0) || !(wet > 0)) { return; }
  const fb = space.feedback ?? 0;
  for (const ch of [left, right]) {
    const line = new Float64Array(ch.length);
    let lp = 0;
    for (let i = d; i < ch.length; i++) {
      lp += 0.6 * (ch[i - d] + fb * line[i - d] - lp);
      line[i] = lp;
    }
    for (let i = 0; i < ch.length; i++) { ch[i] += wet * line[i]; }
  }
}

// Sample peak of one effect as placed: pan gains (pl, pr) and the room's echo included.
function placedPeak(mono, pl, pr, space) {
  const len = mono.length + Math.round((space?.delay ?? 0) * SR) + 1;
  const l = new Float32Array(len);
  const r = new Float32Array(len);
  for (let j = 0; j < mono.length; j++) { l[j] = mono[j] * pl; r[j] = mono[j] * pr; }
  applySpace(l, r, space);
  let peak = 0;
  for (let j = 0; j < len; j++) { peak = Math.max(peak, Math.abs(l[j]), Math.abs(r[j])); }
  return peak;
}

// The loudest 400 ms block (LUFS) of a short mono effect as placed at the centre (equal-power pan keeps it at any
// pan), padded with silence to one block.
function effectLoudness(mono) {
  const len = Math.max(mono.length, Math.round(SR * 0.4));
  const x = new Float32Array(len);
  x.set(mono);
  return Math.max(...blockLoudness(x, x, SR));
}

const VOICE_LUFS = -16;
const SFX_UNDER_VOICE = 12;
const DUCK_DB = 8;
const MASTER_LUFS = -14;
const SFX_ONLY_PEAK = -6;
const CEILING = -2;
const GATE = fromDb(-45);

/**
 * The soundtrack: effects (coalesced, seeded by their index) and 24 kHz narration clips on a 48 kHz stereo bus.
 * Voice: bus at -16 LUFS, effects 12 dB under it and ducked 8 dB while it speaks, master to -14 LUFS. Effects only:
 * the loudest effect peaks at -6 dBFS. Then the -2 dBFS limiter. Returns { left, right, report }.
 */
export function mix({ duration, events = [], clips = [], sound = resolveSound(), sfx = true }) {
  const n = Math.max(0, Math.round(duration * SR));
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const evs = sfx ? coalesce(events) : [];
  const voice = new Float32Array(clips.length ? n : 0);
  let voiceSeconds = 0;
  for (const c of clips) {
    voiceSeconds += c.pcm.length / CLIP_SR;
    const up = upsample2x(c.pcm);
    const off = Math.round(c.t * SR);
    for (let i = Math.max(0, -off); i < up.length && off + i < n; i++) { voice[off + i] += up[i]; }
  }
  const hasVoice = voice.some(x => x !== 0);
  if (hasVoice) {
    const vl = loudness(voice, voice).integrated;
    const g = Number.isFinite(vl) ? fromDb(VOICE_LUFS - vl) : 1;
    for (let i = 0; i < n; i++) { voice[i] *= g; }
  }

  // Effects: synthesize, then place each at a level fixed by the loudest one.
  const sl = new Float32Array(n);
  const sr = new Float32Array(n);
  const placed = evs.map((ev, i) => {
    const kind = sound.voices[ev.kind] ? ev.kind : 'pop';
    const mono = synth(kind, sound.voices[kind], i);
    const gain = ev.gain ?? 1;
    const pan = Math.max(-1, Math.min(1, ev.pan ?? 0));
    const ang = (pan + 1) * Math.PI / 4;
    const pl = Math.cos(ang) * Math.SQRT2;
    const pr = Math.sin(ang) * Math.SQRT2;
    return { ev, mono, gain, pl, pr, peak: hasVoice ? 0 : placedPeak(mono, pl, pr, sound.space) * gain, lufs: hasVoice ? effectLoudness(mono) + db(gain) : SILENT };
  });
  let scale = 0;
  if (placed.length) {
    if (hasVoice) {
      const top = Math.max(...placed.map(p => p.lufs));
      scale = Number.isFinite(top) ? fromDb(VOICE_LUFS - SFX_UNDER_VOICE - top) : 0;
    }
    else {
      const top = Math.max(...placed.map(p => p.peak));
      scale = top > 0 ? fromDb(SFX_ONLY_PEAK) / top : 0;
    }
    scale *= sound.gain ?? 1;
  }
  for (const p of placed) {
    const gl = p.pl * p.gain * scale;
    const gr = p.pr * p.gain * scale;
    const off = Math.round(p.ev.t * SR);
    for (let j = Math.max(0, -off); j < p.mono.length && off + j < n; j++) {
      sl[off + j] += p.mono[j] * gl;
      sr[off + j] += p.mono[j] * gr;
    }
  }
  if (placed.length) { applySpace(sl, sr, sound.space); }

  // Duck the effects while the voice speaks: a gate on |voice| smoothed with 30 ms attack, 250 ms release.
  const up = 1 - Math.exp(-1 / (0.03 * SR));
  const down = 1 - Math.exp(-1 / (0.25 * SR));
  const duck = fromDb(-DUCK_DB) - 1;
  let d = 0;
  for (let i = 0; i < n; i++) {
    let gs = 1;
    if (hasVoice) {
      const on = Math.abs(voice[i]) > GATE ? 1 : 0;
      d += (on - d) * (on > d ? up : down);
      gs = 1 + duck * d;
    }
    const v = hasVoice ? voice[i] : 0;
    left[i] = v + sl[i] * gs;
    right[i] = v + sr[i] * gs;
  }

  // Master to -14 LUFS with voice (one correction pass after the limiter), then the ceiling.
  if (hasVoice) {
    const pre = loudness(left, right).integrated;
    if (Number.isFinite(pre)) {
      const dry = [left.slice(), right.slice()];
      let gain = fromDb(MASTER_LUFS - pre);
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < n; i++) { left[i] = dry[0][i] * gain; right[i] = dry[1][i] * gain; }
        limit(left, right, CEILING);
        const got = loudness(left, right).integrated;
        if (!Number.isFinite(got) || Math.abs(got - MASTER_LUFS) < 0.2) { break; }
        gain *= fromDb(MASTER_LUFS - got);
      }
    }
  }
  limit(left, right, CEILING);
  const meter = loudness(left, right);
  return {
    left,
    right,
    report: { sfxEvents: evs.length, voiceSeconds, integratedLufs: meter.integrated, peakDbfs: meter.peak, events: evs },
  };
}
