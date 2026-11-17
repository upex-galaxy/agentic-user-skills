// Camera: zoom, pan and focus-on-element (by id) with easing. A camera is a list of moves; its state at
// time t is a pure function of the moves, so scrubbing and export agree.
import { clamp, lerp, prog, resolveEase } from './math.js';

/**
 * createCamera({ W, H, resolve }) where resolve(id) returns the element rect.
 * Moves should not overlap in time; each move starts from the previous move's end state.
 */
export function createCamera({ W, H, resolve }) {
  const home = { x: W / 2, y: H / 2, z: 1 };
  const moves = [];
  const add = (at, dur, to, e) => {
    moves.push({ at, dur, to, ease: resolveEase(e, 'inOut') });
    moves.sort((a, b) => a.at - b.at);
  };
  const cam = {
    moves,
    home,
    /** Zoom and pan so the element (id or rect) fills the frame. opts: zoom, pad (default 120), maxZoom (2.5), ease. */
    focus(target, at, dur = 1, opts = {}) {
      const r = typeof target === 'string' ? resolve(target) : target;
      const pad = opts.pad ?? 120;
      const fit = Math.min(W / (r.w + pad * 2), H / (r.h + pad * 2));
      const z = opts.zoom ?? clamp(fit, 1, opts.maxZoom ?? 2.5);
      add(at, dur, { x: r.x + r.w / 2, y: r.y + r.h / 2, z }, opts.ease);
      return this;
    },
    pan(x, y, at, dur = 1, opts = {}) {
      add(at, dur, { x, y }, opts.ease);
      return this;
    },
    zoom(z, at, dur = 1, opts = {}) {
      add(at, dur, { z }, opts.ease);
      return this;
    },
    reset(at, dur = 1, opts = {}) {
      add(at, dur, { ...home }, opts.ease);
      return this;
    },
    /** Camera state { x, y, z } at scene-local time t. */
    at(t) {
      let state = home;
      for (const m of moves) {
        if (t < m.at) { break; }
        const target = { ...state, ...m.to };
        const k = m.ease(prog(t, m.at, m.dur));
        if (k < 1 && t < m.at + m.dur) { return { x: lerp(state.x, target.x, k), y: lerp(state.y, target.y, k), z: lerp(state.z, target.z, k) }; }
        state = target;
      }
      return state;
    },
    /** Apply the camera transform to ctx (call between save/restore). */
    apply(ctx, t) {
      const c = cam.at(t);
      ctx.translate(W / 2, H / 2);
      ctx.scale(c.z, c.z);
      ctx.translate(-c.x, -c.y);
    },
  };
  return cam;
}
