// Scene transitions. A transition maps progress p (0..1) to the LOOK of the leaving scene (`out`) and of the entering
// scene (`in`), plus a list of effects (`fx`) drawn over the frame by the preset's transition hooks.
//
// Look fields (all optional): sa (scene alpha), scale (around `origin`), dx / dy (shift as a FRACTION of W / H),
// rot (radians around `origin`), iris (0..1 radius of a circular clip around `origin`, 1 = the frame diagonal),
// wipe (0..1 share of the width revealed from the left), origin (a registered id of that scene or [x, y] in frame pixels).
// The world (camera + items) takes every field; the HUD takes only sa and the iris / wipe clip.
import { clamp, ease, hexA, lerp } from './math.js';

export const DEFAULT_TR = 0.6;

/** Shift along `dir` as a fraction of the frame: v is the travel (-1 = one frame towards `dir`). */
function shift(dir, v) {
  switch (dir) {
    case 'right': return { dx: -v };
    case 'up': return { dy: v };
    case 'down': return { dy: -v };
    default: return { dx: v };
  }
}

/** Built-in transitions. `out(p, spec, W, H)` / `in(p, spec, W, H)` return a look; `fx` names effects for the hooks. */
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
    fx: ['sweep'],
  },
  'wipe': {
    out: () => ({ sa: 1 }),
    in: p => ({ sa: 1, wipe: ease.inOut(p) }),
    fx: ['edge'],
  },
  /** Dive into `origin` (an id of the leaving scene or [x, y]); the next scene grows out of the frame center. */
  'zoom-through': {
    out: (p, sp) => ({ sa: 1 - ease.in(clamp(p * 1.25)), scale: lerp(1, sp.zoom ?? 6, ease.in(p)), origin: sp.origin }),
    in: (p, sp) => ({ sa: ease.out(clamp((p - 0.3) / 0.7)), scale: lerp(0.6, 1, ease.out(clamp((p - 0.2) / 0.8))), origin: sp.origin }),
    fx: ['flash'],
  },
  /** Both scenes travel together like a film strip. `dir`: left (default) | right | up | down. */
  'slide': {
    out: (p, sp) => ({ sa: 1, ...shift(sp.dir, -ease.inOut(p)) }),
    in: (p, sp) => ({ sa: 1, ...shift(sp.dir, 1 - ease.inOut(p)) }),
  },
  /** The next scene opens through a growing circle around `origin` (default the frame center). */
  'iris': {
    out: (_p, sp) => ({ sa: 1, origin: sp.origin }),
    in: (p, sp) => ({ sa: 1, iris: ease.inOut(p), origin: sp.origin }),
    fx: ['ring'],
  },
  /** The old scene drops away like a sheet off the desk; the new one rises with a small overshoot. */
  'drop': {
    out: p => ({ sa: 1 - ease.in(p), dy: ease.in(p) * 0.5, rot: ease.in(p) * 0.06 }),
    in: p => ({ sa: ease.out(p), dy: -(1 - ease.back(p)) * 0.12 }),
  },
  /** A hard cut at the middle, torn by the preset's `glitch` hook; without one it is a plain cut. */
  'glitch': {
    out: p => ({ sa: p < 0.5 ? 1 : 0 }),
    in: p => ({ sa: p < 0.5 ? 0 : 1 }),
    fx: ['glitch'],
  },
};

export const TRANSITION_TYPES = () => Object.keys(TRANSITIONS);

/** Normalize a scene's `transition` (a type name or { type, dur, ...params }) into a spec; unknown types list every type. */
export function parseTransition(def) {
  const spec = typeof def === 'string' ? { type: def } : (def ?? { type: 'crossfade' });
  const type = spec.type ?? 'crossfade';
  if (!TRANSITIONS[type]) { throw new Error(`Unknown transition "${type}" (use ${TRANSITION_TYPES().join(', ')})`); }
  return { ...spec, type, dur: spec.dur ?? DEFAULT_TR };
}

/** Look of one side ('in' | 'out') of a transition at progress p. */
export function transitionLook(spec, side, p, W, H) {
  return TRANSITIONS[spec.type][side](clamp(p), spec, W, H) ?? {};
}

/** Effect names a transition draws over the frame. */
export const transitionFx = spec => TRANSITIONS[spec.type].fx ?? [];

/**
 * Default effect renderers, used when the preset has no hook of that name in `transitions`. Each gets
 * (api, p, spec, origin) with origin already resolved to frame pixels. They draw in frame space, after the layers.
 */
export const DEFAULT_FX = {
  /** A soft accent band crossing the frame left to right. */
  sweep(api, p) {
    const { ctx, W, H } = api;
    const x = lerp(-300, W + 300, p * p * (3 - 2 * p));
    const col = api.color('accent');
    const g = ctx.createLinearGradient(x - 180, 0, x + 180, 0);
    g.addColorStop(0, hexA(col, 0));
    g.addColorStop(0.5, hexA(col, 0.22));
    g.addColorStop(1, hexA(col, 0));
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(x - 180, 0, 360, H);
  },
  /** The bright edge of a wipe. */
  edge(api, p) {
    const { ctx, W, H } = api;
    const x = W * ease.inOut(p);
    ctx.fillStyle = api.color('accent');
    ctx.globalAlpha = 1 - Math.abs(p - 0.5) * 0.6;
    ctx.fillRect(x - 3, 0, 6, H);
  },
  /** A short accent flash at the middle of the transition. */
  flash(api, p) {
    const { ctx, W, H } = api;
    ctx.fillStyle = api.color('accent');
    ctx.globalAlpha = 0.16 * Math.sin(Math.PI * p) ** 2;
    ctx.fillRect(0, 0, W, H);
  },
  /** A ring growing from the origin (the edge of an iris). */
  ring(api, p, _spec, origin) {
    if (p >= 1) { return; }
    const { ctx, W, H } = api;
    ctx.strokeStyle = api.color('accent');
    ctx.lineWidth = 6;
    ctx.globalAlpha = 1 - p;
    ctx.beginPath();
    ctx.arc(origin[0], origin[1], Math.hypot(W, H) * ease.inOut(p), 0, Math.PI * 2);
    ctx.stroke();
  },
  /** No default tear: a preset without a glitch hook shows the plain cut. */
  glitch() {},
};

/** Draw one effect through the preset hook (style.transitions[name]) or the default. */
export function drawFx(api, name, p, spec, origin) {
  const hook = api.style.transitions?.[name] ?? DEFAULT_FX[name];
  if (!hook) { return; }
  const { ctx } = api;
  ctx.save();
  ctx.globalAlpha = 1;
  hook(api, p, spec, origin);
  ctx.restore();
}
