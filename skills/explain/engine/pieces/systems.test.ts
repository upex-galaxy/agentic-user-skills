/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import demo from '../../examples/pieces/systems.scene.js';
import { createEngine } from '../core.js';
import { kit } from '../index.js';
import { defaultTimes, runQA } from '../qa.js';
import { installRoughStub, makeStubCtx } from '../stub-ctx.ts';
import { hologram, sketch } from '../test-presets.ts';
import { basePieces } from './base.js';
import { pieces } from './systems.js';

const PRESETS = [['hologram', hologram], ['sketch', sketch]] as const;
const A = { x: 80, y: 244, w: 1760, h: 636 };

function build(style: any, fn: (s: any) => void, dur = 14) {
  const stub = makeStubCtx(0.55);
  if (style === sketch) { installRoughStub(stub.log); }
  const engine = createEngine({ canvas: stub.canvas, style, pieces: { ...basePieces, ...pieces }, spec: { scenes: [{ name: 't', dur, build: fn }] } } as any);
  return { engine, ...stub };
}
const recs = (engine: any, t: number) => Object.fromEntries(engine.sample(t)[0].records.map((r: any) => [r.id, r]));
const textsOf = (engine: any, t: number, id: string): string[] => recs(engine, t)[id].texts.map((x: any) => x.text);
const gate = (engine: any, times: number[]) => runQA(engine, times, { determinism: false });

const STAGES = [
  { name: 'Build', jobs: [{ name: 'compile', dur: 1.5 }, { name: 'lint', dur: 1 }] },
  { name: 'Test', jobs: [{ name: 'unit', dur: 2 }, { name: 'e2e', dur: 2, ok: false }] },
  { name: 'Deploy', jobs: [{ name: 'ship', dur: 1 }] },
];

describe('pipeline', () => {
  test('stageEnd marks chain stage after stage and end follows the last one', () => {
    let item: any;
    build(hologram, (s) => { item = s.pipeline({ id: 'ci', rect: A, runAt: 1, stages: STAGES }); });
    const m = item.marks.stageEnd;
    expect(m.Build).toBeCloseTo(1 + 1.5, 5);
    expect(m.Test).toBeCloseTo(m.Build + 0.4 + 0.15 + 2, 5);
    expect(m.Deploy).toBeCloseTo(m.Test + 0.4 + 1, 5);
    expect(item.end).toBeCloseTo(m.Deploy + 0.3, 5);
  });

  test('explicit job start wins and registers the job rects', () => {
    let item: any;
    const { engine } = build(hologram, (s) => {
      item = s.pipeline({ id: 'ci', rect: A, stages: [{ name: 'A', jobs: [{ id: 'x', name: 'one', start: 3, dur: 2 }] }] });
    });
    expect(item.marks.stageEnd.A).toBe(5);
    const reg = engine.scenes[0].reg ?? null;
    expect(reg === null || reg.has('ci.x')).toBe(true);
  });

  for (const [name, style] of PRESETS) {
    test(`jobs wait, run, pass or fail; timers reach their value (${name})`, () => {
      const { engine } = build(style, (s) => { s.pipeline({ id: 'ci', rect: A, runAt: 1, at: 0.2, stages: STAGES, timeScale: 10 }); });
      expect(recs(engine, 0.1).ci.alpha).toBe(0);
      const early = textsOf(engine, 1.5, 'ci');
      expect(early).toEqual(expect.arrayContaining(['Build', 'compile', 'lint', 'Test']));
      expect(early).toContain('5 s');
      expect(textsOf(engine, 20, 'ci')).toContain('15 s');
      expect(textsOf(engine, 20, 'ci')).toContain('20 s');
      expect(gate(engine, [0.1, 0.8, 1.5, 2.5, 4, 6, 8, 10, 14]).ok).toBe(true);
    });
  }

  test('parts report stages and jobs, bad input throws', () => {
    const { engine } = build(hologram, (s) => { s.pipeline({ id: 'ci', rect: A, stages: STAGES }); });
    expect(recs(engine, 5).ci.parts.map((p: any) => p.id)).toEqual(['s1', 'j1.1', 'j1.2', 's2', 'j2.1', 'j2.2', 's3', 'j3.1']);
    expect(() => build(hologram, s => s.pipeline({ rect: A, stages: [] }))).toThrow();
  });
});

