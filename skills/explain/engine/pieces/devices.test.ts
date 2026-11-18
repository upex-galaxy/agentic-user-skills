/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import demo from '../../examples/pieces/devices.scene.js';
import { createEngine } from '../core.js';
import { kit } from '../index.js';
import { defaultTimes, runQA } from '../qa.js';
import { makeStubCtx } from '../stub-ctx.ts';
import { hologram, sketch } from '../test-presets.ts';
import { basePieces } from './base.js';
import { pieces } from './devices.js';

// Rough.js stand-in that accepts every drawing method (the shared stub only knows four).
const installRoughStub = (log: unknown[][]) => {
  (globalThis as any).rough = { canvas: () => new Proxy({}, { get: (_, name) => (...args: unknown[]) => { log.push([`rough.${String(name)}`, ...args]); } }) };
};
const PRESETS = [['hologram', hologram], ['sketch', sketch]] as const;

// The stub measures every glyph at a fixed share of the size; the handwriting face of sketch is narrower than that.
function build(style: any, fn: (s: any) => void, dur = 14) {
  const stub = makeStubCtx(style === sketch ? 0.45 : 0.55);
  if (style === sketch) { installRoughStub(stub.log); }
  const engine = createEngine({ canvas: stub.canvas, style, pieces: { ...basePieces, ...pieces }, spec: { scenes: [{ name: 't', dur, build: fn }] } } as any);
  return { engine, ...stub };
}
const recs = (engine: any, t: number): Record<string, any> => Object.fromEntries(engine.sample(t)[0].records.map((r: any) => [r.id, r]));
const textsOf = (engine: any, t: number, id: string): string[] => recs(engine, t)[id].texts.map((x: any) => x.text);
const AREA = { x: 80, y: 244, w: 1760, h: 636 };

const PR = {
  title: 'Agregar cupón',
  number: 7,
  from: 'feat/cupon',
  to: 'main',
  button: 'Abrir pull request',
  openAt: 2,
  checks: [{ name: 'pruebas', start: 3, end: 5 }, { name: 'lint', start: 3, end: 4, ok: true }],
  reviewers: [{ name: 'Marta', approveAt: 5.5 }],
  mergeAt: 8,
};

describe('hosts', () => {
  for (const [name, style] of PRESETS) {
    test(`browser registers its body and a hosted piece passes QA with its host (${name})`, () => {
      let b: any;
      const { engine } = build(style, (s: any) => {
        b = s.browser({ id: 'web', rect: AREA, url: 'ejemplo.dev/x', at: 0.2 });
        s.appScreen({ id: 'app', in: 'web.body', at: 1, title: 'Carrito', rows: [{ label: 'Camiseta', value: '$ 25' }] });
        expect(s.reg.has('web.body')).toBe(true);
        expect(s.reg.get('web.body')).toEqual(b.body);
      });
      const r = recs(engine, 3);
      expect(r.web.container).toBe(true);
      expect(r.app.host).toBe('web.body');
      expect(textsOf(engine, 3, 'web')).toEqual(['ejemplo.dev/x']);
      const body = b.body;
      expect(r.app.rect).toEqual(body);
      expect(runQA(engine, [0.5, 1.5, 3, 6], { determinism: false }).errors).toEqual([]);
    });

    test(`phone keeps a 1:2 aspect, registers its screen and hosts a piece (${name})`, () => {
      const { engine } = build(style, (s: any) => {
        const p = s.phone({ id: 'ph', rect: { x: 100, y: 244, w: 500, h: 600 }, at: 0.2, tilt: 8 });
        expect(p.rect.h).toBeCloseTo(p.rect.w * 2, 5);
        const sc = s.reg.get('ph.screen');
        expect(sc.x).toBeGreaterThan(p.rect.x);
        expect(sc.y + sc.h).toBeLessThan(p.rect.y + p.rect.h);
        s.appScreen({ id: 'app', in: 'ph.screen', at: 1, title: 'Tienda', rows: [{ label: 'Gorra', value: '$ 9' }], cta: 'Pagar' });
      });
      expect(recs(engine, 3).app.host).toBe('ph.screen');
      expect(runQA(engine, [0.5, 1.5, 3, 6], { determinism: false }).errors).toEqual([]);
    });
  }

  test('a hosted piece that pokes out of its host is still caught when it is not hosted', () => {
    const { engine } = build(hologram, (s: any) => {
      s.browser({ id: 'web', rect: AREA, at: 0 });
      s.appScreen({ id: 'app', rect: { x: AREA.x + AREA.w - 300, y: AREA.y + 200, w: 600, h: 300 }, at: 0, title: 'x', rows: [{ label: 'a' }] });
    });
    expect(runQA(engine, [3], { determinism: false }).errors.some((e: any) => e.type === 'overlap')).toBe(true);
  });

  test('browser: the url types out and end covers it', () => {
    let end = 0;
    const { engine } = build(hologram, (s: any) => { end = s.browser({ id: 'web', rect: AREA, url: 'github.com/a/b', at: 1 }).end; });
    expect(end).toBeGreaterThan(1.7);
    expect(textsOf(engine, 0.5, 'web')).toEqual([]);
    expect(textsOf(engine, 1.5, 'web')).toEqual(['github.com/a/b']);
  });
});

