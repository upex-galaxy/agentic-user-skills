/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import demo from '../../examples/pieces/state.scene.js';
import { buildScene, qaOfDemo, records, STYLES } from './harness-b.ts';
import { activeAt, autoStatePlan, pieces, routeTransitions, stateLayout, transitionPath } from './state.js';

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

describe('auto layout fills the content area', () => {
  const six = ['Nuevo', 'Abierto', 'En curso', 'En revisión', 'Aprobado', 'Cerrado'];
  const trs = [['Nuevo', 'Abierto', 'abrir'], ['Abierto', 'En curso', 'tomar'], ['En curso', 'En revisión', 'enviar'], ['En revisión', 'En curso', 'cambios'], ['En revisión', 'Aprobado', 'aprobar'], ['Aprobado', 'Cerrado', 'cerrar'], ['Cerrado', 'Nuevo', 'reabrir'], ['Cerrado', 'Cerrado', 'archivar']];
  const extent = (o: any) => {
    const { engine } = buildScene(s => s.stateMachine({ id: 'sm', ...o }), pieces, 12);
    const recs = engine.sample(11)[0].records.filter((r: any) => r.rect && !r.container);
    const x0 = Math.min(...recs.map((r: any) => r.rect.x));
    const y0 = Math.min(...recs.map((r: any) => r.rect.y));
    const x1 = Math.max(...recs.map((r: any) => r.rect.x + r.rect.w));
    const y1 = Math.max(...recs.map((r: any) => r.rect.y + r.rect.h));
    return { h: y1 - y0, w: x1 - x0, recs };
  };
  const apart = (rects: any[]) => rects.every((a, i) => rects.every((b, j) => i >= j || a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y));

  test('six states use at least 55 % of the content-area height after the engine fill', () => {
    const e = extent({ states: six, transitions: trs });
    expect(e.h).toBeGreaterThanOrEqual(0.55 * 636);
    expect(e.w).toBeLessThanOrEqual(1760 + 1);
  });

  test('transition labels and states do not overlap', () => {
    const { recs } = extent({ states: six, transitions: trs });
    const parts = recs.filter((r: any) => r.id.endsWith('-label') || six.includes(r.id));
    expect(parts.length).toBe(six.length + trs.length);
    expect(apart(parts.map((r: any) => r.rect))).toBe(true);
  });

  test('auto picks a wrapped layout for six states and a ring only without two-way pairs', () => {
    const area = { x: 80, y: 244, w: 1760, h: 636 };
    const states = six.map(id => ({ id }));
    const plan = autoStatePlan(states, trs.map(([from, to, label]) => ({ from, to, label })), area);
    expect(new Set(Object.values<any>(plan.rects).map(r => Math.round(r.y))).size).toBeGreaterThan(1);
    const cycle = autoStatePlan(states.slice(0, 3), [{ from: 'Nuevo', to: 'Abierto' }, { from: 'Abierto', to: 'En curso' }, { from: 'En curso', to: 'Nuevo' }], area);
    expect(['row', 'ring']).toContain(cycle.mode);
  });

  test('layout row keeps the one-row placement', () => {
    const e = extent({ states: ['A', 'B', 'C'], transitions: [['A', 'B', 'ir'], ['B', 'C', 'ir']], layout: 'row' });
    const ys = new Set(['A', 'B', 'C'].map(id => Math.round(e.recs.find((r: any) => r.id === id).rect.y)));
    expect(ys.size).toBe(1);
  });

  test('layout grid turns at the edge so consecutive states stay neighbors', () => {
    const rects = stateLayout(six.map(id => ({ id })), { area: { x: 0, y: 0, w: 1800, h: 900 }, layout: 'grid', cols: 3 }).rects;
    expect(Math.abs(rects['En revisión'].x - rects['En curso'].x)).toBeLessThan(1);
    expect(rects.Cerrado.x).toBeLessThan(rects['En revisión'].x);
  });

  test('routing keeps arcs off other states', () => {
    const rects = { A: { x: 0, y: 0, w: 200, h: 100 }, B: { x: 400, y: 0, w: 200, h: 100 }, C: { x: 800, y: 0, w: 200, h: 100 } };
    const [arc] = routeTransitions(rects, [{ from: 'A', to: 'C' }]);
    const b = rects.B;
    expect(arc.pts.some((q: number[]) => q[0] > b.x && q[0] < b.x + b.w && q[1] > b.y && q[1] < b.y + b.h)).toBe(false);
  });
});