const COMMITS = [
  { id: 'a', lane: 'main', col: 0, at: 1, label: 'init' },
  { id: 'b', lane: 'main', col: 1, at: 2, parents: ['a'] },
  { id: 'f', lane: 'dev', col: 2, at: 3, parents: ['b'], label: 'work' },
  { id: 'm', lane: 'main', col: 3, at: 4, parents: ['b', 'f'], tag: 'v1' },
];

describe('gitGraph', () => {
  for (const [name, style] of PRESETS) {
    test(`registers every commit, fits lane names and passes QA (${name})`, () => {
      let reg: any;
      const { engine } = build(style, (s) => {
        reg = s.reg;
        s.gitGraph({ id: 'g', rect: A, at: 0.2, lanes: [{ name: 'main', color: 'accent' }, { name: 'feature/some-long-branch-name', color: 'accent2' }], commits: COMMITS.map(c => (c.lane === 'dev' ? { ...c, lane: 'feature/some-long-branch-name' } : c)) });
      });
      for (const c of ['a', 'b', 'f', 'm']) { expect(reg.has(`g.${c}`)).toBe(true); }
      const tx = textsOf(engine, 8, 'g');
      expect(tx).toEqual(expect.arrayContaining(['main', 'feature/some-long-branch-name', 'init', 'work', 'v1']));
      expect(recs(engine, 8).g.texts.every((x: any) => !x.overflow)).toBe(true);
      expect(textsOf(engine, 1.5, 'g')).not.toContain('v1');
      expect(gate(engine, [0.1, 1.2, 2.5, 3.5, 4.5, 6, 9]).ok).toBe(true);
    });
  }

  test('marks hold the commit times and unknown lanes or parents throw', () => {
    let item: any;
    build(hologram, (s) => { item = s.gitGraph({ id: 'g', rect: A, lanes: [{ name: 'main' }], commits: [{ id: 'a', lane: 'main', col: 0 }, { id: 'b', lane: 'main', col: 1, at: 3, parents: ['a'] }] }); });
    expect(item.marks.b).toBe(3);
    expect(item.marks.a).toBeCloseTo(0.5, 5);
    expect(() => build(hologram, s => s.gitGraph({ id: 'g', rect: A, lanes: [{ name: 'main' }], commits: [{ id: 'a', lane: 'nope', col: 0 }] }))).toThrow();
    expect(() => build(hologram, s => s.gitGraph({ id: 'g', rect: A, lanes: [{ name: 'main' }], commits: [{ id: 'a', lane: 'main', col: 0, parents: ['zzz'] }] }))).toThrow();
  });
});

