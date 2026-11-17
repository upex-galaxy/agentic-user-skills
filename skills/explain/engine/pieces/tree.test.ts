/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import { createEngine } from '../core.js';
import { runQA } from '../qa.js';
import { installRoughStub, makeStubCtx } from '../stub-ctx.ts';
import hologram from '../styles/hologram.js';
import sketch from '../styles/sketch.js';
import { basePieces } from './base.js';

import { parseTree, pieces } from './tree.js';

const build = (style: any, fn: (s: any) => void, dur = 10) => {
  const stub = makeStubCtx(0.55);
  if (style === sketch) { installRoughStub(stub.log); }
  return createEngine({ canvas: stub.canvas, style, pieces: { ...basePieces, ...pieces }, spec: { scenes: [{ name: 't', dur, build: fn }] } });
};
const data = { 'src': { app: { 'page.tsx': null, 'layout.tsx': null }, lib: { 'db.ts': null } }, 'package.json': null, 'tests': { 'login.spec.ts': null } };
const text = 'src/\n  app/\n    page.tsx\n    layout.tsx\n  lib/\n    db.ts\npackage.json\ntests/\n  login.spec.ts';

describe('parseTree', () => {
  test('object and indented string give the same rows', () => {
    const a = parseTree(data);
    const b = parseTree(text);
    expect(b.map((r: any) => [r.path, r.depth, r.dir])).toEqual(a.map((r: any) => [r.path, r.depth, r.dir]));
    expect(a.map((r: any) => r.path)).toContain('src/app/page.tsx');
  });

  test('last siblings and pass-through columns', () => {
    const rows = parseTree(data);
    const by = (p: string) => rows.find((r: any) => r.path === p)!;
    expect(by('src/app').last).toBe(false);
    expect(by('src/lib').last).toBe(true);
    expect(by('src/app/page.tsx').pass).toEqual([1]);
    expect(by('src/lib/db.ts').pass).toEqual([]);
  });

  test('root wraps everything one level down', () => {
    const rows = parseTree({ a: null }, 'proyecto');
    expect(rows.map((r: any) => [r.name, r.depth])).toEqual([['proyecto/', 0], ['a', 1]]);
  });
});

describe('folderTree', () => {
  for (const style of [hologram, sketch]) {
    test(`reveals rows in order, highlights one path at a time and passes the gate (${style.name})`, () => {
      const engine = build(style, (s: any) => s.folderTree({ id: 'ft', data, at: 0.2, highlight: ['src/app', 'tests'], hlAt: 4, hlStep: 2 }));
      expect(engine.texts().map((x: any) => x.text).slice(0, 3)).toEqual(['src/', 'app/', 'page.tsx']);
      const rec = engine.sample(9)[0].records[0];
      expect(rec.texts).toHaveLength(parseTree(data).length);
      expect(rec.texts.every((t: any) => !t.overflow)).toBe(true);
      expect(runQA(engine, [0, 1, 2, 5, 9], { determinism: false }).ok).toBe(true);
      for (const t of [0, 1, 4.5, 6.5, 9]) { engine.render(t); }
    });
  }

  test('auto-sizes: many rows or long names shrink the font and keep the panel inside the area', () => {
    const big: Record<string, any> = {};
    for (let i = 0; i < 14; i++) { big[`carpeta-${i}`] = { 'un-archivo-con-un-nombre-largo.spec.ts': null }; }
    const engine = build(hologram, (s: any) => s.folderTree({ id: 'big', data: big }));
    const rec = engine.sample(9)[0].records[0];
    const small = build(hologram, (s: any) => s.folderTree({ id: 'small', data: { a: null } })).sample(9)[0].records[0];
    expect(rec.texts[0].px).toBeLessThan(small.texts[0].px);
    expect(rec.rect.y).toBeGreaterThanOrEqual(80 - 1);
    expect(rec.rect.y + rec.rect.h).toBeLessThanOrEqual(1000 + 1);
  });
});
