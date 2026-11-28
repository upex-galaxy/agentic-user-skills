/* eslint-disable ts/no-explicit-any */
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import { blockLoudness, CLIP_SR, coalesce, DEFAULT_SOUND, kWeights, limit, loudness, mix, resolveSound, soundProblems, SR, synth, upsample2x } from './audio.js';
import { ciLimit } from './ci-limit.ts';
import { SOUND_KINDS } from './sound-kinds.js';

const sine = (n: number, f: number, amp: number, sr: number) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(2 * Math.PI * f * i / sr));
const peakOf = (...chs: Float32Array[]) => Math.max(...chs.map(c => c.reduce((m, x) => Math.max(m, Math.abs(x)), 0)));
const sha = (a: Float32Array, b: Float32Array) => createHash('sha256').update(new Uint8Array(a.buffer)).update(new Uint8Array(b.buffer)).digest('hex');

// Speech-like test clip at 24 kHz: noise bursts under a 4 Hz syllable envelope with pauses (crest well over 12 dB).
function speechish(seconds: number, seed = 1) {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7FFFFFFF;
    return s / 0x7FFFFFFF;
  };
  const out = new Float32Array(Math.round(seconds * CLIP_SR));
  let lp = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / CLIP_SR;
    const syl = Math.max(0, Math.sin(2 * Math.PI * 4 * t)) ** 2;
    const word = Math.sin(2 * Math.PI * 0.35 * t) > -0.6 ? 1 : 0;
    lp += 0.3 * ((rand() * 2 - 1) - lp);
    out[i] = 0.3 * (lp + 0.5 * Math.sin(2 * Math.PI * 180 * t)) * syl * word;
  }
  return out;
}

// Spectral centroid by a plain DFT on a 4096-sample window.
function centroid(x: Float32Array) {
  const n = 4096;
  let num = 0;
  let den = 0;
  for (let k = 1; k < n / 2; k += 2) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < Math.min(n, x.length); i++) {
      re += x[i] * Math.cos(2 * Math.PI * k * i / n);
      im -= x[i] * Math.sin(2 * Math.PI * k * i / n);
    }
    const mag = Math.hypot(re, im);
    num += mag * k * SR / n;
    den += mag;
  }
  return num / den;
}

describe('sound block', () => {
  test('defaults: a valid voice for every kind, short and soft', () => {
    expect(Object.keys(DEFAULT_SOUND.voices)).toEqual(SOUND_KINDS);
    expect(soundProblems(DEFAULT_SOUND)).toEqual([]);
    for (const k of SOUND_KINDS) {
      const len = synth(k, DEFAULT_SOUND.voices[k], 0).length / SR;
      expect(len).toBeLessThanOrEqual(['swell', 'riser'].includes(k) ? 1.2 : 0.5);
    }
  });

  test('resolveSound deep-merges, nulls and arrays replace, defaults stay untouched', () => {
    const r = resolveSound({ gain: 0.5, voices: { pop: { f0: 900, filter: { f: [200, 900] } }, ding: { fm: null } }, space: { wet: 0 } });
    expect(r.gain).toBe(0.5);
    expect(r.voices.pop).toMatchObject({ f0: 900, wave: 'triangle', filter: { type: 'lp', f: [200, 900], q: 0.7 } });
    expect(r.voices.ding.fm).toBeNull();
    expect(r.space).toEqual({ delay: 0.09, feedback: 0.22, wet: 0 });
    r.voices.tick.f0 = 1;
    expect(DEFAULT_SOUND.voices.tick.f0).not.toBe(1);
    expect(resolveSound().voices.whoosh).toEqual(DEFAULT_SOUND.voices.whoosh);
  });

  test('soundProblems names unknown kinds, params and out-of-range values', () => {
    const p = soundProblems({ volume: 1, gain: 3, voices: { boing: {}, pop: { f0: 5, colour: 1, filter: { type: 'notch', z: 1 }, repeat: { n: 0 } } }, space: { feedback: 1 } });
    expect(p).toEqual(expect.arrayContaining([
      expect.stringContaining('sound.volume'),
      expect.stringContaining('sound.gain'),
      expect.stringContaining('sound.voices.boing'),
      expect.stringContaining('sound.voices.pop.f0'),
      expect.stringContaining('sound.voices.pop.colour'),
      expect.stringContaining('sound.voices.pop.filter.type'),
      expect.stringContaining('sound.voices.pop.filter.z'),
      expect.stringContaining('sound.voices.pop.repeat.n'),
      expect.stringContaining('sound.space.feedback'),
    ]));
    expect(p).toHaveLength(9);
    expect(soundProblems(undefined)).toEqual([]);
    expect(soundProblems({ voices: { pop: { attack: 0.5, dur: 0.2 } } })).toEqual(['sound.voices.pop.attack must be shorter than dur']);
  });
});