describe('machine', () => {
  const opts = { id: 'mq', rect: A, at: 0.5, inputs: [{ kind: 'doc', label: 'code' }, { kind: 'doc', label: 'styles' }, { kind: 'database', label: 'data' }], machine: { label: 'Pack' }, output: { kind: 'package', label: 'app.zip' } };
  for (const [name, style] of PRESETS) {
    test(`marks, labels in flight and the output label after the run (${name})`, () => {
      let item: any;
      const { engine } = build(style, (s) => { item = s.machine(opts); });
      const { processStart, processEnd } = item.marks;
      expect(processStart).toBeCloseTo(0.5 + 0.9 + 1.3 * 0.8, 5);
      expect(processEnd).toBeCloseTo(0.5 + 0.9 + 2 * 0.8 + 1.3 + 1.6, 5);
      expect(item.end).toBeCloseTo(processEnd + 1.3, 5);
      expect(textsOf(engine, 1.9, 'mq')).toContain('code');
      expect(textsOf(engine, 1.9, 'mq')).not.toContain('app.zip');
      expect(textsOf(engine, item.end + 1, 'mq')).toEqual(expect.arrayContaining(['Pack', 'app.zip']));
      expect(textsOf(engine, item.end + 1, 'mq')).not.toContain('code');
      expect(gate(engine, [0.2, 1, 1.8, 2.6, 3.4, 4.5, 6, 7.5, 9, 11]).ok).toBe(true);
    });
  }
  test('registers the machine and the output', () => {
    let reg: any;
    build(hologram, (s) => { reg = s.reg; s.machine(opts); });
    expect(reg.has('mq.machine') && reg.has('mq.out')).toBe(true);
    expect(() => build(hologram, s => s.machine({ rect: A, inputs: [] }))).toThrow();
  });
});

describe('fleet', () => {
  for (const [name, style] of PRESETS) {
    test(`flips one by one, marks per flip, version text swaps (${name})`, () => {
      let item: any;
      const { engine } = build(style, (s) => { item = s.fleet({ id: 'fl', rect: A, count: 4, from: 'v1', to: 'v2', startAt: 1.5, step: 1.2, at: 0.2 }); });
      const m = item.marks;
      expect(Object.keys(m)).toEqual(['flip1', 'flip2', 'flip3', 'flip4']);
      expect(m.flip2 - m.flip1).toBeCloseTo(1.2, 5);
      expect(item.end).toBeCloseTo(1.5 + 3 * 1.2 + 0.35 + 0.7 + 0.45, 5);
      const v = (t: number) => textsOf(engine, t, 'fl').filter(x => /^v\d$/.test(x));
      expect(v(1.2)).toEqual(['v1', 'v1', 'v1', 'v1']);
      expect(v(m.flip1 + 0.05)).toEqual(['v2', 'v1', 'v1', 'v1']);
      expect(v(item.end + 1)).toEqual(['v2', 'v2', 'v2', 'v2']);
      expect(textsOf(engine, 5, 'fl')).toContain('LB');
      expect(gate(engine, [0.1, 0.6, 1.2, 1.6, 2.5, 3.5, 4.8, 6, 8]).ok).toBe(true);
    });
  }
  test('cols make rows, lb false hides the balancer, ids register', () => {
    let reg: any;
    const { engine } = build(hologram, (s) => { reg = s.reg; s.fleet({ id: 'fl', rect: A, count: 6, cols: 3, lb: false, at: 0 }); });
    expect(reg.get('fl.s4').y).toBeGreaterThan(reg.get('fl.s1').y);
    expect(reg.has('fl.lb')).toBe(false);
    expect(textsOf(engine, 12, 'fl')).not.toContain('LB');
    expect(gate(engine, [1, 3, 6, 10, 13]).ok).toBe(true);
  });
});

describe('layers', () => {
  for (const [name, style] of PRESETS) {
    test(`drop in bottom first, texts appear in order and QA passes (${name})`, () => {
      let reg: any;
      let item: any;
      const { engine } = build(style, (s) => {
        reg = s.reg;
        item = s.layers({ id: 'st', rect: { x: 300, y: 250, w: 1200, h: 560 }, at: 1, step: 0.5, layers: [{ text: 'Infra' }, { text: 'Data', color: 'good' }, { text: 'UI', color: 'warn' }] });
      });
      expect(reg.get('st.l1').y).toBeGreaterThan(reg.get('st.l3').y);
      expect(textsOf(engine, 1.1, 'st')).toEqual([]);
      expect(textsOf(engine, 1.3, 'st')).toEqual(['Infra']);
      expect(textsOf(engine, 4, 'st')).toEqual(['Infra', 'Data', 'UI']);
      expect(item.end).toBeCloseTo(1 + 2 * 0.5 + 0.55, 5);
      expect(gate(engine, [0.5, 1.3, 1.8, 2.4, 4]).ok).toBe(true);
    });
  }
});

