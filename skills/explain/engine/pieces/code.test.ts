/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import demo from '../../examples/pieces/code.scene.js';
import { bandAt, normalizeHighlights, pieces } from './code.js';
import { buildScene, qaOfDemo, records, STYLES } from './harness-b.ts';

describe('highlight timeline', () => {
  const hls = normalizeHighlights([{ lines: 4, at: 5 }, { lines: [1, 2], at: 2 }]);
  const rowRect = (from: number, to: number) => ({ x: 0, y: (from - 1) * 40, w: 100, h: (to - from + 1) * 40 });

  test('entries are sorted by time and ranges normalized', () => {
    expect(hls.map((h: any) => [h.from, h.to, h.at])).toEqual([[1, 2, 2], [4, 4, 5]]);
  });

  test('nothing before the first entry, then it fades in on its range', () => {
    expect(bandAt(1, hls, rowRect)).toBeNull();
    const b = bandAt(2.15, hls, rowRect)!;
    expect(b.alpha).toBeGreaterThan(0);
    expect(b.alpha).toBeLessThan(1);
    expect(b.rect).toEqual(rowRect(1, 2));
  });

  test('the band glides between ranges and lands exactly', () => {
    const mid = bandAt(5.2, hls, rowRect)!;
    expect(mid.rect.y).toBeGreaterThan(0);
    expect(mid.rect.y).toBeLessThan(120);
    expect(bandAt(6, hls, rowRect)!.rect).toEqual(rowRect(4, 4));
    expect(bandAt(6, hls, rowRect)!.alpha).toBe(1);
  });

  test('until fades the band out', () => {
    const h = normalizeHighlights([{ lines: 1, at: 0, until: 3 }]);
    expect(bandAt(2, h, rowRect)!.alpha).toBe(1);
    expect(bandAt(3.5, h, rowRect)).toBeNull();
  });
});

describe('codeBlock piece', () => {
  const lines = ['const a = 1;', 'const b = 2;', 'const c = a + b;'];
  const make = (extra: any = {}) => buildScene(s => s.codeBlock({ id: 'cb', title: 'x.ts', lines, area: { x: 100, y: 100, w: 1200, h: 600 }, at: 0, ...extra }), pieces);

  test('registers the window and reports title and code text to the QA gate', () => {
    const { engine } = make();
    const rec = records(engine, 6).cb;
    expect(rec.container).toBe(true);
    expect(rec.texts.map((t: any) => t.text)).toEqual(['x.ts', lines.join('\n')]);
    expect(engine.texts().map((t: any) => t.text)).toEqual(expect.arrayContaining(['x.ts', ...lines]));
  });

  test('typing mode draws fewer characters early than late', () => {
    const { engine, log } = make({ typeDur: 2 });
    const chars = (t: number) => {
      log.length = 0;
      engine.render(t);
      return log.filter(c => c[0] === 'fillText' && /const/.test(String(c[1]))).map(c => String(c[1]).length).reduce((a, b) => a + b, 0);
    };
    expect(chars(1.0)).toBeLessThan(chars(5));
    expect(chars(5)).toBeGreaterThan(30);
  });

  test('pointer callout sits right of the window, registered and inside the frame', () => {
    const { engine } = make({ pointer: { line: 2, text: 'Aquí', at: 3 } });
    const recs = records(engine, 6);
    const p = recs['cb-pointer'];
    expect(p.rect.x).toBeGreaterThan(recs.cb.rect.x + recs.cb.rect.w);
    expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(1920 - 24);
    expect(recs['cb-pointer-leader']).toBeDefined();
  });

  for (const [name, style] of STYLES) {
    test(`demo passes the QA gate (${name})`, () => {
      expect(qaOfDemo(demo, pieces, style).errors).toEqual([]);
    });
  }
});