describe('synth', () => {
  test('deterministic per (kind, voice, seed); the seed only moves the noise', () => {
    const a = synth('whoosh', DEFAULT_SOUND.voices.whoosh, 3);
    expect(sha(a, a)).toBe(sha(synth('whoosh', DEFAULT_SOUND.voices.whoosh, 3), new Float32Array(a)));
    expect(sha(a, a)).not.toBe(sha(synth('whoosh', DEFAULT_SOUND.voices.whoosh, 4), synth('whoosh', DEFAULT_SOUND.voices.whoosh, 4)));
    const ding = synth('ding', DEFAULT_SOUND.voices.ding, 1);
    expect(synth('ding', DEFAULT_SOUND.voices.ding, 9)).toEqual(ding);
  });

  test('every kind is finite, bounded and starts and ends at silence', () => {
    for (const k of SOUND_KINDS) {
      const x = synth(k, DEFAULT_SOUND.voices[k], 7);
      expect(x.every(Number.isFinite)).toBe(true);
      expect(peakOf(x)).toBeGreaterThan(0.01);
      expect(peakOf(x)).toBeLessThan(1.5);
      expect(Math.abs(x[0])).toBeLessThan(1e-6);
      expect(Math.abs(x[x.length - 1])).toBeLessThan(1e-3);
    }
  });

  test('acceptance 5: a preset changes the flavor (spectral centroid moves over 30 %)', () => {
    const a = centroid(synth('pop', DEFAULT_SOUND.voices.pop, 0));
    const b = centroid(synth('pop', resolveSound({ voices: { pop: { wave: 'sine', f0: 1800, f1: 2600 } } }).voices.pop, 0));
    expect(Math.abs(b - a) / a).toBeGreaterThan(0.3);
  });
});

describe('coalesce', () => {
  const ev = (t: number, kind = 'pop', sceneIndex = 0, gain = 0.3) => ({ t, scene: `s${sceneIndex}`, sceneIndex, id: `e${t}`, kind, gain, pan: 0 });

  test('acceptance 4: 12 pops 0.05 s apart become at most 2 (chained into the first, gain capped)', () => {
    const out = coalesce(Array.from({ length: 12 }, (_, i) => ev(i * 0.05)));
    expect(out.length).toBeLessThanOrEqual(2);
    expect(out[0]).toMatchObject({ t: 0, gain: 1, kind: 'pop' });
  });

  test('perSecond cap: at most 3 in any 1 s window, low-priority and later drop first', () => {
    const kinds = ['ding', 'pop', 'stamp', 'pop', 'whoosh'];
    const out = coalesce(kinds.map((k, i) => ev(i * 0.2, k)));
    expect(out.map((e: any) => e.kind)).toEqual(['ding', 'stamp', 'whoosh']);
    const ties = coalesce([0, 0.2, 0.4, 0.6].map(t => ev(t, 'tick')));
    expect(ties.map((e: any) => e.t)).toEqual([0, 0.2, 0.4]);
    const spread = Array.from({ length: 10 }, (_, i) => ev(i * 0.34, 'blip'));
    const kept = coalesce(spread);
    for (const a of kept) { expect(kept.filter((b: any) => b.t >= a.t && b.t < a.t + 1).length).toBeLessThanOrEqual(3); }
  });

  test('perScene cap counts by sceneIndex, not name', () => {
    const list = Array.from({ length: 20 }, (_, i) => ({ ...ev(i * 0.5, i % 2 ? 'ding' : 'sparkle'), scene: 'same' }));
    const out = coalesce(list);
    expect(out.length).toBe(12);
    expect(out.filter((e: any) => e.kind === 'ding').length).toBe(10);
    const two = coalesce(list.map((e, i) => ({ ...e, sceneIndex: i < 10 ? 0 : 1 })));
    expect(two.length).toBe(20);
    expect(list[0].gain).toBe(0.3);
  });
});

