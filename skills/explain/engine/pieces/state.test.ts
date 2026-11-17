/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import demo from '../../examples/pieces/state.scene.js';
import { buildScene, qaOfDemo, records, STYLES } from './harness-b.ts';
import { activeAt, pieces, stateLayout, transitionPath } from './state.js';

const a = { x: 100, y: 400, w: 300, h: 120 };
const b = { x: 700, y: 400, w: 300, h: 120 };

describe('transition geometry', () => {
  test('a pair A->B and B->A bows to opposite sides and both ends stay off the nodes', () => {
    const ab = transitionPath(a, b);
    const ba = transitionPath(b, a);
    expect(ab.mid[1]).toBeGreaterThan(520);
    expect(ba.mid[1]).toBeLessThan(400);
    const near = (r: any, p: number[]) => p[0] >= r.x - 14 && p[0] <= r.x + r.w + 14 && p[1] >= r.y - 14 && p[1] <= r.y + r.h + 14;
    expect(near(a, ab.pts[0]) && near(b, ab.pts[ab.pts.length - 1])).toBe(true);
    expect(near(b, ba.pts[0]) && near(a, ba.pts[ba.pts.length - 1])).toBe(true);
  });

  test('a label anchor on the arc clears the node heights', () => {
    const { mid } = transitionPath(a, b);
    expect(Math.abs(mid[1] - 460)).toBeGreaterThan(60 + 26);
  });

  test('self-loops leave and return on the same side of the node, above by default', () => {
    const up = transitionPath(a, a);
    expect(up.pts[0][1]).toBe(a.y);
    expect(up.pts[up.pts.length - 1][1]).toBe(a.y);
    expect(Math.min(...up.pts.map((p: number[]) => p[1]))).toBeLessThan(a.y - 50);
    const down = transitionPath(a, a, { down: true });
    expect(Math.max(...down.pts.map((p: number[]) => p[1]))).toBeGreaterThan(a.y + a.h + 50);
  });
});

describe('state layout and active path', () => {
  test('layout defaults: row up to four states, ring up to six, grid beyond', () => {
    const area = { x: 0, y: 0, w: 1800, h: 900 };
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}` }));
    const ys = (n: number) => new Set(Object.values<any>(stateLayout(mk(n), { area }).rects).map(r => Math.round(r.y))).size;
    expect(ys(3)).toBe(1);
    expect(ys(5)).toBeGreaterThan(1);
    expect(ys(8)).toBeGreaterThan(1);
  });

  test('the highlight hands over from state to state along the legs', () => {
    const legs = [null, [[0, 0], [100, 0]], [[100, 0], [100, 100]]];
    const o = { path: ['x', 'y', 'z'], T0: 2, step: 2, tdur: 0.8, legs };
    const at = (t: number) => activeAt(t, o);
    expect(at(1).lit.every((l: any) => l.alpha === 0)).toBe(true);
    expect(at(2.5).lit.map((l: any) => l.alpha)).toEqual([1, 0, 0]);
    const mid = at(3.6);
    expect(mid.travel!.k).toBe(1);
    expect(mid.lit[0].alpha).toBeGreaterThan(0);
    expect(mid.lit[0].alpha).toBeLessThan(1);
    expect(mid.lit[1].alpha).toBeCloseTo(1 - mid.lit[0].alpha, 6);
    expect(at(4.4).lit.map((l: any) => l.alpha)).toEqual([0, 1, 0]);
    expect(at(9).lit.map((l: any) => l.alpha)).toEqual([0, 0, 1]);
    expect(at(9).travel).toBeNull();
  });
});

describe('stateMachine piece', () => {
  const make = (o: any = {}) => buildScene(s => s.stateMachine({ id: 'sm', area: { x: 100, y: 200, w: 1700, h: 700 }, states: ['A', 'B', 'C'], transitions: [['A', 'B', 'ir'], ['B', 'A', 'volver'], ['C', 'C', 'otra']], ...o }), pieces);

  test('registers states, one arc per transition and label chips', () => {
    const ids = Object.keys(records(make().engine, 9));
    expect(ids).toEqual(expect.arrayContaining(['A', 'B', 'C', 'sm-t0', 'sm-t1', 'sm-t2', 'sm-t0-label', 'sm-t2-label']));
  });

  test('unknown states fail at build time', () => {
    expect(() => make({ transitions: [['A', 'Z']] })).toThrow('unknown state');
    expect(() => make({ path: ['A', 'Z'] })).toThrow('unknown state');
  });

  for (const [name, style] of STYLES) {
    test(`demo passes the QA gate (${name})`, () => {
      expect(qaOfDemo(demo, pieces, style).errors).toEqual([]);
    });
  }
});
