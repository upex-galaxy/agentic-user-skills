/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import { summarizeReport } from '../cli/qa.ts';
import { auditAudio, densityIssues } from './audio-qa.js';
import { CLIP_SR, mix } from './audio.js';
import { createEngine } from './index.js';
import { narrationOf } from './page-audio.js';
import { defaultTimes, runQA } from './qa.js';
import { makeStubCtx } from './stub-ctx.ts';
import { hologram } from './test-presets.ts';
import { encodeWav } from './wav.js';

const LINE = 'A line of narration here.'; // 25 characters: clips of 0.75 s to 5 s are plausible
const sine = (seconds: number, amp = 0.3) => Float32Array.from({ length: Math.round(seconds * CLIP_SR) }, (_, i) => amp * Math.sin(2 * Math.PI * 220 * i / CLIP_SR));
const wavB64 = (pcm: Float32Array) => Buffer.from(encodeWav([pcm], CLIP_SR)).toString('base64');

interface Clip { id: string, pcm: Float32Array }
/** An audio object in the shape the page carries: one cue per clip, one embedded WAV per cue. */
const audioOf = (clips: Clip[], sound = true) => ({
  sound,
  narration: { cues: clips.map(c => ({ id: c.id, key: `k${c.id}`, seconds: c.pcm.length / CLIP_SR })), clips: Object.fromEntries(clips.map(c => [`k${c.id}`, wavB64(c.pcm)])) },
});
const clipsOf = (...secs: number[]) => secs.map((s, i) => ({ id: `0.${i}`, pcm: sine(s) }));

function build(scenes: any[], audio: any) {
  const stub = makeStubCtx(0.55);
  return createEngine({ canvas: stub.canvas, style: hologram, spec: { scenes }, narration: narrationOf(audio) });
}
const scene = (extra: any = {}) => ({ name: 'a', dur: 6, say: LINE, build() {}, ...extra });
const types = (list: any[]) => list.map(i => i.type);
const find = (list: any[], type: string) => list.find(i => i.type === type);