describe('prPage', () => {
  for (const [name, style] of PRESETS) {
    test(`sub-ids are registered and reported as parts (${name})`, () => {
      const { engine } = build(style, (s: any) => {
        s.browser({ id: 'web', rect: AREA, at: 0 });
        s.prPage({ id: 'pr', in: 'web.body', at: 0.5, ...PR });
        for (const sub of ['badge', 'checks', 'reviewers', 'merge', 'button', 'status']) { expect(s.reg.has(`pr.${sub}`)).toBe(true); }
      });
      const ids = (t: number) => recs(engine, t).pr.parts.map((p: any) => p.id);
      expect(ids(1.5)).toEqual(expect.arrayContaining(['badge', 'status', 'button']));
      expect(ids(1.5)).not.toContain('checks');
      expect(ids(6)).toEqual(expect.arrayContaining(['badge', 'checks', 'reviewers', 'merge']));
      expect(ids(6)).not.toContain('button');
      expect(recs(engine, 6).pr.host).toBe('web.body');
    });

    test(`draft, open and merged states, checks, approval and merge button follow t (${name})`, () => {
      const { engine } = build(style, (s: any) => {
        s.browser({ id: 'web', rect: AREA, at: 0 });
        s.prPage({ id: 'pr', in: 'web.body', at: 0.5, ...PR });
      });
      const T = (t: number) => textsOf(engine, t, 'pr');
      expect(T(1.5)).toContain('Borrador');
      expect(T(1.8)).toContain('Abrir pull request');
      expect(T(1.5)).not.toContain('Checks');
      expect(T(3)).toContain('Abierto');
      expect(T(3)).not.toContain('Borrador');
      expect(T(3)).toContain('Checks');
      expect(T(3)).toContain('pruebas');
      expect(T(4.5)).toContain('Esperando checks y revisión');
      expect(T(6.5)).toContain('Fusionar pull request');
      expect(T(6.5)).not.toContain('Esperando checks y revisión');
      expect(T(7)).toContain('Abierto');
      expect(T(9)).toContain('Fusionado');
      expect(T(9)).not.toContain('Abierto');
      expect(runQA(engine, [0.8, 1.5, 2.5, 3.5, 4.5, 6, 7.5, 8.2, 9, 12], { determinism: false }).errors).toEqual([]);
    });
  }

  test('draw calls change at the check end, the approval and the merge', () => {
    const { engine, log } = build(hologram, (s: any) => {
      s.browser({ id: 'web', rect: AREA, at: 0 });
      s.prPage({ id: 'pr', in: 'web.body', at: 0.5, ...PR });
    });
    const frame = (t: number) => { log.length = 0; engine.render(t); return JSON.stringify(log); };
    expect(frame(3.5)).not.toBe(frame(4.5));
    expect(frame(5.2)).not.toBe(frame(5.9));
    expect(frame(7.5)).not.toBe(frame(8.9));
  });

  test('a failed check keeps the merge button blocked', () => {
    const { engine } = build(hologram, (s: any) => {
      s.browser({ id: 'web', rect: AREA, at: 0 });
      s.prPage({ id: 'pr', in: 'web.body', at: 0.5, ...PR, mergeAt: undefined, checks: [{ name: 'pruebas', start: 3, end: 5, ok: false }] });
    });
    expect(textsOf(engine, 9, 'pr')).toContain('Esperando checks y revisión');
    expect(textsOf(engine, 9, 'pr')).not.toContain('Fusionar pull request');
  });

  test('without a button the page starts open, labels follow the language and end and marks are exposed', () => {
    let it: any;
    const stub = makeStubCtx(0.55);
    const engine = createEngine({ canvas: stub.canvas, style: hologram, pieces: { ...basePieces, ...pieces }, spec: { lang: 'en', scenes: [{ name: 't', dur: 14, build: (s: any) => { it = s.prPage({ id: 'pr', rect: { x: 100, y: 244, w: 1500, h: 600 }, at: 0.5, title: 'Add coupon', checks: [{ name: 'tests', start: 1, end: 2 }], reviewers: [{ name: 'Ann', approveAt: 3 }], mergeAt: 5 }); } }] } } as any);
    expect(textsOf(engine, 1, 'pr')).toContain('Open');
    expect(textsOf(engine, 8, 'pr')).toEqual(expect.arrayContaining(['Merged', 'Merge pull request']));
    expect(it.marks).toEqual({ ready: 3, merge: 5 });
    expect(it.end).toBeGreaterThanOrEqual(5.8);
    expect(it.texts()).toEqual(expect.arrayContaining(['Draft'].slice(1).concat(['Merged', 'Waiting for checks and review'])));
  });
});

