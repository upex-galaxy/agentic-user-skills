/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import demo from '../../examples/pieces/movement.scene.js';
import { createEngine } from '../core.js';
import { allPieces, kit } from '../index.js';
import { defaultTimes, runQA } from '../qa.js';
import { makeStubCtx } from '../stub-ctx.ts';
import { hologram, sketch } from '../test-presets.ts';
import { basePieces } from './base.js';
import { pieces as iconPieces } from './icons.js';
import { pieces } from './movement.js';
import { pieces as titlePieces } from './titles.js';

// Rough.js stand-in that accepts every drawing method (the shared stub only knows four).
const installRoughStub = (log: unknown[][]) => {
  (globalThis as any).rough = { canvas: () => new Proxy({}, { get: (_, name) => (...args: unknown[]) => { log.push([`rough.${String(name)}`, ...args]); } }) };
};
const PRESETS = [['hologram', hologram], ['sketch', sketch]] as const;

function build(style: any, fn: (s: any) => void, dur = 10) {
  const stub = makeStubCtx(0.55);
  if (style === sketch) { installRoughStub(stub.log); }
  const engine = createEngine({ canvas: stub.canvas, style, pieces: { ...basePieces, ...iconPieces, ...titlePieces, ...pieces }, spec: { scenes: [{ name: 't', dur, build: fn }] } } as any);
  return { engine, ...stub };
}
const rects = (s: any) => {
  s.reg.add('A', { x: 100, y: 300, w: 100, h: 100 });
  s.reg.add('B', { x: 700, y: 300, w: 100, h: 100 });
};

describe('packets', () => {
  test('id path leaves from the borders facing each other and is halfway at mid travel', () => {
    let it: any;
    build(hologram, (s) => { rects(s); it = s.packets({ path: ['A', 'B'], at: 1, dur: 2 }); });
    expect(it.pts[0][0]).toBeCloseTo(210, 3);
    expect(it.pts.at(-1)[0]).toBeCloseTo(690, 3);
    expect(it.positions(0.5)).toEqual([]);
    const [p] = it.positions(2);
    expect(p.x).toBeCloseTo(450, 3);
    expect(p.y).toBeCloseTo(350, 3);
    expect(it.positions(3.5)).toEqual([]);
    expect(it.arriveAt).toBe(3);
  });

  test('point path uses the points as given', () => {
    let it: any;
    build(hologram, (s) => { it = s.packets({ path: [[100, 100], [500, 100]], at: 0, dur: 2 }); });
    expect(it.positions(1)[0].x).toBeCloseTo(300, 3);
    expect(it.positions(1)[0].y).toBeCloseTo(100, 3);
  });

  test('anchor path starts exactly on the named anchor', () => {
    let it: any;
    build(hologram, (s) => { rects(s); it = s.packets({ path: [{ id: 'A', anchor: 'right' }, [600, 350]], at: 0, dur: 2 }); });
    expect(it.pts[0]).toEqual([200, 350]);
    expect(it.positions(1)[0].x).toBeCloseTo(400, 3);
  });

  test('every emission is a separate packet, end counts the ping', () => {
    let it: any;
    build(hologram, (s) => { rects(s); it = s.packets({ path: ['A', 'B'], at: 0, until: 1, every: 0.5, dur: 1 }); });
    expect(it.positions(0.75).map((p: any) => p.n)).toEqual([0, 1]);
    expect(it.end).toBeCloseTo(2 + 0.45, 6);
  });

  test('arc and s curves bend the route off the straight line', () => {
    let arc: any;
    let sv: any;
    build(hologram, (s) => {
      rects(s);
      arc = s.packets({ path: ['A', 'B'], curve: 'arc', bend: -100 });
      sv = s.packets({ path: [[100, 100], [500, 300]], curve: 's' });
    });
    const mid = arc.pts[Math.floor(arc.pts.length / 2)];
    expect(mid[1]).toBeLessThan(330);
    expect(sv.pts.length).toBeGreaterThan(10);
  });

  test('edge follows the points of a registered edge item; shapes and unknown ids are validated', () => {
    expect(() => build(hologram, (s) => { rects(s); s.packets({ edge: 'nope' }); })).toThrow(/no edge item/);
    expect(() => build(hologram, (s) => { rects(s); s.packets({ path: ['A', 'B'], shape: 'banana' }); })).toThrow(/unknown shape/);
    expect(() => build(hologram, (s) => { rects(s); s.packets({ path: ['A', 'ZZ'] }); })).toThrow(/unknown (element )?id/i);
    let it: any;
    build(hologram, (s) => {
      s.add({ kind: 'edge', id: 'e1', pts: [[0, 0], [400, 0]], draw() {}, texts: () => [] });
      it = s.packets({ edge: 'e1', at: 0, dur: 2 });
    });
    expect(it.positions(1)[0].x).toBeCloseTo(200, 3);
  });

  for (const [name, style] of PRESETS) {
    test(`glyph shapes draw and QA stays clean (${name})`, () => {
      const { engine } = build(style, (s) => {
        s.icon({ id: 'A', kind: 'laptop', rect: { x: 100, y: 300, w: 200, h: 240 } });
        s.icon({ id: 'B', kind: 'cloud', rect: { x: 1000, y: 300, w: 200, h: 240 } });
        s.packets({ path: ['A', 'B'], shape: 'doc', at: 1, until: 2, curve: 'arc' });
        s.packets({ path: ['A', 'B'], shape: 'box', at: 3 });
      }, 6);
      expect(runQA(engine, [0.5, 1.5, 2.5, 3.5, 4.5], { determinism: false }).ok).toBe(true);
    });
  }
});

