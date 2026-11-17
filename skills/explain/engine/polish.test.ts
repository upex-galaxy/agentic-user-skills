/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import { bands, fillScale } from './bands.js';
import { createCamera } from './camera.js';
import { createEngine } from './index.js';
import { placeTransitionLabels } from './pieces/state.js';
import { detectLang } from './pieces/titles.js';
import { runQA } from './qa.js';
import { makeStubCtx } from './stub-ctx.ts';
import hologram from './styles/hologram.js';
import sketch from './styles/sketch.js';

const make = (build: (s: any) => void, spec: any = {}, dur = 6) => {
  const stub = makeStubCtx(0.55);
  return createEngine({ canvas: stub.canvas, style: hologram, spec: { ...spec, scenes: [{ name: 's', dur, build }] } });
};
const rec = (engine: any, t: number, id: string) => engine.sample(t)[0].records.find((r: any) => r.id === id);

describe('default content area and fill', () => {
  test('the default area sits between the heading band and the caption band', () => {
    const b = bands(1920, 1080);
    expect(b.area.y).toBeGreaterThanOrEqual(b.heading.y + b.heading.h);
    expect(b.area.y + b.area.h).toBeLessThan(1080 - 190);
  });

  test('fillScale grows small content to about 80 %, shrinks overflow, leaves filled content alone', () => {
    const area = { x: 0, y: 0, w: 1000, h: 600 };
    expect(fillScale({ x: 0, y: 0, w: 400, h: 200 }, area)).toBeCloseTo(2, 5);
    expect(fillScale({ x: 0, y: 0, w: 800, h: 300 }, area)).toBe(1);
    expect(fillScale({ x: 0, y: 0, w: 2000, h: 100 }, area)).toBeCloseTo(0.5, 5);
  });

  test('a layout without an area grows and centers in the default area; with an area it only shrinks', () => {
    make((s) => {
      const r = s.row([{ id: 'a', w: 200, h: 100 }, { id: 'b', w: 200, h: 100 }], { gap: 40 });
      expect(r.scale).toBeGreaterThan(1.5);
      const cx = r.bounds.x + r.bounds.w / 2;
      const cy = r.bounds.y + r.bounds.h / 2;
      expect(cx).toBeCloseTo(s.area.x + s.area.w / 2, 3);
      expect(cy).toBeCloseTo(s.area.y + s.area.h / 2, 3);
      const small = s.row([{ id: 'c', w: 200, h: 100 }], { area: { x: 0, y: 0, w: 1000, h: 600 } });
      expect(small.scale).toBe(1);
    });
  });

  test('a flow without an area is centered in the default area, with registered rects in scene coordinates', () => {
    make((s) => {
      s.flow({ id: 'f', steps: ['uno', 'dos', 'tres'] });
      const rects = ['f-1', 'f-2', 'f-3'].map(id => s.reg.get(id));
      const x0 = Math.min(...rects.map((r: any) => r.x));
      const x1 = Math.max(...rects.map((r: any) => r.x + r.w));
      expect((x0 + x1) / 2).toBeCloseTo(960, 0);
      expect(Math.min(...rects.map((r: any) => r.y))).toBeGreaterThanOrEqual(s.area.y - 0.5);
    });
  });
});

describe('HUD layer', () => {
  const scene = (s: any) => {
    s.heading({ text: 'Un título' });
    s.sectionTag({ index: 1, total: 2, name: 'Parte' });
    s.node({ id: 'target', text: 'x', rect: { x: 1300, y: 500, w: 300, h: 140 } });
    s.camera.focus('target', 1, 1, { zoom: 2 });
  };

  test('heading, section tag, caption and footer are screen space: QA rects ignore the camera', () => {
    const engine = make((s) => {
      scene(s);
      s.caption({ id: 'cap', text: 'hola', at: 0 });
      s.sourceFooter({ id: 'src', text: 'doc' });
    });
    for (const id of ['heading', 'cap', 'src']) {
      const a = rec(engine, 0.5, id).rect;
      const b = rec(engine, 3, id).rect;
      expect(b).toEqual(a);
      expect(rec(engine, 3, id).hud).toBe(true);
    }
    expect(rec(engine, 3, 'target').hud).toBe(false);
  });

  test('the HUD never trips out-of-bounds while the camera zooms, and the gate passes', () => {
    const engine = make(scene);
    expect(runQA(engine, [0.5, 1.2, 1.6, 2, 3, 5], { determinism: false }).errors).toEqual([]);
  });

  test('the heading fades while zoomed and returns after the reset', () => {
    const stub = makeStubCtx(0.55);
    const engine = createEngine({ canvas: stub.canvas, style: hologram, spec: { scenes: [{ name: 's', dur: 8, build: (s: any) => { scene(s); s.camera.reset(5, 1); } }] } });
    expect(engine.sample(0.5)[0].cam.z).toBe(1);
    expect(engine.sample(3)[0].cam.z).toBe(2);
    expect(engine.sample(7)[0].cam.z).toBe(1);
  });
});

