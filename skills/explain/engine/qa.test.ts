/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import { summarizeReport } from '../cli/qa.ts';
import smoke from '../examples/smoke.scene.js';
import { createEngine, kit } from './index.js';
import { countChanged, defaultTimes, probeDeterminism, probeTimes, runQA } from './qa.js';
import { makeStubCtx } from './stub-ctx.ts';
import { hologram } from './test-presets.ts';

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

describe('determinism probe spread', () => {
  test('probe times are spread over the whole video and include the first and the last sample', () => {
    const samples = Array.from({ length: 30 }, (_, i) => i * 0.5);
    const p = probeTimes(samples, 6);
    expect(p[0]).toBe(0);
    expect(p.at(-1)).toBe(14.5);
    expect(p.length).toBe(6);
    expect(p.filter((t: number) => t > (14.5 * 2) / 3).length).toBeGreaterThanOrEqual(2);
    expect(probeTimes([3, 1, 2], 6)).toEqual([1, 2, 3]);
  });

  test('a leak that only shows in the last third of the video fails the probe', () => {
    let calls = 0;
    let data = new Uint8ClampedArray(40);
    const fake: any = {
      W: 10,
      H: 1,
      duration: 9,
      ctx: { getImageData: () => ({ data }) },
      render(t: number) {
        calls++;
        data = new Uint8ClampedArray(40).fill(t > 6 ? (calls * 37) % 256 : 10);
      },
    };
    const samples = Array.from({ length: 19 }, (_, i) => i * 0.5);
    expect(probeDeterminism(fake, probeTimes(samples, 3)).failures.length).toBeGreaterThan(0);
  });
});

describe('raw items and QA', () => {
  test('texts declared on s.raw are checked for the opening marks, and its rect for bounds', () => {
    const r = run((s) => {
      full(s);
      s.raw(() => {}, { id: 'r', texts: ['¿Qué pasa?'], rect: { x: 1650, y: 400, w: 400, h: 100 } });
    });
    expect(types(r)).toContain('opening-punctuation');
    expect(types(r)).toContain('out-of-bounds');
    expect(types(r)).not.toContain('overlap');
  });
});

// ---- QA record contract: pure records through a fake engine (no canvas, no pieces) ----------------------------------

interface Rect { x: number, y: number, w: number, h: number }
const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const rec = (id: string, rect: Rect, extra: any = {}) => ({ id, kind: 'node', hud: false, alpha: 1, rect, texts: [], ...extra });
const txt = (text: string, rect: Rect) => ({ text, rect, overflow: false, px: 24 });
const HOME = { x: 960, y: 540, z: 1, target: null, moving: false };
const fakeEngine = (records: any[], cam: any = HOME, texts: any[] = []): any => ({
  W: 1920,
  H: 1080,
  duration: 2,
  scenes: [{ name: 's', start: 0, dur: 2, end: 2 }],
  ctx: {},
  sample: (t: number) => [{ index: 0, name: 's', lt: t, sa: 1, cam, records }],
  texts: () => texts,
});
const gate = (records: any[], cam?: any, texts?: any[]) => runQA(fakeEngine(records, cam, texts), [1], { determinism: false });
const ofType = (r: any, type: string) => r.errors.filter((e: any) => e.type === type);
const phone = (extra: any = {}) => rec('phone', R(600, 200, 500, 700), { kind: 'phone', container: true, ...extra });

