/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import demo2 from '../../examples/pieces/motion2.scene.js';
import demo from '../../examples/pieces/motion.scene.js';
import { pieces as flowPieces } from './flow.js';
import { buildScene, qaOfDemo, records, STYLES } from './harness-b.ts';
import { pieces, routePoints } from './motion.js';

const flow = (s: any) => {
  s.row([{ id: 'a', w: 300, h: 150 }, { id: 'b', w: 300, h: 150 }, { id: 'c', w: 300, h: 150 }], { gap: 200 });
  for (const id of ['a', 'b', 'c']) { s.node({ id, text: id.toUpperCase(), at: 0 }); }
  s.edge({ from: 'a', to: 'b', at: 0 });
  s.edge({ from: 'b', to: 'c', at: 0 });
};
const make = (extra: (s: any) => void) => buildScene((s) => { flow(s); extra(s); }, pieces);
const scales = (log: any[][]) => log.filter(c => c[0] === 'scale').map(c => Number(c[1]));
const translates = (log: any[][]) => log.filter(c => c[0] === 'translate').map(c => Number(c[1]));

describe('wrapping helpers', () => {
  test('pulse scales the target only while it beats and sends a ring', () => {
    const { engine, log } = make(s => s.pulse({ target: 'b', at: 3, dur: 1, times: 1 }));
    log.length = 0;
    engine.render(3.5);
    expect(Math.max(...scales(log))).toBeGreaterThan(1.05);
    log.length = 0;
    engine.render(6);
    expect(Math.max(...scales(log))).toBeLessThanOrEqual(1.0001);
  });

  test('shake offsets the target inside its window and returns to rest', () => {
    const rest = make(() => {});
    rest.log.length = 0;
    rest.engine.render(5);
    const base = translates(rest.log);
    const { engine, log } = make(s => s.shake({ target: 'c', at: 2, dur: 1 }));
    log.length = 0;
    engine.render(2.1);
    expect(translates(log).some((v, i) => Math.abs(v - (base[i] ?? v)) > 1 || log.length !== rest.log.length)).toBe(true);
    log.length = 0;
    engine.render(5);
    expect(translates(log)).toEqual(base);
  });

  test('helpers that wrap an item need it to exist first', () => {
    expect(() => buildScene(s => s.pulse({ target: 'ghost' }), pieces)).toThrow('no item "ghost"');
    expect(() => buildScene(s => s.shake({ target: 'ghost' }), pieces)).toThrow('no item "ghost"');
  });

  test('highlight validates its style and draws only inside its window', () => {
    expect(() => make(s => s.highlight({ target: 'a', style: 'blink' }))).toThrow('unknown style');
    const { engine, log } = make(s => s.highlight({ target: 'a', style: 'underline', at: 4, until: 5 }));
    const strokes = (t: number) => { log.length = 0; engine.render(t); return log.filter(c => c[0] === 'stroke').length; };
    expect(strokes(4.5)).toBeGreaterThan(strokes(2));
    expect(strokes(8)).toBe(strokes(2));
  });
});

describe('travelDot', () => {
  test('routes follow ids, edge items or raw points', () => {
    const { engine } = make(() => {});
    expect(engine).toBeDefined();
    buildScene((s) => {
      flow(s);
      const viaIds = routePoints(s, { path: ['a', 'b', 'c'] });
      expect(viaIds).toHaveLength(4);
      expect(viaIds[0][0]).toBeLessThan(viaIds[3][0]);
      expect(routePoints(s, { edge: 'a->b' })).toHaveLength(2);
      expect(routePoints(s, { points: [[0, 0], [1, 1]] })).toEqual([[0, 0], [1, 1]]);
      expect(() => routePoints(s, { edge: 'nope' })).toThrow('no edge item');
      expect(() => routePoints(s, { path: ['a'] })).toThrow('needs path');
    }, pieces);
  });

  test('the dot is only drawn while it travels', () => {
    const { engine, log } = make(s => s.travelDot({ path: ['a', 'c'], at: 3, dur: 2 }));
    const arcs = (t: number) => { log.length = 0; engine.render(t); return log.filter(c => c[0] === 'ellipse').length; };
    expect(arcs(4)).toBeGreaterThan(arcs(1));
    expect(arcs(8)).toBe(arcs(1));
  });
});