describe('camera', () => {
  const rects: any = { a: { x: 200, y: 200, w: 300, h: 200 }, b: { x: 1300, y: 700, w: 300, h: 200 } };
  const cam = () => createCamera({ W: 1920, H: 1080, resolve: (id: string) => rects[id] });

  test('focus can go straight from one target to another without a reset', () => {
    const c = cam();
    c.focus('a', 1, 1, { zoom: 2 });
    c.focus('b', 4, 1, { zoom: 2 });
    expect(c.at(3)).toEqual({ x: 350, y: 300, z: 2 });
    expect(c.targetAt(3)).toBe('a');
    const mid = c.at(4.5);
    expect(mid.x).toBeGreaterThan(350);
    expect(mid.x).toBeLessThan(1450);
    expect(mid.z).toBe(2);
    expect(c.at(6)).toEqual({ x: 1450, y: 800, z: 2 });
    expect(c.targetAt(6)).toBe('b');
  });

  test('movingAt is true during any move, including the first frames near zoom 1', () => {
    const c = cam();
    c.focus('a', 1, 1, { zoom: 2 });
    expect(c.movingAt(0.5)).toBe(false);
    expect(c.movingAt(1.02)).toBe(true);
    expect(c.movingAt(2.5)).toBe(false);
  });

  test('QA: a neighbor cropped at the very start of a ramp (zoom near 1.0) is not out-of-bounds', () => {
    const engine = make((s) => {
      s.node({ id: 'edge', text: 'e', rect: { x: 1560, y: 500, w: 300, h: 100 } }); // inside the margin at rest
      s.node({ id: 'goal', text: 'g', rect: { x: 300, y: 500, w: 300, h: 140 } });
      s.camera.focus('goal', 1, 2, { zoom: 2.2, ease: 'linear' });
    });
    const r = runQA(engine, [1.1, 1.2, 1.3], { determinism: false });
    expect(r.errors.filter((e: any) => e.id === 'edge')).toEqual([]);
  });
});

describe('footer language', () => {
  test('detectLang reads Spanish and English', () => {
    expect(detectLang(['Cómo funciona el motor'])).toBe('es');
    expect(detectLang(['El pipeline de la entrega'])).toBe('es');
    expect(detectLang(['How the engine works', 'docs'])).toBe('en');
  });

  test('prefix follows the scene text, the spec lang, or an explicit lang', () => {
    const footer = (build: (s: any) => void, spec: any = {}) => make(build, spec).texts().map((x: any) => x.text).find((t: string) => /^(?:Fuente|Source):/.test(t));
    expect(footer((s) => { s.heading({ text: 'Cómo viaja un cambio' }); s.sourceFooter({ text: 'docs.github.com' }); })).toBe('Fuente: docs.github.com');
    expect(footer((s) => { s.heading({ text: 'How a change travels' }); s.sourceFooter({ text: 'docs.github.com' }); })).toBe('Source: docs.github.com');
    expect(footer((s) => { s.sourceFooter({ text: 'docs.github.com' }); }, { lang: 'es' })).toBe('Fuente: docs.github.com');
    expect(footer((s) => { s.heading({ text: 'Cómo viaja' }); s.sourceFooter({ text: 'docs', lang: 'en' }); })).toBe('Source: docs');
  });
});

describe('sketch style', () => {
  test('code and mono text use the bundled JetBrains Mono, not the handwriting font', () => {
    expect(sketch.font('mono', 30)).toContain('JetBrains Mono');
    expect(sketch.font('body', 30)).toContain('Caveat');
    expect(sketch.faces.map((f: any) => f.family)).toContain('JetBrains Mono');
  });
});

describe('transition labels', () => {
  test('two labels whose arcs cross at the same spot slide apart', () => {
    const pts = (a: number[], b: number[]) => Array.from({ length: 21 }, (_, i) => [a[0] + (b[0] - a[0]) * (i / 20), a[1] + (b[1] - a[1]) * (i / 20)]);
    const size = { w: 140, h: 44 };
    const arcs = [
      { pts: pts([300, 300], [900, 700]), mid: [600, 500], size },
      { pts: pts([300, 700], [900, 300]), mid: [600, 500], size },
    ];
    const [p, q] = placeTransitionLabels(arcs as any, [], { x: 0, y: 0, w: 1200, h: 900 });
    const clash = Math.abs(p[0] - q[0]) < size.w && Math.abs(p[1] - q[1]) < size.h;
    expect(clash).toBe(false);
  });
});
