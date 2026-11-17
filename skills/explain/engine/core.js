// Engine core. render(t) is a pure function of time over a scene graph built once from the scene spec.
// Scenes have their own local time and duration; a named transition overlaps each scene with the next.
// No wall-clock is read anywhere in this file.
import { createCamera } from './camera.js';
import { createRegistry, grid, radial, row, stack, tree } from './layout.js';
import { clamp, ease, lerp } from './math.js';

export * from './math.js';

const LAYOUTS = { row, stack, grid, radial, tree };
const DEFAULT_TR = 0.6;

/** Per-transition behavior. `out` / `in` map progress p (0..1) to the layer look of the leaving / entering scene. */
export const TRANSITIONS = {
  'crossfade': {
    out: p => ({ sa: 1 - ease.inOut(p) }),
    in: p => ({ sa: ease.inOut(p) }),
  },
  'push-zoom': {
    out: p => ({ sa: 1 - ease.inOut(p), scale: lerp(1, 0.94, ease.inOut(p)) }),
    in: p => ({ sa: ease.out(p), scale: lerp(1.06, 1, ease.out(p)) }),
  },
  'light-sweep': {
    out: p => ({ sa: 1 - ease.inOut(p) }),
    in: p => ({ sa: ease.inOut(p) }),
    sweep: true,
  },
  'wipe': {
    out: () => ({ sa: 1 }),
    in: p => ({ sa: 1, wipe: ease.inOut(p) }),
    edge: true,
  },
};

function parseTransition(def) {
  const spec = typeof def === 'string' ? { type: def } : (def ?? { type: 'crossfade' });
  const type = spec.type ?? 'crossfade';
  if (!TRANSITIONS[type]) { throw new Error(`Unknown transition "${type}" (use ${Object.keys(TRANSITIONS).join(', ')})`); }
  return { type, dur: spec.dur ?? DEFAULT_TR };
}

/** Identity helper that marks a scene definition (kept for readable scene files). */
export function scene(def) {
  return def;
}

function createBuilder({ ctx, style, W, H, pieces, name }) {
  const reg = createRegistry();
  const items = [];
  const counters = {};
  const s = {
    name,
    W,
    H,
    ctx,
    style,
    reg,
    items,
    area: { x: 80, y: 80, w: W - 160, h: H - 160 },
    camera: createCamera({ W, H, resolve: id => reg.get(id) }),
    uid(prefix) {
      counters[prefix] = (counters[prefix] ?? 0) + 1;
      return `${prefix}-${counters[prefix]}`;
    },
    add(item) {
      items.push(item);
      return item;
    },
    /** Raw escape hatch: fn(ctx, t, api) draws anything through the style. `t` is scene-local time. */
    raw(fn, o = {}) {
      return s.add({ kind: 'raw', id: o.id ?? s.uid('raw'), z: o.z ?? 0, draw: (api, t) => fn(api.ctx, t, api) });
    },
    /** Connect two registered ids: { pts, from, to, length }. */
    connect: (from, to, opts) => reg.connect(from, to, opts),
  };
  for (const [key, fn] of Object.entries(LAYOUTS)) {
    s[key] = (specs, o = {}) => {
      const result = fn(specs, { area: s.area, ...o });
      reg.addAll(result.rects);
      return result;
    };
  }
  for (const [key, fn] of Object.entries(pieces)) { s[key] = o => s.add(fn(s, o)); }
  return s;
}

/**
 * Build the engine from a scene spec: { width?, height?, fps?, scenes: [{ name, dur, transition?, build(s) }] }.
 * `transition` is the transition INTO the next scene: 'crossfade' | 'push-zoom' | 'light-sweep' | 'wipe',
 * or { type, dur }. Call it after fonts are loaded: text is fitted at build time.
 */
export function createEngine({ canvas, ctx = canvas.getContext('2d'), style, spec, pieces = {} }) {
  const W = spec.width ?? 1920;
  const H = spec.height ?? 1080;
  const fps = spec.fps ?? 30;
  if (canvas) {
    canvas.width = W;
    canvas.height = H;
  }
  if (!spec.scenes?.length) { throw new Error('Scene spec has no scenes'); }

  const scenes = spec.scenes.map((def, i) => {
    if (!(def.dur > 0)) { throw new Error(`Scene ${i} needs a positive dur`); }
    const name = def.name ?? `scene-${i + 1}`;
    const s = createBuilder({ ctx, style, W, H, pieces, name });
    def.build(s);
    const items = s.items.map((it, n) => ({ it, n })).sort((a, b) => (a.it.z ?? 0) - (b.it.z ?? 0) || a.n - b.n).map(x => x.it);
    return { index: i, name, dur: def.dur, items, camera: s.camera, reg: s.reg, trOut: parseTransition(def.transition), start: 0, trIn: 0 };
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
        look = { ...look, ...TRANSITIONS[prev.trOut.type].in(p) };
        fx.push({ type: prev.trOut.type, p });
      }
      if (leaving) {
        const p = (lt - (sc.dur - sc.tr)) / sc.tr;
        look = { ...look, ...TRANSITIONS[sc.trOut.type].out(p) };
      }
      layers.push({ index: sc.index, name: sc.name, lt, ...look });
    }
    return { t: tt, layers, fx };
  }

  function drawLayer(layer) {
    const sc = scenes[layer.index];
    const api = makeApi(layer.lt, layer.sa);
    ctx.save();
    if (layer.wipe !== undefined) {
      ctx.beginPath();
      ctx.rect(0, 0, W * layer.wipe, H);
      ctx.clip();
    }
    if (layer.scale && layer.scale !== 1) {
      ctx.translate(W / 2, H / 2);
      ctx.scale(layer.scale, layer.scale);
      ctx.translate(-W / 2, -H / 2);
    }
    sc.camera.apply(ctx, layer.lt);
    for (const it of sc.items) {
      ctx.save();
      it.draw(api, layer.lt);
      ctx.restore();
    }
    ctx.restore();
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
      const api = makeApi(st.t, 1);
      ctx.save();
      ctx.globalAlpha = 1;
      if (TRANSITIONS[f.type].sweep) { style.sweep(api, f.p); }
      if (TRANSITIONS[f.type].edge) {
        const x = W * ease.inOut(f.p);
        ctx.fillStyle = style.color('accent');
        ctx.globalAlpha = 1 - Math.abs(f.p - 0.5) * 0.6;
        ctx.fillRect(x - 3, 0, 6, H);
      }
      ctx.restore();
    }
    style.overlay?.(makeApi(st.t, 1));
  }

  /** QA sample: per visible scene, the records of every element that reports bounds and text. */
  function sample(t) {
    const st = state(t);
    return st.layers.map((layer) => {
      const sc = scenes[layer.index];
      const api = makeApi(layer.lt, layer.sa);
      const records = [];
      for (const it of sc.items) {
        const rec = it.qa?.(api, layer.lt);
        if (rec) { records.push({ id: it.id, kind: it.kind, ...rec, alpha: rec.alpha * layer.sa }); }
      }
      return { index: layer.index, name: layer.name, lt: layer.lt, sa: layer.sa, records };
    });
  }

  /** Every text string of every element, regardless of time (for static checks such as the ¿ ¡ rule). */
  function texts() {
    const out = [];
    for (const sc of scenes) {
      for (const it of sc.items) {
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
    scenes: scenes.map(sc => ({ name: sc.name, start: sc.start, dur: sc.dur, end: sc.start + sc.dur })),
    style,
    ctx,
    canvas,
    render,
    state,
    sample,
    texts,
  };
}
