/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import { createEngine } from '../core.js';
import { runQA } from '../qa.js';
import { installRoughStub, makeStubCtx } from '../stub-ctx.ts';
import { hologram, sketch } from '../test-presets.ts';
import { basePieces } from './base.js';

import { columnWidths, pieces } from './table.js';

const build = (style: any, fn: (s: any) => void, dur = 10) => {
  const stub = makeStubCtx(0.55);
  if (style === sketch) { installRoughStub(stub.log); }
  return createEngine({ canvas: stub.canvas, style, pieces: { ...basePieces, ...pieces }, spec: { scenes: [{ name: 't', dur, build: fn }] } });
};
const columns = ['Criterio', 'Manual', 'Automatizado'];
const rows = [
  ['Velocidad', 'Lenta, depende de una persona', 'Rápida, corre en cada cambio'],
  ['Costo inicial', 'Bajo', 'Alto, hay que escribir y mantener las pruebas'],
  ['Exploración', 'Excelente', 'Limitada'],
  ['Regresión', 'Cansada', 'Ideal'],
];

describe('columnWidths', () => {
  test('sums to the total and respects the minimum', () => {
    const w = columnWidths([4, 20, 30], 1000);
    expect(w.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(1000, 3);
    expect(Math.min(...w)).toBeGreaterThanOrEqual(120 - 1e-6);
    expect(w[2]).toBeGreaterThan(w[1]);
  });
});

describe('table', () => {
  for (const style of [hologram, sketch]) {
    test(`fills row by row, fits every cell and passes the gate (${style.name})`, () => {
      const engine = build(style, (s: any) => s.table({ id: 'tb', columns, rows, at: 0.2, highlight: { row: 1 } }));
      const rec = engine.sample(9)[0].records[0];
      expect(rec.texts).toHaveLength(3 * 5);
      expect(rec.texts.every((t: any) => !t.overflow)).toBe(true);
      expect(new Set(rec.texts.map((t: any) => t.px)).size).toBe(1);
      expect(runQA(engine, [0, 1, 2, 4, 6, 9], { determinism: false }).ok).toBe(true);
      for (const t of [0, 1, 3, 6, 9]) { engine.render(t); }
    });
  }

  test('highlighting a column works and a table without rows throws', () => {
    const engine = build(hologram, (s: any) => s.table({ id: 'tb', columns, rows, highlight: { col: 2 } }));
    for (const t of [0.5, 5, 9]) { engine.render(t); }
    expect(() => build(hologram, (s: any) => s.table({ columns, rows: [] }))).toThrow();
  });
});