describe('particles and burst', () => {
  const sampleOf = (style: any, mode: string) => {
    let it: any;
    build(style, (s) => { it = s.particles({ mode, at: 0.5, dur: 2, count: 20, seed: 7 }); });
    return [0.8, 1.2, 2].map(t => it.sample(t));
  };
  for (const mode of ['burst', 'confetti', 'ambient', 'hearts']) {
    test(`${mode}: seeded, identical across two builds, and it draws something`, () => {
      const a = sampleOf(hologram, mode);
      const b = sampleOf(hologram, mode);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.some(x => x.length > 0)).toBe(true);
    });
  }

  test('another seed moves the particles; unknown mode lists the modes', () => {
    let a: any;
    let b: any;
    build(hologram, (s) => { a = s.particles({ mode: 'burst', seed: 1 }); b = s.particles({ mode: 'burst', seed: 2 }); });
    expect(JSON.stringify(a.sample(0.5))).not.toBe(JSON.stringify(b.sample(0.5)));
    expect(() => build(hologram, (s) => { s.particles({ mode: 'rain' }); })).toThrow(/burst, confetti, ambient, hearts/);
  });

  test('the same render twice gives the same draw calls', () => {
    const run = () => {
      const { engine, log } = build(hologram, (s) => { s.particles({ mode: 'confetti', at: 0, seed: 3 }); s.burst({ origin: [900, 500], at: 0, seed: 3 }); });
      engine.render(0.9);
      return JSON.stringify(log);
    };
    expect(run()).toBe(run());
  });

  test('burst needs a position', () => {
    expect(() => build(hologram, (s) => { s.burst({}); })).toThrow(/origin or target/);
    let it: any;
    build(hologram, (s) => { rects(s); it = s.burst({ target: 'A', at: 1, dur: 1 }); });
    expect(it.end).toBeCloseTo(2.15, 6);
  });
});

describe('parallax', () => {
  test('far layers follow the camera less than near ones and the doodles drift', () => {
    let it: any;
    build(hologram, (s) => {
      it = s.parallax({ layers: 2, count: 3, seed: 5 });
      s.camera.pan(1160, 540, 1, 1);
    }, 6);
    const a = it.marks(0);
    const b = it.marks(3);
    const shift = (i: number) => (b[i].x - a[i].x);
    // Same seed and depth order: layer 1 (far) is the first three marks, layer 2 (near) the last three.
    const far = [0, 1, 2].map(shift);
    expect(far.every(v => Number.isFinite(v))).toBe(true);
    expect(a.slice(0, 3).every((m: any) => m.depth === 0.5)).toBe(true);
    // Camera panned +200 on x: a far mark (follow 0.625) is pushed further than a near one (follow 0.25).
    const push = (m: any[], n: any[], i: number) => (n[i].x - m[i].x) + 3 * 14 * m[i].depth;
    expect(push(a, b, 0)).toBeCloseTo(200 * 0.625, 3);
    expect(push(a, b, 3)).toBeCloseTo(200 * 0.25, 3);
  });

  test('kinds and bad kind', () => {
    for (const kind of ['shapes', 'dots', 'rings']) {
      let it: any;
      build(hologram, (s) => { it = s.parallax({ kind }); });
      expect(it.marks(0).length).toBe(24);
      if (kind !== 'shapes') { expect(new Set(it.marks(0).map((m: any) => m.type)).size).toBe(1); }
    }
    expect(() => build(hologram, (s) => { s.parallax({ kind: 'x' }); })).toThrow(/shapes, dots, rings/);
  });

  test('reports no QA record (decoration)', () => {
    const { engine } = build(hologram, (s) => { s.parallax({}); s.spotlight({ target: { x: 400, y: 400, w: 200, h: 200 } }); s.particles({ mode: 'ambient' }); });
    expect(engine.sample(2)[0].records).toEqual([]);
  });
});