describe('audio qa: one fixture per error', () => {
  test('narration-overlap: two clips of one scene overlap', () => {
    const audio = audioOf(clipsOf(2, 2));
    const e = build([scene({ say: [{ text: LINE, at: 0.5 }, { text: LINE, at: 1 }] })], audio);
    const r = auditAudio(e, audio);
    const hit = find(r.errors, 'narration-overlap');
    expect(hit).toMatchObject({ scene: 'a', id: '0.0/0.1', t: 1 });
  });

  test('narration-window: a clip ends after dur - tr (fit: false)', () => {
    const audio = audioOf(clipsOf(2, 2));
    const e = build([scene({ dur: 5, fit: false, transition: { type: 'crossfade', dur: 0.6 }, say: [{ text: LINE, at: 3 }] }), { name: 'b', dur: 4, build() {} }], audio);
    const hit = find(auditAudio(e, audio).errors, 'narration-window');
    expect(hit).toMatchObject({ scene: 'a', id: '0.0', t: 3 });
    expect(hit.detail).toContain('ends at 5');
  });

  test('narration-window: a clip starts before the transition in ends', () => {
    const audio = audioOf([{ id: '1.0', pcm: sine(2) }]);
    const e = build([{ name: 'a', dur: 4, transition: { type: 'crossfade', dur: 1 }, build() {} }, { name: 'b', dur: 6, say: [{ text: LINE, at: 0.2 }], build() {} }], audio);
    const hit = find(auditAudio(e, audio).errors, 'narration-window');
    expect(hit).toMatchObject({ scene: 'b', id: '1.0' });
    expect(hit.detail).toContain('before');
  });

  test('with the voice off, estimated narration never fails the window checks (sound on)', () => {
    // 110 characters estimate to 7.3 s in a 4 s scene: only real clips are judged.
    const long = 'x'.repeat(110);
    const e = build([scene({ dur: 4, say: long }), { name: 'b', dur: 4, build() {} }], undefined);
    const r = auditAudio(e, { sound: true, narration: null });
    expect(types(r.errors)).toEqual([]);
  });

  test('voice-suspect counts the spoken characters the CLI recorded, not the display text', () => {
    const audio = audioOf(clipsOf(1.5));
    audio.narration.cues[0] = { ...audio.narration.cues[0], chars: 27 } as any;
    const e = build([scene({ say: [{ text: 'AWS', spoken: 'Amazon Web Services runs it' }] })], audio);
    expect(types(auditAudio(e, audio).errors)).not.toContain('voice-suspect');
  });

  test('cue-after-end: an effect timed past its scene is reported, not silently lost', () => {
    const e = build([scene({ say: undefined, build(s: any) { s.sfx({ kind: 'stamp', at: 9 }); } })], undefined);
    const r = auditAudio(e, { sound: true, narration: null });
    expect(find(r.warnings, 'cue-after-end')).toMatchObject({ scene: 'a' });
  });

  test('voice-missing: a cue has no clip', () => {
    const audio = audioOf(clipsOf(2));
    const e = build([scene({ say: [LINE, LINE] })], audio);
    const hit = find(auditAudio(e, audio).errors, 'voice-missing');
    expect(hit).toMatchObject({ scene: 'a', id: '0.1' });
    expect(hit.t).toBeGreaterThan(2);
  });

  test('voice-suspect: too short, too long and silent clips', () => {
    const short = audioOf(clipsOf(0.1));
    expect(find(auditAudio(build([scene()], short), short).errors, 'voice-suspect')).toMatchObject({ scene: 'a', id: '0.0', t: 0.3 });
    const long = audioOf([{ id: '0.0', pcm: sine(8) }]);
    expect(find(auditAudio(build([scene({ say: 'Hi there, you.' })], long), long).errors, 'voice-suspect').detail).toContain('over 0.2 s');
    const quiet = audioOf([{ id: '0.0', pcm: new Float32Array(2 * CLIP_SR) }]);
    expect(find(auditAudio(build([scene()], quiet), quiet).errors, 'voice-suspect').detail).toContain('RMS');
  });

  test('audio-clipping: the mix peaks above -1 dBFS', () => {
    const audio = audioOf(clipsOf(2));
    const e = build([scene()], audio);
    const loud = new Float32Array(48000).fill(0.99);
    const hit = find(auditAudio(e, audio, { pageMix: () => ({ left: loud, right: loud, report: { sfxEvents: 0, voiceSeconds: 2, events: [] } }) }).errors, 'audio-clipping');
    expect(hit).toMatchObject({ scene: '-', id: 'mix', t: 0 });
  });

  test('audio-nondeterministic: a second mix of the same input differs', () => {
    const audio = audioOf(clipsOf(2));
    const e = build([scene()], audio);
    const hit = find(auditAudio(e, audio, { mix: (...a: any[]) => {
      const out = (mix)(...a);
      out.left[100] += 1e-7;
      return out;
    } }).errors, 'audio-nondeterministic');
    expect(hit).toBeDefined();
  });
});

