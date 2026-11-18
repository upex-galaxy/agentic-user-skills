/* eslint-disable ts/no-explicit-any */
import { afterEach, describe, expect, test } from 'bun:test';
import smoke from '../examples/smoke.scene.js';
import { createCamera } from './camera.js';
import { installClock } from './clock.js';
import { createEngine as createCore } from './core.js';
import { createEngine, kit } from './index.js';
import { clamp, ease, kf, prog, stagger, tween, val } from './math.js';
import { installRoughStub, makeStubCtx } from './stub-ctx.ts';
import { hologram, sketch } from './test-presets.ts';

const build = (style: any, spec: any = (smoke)(kit)) => {
  const stub = makeStubCtx(0.55);
  if (style === sketch) { installRoughStub(stub.log); }
  const engine = createEngine({ canvas: stub.canvas, style, spec });
  return { engine, ...stub };
};

describe('math helpers', () => {
  test('easings hit their endpoints', () => {
    for (const name of ['linear', 'in', 'out', 'inOut', 'sine', 'back', 'bounce', 'elastic'] as const) {
      expect(ease[name](0)).toBeCloseTo(0, 6);
      expect(ease[name](1)).toBeCloseTo(1, 6);
    }
  });

  test('prog, tween, val, stagger, kf', () => {
    expect(prog(5, 2, 2)).toBe(1);
    expect(prog(1, 2, 2)).toBe(0);
    expect(prog(3, 2, 2)).toBe(0.5);
    expect(tween(0, 10, 0, 2, 'linear')(1)).toBe(5);
    expect(val(0, 0, 10, 1, 2, 'linear')).toBe(0);
    expect(stagger(3, 1, 0.5)).toEqual([1, 1.5, 2]);
    expect(stagger(['a', 'b'], 0, 1)).toEqual([0, 1]);
    expect(kf(1, [[0, 0], [2, 10]], 'linear')).toBe(5);
    expect(clamp(5, 0, 1)).toBe(1);
  });
});

describe('scene runner', () => {
  test('total duration accounts for the transition overlap', () => {
    const { engine } = build(hologram);
    expect(engine.duration).toBeCloseTo(6.5 + 4.1 - 0.6, 9);
    expect(engine.scenes[1].start).toBeCloseTo(5.9, 9);
  });

  test('crossfade layers overlap with complementary alpha, local time per scene', () => {
    const { engine } = build(hologram);
    const st = engine.state(6.2);
    expect(st.layers.map((l: any) => l.name)).toEqual(['flujo', 'cierre']);
    expect(st.layers[0].lt).toBeCloseTo(6.2, 9);
    expect(st.layers[1].lt).toBeCloseTo(0.3, 9);
    expect(st.layers[0].sa + st.layers[1].sa).toBeCloseTo(1, 6);
    expect(st.fx[0].type).toBe('light-sweep');
    expect(engine.state(3).layers).toHaveLength(1);
  });

  test('wipe clips the incoming scene and push-zoom scales it', () => {
    const mk = (transition: string) => build(hologram, {
      scenes: [
        { name: 'a', dur: 3, transition, build: (s: any) => s.label({ text: 'a', rect: { x: 100, y: 100, w: 400, h: 100 } }) },
        { name: 'b', dur: 3, build: (s: any) => s.label({ text: 'b', rect: { x: 100, y: 100, w: 400, h: 100 } }) },
      ],
    }).engine;
    const wipe = mk('wipe').state(2.8);
    expect(wipe.layers[1].wipe).toBeGreaterThan(0);
    expect(wipe.layers[1].wipe).toBeLessThan(1);
    expect(wipe.layers[0].sa).toBe(1);
    const push = mk('push-zoom').state(2.8);
    expect(push.layers[1].scale).toBeGreaterThan(1);
    expect(push.layers[0].scale).toBeLessThan(1);
  });

  test('rejects unknown transitions, missing duration and scenes too short for their transitions', () => {
    const label = (s: any) => s.label({ text: 'x', rect: { x: 0, y: 0, w: 100, h: 50 } });
    expect(() => build(hologram, { scenes: [{ name: 'a', dur: 2, transition: 'spin', build: label }, { name: 'b', dur: 2, build: label }] })).toThrow('Unknown transition');
    expect(() => build(hologram, { scenes: [{ name: 'a', dur: 0, build: label }] })).toThrow('positive dur');
    expect(() => build(hologram, { scenes: [{ name: 'a', dur: 2, transition: { type: 'crossfade', dur: 1.5 }, build: label }, { name: 'b', dur: 2, transition: { type: 'crossfade', dur: 1.5 }, build: label }, { name: 'c', dur: 2, build: label }] })).toThrow('too short');
  });
});

describe('determinism: render(t) is pure', () => {
  for (const [name, style] of [['hologram', hologram], ['sketch', sketch]] as const) {
    test(`${name}: the same t twice makes the same draw calls, whatever was drawn in between`, () => {
      const { engine, log } = build(style);
      const frame = (t: number) => {
        log.length = 0;
        engine.render(t);
        return JSON.stringify(log);
      };
      for (const t of [0, 1.7, 3.1, 4.9, 6.2, 9.9]) {
        const first = frame(t);
        frame((t + 3.3) % engine.duration);
        expect(frame(t)).toBe(first);
        expect(first.length).toBeGreaterThan(50);
      }
    });
  }

  test('state(t) is stable and has no wall-clock dependency', () => {
    const { engine } = build(hologram);
    const a = JSON.stringify(engine.state(4.4));
    engine.render(8);
    expect(JSON.stringify(engine.state(4.4))).toBe(a);
  });

  test('typewriter text never re-centers: partial lines are drawn from their final left edge', () => {
    const { engine, log } = build(hologram);
    log.length = 0;
    engine.render(0.7); // heading is mid-typing
    const aligns = log.filter(c => c[0] === 'set' && c[1] === 'textAlign').map(c => c[2]);
    expect(aligns).toContain('left');
  });
});

