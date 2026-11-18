/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import demo from '../../examples/pieces/annotate.scene.js';
import { createEngine } from '../core.js';
import { kit } from '../index.js';
import { defaultTimes, runQA } from '../qa.js';
import { makeStubCtx } from '../stub-ctx.ts';
import { hologram, sketch } from '../test-presets.ts';
import { parseMarkup, pieces } from './annotate.js';
import { basePieces } from './base.js';

// Rough.js stand-in that accepts every drawing method (the shared stub only knows four).
const installRoughStub = (log: unknown[][]) => {
  (globalThis as any).rough = { canvas: () => new Proxy({}, { get: (_, name) => (...args: unknown[]) => { log.push([`rough.${String(name)}`, ...args]); } }) };
};
const PRESETS = [['hologram', hologram], ['sketch', sketch]] as const;

function build(style: any, fn: (s: any) => void, dur = 10) {
  const stub = makeStubCtx(0.55);
  if (style === sketch) { installRoughStub(stub.log); }
  const engine = createEngine({ canvas: stub.canvas, style, pieces: { ...basePieces, ...pieces }, spec: { scenes: [{ name: 't', dur, build: fn }] } } as any);
  return { engine, ...stub };
}
const rec = (engine: any, t: number, id: string) => engine.sample(t)[0].records.find((r: any) => r.id === id);
const textsOf = (engine: any, t: number, id: string): string[] => (rec(engine, t, id)?.texts ?? []).map((x: any) => x.text);
const inter = (a: any, b: any) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const R = { x: 160, y: 250, w: 1600, h: 400 };

describe('parseMarkup', () => {
  test('*word* is emphasis, | and newline break lines', () => {
    expect(parseMarkup('De tu *laptop*|a *producción*.')).toEqual([
      [{ text: 'De', emph: false }, { text: 'tu', emph: false }, { text: 'laptop', emph: true }],
      [{ text: 'a', emph: false }, { text: 'producción.', emph: true }],
    ]);
    expect(parseMarkup('uno\ndos')).toHaveLength(2);
  });

  test('emphasis spans several words and keeps punctuation', () => {
    expect(parseMarkup('un *código muy claro*, sí').flat().map((w: any) => `${w.text}${w.emph ? '!' : ''}`)).toEqual(['un', 'código!', 'muy!', 'claro,!', 'sí']);
  });
});

describe('kineticText', () => {
  for (const [name, style] of PRESETS) {
    for (const mode of ['pop', 'rise', 'drop', 'slam', 'slide']) {
      test(`mode ${mode} renders words in order and passes QA (${name})`, () => {
        let it: any;
        const { engine, log } = build(style, (s: any) => { it = s.kineticText({ id: 'k', text: 'Tu código, *explicado*|en un minuto', rect: R, mode, at: 1, step: 0.2, underline: ['explicado'] }); });
        expect(textsOf(engine, 0.5, 'k')).toEqual([]);
        expect(textsOf(engine, 1.1, 'k')).toEqual(['Tu']);
        expect(textsOf(engine, 4, 'k')).toEqual(['Tu', 'código,', 'explicado', 'en', 'un', 'minuto']);
        expect(it.texts()).toEqual(['Tu código, explicado', 'en un minuto']);
        expect(it.end).toBeGreaterThan(2.5);
        const n = log.length;
        engine.render(2);
        expect(log.length).toBeGreaterThan(n);
        expect(runQA(engine, [0.5, 1.2, 2, 3, 5, 8], { determinism: false }).errors).toEqual([]);
      });
    }

    test(`fits the largest size into a small rect, emphasis colors and until (${name})`, () => {
      let it: any;
      let small: any;
      const { engine } = build(style, (s: any) => {
        it = s.kineticText({ id: 'k', text: 'Una frase larga que tiene que caber en una caja pequeña de verdad', rect: { x: 200, y: 300, w: 700, h: 260 }, at: 0, until: 5 });
        small = s.kineticText({ id: 'k2', text: '*Hola* mundo', rect: { x: 1000, y: 300, w: 700, h: 260 }, emphasis: { mundo: 'good' } });
      });
      const r = rec(engine, 3, 'k');
      expect(r.texts.every((x: any) => !x.overflow)).toBe(true);
      expect(it.px).toBeLessThan(small.px);
      expect(it.px).toBeGreaterThanOrEqual(style.defaults.minPx);
      expect(small.words.map((w: any) => w.color)).toEqual(['accent', 'good']);
      expect(rec(engine, 3, 'k').alpha).toBe(1);
      expect(rec(engine, 6, 'k').alpha).toBeLessThan(0.05);
    });
  }

  test('a block that cannot fit at minPx reports overflow', () => {
    const { engine } = build(hologram, (s: any) => s.kineticText({ id: 'k', text: 'Palabrotaenormequenocabe', rect: { x: 200, y: 300, w: 100, h: 60 } }));
    expect(rec(engine, 3, 'k').texts[0].overflow).toBe(true);
  });

  test('unknown mode and missing text fail with a clear message', () => {
    expect(() => build(hologram, (s: any) => s.kineticText({ text: 'x', rect: R, mode: 'zoom' }))).toThrow(/pop, rise, drop, slam, slide/);
    expect(() => build(hologram, (s: any) => s.kineticText({ rect: R }))).toThrow(/needs text/);
  });
});