describe('resampling and loudness', () => {
  test('acceptance 8: upsample2x of a 1 kHz sine is a 1 kHz sine at 48 kHz (zero delay)', () => {
    const up = upsample2x(sine(24000, 1000, 0.5, CLIP_SR));
    const ref = sine(48000, 1000, 0.5, SR);
    let err = 0;
    let pow = 0;
    for (let i = 100; i < 47900; i++) {
      err += (up[i] - ref[i]) ** 2;
      pow += ref[i] ** 2;
    }
    expect(Math.sqrt(err / pow)).toBeLessThan(0.01);
  });

  test('K-weighting at 48 kHz matches the BS.1770 published coefficients', () => {
    const [s, h] = kWeights(48000);
    const near = (a: number[], b: number[]) => a.forEach((x, i) => expect(Math.abs(x - b[i])).toBeLessThan(1e-6));
    near(s.b, [1.53512485958697, -2.69169618940638, 1.19839281085285]);
    near(s.a, [1, -1.69065929318241, 0.73248077421585]);
    near(h.b, [1, -2, 1]);
    near(h.a, [1, -1.99004745483398, 0.99007225036621]);
  });

  test('acceptance 2: EBU Tech 3341 case 1 measures -23.0 LUFS', () => {
    // Tech 3341 (2023) Table 1, case 1: stereo sine, 1000 Hz, -23.0 dBFS per-channel PEAK level, applied in phase to
    // both channels, 20 s. Expected M, S, I = -23.0 ±0.1 LUFS.
    const x = sine(20 * SR, 1000, 10 ** (-23 / 20), SR);
    const m = loudness(x, x);
    expect(Math.abs(m.integrated + 23)).toBeLessThan(0.1);
    expect(m.peak).toBeCloseTo(-23, 2);
    expect(blockLoudness(x, x).every((b: number) => Math.abs(b + 23) < 0.1)).toBe(true);
    expect(loudness(new Float32Array(SR), new Float32Array(SR))).toEqual({ integrated: -Infinity, peak: -Infinity });
  });
});

