/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import { DEFAULT_FX, parseTransition, TRANSITION_TYPES, transitionFx, transitionLook } from './transitions.js';

const TYPES = ['crossfade', 'push-zoom', 'light-sweep', 'wipe', 'zoom-through', 'slide', 'iris', 'drop', 'glitch'];
const look = (type: string, side: string, p: number, extra: any = {}) =>
  transitionLook(parseTransition({ type, ...extra }), side as any, p, 1920, 1080);

describe('transitions', () => {
  test('lists all 9 types', () => {
    expect(TRANSITION_TYPES()).toEqual(TYPES);
  });

  test('every type gives finite look fields at p 0, 0.5, 1 on both sides', () => {
    for (const type of TYPES) {
      for (const side of ['in', 'out']) {
        for (const p of [0, 0.5, 1]) {
          for (const [k, v] of Object.entries(look(type, side, p))) {
            if (k === 'origin') { continue; }
            expect(Number.isFinite(v as number)).toBe(true);
          }
        }
      }
    }
  });

  test('entering look is at rest at p 1, leaving look at p 0', () => {
    for (const type of TYPES) {
      const i = look(type, 'in', 1);
      expect(i.sa).toBeCloseTo(1, 6);
      expect(i.scale ?? 1).toBeCloseTo(1, 6);
      expect(i.dx ?? 0).toBeCloseTo(0, 6);
      expect(i.dy ?? 0).toBeCloseTo(0, 6);
      expect(i.rot ?? 0).toBeCloseTo(0, 6);
      expect(i.wipe ?? 1).toBeCloseTo(1, 6);
      expect(i.iris ?? 1).toBeCloseTo(1, 6);
      const o = look(type, 'out', 0);
      expect(o.sa).toBeCloseTo(1, 6);
      expect(o.scale ?? 1).toBeCloseTo(1, 6);
      expect(o.dx ?? 0).toBeCloseTo(0, 6);
      expect(o.dy ?? 0).toBeCloseTo(0, 6);
      expect(o.rot ?? 0).toBeCloseTo(0, 6);
    }
  });

  test('slide directions shift the right way', () => {
    expect(look('slide', 'out', 0.5).dx).toBeLessThan(0);
    expect(look('slide', 'in', 0.5).dx).toBeGreaterThan(0);
    expect(look('slide', 'out', 0.5, { dir: 'right' }).dx).toBeGreaterThan(0);
    expect(look('slide', 'in', 0.5, { dir: 'right' }).dx).toBeLessThan(0);
    expect(look('slide', 'out', 0.5, { dir: 'up' }).dy).toBeLessThan(0);
    expect(look('slide', 'in', 0.5, { dir: 'up' }).dy).toBeGreaterThan(0);
    expect(look('slide', 'out', 0.5, { dir: 'down' }).dy).toBeGreaterThan(0);
    expect(look('slide', 'in', 0.5, { dir: 'down' }).dy).toBeLessThan(0);
    expect(look('slide', 'out', 0.5, { dir: 'up' }).dx).toBeUndefined();
  });

  test('zoom-through zooms into an id or point origin, default 6', () => {
    expect(look('zoom-through', 'out', 0.5, { origin: 'box' }).origin).toBe('box');
    expect(look('zoom-through', 'in', 0.5, { origin: 'box' }).origin).toBe('box');
    expect(look('zoom-through', 'out', 1, { origin: [10, 20] }).origin).toEqual([10, 20]);
    expect(look('zoom-through', 'out', 1).scale).toBeCloseTo(6, 6);
    expect(look('zoom-through', 'out', 1, { zoom: 3 }).scale).toBeCloseTo(3, 6);
  });

  test('iris keeps its origin on both sides and opens fully', () => {
    expect(look('iris', 'in', 0.5, { origin: 'x' }).origin).toBe('x');
    expect(look('iris', 'out', 0.5, { origin: 'x' }).origin).toBe('x');
    expect(look('iris', 'in', 0).iris).toBeCloseTo(0, 6);
  });

  test('glitch cuts hard at the middle', () => {
    expect(look('glitch', 'out', 0.4).sa).toBe(1);
    expect(look('glitch', 'out', 0.6).sa).toBe(0);
    expect(look('glitch', 'in', 0.4).sa).toBe(0);
    expect(look('glitch', 'in', 0.6).sa).toBe(1);
  });

  test('unknown type error lists all 9', () => {
    expect(() => parseTransition('nope')).toThrow(TYPES.join(', '));
  });

  test('transitionFx lists the effects; defaults exist', () => {
    const fx = (t: string) => transitionFx(parseTransition(t));
    expect(fx('light-sweep')).toEqual(['sweep']);
    expect(fx('wipe')).toEqual(['edge']);
    expect(fx('zoom-through')).toEqual(['flash']);
    expect(fx('iris')).toEqual(['ring']);
    expect(fx('glitch')).toEqual(['glitch']);
    expect(fx('crossfade')).toEqual([]);
    for (const n of ['sweep', 'edge', 'flash', 'ring', 'glitch']) { expect(typeof (DEFAULT_FX)[n]).toBe('function'); }
  });
});