describe('callout', () => {
  for (const [name, style] of PRESETS) {
    for (const side of ['right', 'left', 'top', 'bottom']) {
      test(`the note does not overlap the target and the arrow ends at its edge, side ${side} (${name})`, () => {
        const T = { x: 800, y: 420, w: 320, h: 120 };
        let it: any;
        const { engine } = build(style, (s: any) => {
          s.node({ id: 'tg', text: 'objetivo', rect: T });
          it = s.callout({ id: 'c', target: 'tg', text: 'Revisar este paso', side, at: 1 });
        });
        const r = rec(engine, 3, 'c');
        expect(inter(r.rect, T)).toBe(false);
        expect(it.side).toBe(side);
        const end = it.arrow.pts[it.arrow.pts.length - 1];
        const gap = 40;
        const near = end[0] >= T.x - gap && end[0] <= T.x + T.w + gap && end[1] >= T.y - gap && end[1] <= T.y + T.h + gap;
        const inside = end[0] > T.x && end[0] < T.x + T.w && end[1] > T.y && end[1] < T.y + T.h;
        expect(near).toBe(true);
        expect(inside).toBe(false);
        expect(textsOf(engine, 3, 'c')).toEqual(['Revisar este paso']);
        expect(runQA(engine, [0.5, 1.2, 2, 3, 6], { determinism: false }).errors).toEqual([]);
      });
    }
  }

  test('flips to the free side near the frame edge, supports points and anchors, and until fades', () => {
    const { engine } = build(hologram, (s: any) => {
      s.node({ id: 'tg', text: 'borde', rect: { x: 1450, y: 400, w: 380, h: 120 } });
      s.callout({ id: 'c1', target: 'tg', text: 'Se pasa del borde', side: 'right' });
      const c2 = s.callout({ id: 'c2', target: [300, 800], text: 'Un punto', side: 'top', until: 4 });
      expect(c2.arrow.to[1]).toBeLessThan(800);
      expect(c2.arrow.to[1]).toBeGreaterThan(780);
      const c3 = s.callout({ id: 'c3', target: { id: 'tg', anchor: 'top' }, text: 'Desde arriba', side: 'top', dist: 120 });
      expect(Math.abs(c3.arrow.to[1] - 400)).toBeLessThan(20);
    });
    expect(rec(engine, 2, 'c1').rect.x + rec(engine, 2, 'c1').rect.w).toBeLessThan(1920);
    expect(rec(engine, 2, 'c1').rect.x).toBeLessThan(1450);
    expect(rec(engine, 6, 'c2').alpha).toBeLessThan(0.05);
  });

  test('unknown target and side fail', () => {
    expect(() => build(hologram, (s: any) => s.callout({ target: 'nada', text: 'x' }))).toThrow(/unknown target/);
    expect(() => build(hologram, (s: any) => s.callout({ target: [10, 10], text: 'x', side: 'up' }))).toThrow(/right, left, top, bottom/);
  });
});

describe('stamp', () => {
  for (const [name, style] of PRESETS) {
    test(`slams in at its time with its text, by rect or by center (${name})`, () => {
      const { engine } = build(style, (s: any) => {
        s.stamp({ id: 'a', text: 'APROBADO', rect: { x: 300, y: 300, w: 560, h: 150 }, at: 1 });
        s.stamp({ id: 'b', text: 'FALLO', cx: 1300, cy: 600, at: 2, color: 'bad', until: 5 });
      });
      expect(rec(engine, 0.5, 'a').alpha).toBe(0);
      expect(textsOf(engine, 1.5, 'a')).toEqual(['APROBADO']);
      expect(textsOf(engine, 3, 'b')).toEqual(['FALLO']);
      expect(rec(engine, 7, 'b').alpha).toBeLessThan(0.05);
      expect(runQA(engine, [0.5, 1.1, 1.5, 3, 4], { determinism: false }).errors).toEqual([]);
    });
  }
});

