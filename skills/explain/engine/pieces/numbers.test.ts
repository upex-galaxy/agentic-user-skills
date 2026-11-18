/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import demo from '../../examples/pieces/numbers.scene.js';
import { createEngine } from '../core.js';
import { kit } from '../index.js';
import { defaultTimes, runQA } from '../qa.js';
import { makeStubCtx } from '../stub-ctx.ts';
import { hologram, sketch } from '../test-presets.ts';
import { basePieces } from './base.js';
import { formatNumber, pieces } from './numbers.js';

// Rough.js stand-in that accepts every drawing method (the shared stub only knows four).
const installRoughStub = (log: unknown[][]) => {
  (globalThis as any).rough = { canvas: () => new Proxy({}, { get: (_, name) => (...args: unknown[]) => { log.push([`rough.${String(name)}`, ...args]); } }) };
};
const PRESETS = [['hologram', hologram], ['sketch', sketch]] as const;

function build(style: any, fn: (s: any) => void, dur = 10, lang?: string) {
  const stub = makeStubCtx(0.55);
  if (style === sketch) { installRoughStub(stub.log); }
  const engine = createEngine({ canvas: stub.canvas, style, pieces: { ...basePieces, ...pieces }, spec: { lang, scenes: [{ name: 't', dur, build: fn }] } } as any);
  return { engine, ...stub };
}
const recs = (engine: any, t: number) => Object.fromEntries(engine.sample(t)[0].records.map((r: any) => [r.id, r]));
const textsOf = (engine: any, t: number, id: string): string[] => recs(engine, t)[id].texts.map((x: any) => x.text);
const R = { x: 200, y: 200, w: 700, h: 300 };

describe('formatNumber', () => {
  test('groups thousands, decimal comma by default, prefix and suffix', () => {
    expect(formatNumber(12480)).toBe('12.480');
    expect(formatNumber(1234.5, { decimals: 1, prefix: '$', suffix: 'k' })).toBe('$1.234,5k');
    expect(formatNumber(1234.5, { decimals: 1, sep: ',' })).toBe('1,234.5');
    expect(formatNumber(-3)).toBe('-3');
    expect(formatNumber(-0.2)).toBe('0');
  });
});

describe('counter', () => {
  for (const [name, style] of PRESETS) {
    test(`from/to value at fixed t, end and texts (${name})`, () => {
      let end = 0;
      const { engine } = build(style, (s: any) => { end = s.counter({ id: 'c', rect: R, from: 0, to: 1000, at: 1, dur: 2, label: 'usuarios' }).end; });
      expect(textsOf(engine, 0.5, 'c')[0]).toBe('0');
      expect(textsOf(engine, 3.5, 'c')[0]).toBe('1.000');
      const mid = Number(textsOf(engine, 2, 'c')[0].replace('.', ''));
      expect(mid).toBeGreaterThan(100);
      expect(mid).toBeLessThan(1000);
      expect(textsOf(engine, 3.5, 'c')).toContain('usuarios');
      expect(end).toBe(3);
      expect(runQA(engine, [0.5, 1.5, 2, 3, 3.4, 5], { determinism: false }).ok).toBe(true);
    });
  }

  test('keys give a timeline of values and end is the last key', () => {
    let end = 0;
    const { engine } = build(hologram, (s: any) => { end = s.counter({ id: 'c', rect: R, keys: [[1, 0], [3, 50], [5, 200]], prefix: '+', suffix: ' ms' }).end; });
    expect(textsOf(engine, 0, 'c')[0]).toBe('+0 ms');
    expect(textsOf(engine, 3, 'c')[0]).toBe('+50 ms');
    expect(textsOf(engine, 9, 'c')[0]).toBe('+200 ms');
    expect(end).toBe(5);
  });

  test('the number is fitted for the widest value, never overflows, and decimals follow lang', () => {
    const { engine } = build(hologram, (s: any) => s.counter({ id: 'c', rect: { x: 200, y: 200, w: 300, h: 300 }, from: 5, to: 12345678, at: 0, dur: 1 }));
    for (const t of [0.2, 0.6, 2]) { expect(recs(engine, t).c.texts.every((x: any) => !x.overflow)).toBe(true); }
    const en = build(hologram, (s: any) => s.counter({ id: 'c', rect: R, to: 1234.5, decimals: 1, dur: 1 }), 10, 'en');
    expect(textsOf(en.engine, 4, 'c')[0]).toBe('1,234.5');
  });

  test('needs a target value', () => {
    expect(() => build(hologram, (s: any) => s.counter({ rect: R }))).toThrow();
  });
});