describe('appScreen', () => {
  for (const [name, style] of PRESETS) {
    test(`numeric total counts up, the feature row and badge appear (${name})`, () => {
      let it: any;
      const { engine } = build(style, (s: any) => {
        s.phone({ id: 'ph', rect: { x: 100, y: 244, w: 340, h: 636 }, at: 0 });
        it = s.appScreen({ id: 'app', in: 'ph.screen', at: 1, title: 'Tienda', rows: [{ label: 'Gorra', value: '9 uds' }], total: { label: 'Total', from: 10, to: 50, prefix: '$ ', at: 3, dur: 1 }, cta: 'Pagar', feature: { label: 'Oscuro', at: 5, badge: 'Nuevo' } });
        expect(s.reg.has('app.total')).toBe(true);
        expect(s.reg.has('app.feature')).toBe(true);
      });
      const total = (t: number) => Number(textsOf(engine, t, 'app').find(x => x.startsWith('$ '))!.replace('$ ', '').replace(',', '.'));
      expect(total(2.5)).toBe(10);
      expect(total(3.5)).toBeGreaterThan(10);
      expect(total(3.5)).toBeLessThan(50);
      expect(total(6)).toBe(50);
      expect(textsOf(engine, 4, 'app')).not.toContain('Oscuro');
      expect(textsOf(engine, 6, 'app')).toEqual(expect.arrayContaining(['Oscuro', 'Nuevo', 'Pagar', 'Total']));
      expect(it.marks).toEqual({ feature: 5, total: 4 });
      expect(it.end).toBeGreaterThanOrEqual(6.3);
      expect(runQA(engine, [1.5, 2.5, 3.4, 4.5, 6, 8], { determinism: false }).errors).toEqual([]);
    });
  }

  test('string totals swap and a banner drops in on a wide screen', () => {
    const { engine } = build(hologram, (s: any) => {
      s.browser({ id: 'web', rect: AREA, at: 0 });
      s.appScreen({ id: 'app', in: 'web.body', at: 1, title: 'Carrito', rows: [{ label: 'Gorra', on: true }], total: { label: 'Total', from: '$ 37', to: '$ 29,60', at: 3 }, banner: { text: 'Cupón aplicado', at: 3.5 } });
    });
    expect(textsOf(engine, 2, 'app')).toContain('$ 37');
    expect(textsOf(engine, 2, 'app')).not.toContain('Cupón aplicado');
    expect(textsOf(engine, 5, 'app')).toEqual(expect.arrayContaining(['$ 29,60', 'Cupón aplicado']));
    expect(textsOf(engine, 5, 'app')).not.toContain('$ 37');
    expect(runQA(engine, [1.5, 2.5, 4, 6], { determinism: false }).errors).toEqual([]);
  });
});