describe('mix', () => {
  const events = (n: number, dur: number) => Array.from({ length: n }, (_, i) => ({
    t: (i + 0.5) * dur / n,
    scene: `s${Math.floor(i / 6)}`,
    sceneIndex: Math.floor(i / 6),
    id: `e${i}`,
    kind: SOUND_KINDS[i % SOUND_KINDS.length],
    gain: 0.6 + 0.4 * ((i * 7) % 5) / 4,
    pan: ((i * 3) % 7) / 10 - 0.3,
  })).sort((a, b) => a.t - b.t);

  test('silence in, silence out, exact length', () => {
    const r = mix({ duration: 2.5 });
    expect(r.left.length).toBe(Math.round(2.5 * SR));
    expect(peakOf(r.left, r.right)).toBe(0);
    expect(r.report).toMatchObject({ sfxEvents: 0, voiceSeconds: 0, integratedLufs: -Infinity, events: [] });
  });

  test('acceptance 1: the same events and clips give a byte-identical mix', () => {
    const args = () => ({ duration: 12, events: events(14, 12), clips: [{ t: 1, pcm: speechish(4) }, { t: 6.5, pcm: speechish(3, 5) }], sound: resolveSound() });
    const a = mix(args());
    const b = mix(args());
    expect(sha(a.left, a.right)).toBe(sha(b.left, b.right));
    const c = mix({ ...args(), sfx: false });
    expect(c.report.sfxEvents).toBe(0);
    expect(sha(c.left, c.right)).not.toBe(sha(a.left, a.right));
  });

  test('acceptance 3: a naive sum of three blips peaking at 1.27 comes out at or below -2.0 dBFS', () => {
    // The limiter alone, on the spike's case: three summed blips peaking at 1.27.
    const blip = synth('blip', DEFAULT_SOUND.voices.blip, 0);
    const k = 1.27 / 3 / peakOf(blip);
    const l = new Float32Array(SR);
    for (let i = 0; i < blip.length; i++) { l[1000 + i] = 3 * blip[i] * k; }
    expect(peakOf(l)).toBeCloseTo(1.27, 3);
    const r = new Float32Array(l);
    limit(l, r, -2);
    expect(20 * Math.log10(peakOf(l, r))).toBeLessThanOrEqual(-2);
    // Through mix: three different kinds at one instant, each at -6 dBFS, sum well over the ceiling.
    const three = ['blip', 'ding', 'success'].map((kind, i) => ({ t: 0.2, scene: 'a', sceneIndex: 0, id: `x${i}`, kind, gain: 1, pan: 0 }));
    const out = mix({ duration: 1, events: three, sound: resolveSound({ space: { wet: 0 } }) });
    expect(out.report.sfxEvents).toBe(3);
    expect(out.report.peakDbfs).toBeLessThanOrEqual(-2);
    expect(out.report.peakDbfs).toBeGreaterThan(-3);
  });

  test('effects only: the loudest single effect peaks at -6 dBFS', () => {
    const one = [{ t: 0.1, scene: 'a', sceneIndex: 0, id: 'p', kind: 'pop', gain: 0.5, pan: 0 }];
    const r = mix({ duration: 1, events: one, sound: resolveSound({ space: { wet: 0 } }) });
    expect(r.report.peakDbfs).toBeCloseTo(-6, 3);
    // Pan and the room count: a riser panned 0.3 with the default space still peaks at -6 dBFS.
    const riser = [{ t: 0.1, scene: 'a', sceneIndex: 0, id: 'r', kind: 'riser', gain: 1, pan: 0.3 }];
    const panned = mix({ duration: 2, events: riser });
    expect(Math.abs(panned.report.peakDbfs + 6)).toBeLessThan(0.05);
  });

  test('acceptance 7: with voice the mix lands at -14 ± 1 LUFS, peak at or under -2.0 dBFS, effects ducked', () => {
    const clips = [{ t: 0.5, pcm: speechish(9) }, { t: 11, pcm: speechish(8, 3) }];
    const crest = (() => {
      const c = speechish(9);
      return 20 * Math.log10(peakOf(c) / Math.sqrt(c.reduce((s, x) => s + x * x, 0) / c.length));
    })();
    expect(crest).toBeGreaterThan(12);
    const r = mix({ duration: 20, events: events(20, 20), clips });
    expect(Math.abs(r.report.integratedLufs + 14)).toBeLessThanOrEqual(1);
    expect(r.report.peakDbfs).toBeLessThanOrEqual(-2);
    expect(r.report.voiceSeconds).toBeCloseTo(17, 6);
  });

  test('acceptance 6: 90 s, 60 events, 30 s of clips in under 1.5 s', () => {
    const clips = [0, 1, 2].map(i => ({ t: 5 + i * 28, pcm: speechish(10, i + 1) }));
    const t0 = performance.now();
    const r = mix({ duration: 90, events: events(60, 90), clips });
    const ms = performance.now() - t0;
    console.log(`audio: 90 s mix, 60 events (${r.report.sfxEvents} after coalesce), 30 s of clips: ${ms.toFixed(0)} ms, ${r.report.integratedLufs.toFixed(2)} LUFS, ${r.report.peakDbfs.toFixed(2)} dBFS`);
    // Runners took 530 to 920 ms when passing and up to 1770 ms when slow; a worse complexity class takes many times longer.
    expect(ms).toBeLessThan(ciLimit(1500, 2));
    expect(r.left.length).toBe(90 * SR);
  });
});
