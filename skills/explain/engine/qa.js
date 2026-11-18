// QA gate: runs over a set of sample times and reports problems as JSON.
// Errors (fail the gate): out-of-bounds, overlap, text-overflow, text-collision, parts-overlap, hud-overlap,
// opening-punctuation (¿ ¡ on screen), nondeterminism.
// Warnings: composition-balance (lopsided, tiny, flat or high/low content once a scene has settled; HUD furniture excluded), widow (a lone short word on a text block's last line).
// Element rects are scene (world) coordinates; the camera transform at each sample time is applied before any check,
// so bounds, overlaps and coverage are measured in frame (screen) pixels. HUD items (section tag, heading, caption,
// footer) skip the camera: they are screen coordinates. While the camera is zoomed in (z > 1.05) or any move is running only its
// focus target must stay in frame and clear of the HUD; everything else may be cropped or run under the HUD on purpose.
//
// Record (what an item's qa(api, t) returns): { rect, alpha, container?, contains?, host?, texts?: [{ text, rect,
// overflow, px }], parts?: [{ id, rect, solid? }], overlap? (legacy blanket exemption), overlapWith? }. A container
// owns what lies fully inside it; a record that only partly overlaps one is an error unless the container lists it
// in `contains` or the record is hosted by it (`host` is the container id or `<id>.<sub>`).

const OPENING = /[¿¡]/;
const CELL = 40; // px, grid cell of the content-coverage measure
const CHROME = new Set(['tag', 'caption', 'source', 'heading']);
/** HUD furniture (section tag, heading, caption, footer) frames the content; it is not part of the composition measure. */
const isChrome = r => r.hud === true || CHROME.has(r.kind) || r.id === 'heading';

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

const area = r => r.w * r.h;
/** HUD record that fades out as the zoom comes in. The heading counts even when the sample does not carry the flag. */
const zoomFades = r => r.zoomFade === true || r.kind === 'heading';
/** The same string in the same box: an item reported twice draws over itself, which no viewer sees as a collision. */
const sameText = (a, b) => a.text === b.text && ['x', 'y', 'w', 'h'].every(k => Math.abs(a.screen[k] - b.screen[k]) < 0.5);
/** a was placed with `in:` into b (or into one of b's registered sub-rects such as `b.body`). */
const hostedBy = (a, b) => typeof a.host === 'string' && (a.host === b.id || a.host.startsWith(`${b.id}.`));

function exempt(a, b) {
  if (a.overlap === true || b.overlap === true) { return true; }
  if (a.overlapWith?.includes(b.id) || b.overlapWith?.includes(a.id)) { return true; }
  if (a.contains?.includes(b.id) || b.contains?.includes(a.id)) { return true; }
  if ((a.container && contains(a.rect, b.rect)) || (b.container && contains(b.rect, a.rect))) { return true; }
  // The smaller of the two may sit partly over its host (a badge on a device edge, a pane over a window frame).
  if (hostedBy(a, b) && area(a.rect) <= area(b.rect)) { return true; }
  if (hostedBy(b, a) && area(b.rect) <= area(a.rect)) { return true; }
  return false;
}

/**
 * Screen rects of the camera focus target: its record and its texts, or the solid/any part of a parent record whose
 * id is a prefix of the target (`phone.screen` is part `screen` of `phone`) with the parent texts inside that part,
 * or `cam.targetRect` (world) when the engine provides it. Empty when the target is not visible.
 */
function focusRects(recs, cam, view) {
  const id = cam.target;
  const own = recs.find(r => !r.hud && r.id === id);
  if (own) { return own.texts.map(tx => tx.screen).concat([own.rect]).filter(Boolean); }
  for (const r of recs) {
    if (r.hud || !id.startsWith(`${r.id}.`)) { continue; }
    const part = (r.parts ?? []).find(p => p.rect && (p.id === id || `${r.id}.${p.id}` === id));
    if (part) { return [view(part.rect), ...r.texts.filter(tx => tx.rect && contains(part.rect, tx.rect, 1.5)).map(tx => tx.screen)]; }
  }
  return cam.targetRect ? [view(cam.targetRect)] : [];
}

/** Map a world rect to frame pixels through the camera state { x, y, z } (null camera = identity). */
export function toScreen(r, cam, W, H) {
  if (!cam || (cam.z === 1 && cam.x === W / 2 && cam.y === H / 2)) { return r; }
  return { x: (r.x - cam.x) * cam.z + W / 2, y: (r.y - cam.y) * cam.z + H / 2, w: r.w * cam.z, h: r.h * cam.z };
}

