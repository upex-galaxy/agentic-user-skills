// Engine core. render(t) is a pure function of time over a scene graph built once from the scene spec.
// Scenes have their own local time and duration; a named transition overlaps each scene with the next.
// No wall-clock is read anywhere in this file.
import { bands, fillScale } from './bands.js';
import { createCamera } from './camera.js';
import { checkSound } from './kit.js';
import { createRegistry, grid, radial, rectCenter, row, stack, tree, union } from './layout.js';
import { clamp } from './math.js';
import { cueId, fitDur, layoutCues, sayOf } from './narration.js';
import { definePreset } from './preset.js';
import { SOUND_KINDS, transitionSound } from './sound-kinds.js';
import { drawFx, parseTransition, transitionFx, transitionLook, TRANSITIONS } from './transitions.js';

export * from './math.js';

const LAYOUTS = { row, stack, grid, radial, tree };
// Pieces that lay out many items by themselves: without an explicit area they are scaled to fill the default area.
const FILL_PIECES = new Set(['flow', 'stateMachine', 'architecture', 'timeline']);
// HUD items flagged zoomFade (the heading) fade out between camera zoom 1 and 1 + ZOOM_FADE.
const ZOOM_FADE = 0.15;

export { TRANSITIONS };

/** Identity helper that marks a scene definition (kept for readable scene files). */
export function scene(def) {
  return def;
}

function createBuilder({ ctx, style, W, H, pieces, name, lang, title, voice }) {
  const reg = createRegistry();
  const items = [];
  const sfxList = [];
  const counters = {};
  const area = bands(W, H).area;
  const s = {
    name,
    W,
    H,
    ctx,
    style,
    reg,
    items,
    area,
    lang,
    title,
    sfxList,
    /** The scene's narration windows in scene-local seconds: [{ at, end, text }] (estimated lengths when voice is off). */
    voice,
    camera: createCamera({ W, H, resolve: id => reg.get(id), area }),
    uid(prefix) {
      counters[prefix] = (counters[prefix] ?? 0) + 1;
      return `${prefix}-${counters[prefix]}`;
    },
    add(item) {
      items.push(item);
      return item;
    },
    /**
     * Raw escape hatch: fn(ctx, t, api) draws anything through the style. `t` is scene-local time. Options: id, z, hud,
     * texts (strings the drawing shows: checked for the opening marks), rect (its footprint: checked for bounds only).
     */
    raw(fn, o = {}) {
      const texts = [...(o.texts ?? [])];
      const rect = o.rect;
      return s.add({
        kind: 'raw',
        id: o.id ?? s.uid('raw'),
        z: o.z ?? 0,
        hud: o.hud === true,
        draw: (api, t) => fn(api.ctx, t, api),
        texts: () => texts,
        ...(rect ? { rect, qa: () => ({ rect, alpha: 1, overlap: true }) } : {}),
      });
    },
    /** Explicit sound effect: { kind, at = 0, gain = 1, pan = 0 }. `kind` is one of SOUND_KINDS. */
    sfx(o = {}) {
      if (!SOUND_KINDS.includes(o.kind)) { throw new Error(`sfx: unknown kind "${o.kind}". Use one of: ${SOUND_KINDS.join(', ')}`); }
      sfxList.push({ kind: o.kind, at: o.at ?? 0, gain: o.gain ?? 1, pan: o.pan ?? 0 });
    },
    /** Connect two registered ids: { pts, from, to, length }. */
    connect: (from, to, opts) => reg.connect(from, to, opts),
  };
  for (const [key, fn] of Object.entries(LAYOUTS)) {
    s[key] = (specs, o = {}) => {
      // No explicit area: the layout grows to fill the default area instead of only shrinking into it.
      const result = fn(specs, { area: s.area, fill: !o.area && !Number.isFinite(o.x), ...o });
      reg.addAll(result.rects);
      return result;
    };
  }
  /** Scale and center the items created since `first` (and the ids registered since) so they fill the default area. */
  const fillItems = (first, known) => {
    const mine = items.slice(first).filter(it => typeof it.qa === 'function' && it.rect && !it.hud);
    if (!mine.length) { return; }
    const b = union(mine.map(it => it.rect));
    const k = fillScale(b, s.area);
    const tx = s.area.x + (s.area.w - b.w * k) / 2 - b.x * k;
    const ty = s.area.y + (s.area.h - b.h * k) / 2 - b.y * k;
    if (Math.abs(k - 1) < 1e-6 && Math.abs(tx) < 0.5 && Math.abs(ty) < 0.5) { return; }
    const map = r => ({ x: r.x * k + tx, y: r.y * k + ty, w: r.w * k, h: r.h * k });
    for (const it of items.slice(first)) {
      if (typeof it.draw !== 'function') { continue; }
      const { draw, qa } = it;
      // Keep the item's own rect in the filled space too (wrappers pivot and clip on it).
      if (it.rect) { it.rect = map(it.rect); }
      it.draw = (api, t) => {
        api.ctx.translate(tx, ty);
        api.ctx.scale(k, k);
        draw(api, t);
      };
      if (qa) {
        it.qa = (api, t) => {
          const rec = qa(api, t);
          return rec ? { ...rec, rect: map(rec.rect), texts: (rec.texts ?? []).map(x => ({ ...x, rect: map(x.rect) })), ...(rec.parts ? { parts: rec.parts.map(x => ({ ...x, rect: map(x.rect) })) } : {}) } : rec;
        };
      }
    }
    for (const id of reg.ids()) { if (!known.has(id)) { reg.replace(id, map(reg.get(id))); } }
  };
  for (const [key, fn] of Object.entries(pieces)) {
    s[key] = (o = {}) => {
      const first = items.length;
      const known = new Set(reg.ids());
      // A piece may add its own item (older motion pieces do): add it once.
      const made = fn(s, o);
      const item = items.includes(made) ? made : s.add(made);
      // Items built without piece() still carry their `at` and `sound` option for engine.events().
      if (item.at === undefined) { item.at = o.at ?? 0; }
      if (item.sound === undefined && o.sound !== undefined) { item.sound = checkSound(o.sound, `${key} "${item.id}"`); }
      if (FILL_PIECES.has(key) && o.fill !== false && !o.area && !o.rect) { fillItems(first, known); }
      return item;
    };
  }
  return s;
}

