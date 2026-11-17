// QA gate: runs over a set of sample times and reports problems as JSON.
// Errors (fail the gate): out-of-bounds, overlap, text-overflow, opening-punctuation (¿ ¡ on screen), nondeterminism.
// Warnings: composition-balance (one half of the frame stays empty for a whole scene).
// Rects are in scene (world) coordinates, before the camera transform.

const OPENING = /[¿¡]/;

/** Sample times covering every scene: each `step` seconds of local time plus each scene's last instant. */
export function defaultTimes(engine, step = 0.5) {
  const set = new Set();
  for (const sc of engine.scenes) {
    for (let lt = 0; lt < sc.dur; lt += step) { set.add(Math.round((sc.start + lt) * 1000) / 1000); }
    set.add(Math.round((sc.end - 0.01) * 1000) / 1000);
  }
  return [...set].filter(t => t >= 0 && t <= engine.duration).sort((a, b) => a - b);
}

const inter = (a, b) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? { w, h, area: w * h } : null;
};
const contains = (outer, inner, tol = 1) => inner.x >= outer.x - tol && inner.y >= outer.y - tol
  && inner.x + inner.w <= outer.x + outer.w + tol && inner.y + inner.h <= outer.y + outer.h + tol;

function exempt(a, b) {
  if (a.overlap === true || b.overlap === true) { return true; }
  if (a.overlapWith?.includes(b.id) || b.overlapWith?.includes(a.id)) { return true; }
  if (a.container && (a.contains?.includes(b.id) || contains(a.rect, b.rect))) { return true; }
  if (b.container && (b.contains?.includes(a.id) || contains(b.rect, a.rect))) { return true; }
  return false;
}

const pixels = engine => engine.ctx.getImageData(0, 0, engine.W, engine.H).data;

/**
 * Count pixels that really changed between two captures. Canvas rasterization can flip a few antialiased pixels by
 * one or two levels between identical draws (measured: 1 pixel, 1 level, on a Rough.js sketch frame), so channel
 * deltas up to `tol` are noise; nondeterministic code moves whole shapes and changes far more pixels.
 */
export function countChanged(a, b, tol = 3) {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i] - b[i]) > tol || Math.abs(a[i + 1] - b[i + 1]) > tol || Math.abs(a[i + 2] - b[i + 2]) > tol) { n++; }
  }
  return n;
}

/** Render t, render something else, render t again: the pixels must match (within rasterization noise). Needs a real canvas. */
export function probeDeterminism(engine, times, maxChanged = 8) {
  const failures = [];
  for (const t of times) {
    engine.render(t);
    const a = pixels(engine);
    engine.render((t + engine.duration / 2) % engine.duration);
    engine.render(t);
    if (countChanged(a, pixels(engine)) > maxChanged) { failures.push(t); }
  }
  return { checked: times.length, failures };
}

/**
 * Run the gate. opts: margin (24), minOverlapPx (4), overlapRatio (0.02), visible (0.05),
 * balanceMin (0.01 of a half-frame), determinism (probe up to 3 times when the canvas can be read).
 */
export function runQA(engine, times, opts = {}) {
  const { margin = 24, minOverlapPx = 4, overlapRatio = 0.02, visible = 0.05, balanceMin = 0.01 } = opts;
  const samples = times ?? defaultTimes(engine);
  const { W, H } = engine;
  const errors = new Map();
  const warnings = [];
  const flag = (type, scene, id, t, detail) => {
    const key = `${type}|${scene}|${id}`;
    const hit = errors.get(key);
    if (hit) { hit.count++; }
    else { errors.set(key, { type, scene, id, t, count: 1, detail }); }
  };

  for (const { scene, id, text } of engine.texts()) {
    if (OPENING.test(text)) { flag('opening-punctuation', scene, id, 0, `text contains an opening ¿ or ¡: "${text}"`); }
  }

  const coverage = new Map(); // scene -> { left, right, top, bottom, samples }
  let elements = 0;
  for (const t of samples) {
    for (const layer of engine.sample(t)) {
      const recs = layer.records.filter(r => r.alpha > visible);
      elements += recs.length;
      for (const r of recs) {
        const b = r.rect;
        if (b.x < margin - 0.5 || b.y < margin - 0.5 || b.x + b.w > W - margin + 0.5 || b.y + b.h > H - margin + 0.5) { flag('out-of-bounds', layer.name, r.id, t, `rect ${fmt(b)} leaves the ${margin}px safe area of ${W}x${H}`); }
        for (const tx of r.texts ?? []) {
          if (tx.overflow) { flag('text-overflow', layer.name, r.id, t, `text does not fit at the minimum size: "${tx.text}"`); }
          else if (!contains(r.rect, tx.rect, 1.5)) { flag('text-overflow', layer.name, r.id, t, `text box ${fmt(tx.rect)} leaves its shape ${fmt(r.rect)}`); }
        }
      }
      for (let i = 0; i < recs.length; i++) {
        for (let j = i + 1; j < recs.length; j++) {
          const a = recs[i];
          const b = recs[j];
          const x = inter(a.rect, b.rect);
          if (!x || x.w <= minOverlapPx || x.h <= minOverlapPx || exempt(a, b)) { continue; }
          const small = Math.min(a.rect.w * a.rect.h, b.rect.w * b.rect.h);
          if (small > 0 && x.area / small > overlapRatio) { flag('overlap', layer.name, [a.id, b.id].sort().join(' + '), t, `${a.id} ${fmt(a.rect)} overlaps ${b.id} ${fmt(b.rect)} (${Math.round((x.area / small) * 100)}% of the smaller)`); }
        }
      }
      if (layer.sa >= 0.5) {
        const c = coverage.get(layer.name) ?? { left: 0, right: 0, top: 0, bottom: 0, samples: 0 };
        const side = (name, area) => {
          c[name] = Math.max(c[name], area);
        };
        const halves = { left: { x: 0, y: 0, w: W / 2, h: H }, right: { x: W / 2, y: 0, w: W / 2, h: H }, top: { x: 0, y: 0, w: W, h: H / 2 }, bottom: { x: 0, y: H / 2, w: W, h: H / 2 } };
        for (const [name, half] of Object.entries(halves)) {
          let sum = 0;
          for (const r of recs) {
            if (r.kind !== 'edge' && r.kind !== 'raw') { sum += inter(r.rect, half)?.area ?? 0; }
          }
          side(name, sum / (half.w * half.h));
        }
        c.samples++;
        coverage.set(layer.name, c);
      }
    }
  }

  for (const [scene, c] of coverage) {
    if (c.samples < 2) { continue; }
    for (const name of ['left', 'right', 'top', 'bottom']) {
      if (c[name] < balanceMin) { warnings.push({ type: 'composition-balance', scene, detail: `the ${name} half of the frame stays empty for the whole scene` }); }
    }
  }

  let determinism = null;
  if (opts.determinism !== false && typeof engine.ctx.getImageData === 'function') {
    const probe = samples.filter((_, i) => i % Math.max(1, Math.floor(samples.length / 3)) === 0).slice(0, 3);
    determinism = probeDeterminism(engine, probe);
    for (const t of determinism.failures) { flag('nondeterministic', '-', 'render', t, 'the same frame rendered twice produced different pixels'); }
  }

  const list = [...errors.values()];
  return {
    ok: list.length === 0,
    errors: list,
    warnings,
    stats: { samples: samples.length, elements, scenes: engine.scenes.map(s => s.name), determinism },
  };
}

function fmt(r) {
  return `[${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}]`;
}