describe('cursor', () => {
  test('interpolates between keyframes, holds at the ends and resolves ids', () => {
    let c: any;
    build(hologram, (s: any) => {
      s.browser({ id: 'web', rect: { x: 400, y: 300, w: 800, h: 400 } });
      c = s.cursor({ path: [[1, 100, 100], [3, 300, 500], [5, 'web']], clicks: [3.5] });
    });
    expect(c.pos(0)).toEqual([100, 100]);
    expect(c.pos(1)).toEqual([100, 100]);
    expect(c.pos(2)[0]).toBeCloseTo(200, 5);
    expect(c.pos(2)[1]).toBeCloseTo(300, 5);
    expect(c.pos(3)).toEqual([300, 500]);
    expect(c.pos(5)).toEqual([800, 500]);
    expect(c.pos(99)).toEqual([800, 500]);
    expect(c.end).toBe(5);
    expect(c.marks).toEqual({ click: 3.5 });
  });

  for (const [name, style] of PRESETS) {
    test(`draws a pointer through the style and a ripple at a click, fades with until (${name})`, () => {
      const { engine, log } = build(style, (s: any) => { s.cursor({ id: 'cur', path: [[1, 200, 300], [2, 400, 300]], clicks: [2], until: 5 }); });
      const frame = (t: number) => { log.length = 0; engine.render(t); return log.length; };
      const base = frame(0.5);
      expect(frame(1.5)).toBeGreaterThan(base);
      expect(frame(2.2)).toBeGreaterThan(frame(1.5));
      expect(frame(7)).toBeLessThan(base + 10);
    });
  }

  test('needs a path', () => {
    expect(() => build(hologram, (s: any) => s.cursor({}))).toThrow();
  });
});

describe('example scene', () => {
  for (const [name, style] of PRESETS) {
    test(`passes the QA gate (${name})`, () => {
      const stub = makeStubCtx(0.45);
      if (style === sketch) { installRoughStub(stub.log); }
      const engine = createEngine({ canvas: stub.canvas, style, pieces: { ...basePieces, ...pieces }, spec: demo(kit) } as any);
      const r = runQA(engine, defaultTimes(engine, 0.25), { determinism: false });
      expect(r.errors).toEqual([]);
    });
  }
});

describe('appScreen in a phone', () => {
  test('a narrow screen with two rows, a feature with a badge, a total and a cta fits at sketch size', () => {
    const { engine } = build(sketch, (s) => {
      s.phone({ id: 'ph', rect: { x: 100, y: 200, w: 340, h: 680 }, at: 0.2 });
      s.appScreen({ id: 'app', in: 'ph.screen', at: 0.6, title: 'Ajustes', rows: [{ label: 'Notificaciones', on: true }, { label: 'Privacidad', value: 'Alta' }], total: { label: 'Total', from: 37, to: 49, prefix: '$ ', at: 2, dur: 1 }, cta: 'Guardar', feature: { label: 'Notificaciones', at: 3, badge: 'Nuevo' } });
    });
    const times = [0.8, 1.5, 2.5, 3.2, 4, 6, 9];
    for (const t of times) {
      for (const tx of recs(engine, t).app.texts) { expect(tx.overflow).toBe(false); }
    }
    expect(runQA(engine, times, { determinism: false }).ok).toBe(true);
    // every text inside the screen rect
    const app = recs(engine, 9).app;
    for (const tx of app.texts) { expect(tx.rect.x).toBeGreaterThanOrEqual(app.rect.x); expect(tx.rect.x + tx.rect.w).toBeLessThanOrEqual(app.rect.x + app.rect.w); }
  });
});
