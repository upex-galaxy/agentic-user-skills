import { describe, expect, test } from 'bun:test';
import { anchors, connect, createRegistry, grid, nearestEdge, radial, row, stack, tree } from './layout.js';

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe('row / stack / grid', () => {
  test('row places items left to right with gap and centers the cross axis', () => {
    const L = row([{ id: 'a', w: 100, h: 50 }, { id: 'b', w: 100, h: 100 }], { gap: 20, x: 10, y: 5 });
    expect(L.rects.a).toEqual({ x: 10, y: 30, w: 100, h: 50 });
    expect(L.rects.b).toEqual({ x: 130, y: 5, w: 100, h: 100 });
    expect(L.bounds).toEqual({ x: 10, y: 5, w: 220, h: 100 });
  });

  test('row centers inside an area', () => {
    const L = row([{ id: 'a', w: 200, h: 100 }], { area: { x: 0, y: 0, w: 1000, h: 500 } });
    expect(L.rects.a).toEqual({ x: 400, y: 200, w: 200, h: 100 });
  });

  test('row shrinks uniformly when it does not fit the area', () => {
    const L = row([{ id: 'a', w: 1000, h: 100 }, { id: 'b', w: 1000, h: 100 }], { gap: 0, area: { x: 0, y: 0, w: 1000, h: 500 } });
    near(L.scale, 0.5);
    expect(L.bounds.w).toBeLessThanOrEqual(1000);
    near(L.rects.a.w, 500);
  });

  test('stack places items top to bottom', () => {
    const L = stack([{ id: 'a', w: 100, h: 40 }, { id: 'b', w: 60, h: 40 }], { gap: 10, x: 0, y: 0 });
    expect(L.rects.a).toEqual({ x: 0, y: 0, w: 100, h: 40 });
    expect(L.rects.b).toEqual({ x: 20, y: 50, w: 60, h: 40 });
  });

  test('grid fills rows of `cols`', () => {
    const L = grid(['a', 'b', 'c'], { cols: 2, w: 100, h: 50, gap: 10, x: 0, y: 0 });
    expect(L.rects.a).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    expect(L.rects.b).toEqual({ x: 110, y: 0, w: 100, h: 50 });
    expect(L.rects.c).toEqual({ x: 0, y: 60, w: 100, h: 50 });
  });
});

describe('radial / tree', () => {
  test('radial puts the hub in the middle and keeps ring items apart', () => {
    const L = radial(['a', 'b', 'c', 'd'], { hub: { id: 'hub', w: 200, h: 100 }, w: 160, h: 80, x: 0, y: 0 });
    const hub = L.rects.hub;
    const ring = ['a', 'b', 'c', 'd'].map(id => L.rects[id]);
    for (const r of ring) {
      const overlap = !(r.x + r.w <= hub.x || hub.x + hub.w <= r.x || r.y + r.h <= hub.y || hub.y + hub.h <= r.y);
      expect(overlap).toBe(false);
    }
    for (let i = 0; i < ring.length; i++) {
      for (let j = i + 1; j < ring.length; j++) {
        const a = ring[i];
        const b = ring[j];
        expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
      }
    }
  });

  test('tree centers a parent over its children and lists edges', () => {
    const L = tree({ id: 'root', children: [{ id: 'l' }, { id: 'r' }] }, { w: 100, h: 40, gapX: 20, gapY: 60, x: 0, y: 0 });
    expect(L.edges).toEqual([['root', 'l'], ['root', 'r']]);
    const mid = (id: string) => L.rects[id].x + L.rects[id].w / 2;
    near(mid('root'), (mid('l') + mid('r')) / 2);
    expect(L.rects.l.y).toBeGreaterThan(L.rects.root.y + 40);
  });

  test('tree can grow to the right', () => {
    const L = tree({ id: 'root', children: [{ id: 'k' }] }, { dir: 'right', w: 100, h: 40, x: 0, y: 0 });
    expect(L.rects.k.x).toBeGreaterThan(L.rects.root.x + 100);
  });
});

describe('anchors and connect', () => {
  const r = { x: 100, y: 200, w: 200, h: 100 };

  test('anchors cover edges, center and corners', () => {
    const a = anchors(r);
    expect(a.top).toEqual([200, 200]);
    expect(a.bottom).toEqual([200, 300]);
    expect(a.left).toEqual([100, 250]);
    expect(a.right).toEqual([300, 250]);
    expect(a.center).toEqual([200, 250]);
    expect(a.br).toEqual([300, 300]);
  });

  test('nearestEdge leaves the rect toward a point', () => {
    expect(nearestEdge(r, [1000, 250])).toEqual([300, 250]);
    expect(nearestEdge(r, [200, -500])).toEqual([200, 200]);
    const [x, y] = nearestEdge(r, [400, 350]);
    near(x, 300);
    near(y, 300);
  });

  test('connect picks facing sides and keeps the gap', () => {
    const reg = createRegistry();
    reg.add('a', { x: 0, y: 0, w: 100, h: 100 });
    reg.add('b', { x: 300, y: 0, w: 100, h: 100 });
    const c = connect(reg, 'a', 'b', { gap: 10 });
    expect(c.from.anchor).toBe('right');
    expect(c.to.anchor).toBe('left');
    expect(c.pts[0]).toEqual([110, 50]);
    expect(c.pts[1]).toEqual([290, 50]);
  });

  test('connect goes vertical when the elements are stacked', () => {
    const reg = createRegistry();
    reg.add('a', { x: 0, y: 0, w: 100, h: 100 });
    reg.add('b', { x: 0, y: 300, w: 100, h: 100 });
    const c = reg.connect('a', 'b', { gap: 0 });
    expect(c.from.anchor).toBe('bottom');
    expect(c.pts).toEqual([[50, 100], [50, 300]]);
  });

  test('connect supports explicit anchors and elbow routes', () => {
    const reg = createRegistry();
    reg.add('a', { x: 0, y: 0, w: 100, h: 100 });
    reg.add('b', { x: 300, y: 200, w: 100, h: 100 });
    const c = reg.connect('a', 'b', { from: 'right', to: 'left', route: 'elbow', gap: 0 });
    expect(c.pts).toEqual([[100, 50], [200, 50], [200, 250], [300, 250]]);
  });

  test('registry rejects unknown and duplicate ids', () => {
    const reg = createRegistry();
    reg.add('a', { x: 0, y: 0, w: 1, h: 1 });
    expect(() => reg.add('a', { x: 0, y: 0, w: 1, h: 1 })).toThrow('Duplicate');
    expect(() => reg.get('nope')).toThrow('Unknown element id "nope"');
  });
});
