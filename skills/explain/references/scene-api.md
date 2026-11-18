# Scene API

## File shape

```js
export const title = 'How a skill loads';          // page title; falls back to the file name
export const preset = 'sketch';                    // optional; used when neither --preset nor explain.json sets one (older `style` still works)

export default ({ scene, W, H, ease, kf }) => ({    // the kit (below) is the only argument
  title,
  // width: 1920, height: 1080, fps: 30                the defaults; export writes only 1920x1080 at 30 fps and refuses other values
  // lang: 'es'                                         optional; picks the sourceFooter prefix ('es' = "Fuente: ", else "Source: "), number separators and the player UI language; detected from the text when absent
  scenes: [
    scene({
      name: 'intro',                                // shown in QA reports and used by humans; default scene-N
      dur: 8,                                       // seconds, required, positive
      transition: { type: 'light-sweep', dur: 0.5 },// hand-over INTO the next scene (ignored on the last one)
      build(s) { /* create pieces with s.<piece>(...) */ },
    }),
  ],
});
```

`build(s)` runs once when the page loads, after fonts are ready; text is measured and fitted then. Drawing happens later as a pure function of time.

## Kit

The scene file's default export receives the kit: `scene(def)` (identity helper), `W` (1920), `H` (1080) and these helpers, all pure. Use them in a `raw` drawing or to compute times:

| Helper | Meaning |
|---|---|
| `clamp(v, a=0, b=1)`, `lerp(a, b, k)` | basics |
| `prog(t, at, dur)` | progress 0..1 of the window `[at, at+dur]` |
| `ease.linear` (`lin`), `in`, `out`, `inOut`, `sine`, `back`, `bounce`, `elastic` | easing functions k -> k |
| `tween(from, to, start, dur, ease='out')` | returns a function of `t` |
| `val(t, from, to, start, dur, ease='out')` | the tween value at `t` |
| `stagger(n \| array, start=0, step=0.2)` | array of start times |
| `kf(t, [[0, v0], [2, v1], ...], ease='inOut')` | keyframes: eased value between keys |
| `rng(seed)` | seeded random, returns a function giving [0, 1) |
| `hash(str)` | stable positive integer seed |
| `hexA('#rrggbb', a)` | `rgba(...)` string |
| `path` | path math: `path.arcPts`, `bezierPts`, `linkPts(a, b, curve, bend)` (curves `straight`, `arc`, `s`, `sv`), `chainPts(points, curve, bend)`, `pointAt(pts, k)` -> `{ x, y, a }`, `pathLen(pts)` |

Easing options also accept a function wherever `ease` is a parameter.

## Scene timeline and transitions

Scene `i+1` starts when scene `i` begins its outgoing transition, so the transition overlaps both. A transition cannot be longer than either scene, and a scene must fit its incoming plus outgoing transition (`dur >= trIn + trOut`), or the build throws. Total duration = sum of `dur` minus the overlaps.

`transition` is a name or `{ type, dur, ...params }` (default `crossfade`, 0.6 s). Nine types:

| Type | Look | Params |
|---|---|---|
| `crossfade` | old fades out, new fades in | |
| `push-zoom` | old shrinks away, new grows in from 106% | |
| `light-sweep` | crossfade plus a band across the frame (the preset draws it) | |
| `wipe` | new scene revealed left to right behind an edge line | |
| `zoom-through` | dive into `origin`, the next scene grows from the center, flash | `origin` (id of the leaving scene or `[x, y]`), `zoom` (6) |
| `slide` | both scenes travel together like a film strip | `dir` (`left` default, `right`, `up`, `down`) |
| `iris` | the next scene opens through a growing circle, ring on the edge | `origin` (id or `[x, y]`; default the center) |
| `drop` | the old scene drops off like a sheet, the new one rises with a small overshoot | |
| `glitch` | hard cut at the middle, torn by the preset's `glitch` hook (a plain cut without one) | |

An unknown name throws and lists all nine. Use at most two types in one video. The preset draws the effects (`sweep`, `edge`, `flash`, `ring`, `glitch`) through its `transitions` hooks; a preset without a hook gets the default. Element times (`at`) are always the scene's own local time, starting at 0 when the scene begins (including during its incoming transition).

## Builder `s`