/** Intersection of a rect with the frame, or null when it lies fully outside. */
const clip = (r, W, H) => {
  const x = Math.max(0, r.x);
  const y = Math.max(0, r.y);
  const w = Math.min(W, r.x + r.w) - x;
  const h = Math.min(H, r.y + r.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
};

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

/** `n` sample times spread evenly over the sorted samples, always including the first and the last. */
export function probeTimes(samples, n) {
  const sorted = [...samples].sort((a, b) => a - b);
  if (sorted.length <= n) { return sorted; }
  if (n <= 1) { return [sorted[sorted.length - 1]]; }
  return [...new Set(Array.from({ length: n }, (_, i) => sorted[Math.round((i * (sorted.length - 1)) / (n - 1))]))];
}

/**
 * Run the gate. opts: margin (24), minOverlapPx (4), overlapRatio (0.02), visible (0.05),
 * balanceHalf (0.12: least share of the content area a half may hold), balanceBox (0.28: least frame share of the content bounding box, HUD furniture excluded), balanceHeight (0.3: least frame-height share of the content), vcenterBand ([0.4, 0.64]: where the content's vertical center of mass must sit), settle (0.6: share of a scene after which it counts as settled), determinism (false skips the probe; when the canvas can be read, max(3, 2 x scenes) times spread evenly over the whole video, first and last sample included, are rendered twice).
 */
export function runQA(engine, times, opts = {}) {
  const { margin = 24, minOverlapPx = 4, overlapRatio = 0.02, visible = 0.05, balanceHalf = 0.12, balanceBox = 0.28, balanceHeight = 0.3, vcenterBand = [0.4, 0.64], settle = 0.6 } = opts;
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

  const coverage = new Map(); // scene -> best settled { left, right, top, bottom, box, samples }
  const widows = new Map();
  const scenes = new Map(engine.scenes.map(sc => [sc.name, sc]));
  let elements = 0;
  for (const t of samples) {
    for (const layer of engine.sample(t)) {
      const cam = layer.cam;
      const camBusy = Boolean(cam) && (cam.z > 1.05 || cam.moving);
      const view = rect => toScreen(rect, cam, W, H);
      const recs = layer.records.filter(r => r.alpha > visible).map((r) => {
        const place = rect => (r.hud ? rect : view(rect));
        // `screen` is the frame rect of each text (null when a piece reports a text without a box).
        const texts = (r.texts ?? []).map(tx => ({ ...tx, screen: tx.rect ? place(tx.rect) : null }));
        return { ...r, world: r.rect, rect: place(r.rect), texts };
      });
      elements += recs.length;
      for (const r of recs) {
        const b = r.rect;
        // While the camera is off its home view or moving, it may crop everything except its focus target. HUD items
        // are screen space: they always have to stay inside the frame.
        const zoomCrops = !r.hud && camBusy && r.id !== cam.target;
        if (!zoomCrops && (b.x < margin - 0.5 || b.y < margin - 0.5 || b.x + b.w > W - margin + 0.5 || b.y + b.h > H - margin + 0.5)) { flag('out-of-bounds', layer.name, r.id, t, `rect ${fmt(b)} leaves the ${margin}px safe area of ${W}x${H}${cam && cam.z !== 1 ? ' (after the camera)' : ''}`); }
        for (const tx of r.texts) {
          if (OPENING.test(tx.text ?? '')) { flag('opening-punctuation', layer.name, r.id, t, `text contains an opening ¿ or ¡: "${tx.text}"`); }
          if (tx.overflow) { flag('text-overflow', layer.name, r.id, t, `text does not fit at the minimum size: "${tx.text}"`); }
          else if (!contains(r.world, tx.rect, 1.5)) { flag('text-overflow', layer.name, r.id, t, `text box ${fmt(tx.rect)} leaves its shape ${fmt(r.world)}`); }
          if (tx.rect?.widow) { widows.set(`${layer.name}|${r.id}|${tx.text}`, { scene: layer.name, id: r.id, text: tx.text }); }
        }
        // Two solid sub-elements of one composite (a phone's keyboard and its screen) must not overlap.
        const solid = (r.parts ?? []).filter(p => p.solid === true && p.rect);
        for (let i = 0; i < solid.length; i++) {
          for (let j = i + 1; j < solid.length; j++) {
            const pa = r.hud ? solid[i].rect : view(solid[i].rect);
            const pb = r.hud ? solid[j].rect : view(solid[j].rect);
            const x = inter(pa, pb);
            if (x && x.w > minOverlapPx && x.h > minOverlapPx) { flag('parts-overlap', layer.name, r.id, t, `parts ${solid[i].id} ${fmt(pa)} and ${solid[j].id} ${fmt(pb)} overlap`); }
          }
        }
      }
      // Text collision: any two visible text boxes of the layer, the same record included and also when the records
      // are allowed to overlap (a container and what sits inside it). HUD texts only meet HUD texts.
      const pool = recs.flatMap(r => r.texts.filter(tx => tx.screen && tx.text).map(tx => ({ r, tx })));
      for (let i = 0; i < pool.length; i++) {
        for (let j = i + 1; j < pool.length; j++) {
          const a = pool[i];
          const b = pool[j];
          if (a.r.hud !== b.r.hud || sameText(a.tx, b.tx)) { continue; }
          const x = inter(a.tx.screen, b.tx.screen);
          if (!x || x.w <= minOverlapPx || x.h <= minOverlapPx) { continue; }
          const id = a.r.id === b.r.id ? a.r.id : [a.r.id, b.r.id].sort().join(' + ');
          flag('text-collision', layer.name, id, t, `"${a.tx.text}" ${fmt(a.tx.screen)} collides with "${b.tx.text}" ${fmt(b.tx.screen)}`);
        }
      }
      // HUD over the focus: while the camera is zoomed or moving, the target and its texts must stay clear of every
      // visible HUD record except zoomFade ones (the heading fades out as the zoom comes in).
      if (camBusy && cam.target) {
        const focus = focusRects(recs, cam, view);
        for (const h of recs.filter(r => r.hud && !zoomFades(r))) {
          const hit = focus.find((f) => {
            const x = inter(f, h.rect);
            return x && x.w > minOverlapPx && x.h > minOverlapPx;
          });
          if (hit) { flag('hud-overlap', layer.name, `${cam.target} + ${h.id}`, t, `the camera target ${cam.target} ${fmt(hit)} sits under the HUD ${h.kind ?? 'item'} ${h.id} ${fmt(h.rect)} (zoom ${Math.round(cam.z * 100) / 100})`); }
        }
      }
      for (let i = 0; i < recs.length; i++) {
        for (let j = i + 1; j < recs.length; j++) {
          const a = recs[i];
          const b = recs[j];
          const x = inter(a.rect, b.rect);
          if (!x || x.w <= minOverlapPx || x.h <= minOverlapPx || exempt(a, b)) { continue; }
          // The HUD over a camera-moved scene is a layer above the view: the camera may run world content under it.
          // Only the focus target is checked against the HUD, by hud-overlap above.
          if (camBusy && a.hud !== b.hud) { continue; }
          const small = Math.min(a.rect.w * a.rect.h, b.rect.w * b.rect.h);
          if (small > 0 && x.area / small > overlapRatio) { flag('overlap', layer.name, [a.id, b.id].sort().join(' + '), t, `${a.id} ${fmt(a.rect)} overlaps ${b.id} ${fmt(b.rect)} (${Math.round((x.area / small) * 100)}% of the smaller)`); }
        }
      }
      if (layer.sa >= 0.5 && layer.lt >= settle * scenes.get(layer.name).dur) {
        // Content = every visible element except edges and raw drawing. Its footprint is measured on a coarse grid
        // (CELL px) so a container and the children drawn inside it are not counted twice.
        const content = recs.filter(r => r.kind !== 'edge' && r.kind !== 'raw' && !isChrome(r)).map(r => clip(r.rect, W, H)).filter(Boolean);
        const cols = Math.ceil(W / CELL);
        const rows = Math.ceil(H / CELL);
        const filled = new Uint8Array(cols * rows);
        for (const r of content) {
          for (let cy = Math.floor(r.y / CELL); cy <= Math.min(rows - 1, Math.floor((r.y + r.h - 1e-6) / CELL)); cy++) {
            for (let cx = Math.floor(r.x / CELL); cx <= Math.min(cols - 1, Math.floor((r.x + r.w - 1e-6) / CELL)); cx++) { filled[cy * cols + cx] = 1; }
          }
        }
        let total = 0;
        let sumY = 0;
        const part = { left: 0, right: 0, top: 0, bottom: 0 };
        for (let cy = 0; cy < rows; cy++) {
          for (let cx = 0; cx < cols; cx++) {
            if (!filled[cy * cols + cx]) { continue; }
            total++;
            sumY += (cy + 0.5) * CELL;
            if ((cx + 0.5) * CELL < W / 2) { part.left++; }
            else { part.right++; }
            if ((cy + 0.5) * CELL < H / 2) { part.top++; }
            else { part.bottom++; }
          }
        }
        if (total > 0) {
          const box = content.reduce((u, r) => ({ x0: Math.min(u.x0, r.x), y0: Math.min(u.y0, r.y), x1: Math.max(u.x1, r.x + r.w), y1: Math.max(u.y1, r.y + r.h) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
          const m = {
            left: part.left / total,
            right: part.right / total,
            top: part.top / total,
            bottom: part.bottom / total,
            box: ((box.x1 - box.x0) * (box.y1 - box.y0)) / (W * H),
            hspan: (box.y1 - box.y0) / H,
          };
          const vcenter = sumY / total / H;
          // The best settled moment counts: the scene only warns when even its fullest sample is lopsided.
          const c = coverage.get(layer.name) ?? { left: 0, right: 0, top: 0, bottom: 0, box: 0, hspan: 0, samples: 0 };
          for (const k of Object.keys(m)) { c[k] = Math.max(c[k], m[k]); }
          if (c.vcenter === undefined || Math.abs(vcenter - 0.5) < Math.abs(c.vcenter - 0.5)) { c.vcenter = vcenter; }
          if (recs.some(r => r.kind === 'title')) { c.title = true; }
          c.samples++;
          coverage.set(layer.name, c);
        }
      }
    }
  }

  const balance = {};
  for (const [scene, c] of coverage) {
    balance[scene] = Object.fromEntries(Object.entries(c).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, Math.round(v * 1000) / 1000]));
    for (const name of ['left', 'right', 'top', 'bottom']) {
      if (c[name] < balanceHalf) { warnings.push({ type: 'composition-balance', scene, detail: `the ${name} half of the frame holds ${Math.round(c[name] * 100)}% of the content (under ${Math.round(balanceHalf * 100)}%)` }); }
    }
    // A title card is a deliberately spare scene: the size rules do not apply to it.
    if (!c.title && c.box < balanceBox) { warnings.push({ type: 'composition-balance', scene, detail: `the content covers ${Math.round(c.box * 100)}% of the frame (under ${Math.round(balanceBox * 100)}%)` }); }
    if (!c.title && c.hspan < balanceHeight) { warnings.push({ type: 'composition-balance', scene, detail: `the content spans only ${Math.round(c.hspan * 100)}% of the frame height (under ${Math.round(balanceHeight * 100)}%): scale it up or center it in the area` }); }
    if (c.vcenter !== undefined && (c.vcenter < vcenterBand[0] || c.vcenter > vcenterBand[1])) { warnings.push({ type: 'composition-balance', scene, detail: `the content sits ${c.vcenter < vcenterBand[0] ? 'high' : 'low'} in the frame (vertical center at ${Math.round(c.vcenter * 100)}%, expected ${Math.round(vcenterBand[0] * 100)}-${Math.round(vcenterBand[1] * 100)}%)` }); }
  }
  for (const w of widows.values()) { warnings.push({ type: 'widow', scene: w.scene, id: w.id, detail: `a single short word is alone on the last line of "${w.text.replace(/\n/g, ' / ')}"` }); }

  let determinism = null;
  if (opts.determinism !== false && typeof engine.ctx.getImageData === 'function') {
    determinism = probeDeterminism(engine, probeTimes(samples, Math.max(3, 2 * engine.scenes.length)));
    for (const t of determinism.failures) { flag('nondeterministic', '-', 'render', t, 'the same frame rendered twice produced different pixels'); }
  }

  const list = [...errors.values()];
  return {
    ok: list.length === 0,
    errors: list,
    warnings,
    stats: { samples: samples.length, elements, scenes: engine.scenes.map(s => s.name), balance, determinism },
  };
}

function fmt(r) {
  return `[${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}]`;
}
