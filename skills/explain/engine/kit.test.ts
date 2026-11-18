/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import { around, boundsOf, mapRecord, path, piece, pointOf, resolveRect, size, textKit } from './kit.js';
import { createRegistry } from './layout.js';
import { definePreset } from './preset.js';
import { makeStubCtx } from './stub-ctx.ts';
import { hologram } from './test-presets.ts';

const style = definePreset(hologram);

function scene() {
  const { ctx, log } = makeStubCtx(0.5);
  let n = 0;
  const s: any = { ctx, style, reg: createRegistry(), uid: (p: string) => `${p}-${++n}` };
  return { s, ctx, log };
}

/** Minimal engine api: records the sa it was drawn with, fades nest like the engine's. */
function makeApi(ctx: any, sa = 1): any {
  return {
    ctx,
    style,
    sa,
    color: (tok: string) => tok,
    alpha(a: number) { ctx.globalAlpha = a * sa; },
    fade(k: number) { return makeApi(ctx, sa * k); },
  };
}

const R = { x: 100, y: 100, w: 400, h: 200 };

describe('path math', () => {
  const a = [0, 0];
  const b = [100, 0];

  test('every curve ends on its endpoints', () => {
    for (const curve of ['straight', 'arc', 's', 'sv']) {
      const pts = path.linkPts(a, b, curve);
      expect(pts[0]).toEqual(a);
      const last = pts[pts.length - 1];
      expect(last[0]).toBeCloseTo(100, 6);
      expect(last[1]).toBeCloseTo(0, 6);
    }
    expect(path.linkPts(a, b)).toEqual([a, b]);
  });

  test('arc bows up for a negative bend and down for a positive one', () => {
    const minY = (bend: number) => path.linkPts(a, b, 'arc', bend).map((p: number[]) => p[1]);
    expect(Math.min(...minY(-80))).toBeLessThan(-30);
    expect(Math.max(...minY(-80))).toBeLessThanOrEqual(1e-9);
    expect(Math.max(...minY(80))).toBeGreaterThan(30);
  });

  test('s leaves horizontally and sv vertically', () => {
    const s = path.linkPts([0, 0], [100, 60], 's');
    expect(s[1][1]).toBeCloseTo(0, 0);
    const sv = path.linkPts([0, 0], [100, 60], 'sv');
    expect(Math.abs(sv[1][0])).toBeLessThan(2);
  });

  test('chainPts joins segments without duplicate points', () => {
    const pts = path.chainPts([[0, 0], [10, 0], [10, 10]]);
    expect(pts).toEqual([[0, 0], [10, 0], [10, 10]]);
    const curved = path.chainPts([[0, 0], [100, 0], [100, 100]], 's');
    const single = path.linkPts([0, 0], [100, 0], 's').length;
    expect(curved).toHaveLength(single * 2 - 1);
    for (let i = 1; i < curved.length; i++) { expect(curved[i]).not.toEqual(curved[i - 1]); }
  });

  test('pathLen and pointAt with heading a', () => {
    const pts = [[0, 0], [10, 0], [10, 10]];
    expect(path.pathLen(pts)).toBe(20);
    expect(path.pointAt(pts, 0)).toEqual({ x: 0, y: 0, a: 0 });
    const mid = path.pointAt(pts, 0.5);
    expect(mid.x).toBeCloseTo(10, 9);
    expect(mid.y).toBeCloseTo(0, 9);
    const end = path.pointAt(pts, 1);
    expect(end.x).toBeCloseTo(10, 9);
    expect(end.y).toBeCloseTo(10, 9);
    expect(end.a).toBeCloseTo(Math.PI / 2, 9);
    expect('ang' in end).toBe(false);
  });

  test('boundsOf pads and pointOf resolves ids, arrays and anchors', () => {
    expect(boundsOf([[0, 0], [10, 20]], 5)).toEqual({ x: -5, y: -5, w: 20, h: 30 });
    const { s } = scene();
    s.reg.add('a', R);
    expect(pointOf(s, [1, 2])).toEqual([1, 2]);
    expect(pointOf(s, 'a')).toEqual([300, 200]);
    expect(pointOf(s, { id: 'a', anchor: 'left' })).toEqual([100, 200]);
    expect(pointOf(s, R)).toEqual([300, 200]);
  });
});

