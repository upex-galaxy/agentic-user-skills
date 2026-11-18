/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import { createEngine } from '../core.js';
import { runQA } from '../qa.js';
import { installRoughStub, makeStubCtx } from '../stub-ctx.ts';
import { hologram, sketch } from '../test-presets.ts';
import { basePieces } from './base.js';

import { pieces, snakeGeometry, snakeRows, timelineGeometry } from './timeline.js';

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

describe('timeline layouts', () => {
  const eight = ['Primera idea', 'Entrevistas con clientes', 'Prototipo en papel', 'Versión alfa cerrada', 'Pruebas con usuarios', 'Beta pública', 'Lanzamiento', 'Mil equipos activos'].map((label, i) => ({ label, date: `Mes ${i + 1}` }));
  const read = (style: any, o: any) => {
    const engine = build(style, (s: any) => s.timeline({ id: 'tl', at: 0.2, dur: 4, ...o }));
    const rec = engine.sample(9)[0].records[0];
    return { engine, rec };
  };
  const apart = (rects: any[]) => rects.every((a, i) => rects.every((b, j) => i >= j || a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5));

  for (const style of [hologram, sketch]) {
    test(`eight events fill at least 55 % of the content-area height, labels apart (${style.name})`, () => {
      const { engine, rec } = read(style, { milestones: eight });
      expect(rec.rect.h).toBeGreaterThanOrEqual(0.55 * 636);
      expect(rec.rect.w).toBeLessThanOrEqual(1760 + 1);
      expect(apart(rec.texts.map((t: any) => t.rect))).toBe(true);
      expect(rec.texts.every((t: any) => !t.overflow)).toBe(true);
      expect(runQA(engine, [0, 1, 3, 5, 9], { determinism: false }).ok).toBe(true);
    });
  }

  test('auto wraps eight events into two rows; the second row runs right to left', () => {
    const { rec } = read(hologram, { milestones: eight });
    const label = (i: number) => rec.texts[i].rect;
    expect(label(0).y).toBeCloseTo(label(3).y, 0);
    expect(label(4).y).toBeGreaterThan(label(3).y + 100);
    expect(label(4).x).toBeGreaterThan(label(7).x);
  });

  test('layout row keeps the one-row alternating placement', () => {
    const { rec } = read(hologram, { milestones: eight, layout: 'row' });
    const t = rec.texts.slice(0, 8).map((x: any) => x.rect);
    expect(t[0].y).toBeLessThan(t[1].y);
    expect(Math.abs(t[0].y + t[0].h - (t[2].y + t[2].h))).toBeLessThan(5);
    expect(rec.rect.h).toBeLessThan(636);
  });

  test('few events with long labels stay in one row only when it fills; layout column forces a vertical axis', () => {
    const long = [{ label: 'Pruebas automáticas corriendo en cada cambio del repositorio' }, { label: 'Revisión humana de cada pull request abierto' }, { label: 'Despliegue gradual con reversa automática' }];
    const { rec } = read(hologram, { milestones: long, layout: 'column' });
    const xs = rec.texts.map((t: any) => Math.round(t.rect.x));
    expect(new Set(xs).size).toBe(1);
    expect(rec.texts[1].rect.y).toBeGreaterThan(rec.texts[0].rect.y);
  });

  test('five short events stay on one row by default', () => {
    const auto = read(hologram, { milestones: miles }).rec;
    const row = read(hologram, { milestones: miles, layout: 'row' }).rec;
    expect(auto.rect).toEqual(row.rect);
  });

  test('snake geometry reverses odd rows and snakeRows grows with the count', () => {
    const g = snakeGeometry(8, 2, area);
    expect(g.marks[3].row).toBe(0);
    expect(g.marks[4].x).toBeCloseTo(g.marks[3].x, 6);
    expect(g.marks[7].x).toBeCloseTo(g.marks[0].x, 6);
    expect([snakeRows(6), snakeRows(8), snakeRows(9)]).toEqual([2, 2, 3]);
  });
});
