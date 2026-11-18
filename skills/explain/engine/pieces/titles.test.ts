/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import { createEngine } from '../core.js';
import { runQA } from '../qa.js';
import { installRoughStub, makeStubCtx } from '../stub-ctx.ts';
import { hologram, sketch } from '../test-presets.ts';
import { basePieces } from './base.js';
import { pieces } from './titles.js';

const build = (style: any, fn: (s: any) => void, dur = 8) => {
  const stub = makeStubCtx(0.55);
  if (style === sketch) { installRoughStub(stub.log); }
  return createEngine({ canvas: stub.canvas, style, pieces: { ...basePieces, ...pieces }, spec: { scenes: [{ name: 't', dur, build: fn }] } });
};
const scene = (s: any) => {
  s.titleCard({ id: 'hero', title: 'Cómo funciona un pipeline', subtitle: 'De la idea a producción en cinco pasos', at: 0.2 });
};

describe('titles', () => {
  for (const style of [hologram, sketch]) {
    test(`titleCard is written on, fits and passes the gate (${style.name})`, () => {
      const engine = build(style, scene);
      expect(engine.texts().map((x: any) => x.text)).toEqual(['Cómo funciona un pipeline', 'De la idea a producción en cinco pasos']);
      expect(engine.sample(0)[0].records[0].alpha).toBe(0);
      const rec = engine.sample(7)[0].records[0];
      expect(rec.alpha).toBe(1);
      expect(rec.texts.every((t: any) => !t.overflow)).toBe(true);
      expect(runQA(engine, [0, 1, 3, 7], { determinism: false }).ok).toBe(true);
      for (const t of [0, 0.5, 2, 7]) { engine.render(t); }
    });
  }

  test('caption fades out at `until` and sourceFooter prefixes once', () => {
    const engine = build(hologram, (s: any) => {
      s.caption({ id: 'cap', text: 'Todo empieza con una prueba.', at: 1, until: 4 });
      s.sourceFooter({ id: 'src1', text: 'documentación oficial' });
      s.sourceFooter({ id: 'src2', text: 'Fuente: repo del proyecto' });
    });
    const at = (t: number) => Object.fromEntries(engine.sample(t)[0].records.map((r: any) => [r.id, r]));
    expect(at(0.5).cap.alpha).toBe(0);
    expect(at(3).cap.alpha).toBeCloseTo(1, 5);
    expect(at(6).cap.alpha).toBeCloseTo(0, 5);
    expect(engine.texts().map((x: any) => x.text)).toContain('Fuente: documentación oficial');
    expect(engine.texts().map((x: any) => x.text)).toContain('Fuente: repo del proyecto');
  });

  test('sectionTag formats "02 / 09 Name" and hugs its text', () => {
    const engine = build(hologram, (s: any) => s.sectionTag({ id: 'tag', index: 2, total: 9, name: 'Pruebas' }));
    expect(engine.texts()[0].text).toBe('02 / 09 Pruebas');
    const rec = engine.sample(2)[0].records[0];
    expect(rec.rect.x).toBe(64);
    expect(rec.rect.w).toBeLessThan(500);
    expect(rec.texts[0].overflow).toBe(false);
  });

  test('the gate flags an opening ¿ in a title', () => {
    const engine = build(hologram, (s: any) => s.titleCard({ title: '¿Qué es QA?' }));
    expect(runQA(engine, [3], { determinism: false }).errors.some((e: any) => e.type === 'opening-punctuation')).toBe(true);
  });
});
