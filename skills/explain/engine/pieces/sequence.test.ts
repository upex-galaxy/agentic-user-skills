/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import demo from '../../examples/pieces/sequence.scene.js';
import { buildScene, qaOfDemo, records, STYLES } from './harness-b.ts';
import { pieces, sequenceLayout } from './sequence.js';

const area = { x: 100, y: 100, w: 1500, h: 800 };
const actors = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('sequence layout', () => {
  test('actors are evenly spaced columns, heads sit on top and rows run downward inside the area', () => {
    const L = sequenceLayout({ actors, messages: [{}, {}, {}, {}], area });
    expect(L.xs).toEqual([350, 850, 1350]);
    expect(L.heads[0].rect.y).toBe(area.y);
    expect(L.heads[0].rect.w).toBeLessThanOrEqual(300);
    expect(L.ys).toHaveLength(4);
    for (let i = 1; i < L.ys.length; i++) { expect(L.ys[i]).toBeGreaterThan(L.ys[i - 1]); }
    expect(L.ys[0]).toBeGreaterThan(L.heads[0].rect.y + L.heads[0].rect.h);
    expect(L.ys[3]).toBeLessThan(area.y + area.h);
  });
});

describe('sequence piece', () => {
  const messages = [
    { from: 'a', to: 'b', text: 'uno' },
    { from: 'b', to: 'c', text: 'dos', kind: 'async' },
    { from: 'c', to: 'b', text: 'tres', kind: 'return' },
    { from: 'b', to: 'b', text: 'auto' },
  ];
  const make = (extra: any = {}) => buildScene(s => s.sequence({ actors, messages, area, ...extra }), pieces);

  test('registers actor heads and message labels, one arrow per message', () => {
    const { engine } = make({ id: 'sq' });
    const ids = Object.keys(records(engine, 9));
    expect(ids).toEqual(expect.arrayContaining(['a', 'b', 'c', 'sq-m0', 'sq-m3', 'sq-m0-text', 'sq-life-a']));
    expect(ids.filter(i => /^sq-m\d$/.test(i))).toHaveLength(4);
  });

  test('messages draw strictly in order', () => {
    const { engine } = make({ id: 'sq', at: 0, step: 1 });
    const alphaAt = (t: number) => [0, 1, 2, 3].map(i => records(engine, t)[`sq-m${i}`].alpha);
    const a = alphaAt(2.4);
    expect(a[0]).toBeGreaterThan(0.99);
    for (let i = 1; i < 4; i++) { expect(a[i - 1]).toBeGreaterThanOrEqual(a[i]); }
    expect(alphaAt(9).every(v => v > 0.99)).toBe(true);
  });

  test('activation bars are optional and follow sync arrivals', () => {
    const without = Object.keys(records(make({ id: 'sq' }).engine, 9)).filter(i => i.includes('-act-'));
    const withBars = Object.keys(records(make({ id: 'sq', activation: true }).engine, 9)).filter(i => i.includes('-act-'));
    expect(without).toHaveLength(0);
    expect(withBars.length).toBeGreaterThanOrEqual(2);
  });

  test('unknown actors and kinds fail at build time', () => {
    expect(() => buildScene(s => s.sequence({ actors, messages: [{ from: 'a', to: 'zzz' }], area }), pieces)).toThrow('unknown actor');
    expect(() => buildScene(s => s.sequence({ actors, messages: [{ from: 'a', to: 'b', kind: 'x' }], area }), pieces)).toThrow('unknown kind');
    expect(() => buildScene(s => s.sequence({ actors: ['solo'], messages: [] }), pieces)).toThrow('two actors');
  });

  for (const [name, style] of STYLES) {
    test(`demo passes the QA gate (${name})`, () => {
      const r = qaOfDemo(demo, pieces, style);
      expect(r.errors).toEqual([]);
    });
  }
});