describe('progress', () => {
  for (const [name, style] of PRESETS) {
    test(`percent text follows the fill and segments quantize it (${name})`, () => {
      const { engine } = build(style, (s: any) => s.progress({ id: 'p', rect: { x: 200, y: 200, w: 900, h: 110 }, label: 'Migración', at: 1, dur: 2 }));
      expect(recs(engine, 0.9).p.alpha).toBe(0);
      expect(textsOf(engine, 1.1, 'p')).toContain('Migración');
      expect(textsOf(engine, 4, 'p')).toContain('100 %');
      const mid = textsOf(engine, 2, 'p').find(x => x.endsWith('%'))!;
      expect(Number.parseInt(mid, 10)).toBeGreaterThan(0);
      expect(runQA(engine, [1.2, 2, 3, 5], { determinism: false }).ok).toBe(true);
    });
  }

  test('segments step in n parts, to < 1 stops there, pct false hides the text', () => {
    const { engine } = build(hologram, (s: any) => s.progress({ id: 'p', rect: { x: 200, y: 200, w: 900, h: 90 }, at: 0, dur: 2, segments: 4, to: 0.5 }));
    for (const t of [0.3, 0.8, 1.3, 1.9, 4]) { expect([0, 25, 50]).toContain(Number.parseInt(textsOf(engine, t, 'p')[0], 10)); }
    expect(textsOf(engine, 4, 'p')[0]).toBe('50 %');
    const none = build(hologram, (s: any) => s.progress({ id: 'p', rect: { x: 200, y: 200, w: 900, h: 60 }, pct: false }));
    expect(textsOf(none.engine, 4, 'p')).toEqual([]);
  });
});

describe('gauge', () => {
  for (const [name, style] of PRESETS) {
    test(`shows the value and label and passes QA (${name})`, () => {
      const { engine } = build(style, (s: any) => s.gauge({ id: 'g', rect: { x: 200, y: 150, w: 600, h: 500 }, to: 0.87, at: 1, dur: 2, label: 'cobertura' }));
      expect(textsOf(engine, 4, 'g')).toEqual(['87 %', 'cobertura']);
      expect(textsOf(engine, 1, 'g')[0]).toBe('0 %');
      expect(runQA(engine, [1.1, 2, 3, 5], { determinism: false }).ok).toBe(true);
    });
  }
});

describe('chart', () => {
  for (const [name, style] of PRESETS) {
    for (const type of ['line', 'area', 'bars']) {
      test(`${type} draws, reports title and labels and passes QA (${name})`, () => {
        const { engine, log } = build(style, (s: any) => s.chart({ id: 'ch', rect: { x: 200, y: 150, w: 900, h: 600 }, type, data: [10, 30, 20, 40], labels: ['a', 'b', 'c', 'd'], title: 'Serie', at: 0.5, dur: 2 }));
        log.length = 0;
        engine.render(4);
        expect(log.length).toBeGreaterThan(20);
        const tx = textsOf(engine, 6, 'ch');
        expect(tx).toContain('Serie');
        for (const l of ['a', 'b', 'c', 'd']) { expect(tx).toContain(l); }
        if (type === 'bars') { for (const v of ['10', '30', '20', '40']) { expect(tx).toContain(v); } }
        expect(runQA(engine, [0.4, 1, 2, 3, 6], { determinism: false }).ok).toBe(true);
      });
    }
  }

  test('bars appear one by one with step', () => {
    const { engine } = build(hologram, (s: any) => s.chart({ id: 'ch', rect: { x: 200, y: 150, w: 900, h: 600 }, type: 'bars', data: [10, 30, 20, 40], at: 0, step: 1 }));
    // value labels show up once each bar has grown: bar i starts at 0.4 + i, label at +0.3
    const shown = (t: number) => textsOf(engine, t, 'ch').filter(x => /^\d+$/.test(x));
    expect(shown(0.5)).toEqual([]);
    expect(shown(1.2)).toEqual(['10']);
    expect(shown(2.3)).toEqual(['10', '30']);
    expect(shown(5)).toEqual(['10', '30', '20', '40']);
  });

  test('line mark appears once the line reaches the point and stays in the rect', () => {
    for (const [, style] of PRESETS) {
      const { engine } = build(style, (s: any) => s.chart({ id: 'ch', rect: { x: 200, y: 150, w: 900, h: 600 }, type: 'area', data: [40, 38, 20, 10, 6], at: 0, dur: 2, mark: { i: 2, text: 'Lanzamiento' } }));
      expect(textsOf(engine, 0.6, 'ch')).not.toContain('Lanzamiento');
      expect(textsOf(engine, 4, 'ch')).toContain('Lanzamiento');
      expect(runQA(engine, defaultTimes(engine, 0.5), { determinism: false }).ok).toBe(true);
    }
  });

  test('several lines take an array of arrays and bad input throws', () => {
    const { engine } = build(hologram, (s: any) => s.chart({ id: 'ch', rect: { x: 200, y: 150, w: 900, h: 600 }, data: [[1, 2, 3], [3, 2, 1]], labels: ['x', 'y', 'z'] }));
    expect(textsOf(engine, 5, 'ch')).toEqual(['x', 'y', 'z']);
    expect(() => build(hologram, (s: any) => s.chart({ rect: R, type: 'pie', data: [1] }))).toThrow();
    expect(() => build(hologram, (s: any) => s.chart({ rect: R, data: [] }))).toThrow();
    expect(() => build(hologram, (s: any) => s.chart({ rect: R, data: [1, 2], mark: { i: 9, text: 'x' } }))).toThrow();
  });
});