describe('qa record: text-collision', () => {
  test('two texts of one container that overlap are flagged, with both strings in the detail', () => {
    const r = gate([phone({ texts: [txt('Hola', R(700, 300, 200, 40)), txt('Mundo', R(750, 310, 200, 40))] })]);
    const hits = ofType(r, 'text-collision');
    expect(hits.length).toBe(1);
    expect(hits[0].id).toBe('phone');
    expect(hits[0].detail).toContain('"Hola"');
    expect(hits[0].detail).toContain('"Mundo"');
    expect(r.ok).toBe(false);
  });

  test('texts of a record fully inside a container still count against the container texts', () => {
    const r = gate([
      phone({ texts: [txt('Título', R(650, 250, 300, 40))] }),
      rec('row', R(640, 240, 400, 100), { texts: [txt('Fila', R(660, 255, 200, 40))] }),
    ]);
    expect(types(r)).not.toContain('overlap');
    expect(ofType(r, 'text-collision').map((e: any) => e.id)).toEqual(['phone + row']);
  });

  test('texts that only touch, or overlap by minOverlapPx or less, pass', () => {
    const touching = gate([phone({ texts: [txt('a', R(700, 300, 200, 40)), txt('b', R(700, 340, 200, 40))] })]);
    expect(ofType(touching, 'text-collision')).toEqual([]);
    const sliver = gate([phone({ texts: [txt('a', R(700, 300, 200, 40)), txt('b', R(700, 336, 200, 40))] })]);
    expect(ofType(sliver, 'text-collision')).toEqual([]);
  });

  test('an item reported twice (same string, same box) is not a collision with itself', () => {
    const twin = () => rec('n', R(700, 300, 300, 100), { texts: [txt('Igual', R(720, 320, 200, 40))] });
    expect(ofType(gate([{ ...twin(), overlap: true }, { ...twin(), overlap: true }]), 'text-collision')).toEqual([]);
  });

  test('HUD texts only meet HUD texts', () => {
    const world = rec('w', R(700, 900, 400, 100), { overlap: true, texts: [txt('mundo', R(720, 920, 300, 40))] });
    const caption = rec('caption', R(600, 900, 700, 100), { kind: 'caption', hud: true, overlap: true, texts: [txt('subtítulo', R(700, 910, 400, 40))] });
    expect(ofType(gate([world, caption]), 'text-collision')).toEqual([]);
    const tag = rec('tag', R(600, 900, 700, 100), { kind: 'tag', hud: true, overlap: true, texts: [txt('etiqueta', R(800, 915, 300, 40))] });
    expect(ofType(gate([caption, tag]), 'text-collision').map((e: any) => e.id)).toEqual(['caption + tag']);
  });

  test('every reported text goes through the opening-mark check', () => {
    const r = gate([rec('n', R(700, 300, 400, 100), { texts: [txt('¡Listo!', R(720, 320, 200, 40))] })]);
    expect(ofType(r, 'opening-punctuation').map((e: any) => e.id)).toEqual(['n']);
  });
});

describe('qa record: containers, contains and hosts', () => {
  test('a plain record partly overlapping a container is an overlap error', () => {
    const r = gate([phone(), rec('badge', R(1050, 400, 150, 100))]);
    expect(ofType(r, 'overlap').map((e: any) => e.id)).toEqual(['badge + phone']);
  });

  test('two containers that partly overlap are an error too', () => {
    const r = gate([phone(), rec('laptop', R(1000, 300, 600, 400), { container: true })]);
    expect(ofType(r, 'overlap').map((e: any) => e.id)).toEqual(['laptop + phone']);
  });

  test('a record hosted by the container (in: phone.screen or in: phone) may overlap it partly', () => {
    for (const host of ['phone.screen', 'phone']) {
      expect(ofType(gate([phone(), rec('badge', R(1050, 400, 150, 100), { host })]), 'overlap')).toEqual([]);
    }
    // A host id is matched whole: "phonebook" is not hosted by "phone".
    expect(ofType(gate([phone(), rec('badge', R(1050, 400, 150, 100), { host: 'phonebook' })]), 'overlap').length).toBe(1);
  });

  test('a hosted record still may not partly overlap another container', () => {
    const r = gate([phone(), rec('laptop', R(1200, 300, 600, 400), { container: true }), rec('badge', R(1050, 400, 200, 100), { host: 'phone.screen' })]);
    expect(ofType(r, 'overlap').map((e: any) => e.id)).toEqual(['badge + laptop']);
  });

  test('a record fully inside a container passes, and so does one the container lists in contains', () => {
    expect(ofType(gate([phone(), rec('row', R(650, 300, 400, 100))]), 'overlap')).toEqual([]);
    expect(ofType(gate([phone({ contains: ['badge'] }), rec('badge', R(1050, 400, 150, 100))]), 'overlap')).toEqual([]);
  });

  test('legacy overlap: true still exempts every overlap check', () => {
    expect(ofType(gate([phone(), rec('badge', R(1050, 400, 150, 100), { overlap: true })]), 'overlap')).toEqual([]);
  });
});