describe('textKit', () => {
  test('shrinks to maxW and never below minPx (overflow flagged)', () => {
    const { s } = scene();
    const tk = textKit(s);
    const fit = tk.make('hello world', 0, 0, 120, { px: 40, minPx: 10 });
    expect(fit.px).toBeLessThan(40);
    expect(fit.w).toBeLessThanOrEqual(120);
    expect(fit.overflow).toBe(false);
    const tight = tk.make('hello world', 0, 0, 20, { px: 40, minPx: 18 });
    expect(tight.px).toBe(18);
    expect(tight.overflow).toBe(true);
    const floor = tk.make('hello world', 0, 0, 20, { px: 40 });
    expect(floor.px).toBe(s.style.defaults.minPx);
  });

  test('qa(t) honors at / until and strings() lists everything', () => {
    const { s } = scene();
    const tk = textKit(s);
    tk.make('always', 0, 0, 500);
    tk.make('later', 0, 50, 500, { at: 2 });
    tk.make('early', 0, 100, 500, { until: 1 });
    tk.make('hidden', 0, 150, 500, { track: false });
    expect(tk.qa(0.5).map((x: any) => x.text)).toEqual(['always', 'early']);
    expect(tk.qa(1.5).map((x: any) => x.text)).toEqual(['always']);
    expect(tk.qa(3).map((x: any) => x.text)).toEqual(['always', 'later']);
    expect(tk.strings()).toEqual(['always', 'later', 'early']);
    expect(tk.qa(0)[0]).toHaveProperty('overflow');
  });

  test('size derives from the style defaults', () => {
    const { s } = scene();
    expect(size(s, 'label', 1.5)).toBe(Math.round(s.style.defaults.labelPx * 1.5));
    expect(size(s, 'min')).toBe(s.style.defaults.minPx);
  });
});

describe('piece', () => {
  const build = (o: any, def: any = {}) => {
    const { s, ctx } = scene();
    const tk = textKit(s);
    tk.make('inner', R.x + 10, R.y + 20, 200);
    const drawn: number[] = [];
    const item = piece(s, o, { kind: 'card', rect: R, tk, texts: ['extra', '', undefined], draw: (api: any) => { drawn.push(api.sa); }, ...def });
    return { s, ctx, item, drawn };
  };

  test('registers the rect and reports a container record with texts', () => {
    const { s, item } = build({ id: 'c1', in: 'host' }, {});
    expect(s.reg.get('c1')).toEqual(R);
    const rec = item.qa(null, 1);
    expect(rec).toMatchObject({ rect: R, alpha: 1, container: true, host: 'host' });
    expect(rec.texts.map((x: any) => x.text)).toEqual(['inner']);
    expect(item.texts()).toEqual(['inner', 'extra']);
    expect(item.id).toBe('c1');
    expect(item.z).toBe(0);
  });

  test('container false, parts, contains and extra', () => {
    const { item } = build({ id: 'c2' }, { container: false, contains: ['x'], parts: () => [{ id: 'p', rect: R }], extra: { custom: 7 }, end: 3, marks: { m: 1 }, hud: true, z: 4 });
    const rec = item.qa(null, 1);
    expect(rec.container).toBe(false);
    expect(rec.contains).toEqual(['x']);
    expect(rec.parts).toHaveLength(1);
    expect(item.custom).toBe(7);
    expect([item.end, item.marks, item.hud, item.z]).toEqual([3, { m: 1 }, true, 4]);
  });

  test('keeps a rect a layout already registered', () => {
    const { s } = scene();
    const other = { x: 0, y: 0, w: 10, h: 10 };
    s.reg.add('laid', other);
    piece(s, { id: 'laid' }, { kind: 'card', rect: R, draw() {} });
    expect(s.reg.get('laid')).toEqual(other);
  });

  test('draw is skipped before at', () => {
    const { ctx, item, drawn } = build({ id: 'c3', at: 2 });
    const api = makeApi(ctx);
    item.draw(api, 1.9);
    expect(drawn).toEqual([]);
    expect(item.qa(null, 1.9).alpha).toBe(0);
    item.draw(api, 2);
    expect(drawn).toEqual([1]);
  });

  test('until fades out over 0.35 s through api.fade', () => {
    const { ctx, item, drawn } = build({ id: 'c4', until: 5 });
    const api = makeApi(ctx);
    item.draw(api, 4.9);
    expect(drawn).toEqual([1]);
    item.draw(api, 5.1);
    expect(drawn[1]).toBeLessThan(1);
    expect(drawn[1]).toBeGreaterThan(0);
    expect(item.qa(null, 5.1).alpha).toBeLessThan(1);
    item.draw(api, 5.4);
    item.draw(api, 6);
    expect(drawn).toHaveLength(2);
    expect(item.qa(null, 5.4).alpha).toBe(0);
  });

  test('qa false removes the record and a custom qa wins', () => {
    expect(build({ id: 'c5' }, { qa: false }).item.qa).toBeUndefined();
    const fn = () => null;
    expect(build({ id: 'c6' }, { qa: fn }).item.qa).toBe(fn);
  });
});