| Member | Use |
|---|---|
| `s.<piece>(opts)` | every piece in [pieces.md](pieces.md) |
| `s.row`, `s.stack`, `s.grid`, `s.radial`, `s.tree` | layout helpers, below |
| `s.reg` | id to rect registry. Pieces register their own rect and sub-ids (`<id>.body`, `<id>.screen`, `<id>.l3`, `<id>.s1`...). `s.reg.add(id, rect)`, `s.reg.get(id)`, `s.reg.has(id)`, `s.reg.ids()`, `s.reg.anchor(id, 'top' \| 'bottom' \| 'left' \| 'right' \| 'center' \| 'tl'...)` -> `[x, y]`. Duplicate ids throw; unknown ids throw with the known list. Anchor targets in pieces: an id, `[x, y]`, or `{ id, anchor }` |
| `s.connect(fromId, toId, opts)` | edge geometry `{ pts, from, to, length }` without drawing; opts as `edge` (`from`, `to` anchor names, `route`, `gap`) |
| `s.camera` | zoom and pan, below |
| `s.raw(fn, { id, z })` | the escape hatch, below |
| `s.area` | `{ x: 80, y: 244, w: 1760, h: 636 }`, the default content area: below the heading band (`y` 124 to 228), above the caption (`y` 890) and the footer. Pieces and layouts use it when you pass no `area` |
| `s.lang`, `s.title` | the spec's `lang` and `title` (the footer's language detection reads them) |
| `s.W`, `s.H`, `s.ctx`, `s.style` | canvas size, 2D context (measure text), the active preset (`s.style.defaults`: `nodePx`, `labelPx`, `codePx`, `minPx`) |
| `s.add(item)` | register a custom item (kind, id, `draw(api, t)`, `qa`, `texts()`, `end`, `marks`); prefer a piece or `raw` |
| `s.uid(prefix)` | unique id (`prefix-1`, `prefix-2`...) |

Elements draw in `z` order (default 0; edges -0.5, groups -1, labels 1, captions 5), then creation order.

## Layout helpers

All take a list of items (`'id'` or `{ id, w, h }`; default size 280 x 140) and register one rect per id, so a piece can then take `id` alone. Common options: `area` (default `s.area`; the layout shrinks uniformly to fit and is centered; when you pass no `area` it also grows to about 80 % of the area, at most 2.2x, so a small row of nodes fills the frame; `fit: false` turns both off), `x`/`y` (place the top-left corner when there is no area), `place` (`center` default, `top` centers horizontally and aligns to the top, `start` aligns top-left), `fit: false` (do not shrink), `w`/`h` (default item size). Each returns `{ rects, list, bounds, scale }`.

| Helper | Extra options |
|---|---|
| `s.row(items, o)` | `gap` (40), `align` (`start`, `center`, `end` on the cross axis) |
| `s.stack(items, o)` | `gap` (32), `align` |
| `s.grid(items, o)` | `cols` (ceil of sqrt n), `gapX`, `gapY`, `gap` (40) |
| `s.radial(items, o)` | `hub` (`{ id, w, h }`, centered), `radius` (minimum), `aspect` (1.5 wide ellipse), `start` (degrees, -90 = top), `gap` |
| `s.tree(root, o)` | `root` is `{ id, w?, h?, children: [...] }`; `dir` (`down`, `right`), `gapX` (48), `gapY` (90); also returns `edges: [[parent, child]]` to feed `s.edge` |

```js
s.grid(['a', 'b', 'c', 'd'].map(id => ({ id, w: 380, h: 170 })), { cols: 2 }); // centered in s.area and grown to fill it
const t = s.tree({ id: 'root', children: [{ id: 'l' }, { id: 'r' }] }, { w: 300, h: 120 });
t.rects; t.edges.forEach(([from, to], i) => s.edge({ from, to, at: 1 + i * 0.3 }));
```

## Camera

`s.camera` is a list of moves; its state at time `t` is a pure function, so scrubbing and export agree. Moves must not overlap in time; each starts where the previous ended. Default view is the whole frame (zoom 1, center of the canvas).

| Call | Effect |
|---|---|
| `focus(idOrRect, at, dur=1, { zoom, pad, maxZoom=2.5, frame, crop, ease })` | pan and zoom so the element, plus `pad` (24), fits the content area and is centered in it |
| `pan(x, y, at, dur=1, { ease })` | move the view center (world coordinates) |
| `zoom(z, at, dur=1, { ease })` | change zoom |
| `reset(at, dur=1, { ease })` | back to the full frame |

`focus` fits the target INTO `s.area`, so the caption, footer and rail never cover it. `zoom` is a wish: it is capped so the padded target still fits (never below 1), unless `crop: true` lets it crop the target. `frame: 'full'` fits the target to the whole frame instead (pad 120), for a deliberate close-up. Calls chain (each returns the camera): `s.camera.focus('api', 4, 1, { zoom: 1.6 }); s.camera.reset(7, 0.8);`. The target id must already be registered when you call `focus` (create the piece or layout first). `focus` works straight from one target to another (`focus('a', 2); focus('b', 5)`), no `reset` in between; each move starts where the previous one ended.

The camera moves the scene's elements but never the **HUD**: `heading`, `sectionTag`, `caption`, `sourceFooter` and `journeyRail` are drawn in screen space on top (the heading and `journeyRail` fade out while the zoom goes from 1 to 1.15), so zooming never crops them. Ids registered by pieces are in scene coordinates; the camera maps them to the frame.

## Raw escape hatch

Prefer a piece; reach for `raw` for a one-off decoration or a diagram no piece covers.

```js
s.raw((ctx, t, api) => { /* draw with ctx */ }, { id: 'glow-ring', z: 0, texts: ['Ring'], rect: { x: 700, y: 300, w: 520, h: 520 } });
```