describe('bubble', () => {
  for (const [name, style] of PRESETS) {
    test(`typing dots first, then the text, avatar initials, every tail inside the rect (${name})`, () => {
      const items: any[] = [];
      const { engine } = build(style, (s: any) => {
        items.push(s.bubble({ id: 'a', rect: { x: 200, y: 200, w: 900, h: 190 }, initials: 'QA', text: 'Funciona en mi máquina', at: 1 }));
        items.push(s.bubble({ id: 'b', rect: { x: 700, y: 450, w: 900, h: 190 }, initials: 'DV', side: 'right', text: 'Pues en producción no', at: 3, typing: 0 }));
        for (const [i, tail] of ['left', 'right', 'top', 'bottom'].entries()) { items.push(s.bubble({ id: `t${i}`, rect: { x: 200 + i * 420, y: 720, w: 380, h: 170 }, text: 'Una nota corta', tail, tailAt: 0.7, at: 0.5 })); }
      }, 9);
      expect(textsOf(engine, 1.2, 'a')).toEqual(['QA']);
      expect(textsOf(engine, 3, 'a')).toEqual(['QA', 'Funciona en mi máquina']);
      expect(textsOf(engine, 3.5, 'b')).toEqual(['DV', 'Pues en producción no']);
      for (const it of items) {
        if (it.extra === undefined && !it.tail) { continue; }
        const r = rec(engine, 6, it.id).rect;
        for (const p of [it.tail?.tip, it.tail?.b0, it.tail?.b1].filter(Boolean)) {
          expect(p[0]).toBeGreaterThanOrEqual(r.x - 0.5);
          expect(p[0]).toBeLessThanOrEqual(r.x + r.w + 0.5);
          expect(p[1]).toBeGreaterThanOrEqual(r.y - 0.5);
          expect(p[1]).toBeLessThanOrEqual(r.y + r.h + 0.5);
        }
      }
      expect(runQA(engine, [0.5, 1.2, 2, 3.2, 5, 8], { determinism: false }).errors).toEqual([]);
    });
  }

  test('unknown tail and side fail', () => {
    const r = { x: 200, y: 200, w: 500, h: 150 };
    expect(() => build(hologram, (s: any) => s.bubble({ rect: r, text: 'x', tail: 'up' }))).toThrow(/left, right, top, bottom/);
    expect(() => build(hologram, (s: any) => s.bubble({ rect: r, text: 'x', initials: 'A', side: 'top' }))).toThrow(/left, right/);
  });
});

describe('chip', () => {
  for (const [name, style] of PRESETS) {
    test(`states flip at the given times and keep one size (${name})`, () => {
      let it: any;
      const { engine } = build(style, (s: any) => {
        it = s.chip({ id: 'c', cx: 900, cy: 400, text: 'en cola', color: 'warn', icon: 'dot', at: 0.5, states: [{ at: 4, text: 'aprobado', color: 'good', icon: 'check', solid: true }, { at: 2, text: 'corriendo', icon: 'spinner' }] });
      });
      expect(rec(engine, 0.2, 'c').alpha).toBe(0);
      expect(textsOf(engine, 1, 'c')).toEqual(['en cola']);
      expect(textsOf(engine, 1.9, 'c')).toEqual(['en cola']);
      expect(textsOf(engine, 2.4, 'c')).toEqual(['corriendo']);
      expect(textsOf(engine, 3.9, 'c')).toEqual(['corriendo']);
      expect(textsOf(engine, 4.4, 'c')).toEqual(['aprobado']);
      expect(it.texts()).toEqual(['en cola', 'corriendo', 'aprobado']);
      expect(it.marks).toEqual({ state1: 2, state2: 4 });
      expect(it.end).toBeGreaterThan(4.4);
      const sizes = [1, 2.4, 4.4].map(t => rec(engine, t, 'c').rect.w);
      expect(new Set(sizes).size).toBe(1);
      expect(runQA(engine, [0.6, 1, 2.1, 2.5, 4.1, 5], { determinism: false }).errors).toEqual([]);
    });
  }

  test('any icon kind works, mono, x/y and rect placement, until fades; unknown icon lists the kinds', () => {
    const { engine } = build(hologram, (s: any) => {
      s.chip({ id: 'a', x: 200, y: 200, text: 'rama main', icon: 'branch', mono: true, until: 3 });
      s.chip({ id: 'b', rect: { x: 600, y: 200, w: 420, h: 70 }, text: 'listo', solid: true, icon: 'rocket' });
    });
    expect(rec(engine, 1, 'a').rect.x).toBe(200);
    expect(rec(engine, 1, 'b').rect.w).toBe(420);
    expect(rec(engine, 5, 'a').alpha).toBeLessThan(0.05);
    let msg = '';
    try { build(hologram, (s: any) => s.chip({ x: 0, y: 0, text: 'x', icon: 'dragon' })); }
    catch (e: any) { msg = String(e.message); }
    expect(msg).toContain('spinner');
    expect(msg).toContain('rocket');
    expect(() => build(hologram, (s: any) => s.chip({ text: 'x' }))).toThrow(/no position/);
  });
});

