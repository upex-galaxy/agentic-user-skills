/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import demo from '../../examples/pieces/architecture.scene.js';
import { architectureLayout, pieces } from './architecture.js';
import { buildScene, qaOfDemo, records, STYLES } from './harness-b.ts';

const area = { x: 100, y: 100, w: 1600, h: 800 };
const zones = [
  { id: 'z1', nodes: [{ id: 'a' }, { id: 'b' }] },
  { id: 'z2', nodes: [{ id: 'c' }] },
  { id: 'z3', nodes: [{ id: 'd' }, { id: 'e' }, { id: 'f' }] },
];
const inside = (o: any, i: any) => i.x >= o.x - 0.5 && i.y >= o.y - 0.5 && i.x + i.w <= o.x + o.w + 0.5 && i.y + i.h <= o.y + o.h + 0.5;

describe('architecture layout', () => {
  test('layers stack top to bottom inside the area and every node sits inside its zone', () => {
    const L = architectureLayout({ zones, area, layout: 'layers' });
    const ys = zones.map(z => L.zones[z.id].y);
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
    for (const z of zones) {
      expect(inside(area, L.zones[z.id])).toBe(true);
      for (const n of z.nodes) { expect(inside(L.zones[z.id], L.nodes[n.id])).toBe(true); }
    }
  });

  test('columns put zones side by side with nodes stacked inside', () => {
    const L = architectureLayout({ zones, area, layout: 'columns' });
    expect(L.zones.z1.x).toBeLessThan(L.zones.z2.x);
    expect(L.zones.z2.x).toBeLessThan(L.zones.z3.x);
    expect(L.nodes.d.y).toBeLessThan(L.nodes.e.y);
    for (const z of zones) { for (const n of z.nodes) { expect(inside(L.zones[z.id], L.nodes[n.id])).toBe(true); } }
  });

  test('nodes of one zone never overlap', () => {
    const L = architectureLayout({ zones, area });
    expect(L.nodes.d.x + L.nodes.d.w).toBeLessThanOrEqual(L.nodes.e.x);
    expect(L.nodes.e.x + L.nodes.e.w).toBeLessThanOrEqual(L.nodes.f.x);
  });
});

describe('architecture piece', () => {
  const make = () => buildScene(s => s.architecture({ id: 'ar', area, zones: [{ id: 'z1', title: 'Uno', nodes: ['a', 'b'] }, { id: 'z2', title: 'Dos', nodes: ['c'] }], links: [['a', 'c', 'texto'], ['b', 'c']] }), pieces);

  test('reveals zones, then nodes, then links', () => {
    const { engine } = make();
    const first = (id: string) => [...Array.from({ length: 200 }).keys()].map(i => i * 0.05).find(t => (records(engine, t)[id]?.alpha ?? 0) > 0.05);
    const tz = first('z2');
    const tn = first('c');
    const tl = first('ar-link-0');
    expect(tz).toBeLessThan(tn!);
    expect(tn).toBeLessThan(tl!);
  });

  test('registers node and zone ids and the link label chips', () => {
    const ids = Object.keys(records(make().engine, 9));
    expect(ids).toEqual(expect.arrayContaining(['z1', 'z2', 'a', 'b', 'c', 'ar-link-0', 'ar-link-1', 'ar-link-0-label']));
    expect(ids).not.toContain('ar-link-1-label');
  });

  test('unknown link ends and empty zones fail at build time', () => {
    expect(() => buildScene(s => s.architecture({ area, zones: [{ id: 'z', nodes: ['a'] }], links: [['a', 'nope']] }), pieces)).toThrow('unknown node');
    expect(() => buildScene(s => s.architecture({ area, zones: [] }), pieces)).toThrow('needs zones');
  });

  for (const [name, style] of STYLES) {
    test(`demo passes the QA gate (${name})`, () => {
      expect(qaOfDemo(demo, pieces, style).errors).toEqual([]);
    });
  }
});