describe('demo', () => {
  for (const [name, style] of PRESETS) {
    test(`the example scene passes the QA gate (${name})`, () => {
      const stub = makeStubCtx(0.55);
      if (style === sketch) { installRoughStub(stub.log); }
      const engine = createEngine({ canvas: stub.canvas, style, pieces: { ...basePieces, ...pieces }, spec: (demo)(kit) } as any);
      expect(runQA(engine, defaultTimes(engine, 0.5), { determinism: false }).ok).toBe(true);
    });
  }
});

// Regression: the handwriting face is wide (the stub measures 0.7 of the size per glyph).
function buildWide(fn: (s: any) => void, dur = 10) {
  const stub = makeStubCtx(0.7);
  installRoughStub(stub.log);
  const engine = createEngine({ canvas: stub.canvas, style: sketch, pieces: { ...basePieces, ...pieces }, spec: { scenes: [{ name: 't', dur, build: fn }] } } as any);
  return { engine, ...stub };
}

describe('gitGraph label band', () => {
  const rect = { x: 160, y: 250, w: 1600, h: 500 };
  const commits = [
    { id: 'a', lane: 'main', col: 0, label: 'init proyecto', tag: 'v1.0' },
    { id: 'b', lane: 'feat', col: 1, parents: ['a'], label: 'agrega cupón de descuento' },
    { id: 'c', lane: 'feat', col: 2, parents: ['b'], label: 'pruebas del cupón' },
    { id: 'd', lane: 'main', col: 3, parents: ['a', 'c'], label: 'merge de la rama', tag: 'v1.1-release' },
    { id: 'e', lane: 'main', col: 4, parents: ['d'], label: 'despliegue final', tag: 'prod' },
    { id: 'f', lane: 'feat', col: 4, parents: ['c'], label: 'limpieza', tag: 'fin' },
  ];

  test('labels and tags on the top lane, the bottom lane and the last column stay inside the rect and clear of each other', () => {
    const { engine } = buildWide((s) => { s.gitGraph({ id: 'g', rect, lanes: [{ name: 'main' }, { name: 'feat' }], commits }); });
    const r = engine.sample(8)[0].records.find((x: any) => x.id === 'g');
    expect(r.texts.length).toBeGreaterThanOrEqual(8);
    for (const tx of r.texts) {
      expect(tx.overflow).toBe(false);
      expect(tx.rect.x).toBeGreaterThanOrEqual(rect.x);
      expect(tx.rect.y).toBeGreaterThanOrEqual(rect.y);
      expect(tx.rect.x + tx.rect.w).toBeLessThanOrEqual(rect.x + rect.w);
      expect(tx.rect.y + tx.rect.h).toBeLessThanOrEqual(rect.y + rect.h);
    }
    expect(gate(engine, [2, 4, 6, 8]).ok).toBe(true);
  });

  test('a label wider than its column is shortened with an ellipsis instead of overflowing', () => {
    const { engine } = buildWide((s) => {
      s.gitGraph({ id: 'g', rect, cols: 12, lanes: [{ name: 'main' }], commits: [{ id: 'a', lane: 'main', col: 0, label: 'un mensaje de commit larguísimo' }, { id: 'b', lane: 'main', col: 11, label: 'otro mensaje muy largo', tag: 'etiqueta-larga' }] });
    });
    const r = engine.sample(8)[0].records.find((x: any) => x.id === 'g');
    expect(r.texts.some((x: any) => x.text.endsWith('…'))).toBe(true);
    expect(r.texts.every((x: any) => !x.overflow && x.rect.x >= rect.x && x.rect.x + x.rect.w <= rect.x + rect.w)).toBe(true);
  });
});