describe('audio qa: clean and silent pages', () => {
  const scenes = () => [
    scene({ transition: { type: 'crossfade', dur: 0.6 }, build(s: any) { s.sfx({ kind: 'pop', at: 1 }); } }),
    { name: 'b', dur: 4, say: LINE, build(s: any) { s.sfx({ kind: 'ding', at: 1.5 }); } },
  ];
  const audio = audioOf([{ id: '0.0', pcm: sine(2.5) }, { id: '1.0', pcm: sine(2.5) }]);

  test('a clean narrated fixture with sound on has no errors', () => {
    const e = build(scenes(), audio);
    const r = runQA(e, defaultTimes(e, 1), { audio, determinism: false });
    expect(r.errors.filter((x: any) => !['text-overflow', 'out-of-bounds'].includes(x.type))).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(r.audio.voiceSeconds).toBeCloseTo(5, 1);
    expect(r.audio.integratedLufs).toBeGreaterThan(-15.5);
    expect(r.audio.sfxEvents).toBeGreaterThan(0);
    expect(summarizeReport(r)).toMatch(/^audio: -1\d\.\d LUFS, peak -\d+\.\d dBFS, voice 5\.0 s, \d+ effects$/m);
  });

  test('a silent engine reports exactly what it did before', () => {
    const stub = () => createEngine({ canvas: makeStubCtx(0.55).canvas, style: hologram, spec: { scenes: [scene({ say: undefined })] } });
    const e = stub();
    const times = defaultTimes(e, 1);
    const base = runQA(e, times);
    expect(runQA(stub(), times, { audio: null })).toStrictEqual(base);
    expect('audio' in base).toBe(false);
  });
});

describe('audio qa: warnings', () => {
  test('silent-gap: a scene with no cue, and a gap over 3 s', () => {
    const audio = audioOf([{ id: '0.0', pcm: sine(2) }, { id: '2.0', pcm: sine(2) }]);
    const e = build([scene({ dur: 3 }), { name: 'mid', dur: 5, build() {} }, { name: 'c', dur: 4, say: LINE, build() {} }], audio);
    const w = auditAudio(e, audio).warnings.filter((x: any) => x.type === 'silent-gap');
    expect(w.map((x: any) => x.scene)).toContain('mid');
    expect(w.some((x: any) => x.id === '0.0/2.0')).toBe(true);
  });

  test('narration-sparse: a scene whose voice covers under half of it', () => {
    const audio = audioOf([{ id: '0.0', pcm: sine(2) }, { id: '1.0', pcm: sine(4) }]);
    const e = build([scene({ dur: 10 }), { name: 'b', dur: 6, say: LINE, build() {} }], audio);
    const w = auditAudio(e, audio).warnings.filter((x: any) => x.type === 'narration-sparse');
    expect(w.map((x: any) => x.scene)).toEqual(['a']);
    expect(w[0].detail).toContain('2 s of the scene\'s 10 s (20%');
  });

  test('loudness: voice off the -14 LUFS target', () => {
    const audio = audioOf(clipsOf(2));
    const e = build([scene()], audio);
    const quiet = Float32Array.from({ length: 48000 * 3 }, (_, i) => 0.01 * Math.sin(2 * Math.PI * 1000 * i / 48000));
    const r = auditAudio(e, audio, { pageMix: () => ({ left: quiet, right: quiet, report: { sfxEvents: 0, voiceSeconds: 2, events: [] } }) });
    expect(types(r.warnings)).toContain('loudness');
  });

  test('cue-after-end: an effect past its scene end', () => {
    const audio = { sound: true, narration: undefined } as any;
    const e = build([{ name: 'a', dur: 3, build(s: any) { s.sfx({ kind: 'pop', at: 1 }); } }], audio);
    const hit = find(auditAudio(e, audio, { events: [{ t: 3.5, scene: 'a', sceneIndex: 0, id: 'a:sfx0', kind: 'pop', gain: 1, pan: 0 }] }).warnings, 'cue-after-end');
    expect(hit).toMatchObject({ scene: 'a', id: 'a:sfx0', t: 3.5 });
  });

  test('sfx-density: more than 3 in a second or 12 in a scene', () => {
    const ev = (t: number) => ({ t, scene: 's', sceneIndex: 0 });
    expect(densityIssues([0, 0.2, 0.4, 0.6].map(ev))).toHaveLength(1);
    expect(densityIssues([0, 0.5, 1, 1.5, 2].map(ev))).toEqual([]);
    expect(densityIssues(Array.from({ length: 13 }, (_, i) => ev(i * 2)))[0].detail).toContain('13 effects in one scene');
  });
});