describe('splitScreen', () => {
  for (const [name, style] of PRESETS) {
    test(`registers the two inner rects and hosts pieces (${name})`, () => {
      let rl: any;
      let rr: any;
      const { engine } = build(style, (s) => {
        s.splitScreen({ id: 'sp', left: { label: 'Antes', color: 'bad' }, right: { label: 'Después', color: 'good' }, slant: 40, at: 0.2 });
        rl = s.reg.get('sp.left');
        rr = s.reg.get('sp.right');
        s.icon({ kind: 'clock', in: 'sp.left', inset: 40, label: 'Lento', at: 0.5 });
        s.icon({ kind: 'bolt', in: 'sp.right', inset: 40, label: 'Rápido', at: 0.5 });
      }, 5);
      expect(rl.x + rl.w).toBeLessThan(rr.x);
      expect(rl.y).toBeGreaterThan(244);
      expect(runQA(engine, [1.5, 3, 4.5], { determinism: false }).ok).toBe(true);
      const texts = engine.sample(3)[0].records.find((r: any) => r.id === 'sp').texts.map((x: any) => x.text);
      expect(texts).toEqual(['Antes', 'Después']);
    });
  }
});

describe('journeyRail', () => {
  const STEPS = ['Uno', 'Dos', 'Tres'];

  test('is a zoomFade HUD item with all steps in texts() and the QA record', () => {
    const { engine } = build(hologram, (s) => { s.journeyRail({ steps: STEPS, active: 1 }); });
    const rec = engine.sample(2)[0].records[0];
    expect(rec.hud).toBe(true);
    expect(rec.zoomFade).toBe(true);
    expect(rec.texts.map((x: any) => x.text)).toEqual(STEPS);
    expect(engine.texts().map((x: any) => x.text)).toEqual(STEPS);
  });

  test('sits right of the section tag and clear of heading, caption and footer in both presets', () => {
    for (const [, style] of PRESETS) {
      const { engine } = build(style, (s) => {
        s.sectionTag({ index: 1, total: 3, name: 'Paso', at: 0.1 });
        s.journeyRail({ steps: STEPS, active: 0 });
        s.heading({ text: 'Título', at: 0 });
        s.caption({ text: 'Pie', at: 0 });
        s.sourceFooter({ text: 'algo', at: 0 });
      });
      const recs = Object.fromEntries(engine.sample(3)[0].records.map((r: any) => [r.kind, r.rect]));
      expect(recs.rail.x).toBeGreaterThan(recs.tag.x + recs.tag.w);
      expect(recs.rail.y + recs.rail.h).toBeLessThanOrEqual(recs.heading.y);
      expect(runQA(engine, [1, 3, 5], { determinism: false }).ok).toBe(true);
    }
  });

  test('fades out at camera zoom 1.15 and is fully drawn at zoom 1', () => {
    const alphas = (t: number) => {
      const { engine, log } = build(hologram, (s) => {
        s.icon({ id: 'x', kind: 'bolt', rect: { x: 800, y: 300, w: 300, h: 300 } });
        s.journeyRail({ steps: ['Envío', 'Fin'], active: 0, at: 0 });
        s.camera.zoom(1.15, 1, 0.5);
      });
      log.length = 0;
      engine.render(t);
      let alpha = 1;
      const seen: number[] = [];
      for (const c of log) {
        if (c[0] === 'set' && c[1] === 'globalAlpha') { alpha = Number(c[2]); }
        if (c[0] === 'fillText' && (c[1] === 'Envío' || c[1] === 'Fin')) { seen.push(alpha); }
      }
      return seen;
    };
    const home = alphas(0.9);
    expect(home.length).toBeGreaterThan(0);
    expect(Math.max(...home)).toBeGreaterThan(0.4);
    const zoomed = alphas(2.5);
    expect(zoomed.length).toBeGreaterThan(0);
    expect(Math.max(...zoomed)).toBeLessThan(0.01);
  });

  test('needs two steps; exposes marks and end', () => {
    expect(() => build(hologram, (s) => { s.journeyRail({ steps: ['a'] }); })).toThrow(/steps/);
    let it: any;
    build(hologram, (s) => { it = s.journeyRail({ steps: STEPS, active: 2, at: 1 }); });
    expect(it.end).toBeCloseTo(1.9, 6);
    expect(it.marks.arrive).toBeCloseTo(1.9, 6);
  });
});

describe('movement demo', () => {
  for (const [name, style] of PRESETS) {
    test(`QA is clean (${name})`, () => {
      const spec = (demo)(kit);
      const stub = makeStubCtx(0.55);
      if (style === sketch) { installRoughStub(stub.log); }
      const engine = createEngine({ canvas: stub.canvas, style, pieces: allPieces, spec } as any);
      const res = runQA(engine, defaultTimes(engine), { determinism: false });
      expect(res.errors).toEqual([]);
    });
  }
});