describe('scribble', () => {
  for (const [name, style] of PRESETS) {
    for (const kind of ['circle', 'underline', 'box']) {
      test(`${kind} draws on around a registered element and passes QA (${name})`, () => {
        let it: any;
        const { engine, log } = build(style, (s: any) => {
          s.node({ id: 'tg', text: 'objetivo', rect: { x: 700, y: 400, w: 440, h: 130 } });
          it = s.scribble({ id: 'sc', target: 'tg', kind, at: 1, dur: 0.8 });
        });
        expect(rec(engine, 0.5, 'sc').alpha).toBe(0);
        const n = log.length;
        engine.render(1.4);
        expect(log.length).toBeGreaterThan(n);
        expect(it.end).toBe(1.8);
        expect(runQA(engine, [0.5, 1.2, 2, 4], { determinism: false }).errors).toEqual([]);
      });
    }
  }

  test('unknown kind and target fail', () => {
    expect(() => build(hologram, (s: any) => s.scribble({ target: [1, 1, 5, 5], kind: 'x' }))).toThrow(/circle, underline, box/);
    expect(() => build(hologram, (s: any) => s.scribble({ target: 'nada' }))).toThrow(/unknown target/);
  });
});

describe('demo', () => {
  for (const [name, style] of PRESETS) {
    test(`the example scene passes the QA gate (${name})`, () => {
      const stub = makeStubCtx(0.55);
      if (style === sketch) { installRoughStub(stub.log); }
      const engine = createEngine({ canvas: stub.canvas, style, pieces: { ...basePieces, ...pieces }, spec: (demo)(kit) } as any);
      const qa = runQA(engine, defaultTimes(engine, 0.5), { determinism: false });
      expect(qa.errors).toEqual([]);
    });
  }
});

describe('chip position and host', () => {
  const rectOf = (engine: any, id: string) => rec(engine, 3, id).rect;

  test('any mix of x | cx and y | cy places the chip', () => {
    const { engine } = build(hologram, (s: any) => {
      s.chip({ id: 'a', text: 'hola', cx: 600, y: 300, at: 0.5 });
      s.chip({ id: 'b', text: 'mundo', x: 900, cy: 400, at: 0.5 });
    });
    const a = rectOf(engine, 'a');
    const b = rectOf(engine, 'b');
    expect(a.x + a.w / 2).toBeCloseTo(600, 3);
    expect(a.y).toBeCloseTo(300, 3);
    expect(b.x).toBeCloseTo(900, 3);
    expect(b.y + b.h / 2).toBeCloseTo(400, 3);
  });

  test('a lone coordinate still throws "no position"', () => {
    expect(() => build(hologram, (s: any) => s.chip({ text: 'x', cx: 100 }))).toThrow(/no position/);
  });

  test('`px` shrinks the chip', () => {
    const { engine } = build(sketch, (s: any) => {
      s.chip({ id: 'big', text: 'estado', cx: 400, cy: 300, at: 0.5 });
      s.chip({ id: 'small', text: 'estado', cx: 800, cy: 300, px: 22, at: 0.5 });
    });
    expect(rectOf(engine, 'small').h).toBeLessThan(rectOf(engine, 'big').h);
    expect(rectOf(engine, 'small').w).toBeLessThan(rectOf(engine, 'big').w);
  });

  test('`in` names the QA host and does not move a chip that has coordinates', () => {
    const { engine } = build(sketch, (s: any) => {
      s.chip({ id: 'c', text: 'en la mitad', in: 'split.left', cx: 500, cy: 600, at: 0.5 });
    });
    const r = rec(engine, 3, 'c');
    expect(r.host).toBe('split.left');
    expect(r.rect.x + r.rect.w / 2).toBeCloseTo(500, 3);
    expect(r.rect.y + r.rect.h / 2).toBeCloseTo(600, 3);
  });
});
