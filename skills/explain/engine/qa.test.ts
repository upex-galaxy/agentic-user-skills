/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import { summarizeReport } from '../cli/qa.ts';
import smoke from '../examples/smoke.scene.js';
import { createEngine, kit } from './index.js';
import { countChanged, defaultTimes, runQA } from './qa.js';
import { makeStubCtx } from './stub-ctx.ts';
import hologram from './styles/hologram.js';

const run = (build: (s: any) => void, dur = 4) => {
  const stub = makeStubCtx(0.55);
  const engine = createEngine({ canvas: stub.canvas, style: hologram, spec: { scenes: [{ name: 's', dur, build }] } });
  return runQA(engine, defaultTimes(engine, 0.5));
};
const types = (r: any) => r.errors.map((e: any) => e.type);
const full = (s: any) => s.label({ id: 'balance-l', text: 'ok', rect: { x: 100, y: 100, w: 400, h: 100 } });

describe('qa gate', () => {
  test('the smoke scene passes', () => {
    const stub = makeStubCtx(0.55);
    const engine = createEngine({ canvas: stub.canvas, style: hologram, spec: (smoke)(kit) });
    const report = runQA(engine);
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(summarizeReport(report)).toContain('QA passed');
  });

  test('flags an opening ¿ or ¡ anywhere in on-screen text', () => {
    for (const text of ['¿Qué pasa?', '¡Hola!', 'Mira ¡esto']) {
      const r = run(s => s.label({ id: 'q', text, rect: { x: 400, y: 400, w: 1000, h: 100 } }));
      expect(types(r)).toContain('opening-punctuation');
      expect(r.ok).toBe(false);
    }
    expect(types(run(s => s.label({ id: 'ok', text: 'Qué pasa?', rect: { x: 400, y: 400, w: 1000, h: 100 } })))).not.toContain('opening-punctuation');
  });

  test('flags elements out of bounds', () => {
    const r = run((s) => {
      full(s);
      s.node({ id: 'n', text: 'x', rect: { x: 1800, y: 400, w: 300, h: 100 } });
    });
    expect(types(r)).toContain('out-of-bounds');
  });

  test('flags unintended overlaps, and respects the opt-in', () => {
    const two = (extra: any = {}) => (s: any) => {
      s.node({ id: 'a', text: 'a', rect: { x: 400, y: 400, w: 400, h: 200 } });
      s.node({ id: 'b', text: 'b', rect: { x: 600, y: 450, w: 400, h: 200 }, ...extra });
    };
    expect(types(run(two()))).toContain('overlap');
    expect(types(run(two({ overlap: true })))).not.toContain('overlap');
    expect(types(run(two({ overlapWith: ['a'] })))).not.toContain('overlap');
  });

  test('a group may contain its children', () => {
    const r = run((s) => {
      s.row(['a', 'b'], { w: 300, h: 150, gap: 100 });
      s.group({ id: 'g', children: ['a', 'b'], title: 'Equipo' });
      s.node({ id: 'a', text: 'a' });
      s.node({ id: 'b', text: 'b' });
    });
    expect(types(r)).not.toContain('overlap');
  });

  test('flags text that cannot fit its shape', () => {
    const r = run(s => s.node({ id: 'tiny', text: 'a very long sentence that cannot possibly fit inside this tiny node', rect: { x: 800, y: 500, w: 120, h: 50 } }));
    expect(types(r)).toContain('text-overflow');
  });

  test('warns, without failing, when one half of the frame stays empty', () => {
    const r = run(s => s.node({ id: 'left-only', text: 'solo', rect: { x: 100, y: 300, w: 500, h: 300 } }));
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w: any) => w.type === 'composition-balance' && w.detail.includes('right'))).toBe(true);
  });

  test('a zoom may crop neighbours of its focus target', () => {
    const r = run((s) => {
      full(s);
      s.node({ id: 'mid', text: 'x', rect: { x: 900, y: 400, w: 200, h: 100 } });
      s.node({ id: 'side', text: 'y', rect: { x: 1500, y: 400, w: 200, h: 100 } });
      s.camera.focus('mid', -1, 0.5, { zoom: 2 });
    });
    expect(r.errors.filter((e: any) => e.type === 'out-of-bounds')).toEqual([]);
  });

  test('a zoom that crops its own focus target is an error', () => {
    const r = run((s) => {
      full(s);
      s.node({ id: 'mid', text: 'x', rect: { x: 900, y: 400, w: 200, h: 100 } });
      s.node({ id: 'side', text: 'y', rect: { x: 1500, y: 400, w: 200, h: 100 } });
      s.camera.focus('mid', -1, 0.5, { zoom: 2 });
      s.camera.pan(1600, 540, 0, 0.01); // slides away from the focused node while still zoomed
    });
    const hits = r.errors.filter((e: any) => e.type === 'out-of-bounds');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((e: any) => e.id === 'mid')).toBe(true);
    expect(hits[0].detail).toContain('after the camera');
  });

  test('without a zoom (pan only) the after-camera bounds still apply', () => {
    const r = run((s) => {
      full(s);
      s.node({ id: 'side', text: 'y', rect: { x: 1500, y: 400, w: 200, h: 100 } });
      s.camera.pan(500, 540, -1, 0.5);
    });
    expect(r.errors.filter((e: any) => e.id === 'side').length).toBeGreaterThan(0);
  });

  test('a pan can bring a world-space out-of-bounds element back into frame', () => {
    const r = run((s) => {
      full(s);
      s.node({ id: 'far', text: 'x', rect: { x: 1800, y: 400, w: 100, h: 100 } });
      s.camera.pan(1400, 540, -1, 0.5);
    });
    expect(r.errors.filter((e: any) => e.id === 'far')).toEqual([]);
  });

  test('an invisible element (alpha under the threshold) is not flagged by the camera', () => {
    const r = run((s) => {
      full(s);
      s.node({ id: 'late', text: 'x', rect: { x: 1500, y: 400, w: 200, h: 100 }, at: 3.9 });
      s.camera.pan(1100, 540, -1, 0.5);
    });
    expect(r.errors.filter((e: any) => e.id === 'late').every((e: any) => e.t >= 3.5)).toBe(true);
  });

  test('balance warns for lopsided or small content only once the scene has settled', () => {
    const lopsided = run(s => s.node({ id: 'a', text: 'a', rect: { x: 100, y: 100, w: 1500, h: 800 } }), 6);
    expect(lopsided.warnings.some((w: any) => w.type === 'composition-balance')).toBe(false);
    const left = run((s) => {
      s.node({ id: 'a', text: 'a', rect: { x: 100, y: 100, w: 900, h: 800 } });
      s.node({ id: 'b', text: 'b', rect: { x: 1200, y: 400, w: 100, h: 50 } });
    }, 6);
    expect(left.warnings.map((w: any) => w.detail).join('\n')).toContain('right half');
    const small = run(s => s.node({ id: 'a', text: 'a', rect: { x: 800, y: 440, w: 320, h: 200 } }), 6);
    expect(small.ok).toBe(true);
    expect(small.warnings.some((w: any) => w.detail.includes('of the frame'))).toBe(true);
    // Elements that only appear before the settled time do not count.
    const early = run((s) => {
      s.node({ id: 'a', text: 'a', rect: { x: 100, y: 100, w: 800, h: 800 } });
      s.node({ id: 'b', text: 'b', rect: { x: 1000, y: 100, w: 800, h: 800 }, at: 1 });
    }, 10);
    expect(early.warnings.filter((w: any) => w.type === 'composition-balance')).toEqual([]);
  });

  test('widow warning when a lone short word stays on the last line', () => {
    const r = run(s => s.label({ id: 'wid', text: 'aaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbb c', rect: { x: 700, y: 300, w: 260, h: 400 }, px: 20 }));
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w: any) => w.type === 'widow' && w.id === 'wid')).toBe(true);
    const fine = run(s => s.label({ id: 'wid', text: 'aaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbb', rect: { x: 700, y: 300, w: 260, h: 400 }, px: 20 }));
    expect(fine.warnings.some((w: any) => w.type === 'widow')).toBe(false);
  });

  test('every error carries scene, id and time', () => {
    const r = run(s => s.node({ id: 'n', text: 'x', rect: { x: 1800, y: 400, w: 300, h: 100 } }));
    expect(r.errors[0]).toMatchObject({ scene: 's', id: 'n' });
    expect(typeof r.errors[0].t).toBe('number');
  });
});

describe('countChanged', () => {
  test('ignores rasterization noise and counts real changes', () => {
    const a = new Uint8ClampedArray(16).fill(100);
    const noise = a.slice();
    noise[0] = 101;
    const moved = a.slice();
    moved[4] = 200;
    moved[8] = 0;
    expect(countChanged(a, noise)).toBe(0);
    expect(countChanged(a, moved)).toBe(2);
  });
});
