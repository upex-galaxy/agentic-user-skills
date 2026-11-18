// Camera: zoom, pan and focus-on-element (by id) with easing. A camera is a list of moves; its state at
// time t is a pure function of the moves, so scrubbing and export agree.
import { clamp, lerp, prog, resolveEase } from './math.js';

/**
 * createCamera({ W, H, resolve, area }) where resolve(id) returns the element rect and `area` is the content band
 * between the heading and the caption (frame pixels). With an area, focus fits the target plus its padding INTO the
 * area and centers it there, so the caption, the footer and the rail never cover it and the zoom never crops it.
 * Without one (or with focus option frame: 'full') the target fills the whole frame, centered.
 * Moves should not overlap in time; each move starts from the previous move's end state.
 */
export function createCamera({ W, H, resolve, area }) {
  const home = { x: W / 2, y: H / 2, z: 1 };
  const moves = [];
  const add = (at, dur, to, e, target) => {
    moves.push({ at, dur, to, target, ease: resolveEase(e, 'inOut') });
    moves.sort((a, b) => a.at - b.at);
  };
  const cam = {
    moves,
    home,
    /**
     * Zoom and pan to an element (id or rect). opts: zoom (a wish: capped so the padded target still fits unless
     * crop: true), pad (24 in the area, 120 full frame), maxZoom (2.5), frame ('area' default when the camera has one,
     * 'full' for the whole frame), ease.
     */
    focus(target, at, dur = 1, opts = {}) {
      const r = typeof target === 'string' ? resolve(target) : target;
      const useArea = area && opts.frame !== 'full';
      const box = useArea ? area : { x: 0, y: 0, w: W, h: H };
      const pad = opts.pad ?? (useArea ? 24 : 120);
      const fit = Math.min(box.w / (r.w + pad * 2), box.h / (r.h + pad * 2));
      const wish = opts.zoom ?? clamp(fit, 1, opts.maxZoom ?? 2.5);
      // A zoom wish is capped so the padded target still fits (in the area, or the full frame), unless crop: true.
      const z = opts.crop !== true ? Math.max(1, Math.min(wish, fit)) : wish;
      // The target center lands on the box center: (c - cam) * z + W / 2 = box center.
      const cx = r.x + r.w / 2 - (box.x + box.w / 2 - W / 2) / z;
      const cy = r.y + r.h / 2 - (box.y + box.h / 2 - H / 2) / z;
      add(at, dur, { x: cx, y: cy, z }, opts.ease, typeof target === 'string' ? target : null);
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
      add(at, dur, { ...home }, opts.ease, null);
      return this;
    },
    /** Id of the latest focus move started by scene-local time t (pan and zoom keep it; reset or a rect focus clears it to null). */
    targetAt(t) {
      let target = null;
      for (const m of moves) {
        if (t < m.at) { break; }
        if (m.target !== undefined) { target = m.target; }
      }
      return target;
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
    /**
     * True while any move is running. QA treats that as "the camera is not at rest" even near zoom 1.0, where the
     * first frames of a zoom ramp are already panned and would otherwise trip false out-of-bounds.
     */
    movingAt(t) {
      return moves.some(m => t >= m.at && t < m.at + m.dur);
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
