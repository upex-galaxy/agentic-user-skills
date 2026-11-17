/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import { createEngine } from '../core.js';
import { runQA } from '../qa.js';
import { installRoughStub, makeStubCtx } from '../stub-ctx.ts';
import hologram from '../styles/hologram.js';
import sketch from '../styles/sketch.js';
import { basePieces } from './base.js';

import { curve, mapLayout, pieces } from './mindmap.js';

const build = (style: any, fn: (s: any) => void, dur = 14) => {
  const stub = makeStubCtx(0.55);
  if (style === sketch) { installRoughStub(stub.log); }
  return createEngine({ canvas: stub.canvas, style, pieces: { ...basePieces, ...pieces }, spec: { scenes: [{ name: 't', dur, build: fn }] } });
};
const area = { x: 80, y: 80, w: 1760, h: 920 };
const apart = (a: any, b: any) => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
const inside = (r: any) => r.x >= area.x - 0.5 && r.y >= area.y - 0.5 && r.x + r.w <= area.x + area.w + 0.5 && r.y + r.h <= area.y + area.h + 0.5;
const spec = {
  hub: 'Calidad',
  branches: [
    { text: 'Pruebas', children: ['Unitarias', 'E2E', 'API'] },
    { text: 'Procesos', children: ['Revisión', 'Releases'] },
    { text: 'Datos', children: ['Fixtures'] },
    { text: 'Métricas', children: ['Cobertura', 'Flaky', 'Tiempo'] },
    { text: 'Equipo' },
  ],
};

describe('mapLayout', () => {
  for (const [name, branches] of [['flat', spec.branches.map((b: any) => ({ text: b.text }))], ['two levels', spec.branches]] as const) {
    test(`nothing overlaps and everything stays in the area (${name})`, () => {
      const L = mapLayout(branches as any, area);
      const all = [L!.hub, ...L!.branches.flatMap((b: any) => [b.rect, ...b.leaves])];
      all.forEach((r: any) => expect(inside(r)).toBe(true));
      for (let i = 0; i < all.length; i++) { for (let j = i + 1; j < all.length; j++) { expect(apart(all[i], all[j])).toBe(true); } }
    });
  }

  test('branches go around the hub, leaves sit beyond their branch', () => {
    const L = mapLayout(spec.branches as any, area)!;
    const c = (r: any) => [r.x + r.w / 2, r.y + r.h / 2];
    const hub = c(L.hub);
    L.branches.forEach((b: any) => {
      const d = (r: any) => Math.hypot((c(r)[0] - hub[0]) / 1.9, c(r)[1] - hub[1]);
      b.leaves.forEach((l: any) => expect(d(l)).toBeGreaterThan(d(b.rect)));
    });
  });
});

describe('curve', () => {
  test('is not a straight line and ends on the rect borders', () => {
    const pts = curve({ x: 0, y: 0, w: 100, h: 50 }, { x: 500, y: 300, w: 100, h: 50 });
    const [a, b] = [pts[0], pts[pts.length - 1]];
    const mid = pts[Math.floor(pts.length / 2)];
    const off = Math.abs((b[0] - a[0]) * (a[1] - mid[1]) - (a[0] - mid[0]) * (b[1] - a[1])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
    expect(off).toBeGreaterThan(10);
  });
});

describe('mindMap', () => {
  for (const style of [hologram, sketch]) {
    test(`grows branch by branch, registers ids and passes the gate (${style.name})`, () => {
      let handle: any;
      const engine = build(style, (s: any) => {
        handle = s.mindMap({ id: 'mm', hub: spec.hub, branches: spec.branches, at: 0.2 });
        expect(s.reg.has('mm.hub') && s.reg.has('mm.b5') && s.reg.has('mm.b1.3')).toBe(true);
      });
      expect(handle.ids.branches).toHaveLength(5);
      expect(handle.ids.leaves.flat()).toHaveLength(9);
      const alpha = (t: number, id: string) => engine.sample(t)[0].records.find((r: any) => r.id === id)?.alpha ?? 0;
      expect(alpha(3, 'mm.b1')).toBeGreaterThan(0.05);
      expect(alpha(3, 'mm.b5')).toBeLessThan(0.05);
      expect(alpha(13, 'mm.b5')).toBeGreaterThan(0.9);
      expect(runQA(engine, [0, 1, 2, 4, 6, 9, 13], { determinism: false }).ok).toBe(true);
      for (const t of [0, 2, 5, 13]) { engine.render(t); }
    });
  }
});