describe('resolveRect', () => {
  test('rect object, rect id, in + inset, x/y/w/h and own id', () => {
    const { s } = scene();
    s.reg.add('box', R);
    expect(resolveRect(s, { rect: R })).toBe(R);
    expect(resolveRect(s, { rect: 'box' })).toEqual(R);
    expect(resolveRect(s, { in: 'box', inset: 10 })).toEqual({ x: 110, y: 110, w: 380, h: 180 });
    expect(resolveRect(s, { in: 'box' })).toEqual(R);
    expect(resolveRect(s, { x: 1, y: 2, w: 3, h: 4 })).toEqual({ x: 1, y: 2, w: 3, h: 4 });
    expect(resolveRect(s, { id: 'box' })).toEqual(R);
  });

  test('names the piece when nothing is given', () => {
    const { s } = scene();
    expect(() => resolveRect(s, { id: 'nope' }, 'panel')).toThrow('panel "nope" has no position: pass rect, in, x/y/w/h or a layout id');
  });
});

describe('mapRecord and around', () => {
  test('maps rect, texts and parts', () => {
    const rec = { rect: R, alpha: 1, texts: [{ text: 'a', rect: { x: 1, y: 2, w: 3, h: 4 }, overflow: false, px: 20 }], parts: [{ id: 'p', rect: { x: 5, y: 6, w: 7, h: 8 }, solid: true }] };
    const out = mapRecord(rec, (r: any) => ({ ...r, x: r.x + 10 }));
    expect(out.rect.x).toBe(110);
    expect(out.texts[0].rect.x).toBe(11);
    expect(out.parts[0]).toMatchObject({ id: 'p', solid: true });
    expect(out.parts[0].rect.x).toBe(15);
    expect(out.alpha).toBe(1);
    expect(rec.rect.x).toBe(100);
    expect(mapRecord(null, (r: any) => r)).toBeNull();
  });

  test('around applies translate, rotate and scale and restores', () => {
    const { ctx, log } = makeStubCtx();
    around(makeApi(ctx), 100, 50, { scale: 2, sx: 0.5, dx: 10, rot: 1 }, () => log.push(['body']));
    const names = log.map(l => l[0]);
    expect(names).toEqual(['save', 'translate', 'rotate', 'scale', 'translate', 'body', 'restore']);
    expect(log[1]).toEqual(['translate', 110, 50]);
    expect(log[3]).toEqual(['scale', 1, 2]);
  });
});
