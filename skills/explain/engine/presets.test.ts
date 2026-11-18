/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import hologramFactory from '../presets/hologram/preset.js';
import posterFactory from '../presets/poster/preset.js';
import sketchFactory from '../presets/sketch/preset.js';
import { definePreset } from './preset.js';
import { makeStubCtx } from './stub-ctx.ts';

const FACTORIES: Record<string, unknown> = { sketch: sketchFactory, hologram: hologramFactory, poster: posterFactory };
const NAMES = Object.keys(FACTORIES);

/** The Rough.js canvas API the sketch preset calls, recording into the ctx log. */
function installRough(log: unknown[][]) {
  const rec = (name: string) => (...args: unknown[]) => {
    log.push([`rough.${name}`, ...args]);
  };
  (globalThis as any).rough = {
    canvas: () => ({ rectangle: rec('rectangle'), ellipse: rec('ellipse'), linearPath: rec('linearPath'), line: rec('line'), path: rec('path'), curve: rec('curve'), polygon: rec('polygon') }),
  };
}

function setup(name: string, t = 1.3) {
  const stub = makeStubCtx();
  installRough(stub.log);
  stub.canvas.width = 1920;
  stub.canvas.height = 1080;
  const style = definePreset(FACTORIES[name]);
  const api: any = {
    ctx: stub.ctx,
    style,
    pal: style.palette,
    W: 1920,
    H: 1080,
    t,
    sa: 1,
    color: (tok: string) => style.color(tok),
    alpha(a: number) { stub.ctx.globalAlpha = a * this.sa; },
    fade(k: number) { return { ...this, sa: this.sa * k }; },
  };
  return { stub, style, api };
}

const counts = (log: unknown[][]) => ({
  save: log.filter(c => c[0] === 'save').length,
  restore: log.filter(c => c[0] === 'restore').length,
});

const RECT = { x: 100, y: 80, w: 320, h: 140 };
const PTS: [number, number][] = [[100, 100], [220, 180], [340, 120], [460, 260]];

const SHAPES: any[] = [];
for (const kind of ['round', 'rect', 'ellipse', 'pill']) {
  for (const p of [0, 0.5, 1]) {
    for (const stroke of [null, 'ink']) {
      for (const fill of [null, 'panel']) {
        for (const r of [undefined, 9]) {
          for (const dash of [null, [12, 8]]) {
            for (const alpha of [0.5, 1]) {
              SHAPES.push({ kind, p, stroke, fill, r, dash, dashOffset: 5, alpha, fillAlpha: alpha === 1 ? undefined : 0.4, lw: 3, seed: 2, still: true, glow: 4, hatch: true, shadow: false });
            }
          }
        }
      }
    }
  }
}
const LINES: any[] = [];
for (const p of [0, 0.4, 1]) {
  for (const head of [false, true]) {
    for (const dash of [null, [10, 6]]) {
      for (const smooth of [false, true]) {
        for (const alpha of [0.5, 1]) { LINES.push({ p, head, dash, dashOffset: 3, smooth, alpha, color: 'accent', lw: 5, seed: 3 }); }
      }
    }
  }
}
const POLYS: any[] = [];
for (const closed of [true, false]) {
  for (const p of [0, 0.5, 1]) {
    for (const stroke of [null, 'ink']) {
      for (const fill of [null, 'good']) {
        for (const smooth of [false, true]) { POLYS.push({ closed, p, stroke, fill, fillAlpha: 0.3, lw: 3, alpha: 0.8, smooth, hatch: true, shadow: true, seed: 1 }); }
      }
    }
  }
}
const TEXTS: any[] = [];
for (const role of ['body', 'display', 'mono']) {
  for (const align of ['left', 'center', 'right']) {
    for (const weight of [undefined, 700]) { TEXTS.push({ px: 30, role, weight, color: 'onPanel', align, alpha: 0.7, glow: 6 }); }
  }
}

