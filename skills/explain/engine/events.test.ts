/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import gallery from '../examples/gallery.scene.js';
import { createEngine, kit } from './index.js';
import { installRoughStub, makeStubCtx } from './stub-ctx.ts';
import { sketch } from './test-presets.ts';

const build = (spec: any, narration?: any) => {
  const stub = makeStubCtx(0.55);
  installRoughStub(stub.log);
  return createEngine({ canvas: stub.canvas, style: sketch, spec, narration });
};

const two = (first: any = {}) => ({
  scenes: [
    { name: 'a', dur: 8, say: 'x', transition: { type: 'crossfade', dur: 0.6 }, build() {}, ...first },
    { name: 'b', dur: 4, build() {} },
  ],
});

describe('engine.events', () => {
  test('the gallery gives the same events in two builds', () => {
    const a = build(gallery(kit)).events();
    const b = build(gallery(kit)).events();
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
    for (let i = 1; i < a.length; i++) { expect(a[i].t).toBeGreaterThanOrEqual(a[i - 1].t); }
  });

  test('transition events carry the sound of the outgoing type', () => {
    const spec = {
      scenes: [
        { name: 'a', dur: 4, transition: { type: 'crossfade', dur: 0.6 }, build() {} },
        { name: 'b', dur: 4, transition: 'glitch', build() {} },
        { name: 'c', dur: 4, transition: 'zoom-through', build() {} },
        { name: 'd', dur: 4, transition: { type: 'crossfade', dur: 0 }, build() {} },
        { name: 'e', dur: 4, build() {} },
      ],
    };
    const e = build(spec);
    const ev = e.events();
    expect(ev.map((x: any) => [x.id, x.kind, x.gain, x.pan])).toEqual([
      ['transition:a', 'whoosh', 0.7, 0],
      ['transition:b', 'glitch', 0.7, 0],
      ['transition:c', 'riser', 0.7, 0],
    ]);
    const a = e.scenes[0];
    expect(ev[0].t).toBeCloseTo(a.start + a.dur - 0.6, 9);
  });

  test('piece cues, sound options and s.sfx', () => {
    const spec = {
      scenes: [{
        name: 'a',
        dur: 6,
        build(s: any) {
          s.stamp({ id: 'st', text: 'OK', cx: 960, cy: 400, at: 1 });
          s.stamp({ id: 'quiet', text: 'OK', cx: 400, cy: 700, at: 2, sound: false });
          s.stamp({ id: 'loud', text: 'OK', cx: 1500, cy: 700, at: 3, sound: 'blip' });
          s.counter({ id: 'n', x: 100, y: 100, w: 400, h: 200, to: 10, at: 0.5, dur: 1, sound: true });
          s.sfx({ kind: 'riser', at: 5, gain: 0.5, pan: -0.2 });
          s.sfx({ kind: 'pop', at: 99 });
        },
      }],
    };
    const ev = build(spec).events();
    const by = (id: string) => ev.filter((x: any) => x.id.includes(id));
    expect(by(':st:cue0')).toMatchObject([{ kind: 'stamp', gain: 1, pan: 0 }]);
    expect(by(':st:cue0')[0].t).toBeCloseTo(1.22, 9);
    expect(by(':quiet:')).toEqual([]);
    expect(by(':loud:').map((x: any) => [x.kind, x.t])).toEqual([['stamp', 3.22], ['blip', 3]].sort((p: any, q: any) => p[1] - q[1]));
    expect(by(':n:').filter((x: any) => x.kind === 'tick').length).toBe(3);
    // The pop at 99 s is past its scene: dropped from the mix, listed for QA's cue-after-end.
    expect(build(spec).droppedEvents().map((x: any) => x.kind)).toEqual(['pop']);
    expect(by(':n:').filter((x: any) => x.kind === 'ding').length).toBe(1);
    expect(by(':n:sound')).toMatchObject([{ kind: 'pop', t: 0.5 }]);
    expect(by('sfx')).toMatchObject([{ kind: 'riser', t: 5, gain: 0.5, pan: -0.2 }]);
    expect(by('sfx')).toHaveLength(1);
  });

  test('s.sfx and sound options reject an unknown kind', () => {
    const run = (fn: (s: any) => void) => () => build({ scenes: [{ name: 'a', dur: 2, build: fn }] });
    expect(run(s => s.sfx({ kind: 'boing' }))).toThrow(/unknown kind "boing".*pop/);
    expect(run(s => s.stamp({ text: 'x', cx: 500, cy: 500, sound: 'boing' }))).toThrow(/unknown sound "boing"/);
  });
});

describe('narration timing', () => {
  const narration = { cues: [{ id: '0.0', seconds: 9 }] };

  test('a scene stretches to its clip, and fit: false keeps the authored dur', () => {
    const e = build(two(), narration);
    expect(e.narrated).toBe(true);
    expect(e.scenes[0].dur).toBeCloseTo(0.3 + 9 + 0.5 + 0.6, 9);
    expect(e.scenes[1].start).toBeCloseTo(e.scenes[0].dur - 0.6, 9);
    expect(build(two({ fit: false }), narration).scenes[0].dur).toBe(8);
    expect(e.voice).toMatchObject([{ id: '0.0', scene: 'a', sceneIndex: 0, t: 0.3, at: 0.3, end: 9.3, seconds: 9, text: 'x', estimated: false }]);
  });

  test('voice off: durations untouched, voice windows estimated', () => {
    const e = build(two());
    expect(e.narrated).toBe(false);
    expect(e.scenes[0].dur).toBe(8);
    expect(e.voice[0]).toMatchObject({ estimated: true, at: 0.3 });
  });

  test('s.voice reaches build with voice on and off', () => {
    for (const narr of [undefined, narration]) {
      let seen: any;
      const spec = two({
        build(s: any) {
          seen = s.voice;
          s.sfx({ kind: 'pop', at: s.voice[0].end });
        },
      });
      const e = build(spec, narr);
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ at: 0.3, text: 'x' });
      expect(seen[0].end).toBeCloseTo(narr ? 9.3 : 0.3 + 0.6, 9);
      expect(e.events().find((x: any) => x.kind === 'pop').t).toBeCloseTo(seen[0].end, 9);
    }
  });

  test('s.cue finds a beat window by key or index, and names the keys on a miss', () => {
    let got: any;
    build({ scenes: [{ name: 'a', dur: 8, say: [{ text: 'uno', key: 'tests' }, 'dos'], build(s: any) {
      got = [s.cue('tests'), s.cue(1)];
      expect(() => s.cue('nope')).toThrow('keys: tests; 2 beats');
    } }] });
    expect(got[0]).toMatchObject({ at: 0.3, key: 'tests', text: 'uno' });
    expect(got[1]).toMatchObject({ text: 'dos' });
    expect('key' in got[1]).toBe(false);
  });
});