describe('camera', () => {
  test('focus eases toward the element and zooms; reset returns home', () => {
    const rects: Record<string, any> = { a: { x: 800, y: 400, w: 320, h: 200 } };
    const cam = createCamera({ W: 1920, H: 1080, resolve: (id: string) => rects[id] });
    cam.focus('a', 1, 1, { zoom: 2 }).reset(4, 1);
    expect(cam.at(0)).toEqual({ x: 960, y: 540, z: 1 });
    const mid = cam.at(1.5);
    expect(mid.z).toBeGreaterThan(1);
    expect(mid.z).toBeLessThan(2);
    expect(cam.at(2.5)).toEqual({ x: 960, y: 500, z: 2 });
    expect(cam.at(5)).toEqual({ x: 960, y: 540, z: 1 });
  });

  test('focus derives a zoom that frames the element', () => {
    const cam = createCamera({ W: 1920, H: 1080, resolve: () => ({ x: 0, y: 0, w: 400, h: 200 }) });
    cam.focus('x', 0, 1, { pad: 100 });
    expect(cam.at(5).z).toBeGreaterThan(1);
    expect(() => createCamera({ W: 1, H: 1, resolve: () => { throw new Error('Unknown element id "z"'); } }).focus('z', 0)).toThrow('Unknown');
  });
});

describe('virtual clock', () => {
  const fakeTarget = () => {
    const raf: Array<(t: number) => void> = [];
    const target: any = { Date, Math: { random: Math.random }, performance: { now: () => 12345 }, requestAnimationFrame: (cb: any) => raf.push(cb), cancelAnimationFrame: () => {} };
    return { target, raf };
  };
  afterEach(() => {});

  test('Date, performance.now and Math.random follow the frame time', () => {
    const { target } = fakeTarget();
    const clock = installClock(target);
    clock.seek(1500);
    expect(target.performance.now()).toBe(1500);
    expect(target.Date.now()).toBe(1_700_000_001_500);
    expect(new target.Date().getTime()).toBe(1_700_000_001_500);
    expect(new target.Date(0).getTime()).toBe(0);
    clock.seek(1500);
    const a = [target.Math.random(), target.Math.random()];
    clock.seek(1500);
    expect([target.Math.random(), target.Math.random()]).toEqual(a);
    clock.seek(1600);
    expect(target.Math.random()).not.toBe(a[0]);
  });

  test('requestAnimationFrame callbacks run only when a frame is sought', () => {
    const { target } = fakeTarget();
    const clock = installClock(target);
    const seen: number[] = [];
    target.requestAnimationFrame((t: number) => seen.push(t));
    expect(seen).toEqual([]);
    clock.seek(40);
    expect(seen).toEqual([40]);
    clock.seek(80);
    expect(seen).toEqual([40]);
    clock.uninstall();
    expect(target.performance.now()).toBe(12345);
  });
});

test('core engine can be built without pieces', () => {
  const stub = makeStubCtx();
  const engine = createCore({ canvas: stub.canvas, style: hologram, spec: { scenes: [{ name: 'empty', dur: 1, build: () => {} }] } });
  engine.render(0.5);
  expect(engine.duration).toBe(1);
});

describe('layer contract (presets merge U0a)', () => {
  const two = (transition: any, hudBuild?: (s: any) => void) => build(hologram, {
    scenes: [
      { name: 'a', dur: 3, transition, build: (s: any) => {
        s.label({ text: 'a', rect: { x: 100, y: 300, w: 400, h: 100 } });
        hudBuild?.(s);
      } },
      { name: 'b', dur: 3, build: (s: any) => s.label({ text: 'b', rect: { x: 100, y: 300, w: 400, h: 100 } }) },
    ],
  });

  test('api.fade nests: alpha multiplies through every level', () => {
    const seen: number[] = [];
    const { engine, ctx } = build(hologram, {
      scenes: [{ name: 'a', dur: 2, build: (s: any) => s.raw((_c: any, _t: number, api: any) => {
        const inner = api.fade(0.5).fade(0.5);
        inner.alpha(0.8);
        seen.push(ctx.globalAlpha, inner.sa);
      }) }],
    });
    engine.render(1);
    expect(seen[0]).toBeCloseTo(0.2, 6);
    expect(seen[1]).toBeCloseTo(0.25, 6);
  });

  test('the HUD is not scaled or shifted by the layer look', () => {
    const { engine, log } = two('push-zoom', (s: any) => s.heading({ text: 'Heading', at: 0 }));
    log.length = 0;
    engine.render(2.8);
    const calls = log.map(c => c[0]);
    // The world of the leaving layer is scaled; the heading text is drawn after that scale was restored.
    const scaleAt = calls.indexOf('scale');
    expect(scaleAt).toBeGreaterThan(-1);
    const fill = log.findIndex(c => c[0] === 'fillText' && c[1] === 'Heading');
    const restoresBetween = calls.slice(scaleAt, fill).filter(c => c === 'restore').length;
    expect(restoresBetween).toBeGreaterThan(0);
  });

  test('the leaving world scales around a registered origin, the fx gets it in frame pixels', () => {
    const { engine } = two({ type: 'light-sweep', origin: [400, 300] });
    const st = engine.state(2.8);
    expect(st.fx[0].name).toBe('sweep');
    expect(st.fx[0].spec.origin).toEqual([400, 300]);
  });
});
