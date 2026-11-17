import { describe, expect, test } from 'bun:test';
import { makeStubCtx } from './stub-ctx.ts';
import { fitText, layoutCode, measure, revealLines, wrapText } from './text.js';

// Stub metrics: width = chars * px * 0.5, so at 20px every character is 10px wide.
const { ctx } = makeStubCtx(0.5);
const font = (px: number) => `${px}px test`;

describe('wrapText', () => {
  test('wraps greedily and keeps word order', () => {
    const lines = wrapText(ctx, 'aaa bbb ccc ddd', 70, font(20)); // 7 chars per line
    expect(lines).toEqual(['aaa bbb', 'ccc ddd']);
    expect(lines.join(' ')).toBe('aaa bbb ccc ddd');
  });

  test('respects explicit newlines and breaks words wider than the box', () => {
    expect(wrapText(ctx, 'a\nb', 100, font(20))).toEqual(['a', 'b']);
    const lines = wrapText(ctx, 'abcdefghij', 50, font(20));
    expect(lines.join('')).toBe('abcdefghij');
    for (const l of lines) { expect(measure(ctx, l, font(20))).toBeLessThanOrEqual(50); }
  });
});

describe('fitText', () => {
  test('keeps the max size when the text fits', () => {
    const f = fitText(ctx, 'hello', { w: 400, h: 100 }, { fontFor: font, maxPx: 40, minPx: 12 });
    expect(f.px).toBe(40);
    expect(f.overflow).toBe(false);
  });

  test('shrinks until the text fits, then stops', () => {
    const f = fitText(ctx, 'hello world again', { w: 120, h: 60 }, { fontFor: font, maxPx: 60, minPx: 10 });
    expect(f.px).toBeLessThan(60);
    expect(f.px).toBeGreaterThanOrEqual(10);
    expect(f.overflow).toBe(false);
    expect(f.width).toBeLessThanOrEqual(120);
    expect(f.height).toBeLessThanOrEqual(60);
  });

  test('flags overflow at the minimum size', () => {
    const f = fitText(ctx, 'a very long sentence that cannot possibly fit in a tiny box', { w: 80, h: 30 }, { fontFor: font, maxPx: 30, minPx: 16 });
    expect(f.px).toBe(16);
    expect(f.overflow).toBe(true);
  });
});

describe('revealLines (typewriter)', () => {
  const lines = ['first line', 'second', 'third one'];

  test('reveals lines strictly in order', () => {
    for (let k = 0; k <= 100; k++) {
      const { shown } = revealLines(lines, k / 100);
      shown.forEach((s: string, i: number) => {
        if (s.length > 0 && i > 0) { expect(shown[i - 1]).toBe(lines[i - 1]); }
        expect(lines[i].startsWith(s)).toBe(true);
      });
    }
  });

  test('is monotonic and complete at p = 1', () => {
    let prev = 0;
    for (let k = 0; k <= 50; k++) {
      const n = revealLines(lines, k / 50).shown.reduce((a: number, s: string) => a + s.length, 0);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
    expect(revealLines(lines, 1).shown).toEqual(lines);
    expect(revealLines(lines, 0).shown).toEqual(['', '', '']);
  });
});

describe('layoutCode', () => {
  test('marks highlighted rows and fits the font to the box', () => {
    const lay = layoutCode(ctx, ['const a = 1;', { text: 'return a;', color: 'accent' }, 'end'], { w: 400, h: 200 }, { fontFor: font, maxPx: 30, minPx: 10, highlight: [2] });
    expect(lay.rows.map((r: { hl: boolean }) => r.hl)).toEqual([false, false, true]);
    expect(lay.rows[1].color).toBe('accent');
    expect(lay.overflow).toBe(false);
    expect(lay.widest).toBeLessThanOrEqual(400 - lay.pad * 2);
    expect(lay.rows[1].y).toBeGreaterThan(lay.rows[0].y);
  });

  test('flags overflow when the code cannot fit', () => {
    const lay = layoutCode(ctx, ['x'.repeat(200)], { w: 200, h: 100 }, { fontFor: font, maxPx: 30, minPx: 10 });
    expect(lay.overflow).toBe(true);
  });
});
