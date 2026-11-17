/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import { createEngine } from '../core.js';
import { runQA } from '../qa.js';
import { installRoughStub, makeStubCtx } from '../stub-ctx.ts';
import hologram from '../styles/hologram.js';
import sketch from '../styles/sketch.js';
import { basePieces } from './base.js';

import { along, flowLayout, pieces } from './flow.js';

const build = (style: any, fn: (s: any) => void, dur = 12) => {
  const stub = makeStubCtx(0.55);
  if (style === sketch) { installRoughStub(stub.log); }
  return createEngine({ canvas: stub.canvas, style, pieces: { ...basePieces, ...pieces }, spec: { scenes: [{ name: 't', dur, build: fn }] } });
};
const area = { x: 80, y: 80, w: 1760, h: 920 };
const apart = (a: any, b: any) => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
const steps = ['Código', 'Build', 'Pruebas', 'Revisión', 'Despliegue'];

describe('flowLayout', () => {
  test('row: left to right, same height, inside the area, with room for the dot', () => {
    const r = flowLayout(5, area);
    r.forEach((q: any, i: number) => {
      expect(q.x).toBeGreaterThanOrEqual(area.x - 0.5);
      expect(q.x + q.w).toBeLessThanOrEqual(area.x + area.w + 0.5);
      if (i) { expect(q.x - (r[i - 1].x + r[i - 1].w)).toBeGreaterThan(60); }
    });
  });

  test('snake: odd rows run right to left, so consecutive steps stay adjacent', () => {
    const r = flowLayout(6, area, { layout: 'snake', cols: 3 });
    expect(r[3].x).toBeCloseTo(r[2].x, 6);
    expect(r[5].x).toBeCloseTo(r[0].x, 6);
    expect(r[3].y).toBeGreaterThan(r[2].y);
    for (let i = 0; i < r.length; i++) { for (let j = i + 1; j < r.length; j++) { expect(apart(r[i], r[j])).toBe(true); } }
  });

  test('along walks a polyline', () => {
    expect(along([[0, 0], [10, 0], [10, 10]], 0.5)).toEqual([10, 0]);
    expect(along([[0, 0], [10, 0]], 1)).toEqual([10, 0]);
  });
});

describe('flow', () => {
  for (const [name, layout] of [['row', 'row'], ['snake', 'snake']] as const) {
    for (const style of [hologram, sketch]) {
      test(`items, ids, dot only on links, gate passes (${name}, ${style.name})`, () => {
        let main: any;
        const engine = build(style, (s: any) => {
          main = s.flow({ id: 'ci', steps, layout, at: 0.2 });
          expect(steps.map((_: any, i: number) => s.reg.has(`ci-${i + 1}`)).every(Boolean)).toBe(true);
          expect(s.items.length).toBe(5 + 4 + 1);
        });
        expect(main.ids).toEqual(['ci-1', 'ci-2', 'ci-3', 'ci-4', 'ci-5']);
        const dot = (t: number) => engine.sample(t)[0].records.find((r: any) => r.id === 'ci').alpha;
        expect(dot(0.5)).toBe(0);
        const l1 = 0.2 + 5 * 0.35 + 0.6;
        expect(dot(l1 + 0.45)).toBeGreaterThan(0.9);
        expect(dot(11.9)).toBe(0);
        const times = [0, 1, 2, l1 + 0.45, l1 + 2.2, l1 + 3.4, 11];
        expect(runQA(engine, times, { determinism: false }).ok).toBe(true);
        for (const t of times) { engine.render(t); }
      });
    }
  }

  test('a link to an unknown step fails at build time', () => {
    expect(() => build(hologram, (s: any) => s.flow({ id: 'f', steps, links: [['f-1', 'nope']] }))).toThrow(/unknown step/);
  });

  test('custom ids and links are honored', () => {
    const engine = build(hologram, (s: any) => {
      s.flow({ id: 'f', steps: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }], links: [['a', 'b'], ['a', 'c']] });
      expect(s.reg.has('a') && s.reg.has('c')).toBe(true);
    });
    expect(engine.texts().map((x: any) => x.text)).toEqual(['A', 'B', 'C']);
  });
});
