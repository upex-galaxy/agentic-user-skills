/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import { createEngine } from '../core.js';
import { runQA } from '../qa.js';
import { installRoughStub, makeStubCtx } from '../stub-ctx.ts';
import hologram from '../styles/hologram.js';
import sketch from '../styles/sketch.js';
import { basePieces } from './base.js';

import { pieces, timelineGeometry } from './timeline.js';

const build = (style: any, fn: (s: any) => void, dur = 10) => {
  const stub = makeStubCtx(0.55);
  if (style === sketch) { installRoughStub(stub.log); }
  return createEngine({ canvas: stub.canvas, style, pieces: { ...basePieces, ...pieces }, spec: { scenes: [{ name: 't', dur, build: fn }] } });
};
const area = { x: 80, y: 80, w: 1760, h: 920 };
const miles = [
  { label: 'Idea', date: '2024' },
  { label: 'Primer prototipo funcional', date: '2025' },
  { label: 'Pruebas con usuarios reales' },
  { label: 'Lanzamiento', date: 'Hoy' },
  { label: 'Escala' },
];

describe('timelineGeometry', () => {
  test('milestones are evenly spaced and labels alternate sides', () => {
    const g = timelineGeometry(5, area);
    expect(g.sides).toEqual(['above', 'below', 'above', 'below', 'above']);
    const gaps = g.xs.slice(1).map((x: any, i: number) => x - g.xs[i]);
    gaps.forEach((v: any) => expect(v).toBeCloseTo(g.spacing, 6));
    expect(g.labelW).toBeLessThan(g.spacing * 2);
    expect(g.xs[0] - g.labelW / 2).toBeGreaterThanOrEqual(area.x - 0.5);
  });

  test('a single milestone is centered', () => {
    const g = timelineGeometry(1, area);
    expect(g.xs[0]).toBeCloseTo(area.x + area.w / 2, 6);
  });
});

describe('timeline', () => {
  for (const style of [hologram, sketch]) {
    test(`marker travels with t, labels do not overlap, gate passes (${style.name})`, () => {
      const engine = build(style, (s: any) => s.timeline({ id: 'tl', milestones: miles, at: 0.2, dur: 4 }));
      const rec = engine.sample(9)[0].records[0];
      expect(rec.texts).toHaveLength(8);
      const rects = rec.texts.map((t: any) => t.rect);
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          expect(a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5).toBe(true);
        }
      }
      expect(rec.texts.every((t: any) => !t.overflow)).toBe(true);
      expect(runQA(engine, [0, 0.5, 1, 3, 5, 9], { determinism: false }).ok).toBe(true);
      for (const t of [0, 1, 3, 9]) { engine.render(t); }
    });
  }

  test('throws without milestones', () => {
    expect(() => build(hologram, (s: any) => s.timeline({ milestones: [] }))).toThrow();
  });
});