describe('dotGrid', () => {
  for (const [name, style] of PRESETS) {
    test(`fills one by one and colors the failing cells (${name})`, () => {
      const { engine, log } = build(style, (s: any) => s.dotGrid({ id: 'd', rect: { x: 200, y: 200, w: 800, h: 400 }, rows: 2, cols: 5, fail: [3], at: 1, dur: 2 }));
      expect(runQA(engine, [0.5, 1.5, 2.5, 4], { determinism: false }).ok).toBe(true);
      log.length = 0;
      engine.render(0.9);
      const before = log.length;
      log.length = 0;
      engine.render(5);
      expect(log.length).toBeGreaterThan(0);
      expect(before).toBeGreaterThan(0);
      expect(recs(engine, 5).d.texts).toEqual([]);
    });
  }

  test('fail cells use the bad token', () => {
    const { engine, log } = build(hologram, (s: any) => s.dotGrid({ id: 'd', rect: { x: 200, y: 200, w: 400, h: 200 }, rows: 1, cols: 4, fail: [1], at: 0, dur: 1 }));
    log.length = 0;
    engine.render(3);
    const fills = log.filter(c => c[0] === 'set' && c[1] === 'fillStyle').map(c => c[2]);
    expect(fills).toContain(hologram.color('bad'));
    expect(fills).toContain(hologram.color('good'));
    expect(() => build(hologram, (s: any) => s.dotGrid({ rect: R, rows: 0, cols: 3 }))).toThrow();
  });
});

describe('end and demo', () => {
  test('every piece exposes end', () => {
    const { engine } = build(hologram, (s: any) => {
      const items = [
        s.counter({ rect: R, to: 5, at: 1, dur: 2 }),
        s.progress({ rect: { x: 200, y: 600, w: 600, h: 80 }, at: 1, dur: 3 }),
        s.gauge({ rect: { x: 900, y: 100, w: 400, h: 400 }, at: 2, dur: 1 }),
        s.chart({ rect: { x: 900, y: 500, w: 800, h: 400 }, type: 'bars', data: [1, 2, 3], at: 0, step: 1 }),
        s.dotGrid({ rect: { x: 100, y: 700, w: 400, h: 200 }, rows: 2, cols: 3, at: 2, dur: 2 }),
      ];
      expect(items.map((i: any) => i.end)).toEqual([3, 4, 3, 0.4 + 2 + 0.5, 4]);
    });
    expect(engine).toBeTruthy();
  });

  for (const [name, style] of PRESETS) {
    test(`the example scene passes the QA gate (${name})`, () => {
      const stub = makeStubCtx(0.55);
      if (style === sketch) { installRoughStub(stub.log); }
      const engine = createEngine({ canvas: stub.canvas, style, pieces: { ...basePieces, ...pieces }, spec: (demo)(kit) } as any);
      const qa = runQA(engine, defaultTimes(engine, 0.5), { determinism: false });
      expect(qa.errors).toEqual([]);
    });
  }
});