describe('qa record: parts-overlap', () => {
  test('two solid parts of one record that intersect are flagged; non-solid parts may overlap', () => {
    const parts = [
      { id: 'screen', rect: R(620, 220, 460, 500), solid: true },
      { id: 'keyboard', rect: R(620, 700, 460, 180), solid: true },
      { id: 'glare', rect: R(620, 220, 200, 600) },
    ];
    const hits = ofType(gate([phone({ parts })]), 'parts-overlap');
    expect(hits.length).toBe(1);
    expect(hits[0].id).toBe('phone');
    expect(hits[0].detail).toContain('screen');
    expect(hits[0].detail).toContain('keyboard');
    const apart = [{ ...parts[0] }, { ...parts[1], rect: R(620, 730, 460, 150) }, parts[2]];
    expect(ofType(gate([phone({ parts: apart })]), 'parts-overlap')).toEqual([]);
  });
});

describe('qa record: hud-overlap', () => {
  // Zoom 2 around the frame center: world card [860,540 200x200] lands on screen [760,540 400x400], bottom at 940.
  const zoomed = { x: 960, y: 540, z: 2, target: 'card', moving: false };
  const card = () => rec('card', R(860, 540, 200, 200), { texts: [txt('Tarjeta', R(880, 560, 160, 40))] });
  const caption = (extra: any = {}) => rec('caption', R(200, 900, 1520, 80), { kind: 'caption', hud: true, ...extra });

  test('the zoomed camera target under a caption is flagged', () => {
    const hits = ofType(gate([card(), caption()], zoomed), 'hud-overlap');
    expect(hits.map((e: any) => e.id)).toEqual(['card + caption']);
    expect(hits[0].detail).toContain('zoom 2');
  });

  test('at rest the plain overlap check owns world vs HUD; a moving camera raises hud-overlap', () => {
    const r = gate([card(), rec('tag', R(780, 560, 300, 60), { kind: 'tag', hud: true })], { ...zoomed, z: 1 }, []);
    expect(ofType(r, 'hud-overlap')).toEqual([]); // camera at rest: the plain overlap check owns this case
    expect(ofType(r, 'overlap').length).toBe(1);
    const moving = gate([card(), caption()], { ...zoomed, moving: true });
    expect(ofType(moving, 'hud-overlap').length).toBe(1);
  });

  test('a zoomFade heading over the target is not flagged', () => {
    const heading = rec('heading', R(200, 600, 1520, 120), { kind: 'heading', hud: true, zoomFade: true });
    expect(ofType(gate([card(), heading], zoomed), 'hud-overlap')).toEqual([]);
    expect(ofType(gate([card(), { ...heading, kind: 'label', zoomFade: false }], zoomed), 'hud-overlap').length).toBe(1);
  });

  test('other world records under the HUD while zoomed stay allowed (the camera may crop them)', () => {
    const side = rec('side', R(500, 760, 120, 60)); // screen [40,980 240x120]: cropped and under the caption
    const r = gate([card(), side, caption({ rect: R(30, 960, 300, 80) })], zoomed);
    expect(r.errors).toEqual([]);
  });

  test('an invisible caption or target is never flagged', () => {
    expect(ofType(gate([card(), caption({ alpha: 0.01 })], zoomed), 'hud-overlap')).toEqual([]);
    expect(ofType(gate([{ ...card(), alpha: 0 }, caption()], zoomed), 'hud-overlap')).toEqual([]);
  });

  test('a sub-id target (phone.screen) is resolved through the parent parts', () => {
    // Zoom 2 around [850,550]: part screen [800,500 100x150] lands on [860,440 200x300], bottom at 740.
    const cam = { x: 850, y: 550, z: 2, target: 'phone.screen', moving: false };
    const dev = rec('phone', R(780, 300, 140, 500), { container: true, parts: [{ id: 'screen', rect: R(800, 500, 100, 150), solid: true }] });
    expect(ofType(gate([dev, caption({ rect: R(200, 700, 1520, 80) })], cam), 'hud-overlap').map((e: any) => e.id)).toEqual(['phone.screen + caption']);
    expect(ofType(gate([dev, caption({ rect: R(200, 900, 1520, 80) })], cam), 'hud-overlap')).toEqual([]);
  });
});

describe('qa record: hud-overlap on a real engine', () => {
  test('the heading of a real scene is never flagged under a zoomed target', () => {
    const r = run((s) => {
      s.heading({ text: 'Un título' });
      s.node({ id: 'n', text: 'x', rect: { x: 760, y: 300, w: 400, h: 400 } });
      s.camera.focus('n', 0.5, 0.5, { frame: 'full', zoom: 2, crop: true });
    });
    expect(types(r)).not.toContain('hud-overlap');
  });
});