/**
 * Build the engine from a scene spec: { width?, height?, fps?, scenes: [{ name, dur, transition?, build(s) }] }.
 * `transition` is the transition INTO the next scene: a type name (engine/transitions.js) or { type, dur, ...params }.
 * `style` is a preset factory or a resolved preset (engine/preset.js). Call it after fonts are loaded: text is fitted
 * at build time. `narration` is undefined (voice off) or { cues: [{ id, seconds }] } (voice on): a scene with `say` then
 * stretches to fit its clips (unless `fit: false`) and its builder reads the cue windows as `s.voice`.
 */
export function createEngine({ canvas, ctx = canvas.getContext('2d'), style: preset, spec, pieces = {}, narration }) {
  const style = definePreset(preset);
  const W = spec.width ?? 1920;
  const H = spec.height ?? 1080;
  const fps = spec.fps ?? 30;
  if (canvas) {
    canvas.width = W;
    canvas.height = H;
  }
  if (!spec.scenes?.length) { throw new Error('Scene spec has no scenes'); }

  const clipSeconds = new Map((narration?.cues ?? []).map(c => [c.id, c.seconds]));
  const scenes = spec.scenes.map((def, i) => {
    if (!(def.dur > 0)) { throw new Error(`Scene ${i} needs a positive dur`); }
    const name = def.name ?? `scene-${i + 1}`;
    // Narration windows come first: they set the scene's effective duration and reach the builder as s.voice.
    const trIn = i > 0 ? parseTransition(spec.scenes[i - 1].transition).dur : 0;
    const layout = layoutCues(sayOf(def, name).map((c, n) => ({ ...c, id: cueId(i, n) })), { trIn, seconds: id => clipSeconds.get(id) });
    const trOutNominal = i < spec.scenes.length - 1 ? parseTransition(def.transition).dur : 0;
    const dur = narration && def.fit !== false ? fitDur(def.dur, layout, trOutNominal) : def.dur;
    const s = createBuilder({ ctx, style, W, H, pieces, name, lang: spec.lang, title: spec.title, voice: layout.map(c => ({ at: c.at, end: c.end, text: c.text })) });
    try { def.build(s); }
    catch (e) { throw new Error(`Scene "${name}": ${e instanceof Error ? e.message : e}`, { cause: e }); }
    const sorted = s.items.map((it, n) => ({ it, n })).sort((a, b) => (a.it.z ?? 0) - (b.it.z ?? 0) || a.n - b.n).map(x => x.it);
    const items = sorted.filter(it => !it.hud);
    const hud = sorted.filter(it => it.hud);
    return { index: i, name, dur, items, hud, camera: s.camera, reg: s.reg, trOut: parseTransition(def.transition), start: 0, trIn: 0, sfx: s.sfxList, layout };
  });

  // Timeline: scene i+1 starts when scene i enters its outgoing window.
  let cursor = 0;
  scenes.forEach((sc, i) => {
    const next = scenes[i + 1];
    sc.start = cursor;
    if (next) {
      sc.tr = Math.min(sc.trOut.dur, sc.dur, next.dur);
      next.trIn = sc.tr;
      cursor += sc.dur - sc.tr;
    }
    else {
      sc.tr = 0;
      cursor += sc.dur;
    }
  });
  scenes.forEach((sc) => {
    if (sc.trIn + sc.tr > sc.dur + 1e-9) { throw new Error(`Scene "${sc.name}" (${sc.dur}s) is too short for its transitions (${sc.trIn}s in + ${sc.tr}s out)`); }
  });
  const duration = cursor;

  /**
   * Drawing api of one layer at scene-local time t. Alpha is a stack: renderers set ctx.globalAlpha only through
   * api.alpha(a), which multiplies by api.sa, and api.fade(k) returns the same api with sa multiplied by k, so fades
   * nest (a faded composite inside a fading scene inside a transition).
   */
  const makeApi = (t, sa) => ({
    ctx,
    style,
    pal: style.palette,
    W,
    H,
    t,
    sa,
    color: tok => style.color(tok),
    alpha(a) {
      ctx.globalAlpha = clamp(a * sa);
    },
    fade(k) {
      return makeApi(t, sa * clamp(k));
    },
  });

  /** Pure scene-graph state at global time t: which scenes are visible and how. */
  function state(t) {
    const tt = clamp(t, 0, duration);
    const layers = [];
    const fx = [];
    for (const sc of scenes) {
      const lt = tt - sc.start;
      if (lt < 0 || lt > sc.dur) { continue; }
      let look = { sa: 1 };
      const entering = sc.index > 0 && sc.trIn > 0 && lt < sc.trIn;
      const leaving = sc.tr > 0 && lt > sc.dur - sc.tr;
      if (entering) {
        const prev = scenes[sc.index - 1];
        const p = lt / sc.trIn;
        look = { ...look, ...transitionLook(prev.trOut, 'in', p, W, H), originFrom: prev.index };
        for (const name of transitionFx(prev.trOut)) { fx.push({ name, type: prev.trOut.type, p, spec: prev.trOut, from: prev.index }); }
      }
      if (leaving) {
        const p = (lt - (sc.dur - sc.tr)) / sc.tr;
        look = { ...look, ...transitionLook(sc.trOut, 'out', p, W, H), originFrom: sc.index };
      }
      layers.push({ index: sc.index, name: sc.name, lt, ...look });
    }
    return { t: tt, layers, fx };
  }

  /** A transition origin (registered id of scene `sc`, [x, y], or nothing) in frame pixels at scene-local time lt. */
  function originOf(sc, origin, lt) {
    if (Array.isArray(origin)) { return origin; }
    if (typeof origin === 'string' && sc?.reg.has(origin)) {
      const [x, y] = rectCenter(sc.reg.get(origin));
      const c = sc.camera.at(lt);
      return [(x - c.x) * c.z + W / 2, (y - c.y) * c.z + H / 2];
    }
    return [W / 2, H / 2];
  }

  function drawLayer(layer) {
    const sc = scenes[layer.index];
    const api = makeApi(layer.lt, layer.sa);
    // An id origin belongs to the LEAVING scene (where the zoom dives in), also for the entering layer.
    const os = scenes[layer.originFrom ?? layer.index];
    const [ox, oy] = originOf(os, layer.origin, os === sc ? layer.lt : os.dur);
    ctx.save();
    // Clips apply to the whole layer, HUD included.
    if (layer.wipe !== undefined) {
      ctx.beginPath();
      ctx.rect(0, 0, W * layer.wipe, H);
      ctx.clip();
    }
    if (layer.iris !== undefined) {
      ctx.beginPath();
      ctx.arc(ox, oy, Math.max(0, Math.hypot(W, H) * layer.iris), 0, Math.PI * 2);
      ctx.clip();
    }
    // Moves (shift, rotation, scale) apply to the world only: the HUD stays where it is and just fades.
    ctx.save();
    if (layer.dx || layer.dy) { ctx.translate((layer.dx ?? 0) * W, (layer.dy ?? 0) * H); }
    if (layer.rot || (layer.scale && layer.scale !== 1)) {
      ctx.translate(ox, oy);
      if (layer.rot) { ctx.rotate(layer.rot); }
      if (layer.scale && layer.scale !== 1) { ctx.scale(layer.scale, layer.scale); }
      ctx.translate(-ox, -oy);
    }
    sc.camera.apply(ctx, layer.lt);
    for (const it of sc.items) {
      ctx.save();
      it.draw(api, layer.lt);
      ctx.restore();
    }
    ctx.restore();
    // HUD furniture (section tag, heading, caption, footer, rail) is screen space: the camera never moves it.
    // zoomFade items (the heading) fade out while the camera zooms in, so they never sit over the magnified part.
    const zoomOut = clamp((sc.camera.at(layer.lt).z - 1) / ZOOM_FADE);
    for (const it of sc.hud) {
      ctx.save();
      it.draw(it.zoomFade && zoomOut > 0 ? api.fade(1 - zoomOut) : api, layer.lt);
      ctx.restore();
    }
    ctx.restore();
  }

  /**
   * Scene-local time when a scene has settled: 0.3 s after the last piece that reports an `end` (typing, a caption,
   * a pipeline) finishes, at least half the scene, and before the outgoing transition starts. Contact sheets sample it.
   */
  function settleOf(sc) {
    const last = sc.dur - sc.tr - 0.05;
    const ends = [...sc.items, ...sc.hud].map(it => it.end).filter(e => Number.isFinite(e) && e <= last);
    const done = ends.length ? Math.max(...ends) + 0.3 : sc.dur * 0.7;
    return Math.round(Math.min(last, Math.max(done, sc.dur * 0.5)) * 100) / 100;
  }

  /** Draw the frame at time t (seconds). Deterministic: same t, same pixels. */
  function render(t) {
    globalThis.__explainClock?.seek(t * 1000);
    const st = state(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
    style.background(makeApi(st.t, 1));
    for (const layer of st.layers) { drawLayer(layer); }
    for (const f of st.fx) {
      const src = scenes[f.from];
      drawFx(makeApi(st.t, 1), f.name, f.p, f.spec, originOf(src, f.spec.origin, src.dur));
    }
    style.overlay(makeApi(st.t, 1));
  }

  /** QA sample: per visible scene, the records of every element that reports bounds and text. */
  function sample(t) {
    const st = state(t);
    return st.layers.map((layer) => {
      const sc = scenes[layer.index];
      const api = makeApi(layer.lt, layer.sa);
      const records = [];
      for (const it of [...sc.items, ...sc.hud]) {
        const rec = it.qa?.(api, layer.lt);
        if (rec) { records.push({ id: it.id, kind: it.kind, hud: it.hud === true, zoomFade: it.zoomFade === true, ...rec, alpha: rec.alpha * layer.sa }); }
      }
      const target = sc.camera.targetAt(layer.lt);
      const targetRect = target && sc.reg.has(target) ? sc.reg.get(target) : null;
      return { index: layer.index, name: layer.name, lt: layer.lt, sa: layer.sa, cam: { ...sc.camera.at(layer.lt), target, targetRect, moving: sc.camera.movingAt(layer.lt) }, records };
    });
  }

  /**
   * Every sound event of the built scene graph, sorted by time then id: [{ t, scene, sceneIndex, id, kind, gain, pan }]
   * with t in global seconds. Pure: the same scene spec gives the same list. Coalescing and density caps are the mixer's job.
   */
  function events() {
    return collectEvents().kept;
  }

  /** Effects timed outside their scene (after its end, or before 0): they never play, and QA warns (cue-after-end). */
  function droppedEvents() {
    return collectEvents().dropped;
  }

  function collectEvents() {
    const out = [];
    const dropped = [];
    const panOf = it => (it.rect ? (rectCenter(it.rect)[0] / W) * 0.6 - 0.3 : 0);
    for (const sc of scenes) {
      const add = (id, local, kind, gain, pan) => {
        const ev = { t: sc.start + local, scene: sc.name, sceneIndex: sc.index, id, kind, gain, pan };
        (local < 0 || local > sc.dur ? dropped : out).push(ev);
      };
      if (sc.index < scenes.length - 1 && sc.tr > 0) { out.push({ t: sc.start + sc.dur - sc.tr, scene: sc.name, sceneIndex: sc.index, id: `transition:${sc.name}`, kind: transitionSound(sc.trOut.type), gain: 0.7, pan: 0 }); }
      for (const it of [...sc.items, ...sc.hud]) {
        if (it.sound === false) { continue; }
        (it.cues ?? []).forEach((c, n) => add(`${sc.name}:${it.id}:cue${n}`, c.t, c.kind, c.gain ?? 1, panOf(it)));
        if (it.sound === true || typeof it.sound === 'string') { add(`${sc.name}:${it.id}:sound`, it.at ?? 0, it.sound === true ? 'pop' : it.sound, 1, panOf(it)); }
      }
      sc.sfx.forEach((e, n) => add(`${sc.name}:sfx${n}`, e.at, e.kind, e.gain, e.pan));
    }
    const order = (a, b) => a.t - b.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return { kept: out.sort(order), dropped: dropped.sort(order) };
  }

  /** Every text string of every element, regardless of time (for static checks such as the ¿ ¡ rule). */
  function texts() {
    const out = [];
    for (const sc of scenes) {
      for (const it of [...sc.items, ...sc.hud]) {
        for (const text of it.texts?.() ?? []) { out.push({ scene: sc.name, id: it.id, text }); }
      }
    }
    return out;
  }

  return {
    W,
    H,
    fps,
    duration,
    scenes: scenes.map(sc => ({ name: sc.name, start: sc.start, dur: sc.dur, end: sc.start + sc.dur, settle: settleOf(sc) })),
    style,
    ctx,
    canvas,
    render,
    state,
    sample,
    texts,
    events,
    droppedEvents,
    narrated: Boolean(narration),
    voice: scenes.flatMap(sc => sc.layout.map(c => ({ id: c.id, scene: sc.name, sceneIndex: sc.index, t: sc.start + c.at, at: c.at, end: c.end, seconds: c.seconds, text: c.text, estimated: c.estimated }))),
  };
}
