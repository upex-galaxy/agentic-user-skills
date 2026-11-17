/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import demo from '../../examples/pieces/anatomy.scene.js';
import { pieces, placeLabels } from './anatomy.js';
import { buildScene, qaOfDemo, records, STYLES } from './harness-b.ts';

const box = { x: 800, y: 200, w: 300, h: 600 };
const column = { x: 0, y: 100, w: 1920, h: 800 };

describe('callout placement', () => {
  test('sides follow the part position and each column stays ordered and non-overlapping', () => {
    const targets = [{ cx: 850, cy: 300 }, { cx: 1050, cy: 320 }, { cx: 1000, cy: 330 }, { cx: 880, cy: 340 }];
    const out = placeLabels({ targets, box, column });
    expect(out.map((o: any) => o.side)).toEqual(['left', 'right', 'right', 'left']);
    for (const side of ['left', 'right']) {
      const ys = out.filter((o: any) => o.side === side).map((o: any) => o.y).sort((a: number, b: number) => a - b);
      for (let i = 1; i < ys.length; i++) { expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(104); }
    }
  });

  test('explicit sides are kept and the stack is pulled back inside the column', () => {
    const targets = [{ cx: 900, cy: 880 }, { cx: 900, cy: 890 }, { cx: 900, cy: 895 }];
    const out = placeLabels({ targets, sides: ['left', 'left', 'left'], box, column });
    expect(out.every((o: any) => o.side === 'left')).toBe(true);
    for (const o of out) { expect(o.y + 104).toBeLessThanOrEqual(column.y + column.h + 0.5); }
  });

  test('a one-sided layout is balanced', () => {
    const targets = [1, 2, 3, 4, 5].map(i => ({ cx: 1000 + i, cy: 200 + i * 100 }));
    const out = placeLabels({ targets, box, column });
    const left = out.filter((o: any) => o.side === 'left').length;
    expect(Math.abs(left - (5 - left))).toBeLessThanOrEqual(2);
  });
});

describe('anatomy piece', () => {
  const parts = [{ id: 'body', x: 0, y: 0, w: 1, h: 1 }, { id: 'eye', shape: 'ellipse', x: 0.2, y: 0.2, w: 0.2, h: 0.1 }];
  const labels = [{ part: 'body', text: 'Cuerpo' }, { part: 'eye', text: 'Ojo' }];
  const make = (o: any = {}) => buildScene(s => s.anatomy({ id: 'an', area: { x: 100, y: 100, w: 1700, h: 800 }, aspect: 0.6, parts, labels, ...o }), pieces);

  test('registers parts, badges and label text; callouts reveal one by one', () => {
    const { engine } = make();
    const ids = Object.keys(records(engine, 9));
    expect(ids).toEqual(expect.arrayContaining(['an.body', 'an.eye', 'an.badge1', 'an.badge2', 'an.label1', 'an.leader1', 'an.dot2']));
    const t1 = records(engine, 2.2);
    expect(t1['an.label1'].alpha).toBeGreaterThan(t1['an.label2'].alpha);
  });

  test('a raw draw function replaces parts and labels target unit rects', () => {
    let drawn = 0;
    const { engine } = buildScene(s => s.anatomy({ id: 'raw', draw: () => { drawn++; }, labels: [{ target: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 }, text: 'Centro' }] }), pieces);
    engine.render(3);
    expect(drawn).toBeGreaterThan(0);
    expect(records(engine, 9)['raw.label1']).toBeDefined();
  });

  test('unknown parts fail at build time', () => {
    expect(() => make({ labels: [{ part: 'nope', text: 'x' }] })).toThrow('unknown part');
  });

  for (const [name, style] of STYLES) {
    test(`demo passes the QA gate (${name})`, () => {
      expect(qaOfDemo(demo, pieces, style).errors).toEqual([]);
    });
  }
});