`ctx` is the 2D canvas context in scene coordinates (the camera transform is already applied; `hud: true` draws in screen space instead), `t` is scene-local time, and `api` is:

| Field | Meaning |
|---|---|
| `api.ctx`, `api.W`, `api.H`, `api.t` | context, size, time |
| `api.style` | the active preset |
| `api.color('accent')` | resolves a token to a CSS color (`api.pal` is the palette) |
| `api.sa` | scene alpha during a transition |
| `api.alpha(a)` | sets `ctx.globalAlpha = a * sa`; the only way to set alpha |
| `api.fade(k)` | the same api with `sa * k`; fades nest |

Draw through the preset so one raw item looks right in every preset: `style.shape(api, rect, { kind: 'round' | 'rect' | 'ellipse' | 'pill', p, stroke, fill, fillAlpha, lw, r, dash, alpha })`, `style.line(api, pts, { p, color, lw, head, dash, alpha, smooth })`, `style.poly(api, pts, { closed, p, stroke, fill, fillAlpha, lw, alpha, smooth })`, `style.text(api, str, x, y, { px, role: 'body' | 'display' | 'mono', weight, color, align, alpha })` (one line, centered vertically on `y`), `style.highlight(api, rect, { p, color, alpha })`, `style.fill(api, rect, { color, alpha, radius })`, `style.dot(api, x, y, r, { color, alpha })`, `style.font(role, px, weight)` (a CSS font string). Hints a preset may ignore: `seed`, `still`, `glow`, `hatch`, `shadow`.

Rules for raw code: derive everything from `t` (use `rng(seed)`, never an unseeded random); use tokens through `api.color` or style methods; never branch on the preset name. QA cannot see what a raw item draws, so declare it: `texts` lists the strings it shows (checked for the opening marks) and `rect` its footprint in scene coordinates (checked for bounds, never for overlap). Without them a raw item reports nothing; keep it inside the 24 px safe margin yourself. `composition-balance` ignores raw items.

## Text

Pieces fit text themselves; a scene does not call the fitting helpers. Text shrinks one pixel at a time from the piece's maximum to `defaults.minPx` of the preset (30 in sketch, 20 in poster, 18 in hologram), then keeps the minimum and QA flags `text-overflow`. The fix is a bigger rect, fewer words, or a smaller `px`, never a smaller minimum. Size text from `s.style.defaults` (`nodePx`, `labelPx`, `codePx`) times a factor, never a fixed pixel count. Typewriter reveal (`type: true`) shows characters in reading order and never re-centers.

## QA report

`check <dir>` prints JSON on stdout (a one-line-per-issue summary goes to stderr) and exits 1 when `errors` is not empty.

```json
{ "ok": true, "errors": [], "warnings": [],
  "stats": { "samples": 10, "elements": 23, "scenes": ["intro"], "determinism": { "checked": 3, "failures": [] } } }
```

Each issue: `{ type, scene, id, t, count, detail }` (`t` is the first global time it was seen, `count` how many samples). Frames are sampled every 0.5 s of scene time plus each scene's last instant. Composite pieces (mockups, devices, systems) report their inner texts and parts, so the checks see inside them. A moved, scaled or revealed item (`animate`, `enter`, `exit`, `reveal`) is checked where it really is.

| Type | Kind | Meaning |
|---|---|---|
| `out-of-bounds` | error | an element leaves the 24 px safe margin of the 1920x1080 frame. While the camera is zoomed (above 1.05) or moving, only the focus target is checked; HUD items are always checked in screen coordinates |
| `overlap` | error | two visible elements overlap by more than 4 px and 2% of the smaller. Exempt: a container and what lies fully inside it, a piece hosted by it (`in: 'x'` or `in: 'x.body'`), ids a container lists in `contains`, edges, items marked `overlap: true` or `overlapWith: [ids]`. A partial overlap with a container is an error |
| `text-overflow` | error | text does not fit at the minimum size, or its box leaves its shape |
| `text-collision` | error | two visible texts of the same layer have intersecting rects |
| `parts-overlap` | error | two solid inner parts of one composite overlap (a phone's keyboard and its screen) |
| `hud-overlap` | error | while the camera is zoomed or moving, the focus target or a text of it sits under a visible HUD item (heading, tag, caption, footer, rail) |
| `opening-punctuation` | error | any text a piece can show contains an opening inverted question or exclamation mark (every string in `texts()` counts, even before it appears) |
| `nondeterministic` | error | the same frame rendered twice gave different pixels (more than 8 changed pixels), probed at max(3, 2 x scenes) times |
| `composition-balance` | warning | on the settled scene without the HUD: a half of the frame holds under 12 % of the content; the content covers under 28 % of the frame or spans under 30 % of its height; or its vertical center of mass is outside 40 to 64 % of the height. Never blocks `export`; keep one only when deliberate and say why |
| `widow` | warning | a single short word is alone on the last line of a text block |

Only elements visible above 5% alpha count, and rects are measured in frame pixels after the camera, except HUD items. To silence a real, intended overlap set `overlap: true` on the element that sits on top, not on everything.