function runAll(name: string) {
  const { stub, style, api } = setup(name);
  const run = (fn: () => void) => {
    const before = counts(stub.log);
    fn();
    const after = counts(stub.log);
    expect(after.save - before.save).toBe(after.restore - before.restore);
  };
  run(() => style.background(api));
  run(() => style.overlay(api));
  for (const o of SHAPES) { run(() => style.shape(api, RECT, o)); }
  for (const o of LINES) { run(() => style.line(api, PTS, o)); }
  for (const o of POLYS) { run(() => style.poly(api, PTS, o)); }
  for (const o of TEXTS) { run(() => style.text(api, 'Hello', 50, 60, o)); }
  for (const o of [{ p: 0 }, { p: 0.5 }, { p: 1, color: 'accent', alpha: 0.5, seed: 2 }]) { run(() => style.highlight(api, RECT, o)); }
  run(() => style.fill(api, RECT, { color: 'accent', alpha: 0.5, radius: 8, hatch: true }));
  run(() => style.dot(api, 40, 40, 6, { color: 'good', alpha: 0.5, glow: 8 }));
  for (const fx of ['sweep', 'glitch', 'flash', 'ring', 'edge']) {
    for (const p of [0, 0.3, 0.5, 1]) { run(() => style.transitions[fx](api, p, {}, [960, 540])); }
  }
  return stub.log;
}

describe.each(NAMES)('preset %s', (name) => {
  test('resolves with no warnings and the contract fields', () => {
    const p = definePreset(FACTORIES[name]);
    expect(p.name).toBe(name);
    expect(p.warnings).toEqual([]);
    expect(p.description.length).toBeGreaterThan(20);
    for (const k of ['onPanel', 'onAccent']) { expect(p.palette[k]).toBeDefined(); }
    for (const k of ['comment', 'string', 'keyword', 'number', 'type', 'fn', 'plain']) { expect(p.palette.syntax[k]).toBeDefined(); }
    for (const k of ['nodePx', 'labelPx', 'codePx', 'minPx', 'lw', 'pad', 'radius', 'fillAlpha']) { expect(typeof p.defaults[k]).toBe('number'); }
    for (const k of ['sweep', 'glitch', 'flash', 'ring', 'edge']) { expect(typeof p.transitions[k]).toBe('function'); }
    expect(p.export.bitrate).toBe(name === 'sketch' ? 4e6 : 2e6);
  });

  test('every renderer honors every option without throwing and restores the ctx', () => {
    expect(runAll(name).length).toBeGreaterThan(100);
  });

  test('the same time gives the same calls twice', () => {
    expect(JSON.stringify(runAll(name))).toBe(JSON.stringify(runAll(name)));
  });

  test('a different time changes the background (animated from api.t)', () => {
    const a = setup(name, 1);
    const b = setup(name, 2.7);
    a.style.background(a.api);
    b.style.background(b.api);
    expect(JSON.stringify(a.stub.log)).not.toBe(JSON.stringify(b.stub.log));
  });

  test('alpha goes through api.alpha and fades compose', () => {
    const { stub, style, api } = setup(name);
    style.shape(api.fade(0.5), RECT, { fill: 'panel', stroke: 'ink', alpha: 1 });
    const alphas = stub.log.filter(c => c[0] === 'set' && c[1] === 'globalAlpha').map(c => c[2] as number);
    expect(alphas.length).toBeGreaterThan(0);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  test('a null stroke and a null fill draw nothing for them', () => {
    const { stub, style, api } = setup(name);
    style.shape(api, RECT, { stroke: null, fill: null, p: 1 });
    expect(stub.log.filter(c => ['fill', 'stroke', 'rough.path', 'rough.rectangle', 'rough.ellipse'].includes(String(c[0])))).toEqual([]);
  });
});

describe('sketch legibility', () => {
  test('its smallest text is at least as large as hologram\'s in px, and handwriting is set heavy', () => {
    const sketch = definePreset(sketchFactory);
    const hologram = definePreset(hologramFactory);
    expect(sketch.defaults.minPx).toBeGreaterThanOrEqual(hologram.defaults.minPx * 1.5);
    expect(sketch.weights.body).toBeGreaterThanOrEqual(600);
  });
});