describe('morph, expand, squeeze', () => {
  const nodes = (s: any) => {
    s.reg.add('from', { x: 100, y: 300, w: 300, h: 150 });
    s.reg.add('to', { x: 900, y: 250, w: 500, h: 300 });
    s.node({ id: 'from', text: 'Origen', at: 0 });
    s.node({ id: 'to', text: 'Destino', at: 0 });
  };

  test('morph hides the source from its start and the destination until it ends', () => {
    const { engine } = buildScene((s) => { nodes(s); s.morph({ from: 'from', to: 'to', at: 2, dur: 1 }); }, pieces);
    const at = (t: number) => records(engine, t);
    expect(at(1).from.alpha).toBeGreaterThan(0.9);
    expect(at(2.5).from.alpha).toBe(0);
    expect(at(2.5).to.alpha).toBe(0);
    expect(at(3.5).to.alpha).toBeGreaterThan(0.9);
    const mid = Object.values<any>(at(2.5)).find(r => r.kind === 'fx' && r.rect.x > 100 && r.rect.x < 900)!;
    expect(mid.rect.w).toBeGreaterThan(300);
    expect(mid.rect.w).toBeLessThan(500);
    expect(engine.texts().map((t: any) => t.text)).toEqual(expect.arrayContaining(['Origen', 'Destino']));
  });

  test('expand opens the node into a panel with its title and lines, and closes again', () => {
    const { engine } = buildScene((s) => {
      nodes(s);
      s.expand({ target: 'to', id: 'panel', at: 2, dur: 1, closeAt: 6, rect: { x: 200, y: 150, w: 1400, h: 700 }, title: 'Detalle', lines: ['uno', 'dos'] });
    }, pieces);
    const open = records(engine, 4.5)['panel-panel'];
    expect(open.rect.w).toBe(1400);
    expect(open.texts.map((t: any) => t.text)).toEqual(['Detalle', 'uno', 'dos']);
    expect(records(engine, 4.5).to.alpha).toBe(0);
    expect(records(engine, 9).to.alpha).toBeGreaterThan(0.9);
    expect(records(engine, 9)['panel-panel'].alpha).toBe(0);
  });

  test('squeeze needs two targets, hides them and leaves one merged node', () => {
    expect(() => buildScene(s => s.squeeze({ targets: ['a'] }), pieces)).toThrow('two targets');
    const { engine } = make(s => s.squeeze({ targets: ['a', 'b', 'c'], into: { id: 'all', text: 'Todo' }, at: 3, dur: 1 }));
    const early = records(engine, 2);
    expect(early.a.alpha).toBeGreaterThan(0.9);
    const after = records(engine, 6);
    expect([after.a.alpha, after.b.alpha, after.c.alpha]).toEqual([0, 0, 0]);
    expect(after.all.alpha).toBe(1);
    expect(after.all.rect.w).toBeGreaterThan(300);
  });

  for (const [name, style] of STYLES) {
    test(`demos pass the QA gate (${name})`, () => {
      expect(qaOfDemo(demo, pieces, style).errors).toEqual([]);
      expect(qaOfDemo(demo2, pieces, style).errors).toEqual([]);
    });
  }
});

describe('motion helpers on composite sub-ids', () => {
  test('pulse and shake accept a registered flow step id ("pasos-2" wraps its item "pasos-2.step")', () => {
    const { engine, log } = buildScene((s: any) => {
      s.flow({ id: 'pasos', steps: ['Uno', 'Dos', 'Tres'], at: 0 });
      s.pulse({ target: 'pasos-2', at: 1, dur: 1, times: 1 });
      s.shake({ target: 'pasos-3', at: 3 });
    }, { ...flowPieces, ...pieces });
    log.length = 0;
    engine.render(1.5);
    expect(scales(log).some(k => k > 1.01)).toBe(true);
  });

  test('an unknown target still fails and names what is accepted', () => {
    expect(() => buildScene((s: any) => {
      s.flow({ id: 'pasos', steps: ['Uno', 'Dos'], at: 0 });
      s.pulse({ target: 'pasos-9', at: 1 });
    }, { ...flowPieces, ...pieces })).toThrow('registered sub-id');
  });
});
