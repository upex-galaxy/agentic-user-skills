/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import { createEngine } from '../core.js';
import { runQA } from '../qa.js';
import { installRoughStub, makeStubCtx } from '../stub-ctx.ts';
import { hologram, sketch } from '../test-presets.ts';
import { basePieces } from './base.js';
import { drawIcon, KINDS, pieces } from './icons.js';

const build = (style: any, fn: (s: any) => void, dur = 6) => {
  const stub = makeStubCtx(0.55);
  if (style === sketch) { installRoughStub(stub.log); }
  const engine = createEngine({ canvas: stub.canvas, style, pieces: { ...basePieces, ...pieces }, spec: { scenes: [{ name: 't', dur, build: fn }] } });
  return { engine, stub };
};

const makeApi = (style: any, ctx: any): any => ({ ctx, style, sa: 1, W: 1920, H: 1080, t: 0, color: (k: string) => k, alpha(a: number) { ctx.globalAlpha = a; }, fade() { return this; } });

describe('icons', () => {
  test('there are 22 kinds', () => {
    expect(KINDS).toHaveLength(22);
    expect(KINDS).toContain('eye');
  });

  for (const style of [hologram, sketch]) {
    test(`every kind draws at several p and t (${style.name})`, () => {
      const stub = makeStubCtx(0.55);
      installRoughStub(stub.log);
      const api = makeApi(style, stub.ctx);
      for (const kind of KINDS) {
        for (const p of [0.2, 0.7, 1]) { drawIcon(api, kind, { x: 100, y: 100, w: 200, h: 200 }, { p, t: 1.3, spin: 1 }); }
      }
      expect(stub.log.length).toBeGreaterThan(100);
    });

    test(`label in texts() and qa, rect registered, until fades (${style.name})`, () => {
      const { engine } = build(style, (s: any) => {
        const it = s.icon({ id: 'ic', kind: 'server', x: 200, y: 300, size: 200, label: 'Servidor', at: 0.2, until: 3 });
        expect(it.texts()).toEqual(['Servidor']);
        expect(s.reg.has('ic')).toBe(true);
        s.icon({ id: 'i2', kind: 'gear', rect: { x: 800, y: 300, w: 400, h: 240 }, label: 'Motor', labelSide: 'right', idle: 'float', spin: 1 });
        s.icon({ id: 'i3', kind: 'eye', x: 1400, y: 300, size: 160, label: 'Ojo', labelSide: 'top', idle: 'pulse' });
      });
      const recs = (t: number) => engine.sample(t)[0].records;
      const r = recs(1).find((x: any) => x.id === 'ic');
      expect(r.texts.map((x: any) => x.text)).toEqual(['Servidor']);
      expect(r.texts[0].overflow).toBe(false);
      expect(recs(1).find((x: any) => x.id === 'i2').texts[0].text).toBe('Motor');
      expect(recs(1).find((x: any) => x.id === 'ic').alpha).toBe(1);
      expect(recs(4).find((x: any) => x.id === 'ic').alpha).toBeLessThan(0.05);
      expect(runQA(engine, [0.5, 1, 2, 5], { determinism: false }).ok).toBe(true);
    });
  }

  test('unknown kind lists the 22 kinds', () => {
    let msg = '';
    try { build(hologram, (s: any) => s.icon({ kind: 'dragon', x: 0, y: 0 })); }
    catch (e: any) { msg = String(e.message); }
    for (const k of KINDS) { expect(msg).toContain(k); }
    expect(() => drawIcon(makeApi(hologram, makeStubCtx().ctx), 'nope', { x: 0, y: 0, w: 10, h: 10 })).toThrow(/laptop/);
  });
});
