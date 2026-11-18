/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import { createEngine } from '../core.js';
import { kf } from '../math.js';
import { runQA } from '../qa.js';
import { installRoughStub, makeStubCtx } from '../stub-ctx.ts';
import { hologram, sketch } from '../test-presets.ts';
import { basePieces } from './base.js';
import { pieces as icons } from './icons.js';
import { pieces } from './wrappers.js';

const build = (style: any, fn: (s: any) => void, dur = 6) => {
  const stub = makeStubCtx(0.55);
  if (style === sketch) { installRoughStub(stub.log); }
  const engine = createEngine({ canvas: stub.canvas, style, pieces: { ...basePieces, ...icons, ...pieces }, spec: { scenes: [{ name: 't', dur, build: fn }] } });
  return { engine, stub };
};
const rec = (engine: any, t: number, id: string) => engine.sample(t)[0].records.find((x: any) => x.id === id);
const R = { x: 800, y: 400, w: 320, h: 220 };

describe('wrappers', () => {
  for (const style of [hologram, sketch]) {
    test(`enter from off frame ends in frame and passes QA (${style.name})`, () => {
      const { engine } = build(style, (s: any) => {
        s.node({ id: 'a', text: 'Hola', rect: R, at: 0, dur: 0.1 });
        s.enter({ targets: 'a', at: 1, dur: 1, from: 'left' });
      });
      expect(rec(engine, 0.5, 'a').alpha).toBe(0);
      expect(rec(engine, 3, 'a').alpha).toBe(1);
      expect(rec(engine, 3, 'a').rect.x).toBeCloseTo(R.x, 3);
      expect(rec(engine, 1.1, 'a').alpha).toBe(0);
      expect(runQA(engine, [0, 0.5, 1, 1.1, 1.25, 1.5, 1.75, 2, 3, 5], { determinism: false }).ok).toBe(true);
    });

    test(`an animate that leaves the frame fails out-of-bounds (${style.name})`, () => {
      const { engine } = build(style, (s: any) => {
        s.node({ id: 'a', text: 'Hola', rect: R, at: 0, dur: 0.1 });
        s.animate({ targets: 'a', x: [[1, 0], [3, 1400]] });
      });
      const out = runQA(engine, [0.5, 2, 3, 5], { determinism: false });
      expect(out.ok).toBe(false);
      expect(JSON.stringify(out)).toContain('out-of-bounds');
      expect(rec(engine, 5, 'a').rect.x).toBeCloseTo(R.x + 1400, 3);
    });

    test(`iris hides the target from QA before p 0.5 (${style.name})`, () => {
      const { engine, stub } = build(style, (s: any) => {
        s.node({ id: 'a', text: 'Hola', rect: R, at: 0, dur: 0.1 });
        s.reveal({ targets: 'a', at: 1, dur: 2, shape: 'iris' });
      });
      expect(rec(engine, 0.5, 'a').alpha).toBe(0);
      expect(rec(engine, 1.8, 'a').alpha).toBe(0);
      expect(rec(engine, 2.4, 'a').alpha).toBe(1);
      expect(rec(engine, 4, 'a').alpha).toBe(1);
      engine.render(1.8);
      engine.render(4);
      expect(stub.log.length).toBeGreaterThan(0);
      expect(runQA(engine, [0.5, 1.8, 2.4, 4], { determinism: false }).ok).toBe(true);
    });
  }

  test('keyframe values at fixed t map the record', () => {
    expect(kf(2, [[1, 0], [3, 100]], 'linear')).toBe(50);
    const { engine } = build(hologram, (s: any) => {
      s.node({ id: 'a', text: 'Hola', rect: R, at: 0, dur: 0.1 });
      s.animate({ targets: 'a', x: [[1, 0], [3, 200]], y: [[1, 0], [3, -100]], scale: [[1, 1], [3, 2]], alpha: [[1, 1], [3, 0.5]], ease: 'linear' });
    });
    const r = rec(engine, 2, 'a');
    expect(r.rect.w).toBeCloseTo(R.w * 1.5, 3);
    expect(r.rect.h).toBeCloseTo(R.h * 1.5, 3);
    expect(r.rect.x + r.rect.w / 2).toBeCloseTo(R.x + R.w / 2 + 100, 3);
    expect(r.rect.y + r.rect.h / 2).toBeCloseTo(R.y + R.h / 2 - 50, 3);
    expect(r.alpha).toBeCloseTo(0.75, 3);
    const early = rec(engine, 0.2, 'a');
    expect(early.rect).toEqual(R);
    expect(early.texts[0].rect.w).toBeGreaterThan(0);
  });

  test('exit ends invisible; origin by id and shape errors', () => {
    const { engine } = build(hologram, (s: any) => {
      s.node({ id: 'a', text: 'Hola', rect: R, at: 0, dur: 0.1 });
      s.exit({ targets: ['a'], at: 2, dur: 1, to: 'pop' });
    });
    expect(rec(engine, 1, 'a').alpha).toBe(1);
    expect(rec(engine, 4, 'a').alpha).toBe(0);
    expect(() => build(hologram, (s: any) => s.enter({ targets: 'nope' }))).toThrow(/Create it first/);
    expect(() => build(hologram, (s: any) => {
      s.node({ id: 'a', text: 'Hola', rect: R, at: 0, dur: 0.1 });
      s.reveal({ targets: 'a', shape: 'star' });
    })).toThrow(/wipe/);
  });
});

describe('wrapper targets', () => {
  test('a composite id wraps the item and its children; a registered sub-rect throws a clear error', () => {
    const { engine } = build(hologram, (s: any) => {
      s.node({ id: 'a', text: 'Hola', rect: R, at: 0, dur: 0.1 });
      s.node({ id: 'a.sub', text: 'Hijo', rect: { x: 100, y: 400, w: 200, h: 100 }, at: 0, dur: 0.1 });
      s.node({ id: 'a-2', text: 'Otro', rect: { x: 100, y: 600, w: 200, h: 100 }, at: 0, dur: 0.1 });
      s.reg.add('host.body', { x: 10, y: 10, w: 50, h: 50 });
      s.animate({ targets: 'a', x: [[0, 0], [1, 100]], ease: 'linear' });
    });
    expect(rec(engine, 1, 'a').rect.x).toBeCloseTo(R.x + 100, 3);
    expect(rec(engine, 1, 'a.sub').rect.x).toBeCloseTo(100 + 100, 3);
    expect(rec(engine, 1, 'a-2').rect.x).toBeCloseTo(100 + 100, 3);
    expect(() => build(hologram, (s: any) => {
      s.reg.add('br.body', { x: 10, y: 10, w: 50, h: 50 });
      s.enter({ targets: 'br.body' });
    })).toThrow(/sub-rects of a composite|cannot be wrapped on its own[\s\S]*Target the composite id/);
    expect(() => build(hologram, (s: any) => s.enter({ targets: 'nope' }))).toThrow(/no item "nope"/);
  });
});
