/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import { cueId, estimateSeconds, fitDur, formatCover, layoutCues, sayOf, scriptCover, specCues } from './narration.js';
import { decodeWav, encodeWav, wavSeconds } from './wav.js';

describe('narration cues', () => {
  test('say as a string, strings and beats', () => {
    expect(sayOf({ say: ' Hola. ' })).toEqual([{ text: 'Hola.', spoken: 'Hola.' }]);
    expect(sayOf({ say: ['a', { text: 'b', spoken: 'be', at: 2 }] })).toEqual([{ text: 'a', spoken: 'a' }, { text: 'b', spoken: 'be', at: 2 }]);
    expect(sayOf({})).toEqual([]);
    expect(() => sayOf({ name: 'x', say: [{ text: '' }] })).toThrow('say[0]');
    expect(() => sayOf({ name: 'x', say: [{ text: 'a', at: -1 }] })).toThrow('at must be');
  });

  test('specCues ids by position, default scene names', () => {
    const cues = specCues({ scenes: [{ dur: 1, say: 'uno' }, { name: 'b', dur: 1 }, { name: 'c', dur: 1, say: ['x', 'y'] }] });
    expect(cues.map((c: any) => [c.id, c.scene, c.text])).toEqual([['0.0', 'scene-1', 'uno'], ['2.0', 'c', 'x'], ['2.1', 'c', 'y']]);
    expect(cueId(3, 1)).toBe('3.1');
  });

  test('layout: first cue after trIn, next after the previous clip, explicit at wins', () => {
    const cues = [{ id: '0.0', text: 'a'.repeat(30) }, { id: '0.1', text: 'b' }, { id: '0.2', text: 'c', at: 7 }];
    const real = layoutCues(cues, { trIn: 0.6, seconds: (id: string) => ({ '0.0': 2, '0.1': 1 } as Record<string, number>)[id] });
    expect(real[0]).toMatchObject({ at: 0.7, end: 2.7, estimated: false });
    expect(real[1].at).toBeCloseTo(2.95, 9);
    expect(real[2]).toMatchObject({ at: 7, estimated: true });
    expect(layoutCues(cues)[0]).toMatchObject({ at: 0.3, seconds: 2, estimated: true });
    expect(estimateSeconds('x')).toBe(0.6);
  });

  test('hold and key: validated, kept only when set, hold widens the gap and the fitted tail', () => {
    expect(sayOf({ say: [{ text: 'a', hold: 1.2, key: ' tests ' }] })).toEqual([{ text: 'a', spoken: 'a', hold: 1.2, key: 'tests' }]);
    expect(() => sayOf({ name: 'x', say: [{ text: 'a', hold: 3 }] })).toThrow('hold must be 0 to 2.5');
    expect(() => sayOf({ name: 'x', say: [{ text: 'a', key: '' }] })).toThrow('key must be');
    expect(() => sayOf({ name: 'x', say: [{ text: 'a', key: 'k' }, { text: 'b', key: 'k' }] })).toThrow('repeats');
    const lay = layoutCues([{ id: '0.0', text: 'a', hold: 1 }, { id: '0.1', text: 'b', hold: 2 }], { seconds: () => 2 });
    expect(lay[0]).toMatchObject({ at: 0.3, end: 2.3, hold: 1 });
    expect(lay[1].at).toBeCloseTo(2.3 + 1 + 0.25, 9);
    expect(fitDur(1, lay, 0.5)).toBeCloseTo(lay[1].end + 2 + 0.5 + 0.5, 9);
  });

  test('scriptCover and formatCover mark a scene whose script is under half its dur', () => {
    const cover = scriptCover({ scenes: [{ name: 'a', dur: 10, say: 'x'.repeat(30) }, { name: 'b', dur: 4 }, { name: 'c', dur: 4, say: ['y'.repeat(30), { text: 'dos palabras', spoken: 'z'.repeat(30) }] }] });
    expect(cover.map((c: any) => [c.scene, c.speech, c.words])).toEqual([['a', 2, 1], ['c', 4, 3]]);
    const lines = formatCover(cover);
    expect(lines[0]).toContain('2 narrated scenes, about 6 s');
    expect(lines[1]).toMatch(/^ {2}THIN a:/);
    expect(lines[2]).toMatch(/^ {2}ok {3}c:.*\(100%\)/);
    expect(lines.at(-1)).toContain('before generating');
    expect(formatCover([])).toEqual([]);
  });

  test('fitDur stretches only when the narration needs it', () => {
    const lay = layoutCues([{ id: '0.0', text: 'x' }], { seconds: () => 9 });
    expect(fitDur(8, lay, 0.6)).toBeCloseTo(0.3 + 9 + 0.5 + 0.6, 9);
    expect(fitDur(20, lay, 0.6)).toBe(20);
    expect(fitDur(8, [], 0.6)).toBe(8);
  });
});

describe('wav codec', () => {
  test('round trip mono and stereo within 16-bit precision', () => {
    const a = Float32Array.from({ length: 480 }, (_, i) => Math.sin(i / 7) * 0.8);
    const b = Float32Array.from({ length: 480 }, (_, i) => Math.cos(i / 5) * -0.5);
    for (const ch of [[a], [a, b]]) {
      const w = decodeWav(encodeWav(ch, 24000));
      expect(w.sampleRate).toBe(24000);
      expect(w.channels.length).toBe(ch.length);
      w.channels.forEach((c: Float32Array, k: number) => c.forEach((v: number, i: number) => expect(Math.abs(v - ch[k][i])).toBeLessThan(1 / 16000)));
      expect(wavSeconds(w)).toBeCloseTo(0.02, 9);
    }
  });

  test('walks extra chunks before data and reads float WAV', () => {
    const pcm = encodeWav([Float32Array.from([0.5, -0.5])], 8000);
    // Insert a LIST chunk between fmt and data.
    const extra = new Uint8Array([...'LIST'].map(c => c.charCodeAt(0)).concat([4, 0, 0, 0, 1, 2, 3, 4]));
    const spliced = new Uint8Array([...pcm.slice(0, 36), ...extra, ...pcm.slice(36)]);
    expect(Array.from(decodeWav(spliced).channels[0]).map((v: any) => Math.round(v * 2) / 2)).toEqual([0.5, -0.5]);
    const f = new Uint8Array(pcm.length + 4);
    f.set(pcm.slice(0, 44));
    const dv = new DataView(f.buffer);
    dv.setUint16(20, 3, true);
    dv.setUint16(34, 32, true);
    dv.setUint32(40, 8, true);
    dv.setFloat32(44, 0.25, true);
    dv.setFloat32(48, -1, true);
    expect(Array.from(decodeWav(f.slice(0, 52)).channels[0])).toEqual([0.25, -1]);
    expect(() => decodeWav(new Uint8Array(4))).toThrow('RIFF');
  });
});
