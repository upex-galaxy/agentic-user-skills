# Scene API

## File shape

```js
export const title = 'How a skill loads';          // page title; falls back to the file name

export default ({ scene, W, H, ease, kf }) => ({    // the kit (below) is the only argument
  title,
  // width: 1920, height: 1080, fps: 30                optional; these are the defaults and the export size
  // lang: 'es'                                         optional; picks the sourceFooter prefix ('es' = "Fuente: ", else "Source: "); detected from the text when absent
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

`scene(def)` (identity helper), `W` (1920), `H` (1080) and these time helpers, all pure:

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

Easing options also accept a function wherever `ease` is a parameter.

## Scene timeline and transitions

Scene `i+1` starts when scene `i` begins its outgoing transition, so the transition overlaps both. A transition cannot be longer than either scene, and a scene must fit its incoming plus outgoing transition (`dur >= trIn + trOut`), or the build throws. Total duration = sum of `dur` minus the overlaps.

`transition` is a name or `{ type, dur }` (default `crossfade`, 0.6 s):

| Type | Look |
|---|---|
| `crossfade` | old fades out, new fades in |
| `push-zoom` | old shrinks away, new grows in from 106% |
| `light-sweep` | crossfade plus a bright band crossing the frame |
| `wipe` | new scene revealed left to right behind an accent line |

An unknown name throws. Use at most two types in one video. Element times (`at`) are always the scene's own local time, starting at 0 when the scene begins (including during its incoming transition).

## Builder `s`

| Member | Use |
|---|---|
| `s.<piece>(opts)` | every piece in [pieces.md](pieces.md) |
| `s.row`, `s.stack`, `s.grid`, `s.radial`, `s.tree` | layout helpers, below |
| `s.reg` | id to rect registry: `s.reg.add(id, rect)`, `s.reg.get(id)`, `s.reg.has(id)`, `s.reg.ids()`, `s.reg.anchor(id, 'top')`. Duplicate ids throw; unknown ids throw with the known list |
| `s.connect(fromId, toId, opts)` | edge geometry `{ pts, from, to, length }` without drawing; opts as `edge` (`from`, `to` anchor names, `route`, `gap`) |
| `s.camera` | zoom and pan, below |
| `s.raw(fn, { id, z })` | the escape hatch, below |
| `s.area` | `{ x: 80, y: 244, w: 1760, h: 636 }`, the default content area: below the heading band (`y` 124 to 228), above the caption (`y` 890) and the footer. Pieces and layouts use it when you pass no `area` |
| `s.lang`, `s.title` | the spec's `lang` and `title` (the footer's language detection reads them) |
| `s.W`, `s.H`, `s.ctx`, `s.style` | canvas size, 2D context, active style |
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
| `focus(idOrRect, at, dur=1, { zoom, pad=120, maxZoom=2.5, ease })` | pan and zoom so the element fills the frame |
| `pan(x, y, at, dur=1, { ease })` | move the view center (world coordinates) |
| `zoom(z, at, dur=1, { ease })` | change zoom |
| `reset(at, dur=1, { ease })` | back to the full frame |

Chain them: `s.camera.focus('api', 4, 1, { zoom: 1.6 }); s.camera.reset(7, 0.8);`. The target id must already be registered when you call `focus` (create the piece or layout first). `focus` works straight from one target to another (`focus('a', 2); focus('b', 5)`), no `reset` in between; each move starts where the previous one ended.

The camera moves the scene's elements but never the **HUD**: `heading`, `sectionTag`, `caption` and `sourceFooter` are drawn in screen space on top (the heading fades out while the zoom is above 1), so zooming never crops them. Ids registered by pieces are in scene coordinates; the camera maps them to the frame.

## Raw escape hatch

```js
s.raw((ctx, t, api) => { /* draw with ctx */ }, { id: 'glow-ring', z: 0 });
```

`ctx` is the 2D canvas context in scene coordinates (the camera transform is already applied; pass `hud: true` in the options to draw in screen space instead), `t` is scene-local time, and `api` is:

| Field | Meaning |
|---|---|
| `api.ctx`, `api.W`, `api.H`, `api.t` | context, size, time |
| `api.style` | the active style (below) |
| `api.pal` | the palette object; `api.color('accent')` resolves a token to a CSS color |
| `api.sa` | scene alpha during a transition; call `api.alpha(a)` to set `ctx.globalAlpha = a * sa` |

Style drawing methods, which every piece uses: `style.shape(api, rect, { kind: 'round'|'rect'|'ellipse'|'pill', p, stroke, fill, lw, dash, alpha, glow, seed })`, `style.line(api, pts, { p, color, lw, head, dash, alpha, glow, seed })`, `style.text(api, str, x, y, { px, role: 'body'|'display'|'mono', weight, color, align, alpha, glow })` (one line, centered vertically on `y`), `style.highlight(api, rect, { p, color, alpha })`, `style.font(role, px, weight)` (a CSS font string). Pass `seed` for a stable sketch wobble in the sketch style.

Rules for raw code: derive everything from `t` (use `rng(seed)`, never an unseeded random); use tokens through `api.color` or style methods; raw items report nothing to QA, so keep them inside the 24 px safe margin yourself, and the `composition-balance` warning ignores them. Prefer a piece; reach for `raw` for a one-off decoration or a diagram no piece covers.

## Text helpers

Pieces fit text through `fitText`, `wrapText`, `revealLines`, `layoutCode` and `measure` (`engine/text.js`). They are not in the kit; a scene does not call them. What matters when authoring: text shrinks one pixel at a time from the piece's max size to a minimum (`minPx`; 26 in sketch, 18 in hologram), then keeps the minimum and QA flags `text-overflow`. The fix is a bigger rect, fewer words, or a smaller `px`, never a smaller minimum. Typewriter reveal (`type: true`) shows characters strictly in reading order and never re-centers.

## QA report

`check <dir>` prints JSON on stdout (a one-line-per-issue summary goes to stderr) and exits 1 when `errors` is not empty.

```json
{ "ok": true, "errors": [], "warnings": [],
  "stats": { "samples": 10, "elements": 23, "scenes": ["intro"], "determinism": { "checked": 3, "failures": [] } } }
```

Each issue: `{ type, scene, id, t, count, detail }` (`t` is the first global time it was seen, `count` how many samples). Frames are sampled every 0.5 s of scene time plus each scene's last instant.

| Type | Kind | Meaning |
|---|---|---|
| `out-of-bounds` | error | an element leaves the 24 px safe margin of the 1920x1080 frame. While the camera is zoomed (above 1.05) or any move is running, only the focus target is checked; HUD items are always checked, in screen coordinates without the camera |
| `overlap` | error | two visible elements overlap by more than 4 px and 2% of the smaller. Exempt: a container (group, panel) and what it holds, edges, and items marked `overlap: true` or `overlapWith: [ids]` |
| `text-overflow` | error | text does not fit at the minimum size, or its box leaves its shape |
| `opening-punctuation` | error | any text contains an opening inverted question or exclamation mark |
| `nondeterministic` | error | the same frame rendered twice gave different pixels (more than 8 changed pixels) |
| `composition-balance` | warning | measured on the settled scene without the HUD (heading, tag, caption, footer) and without title-card scenes for the size rules: a half of the frame holds under 12 % of the content; the content bounding box covers under 28 % of the frame; the content spans under 30 % of the frame height; or its vertical center of mass is outside 40 to 64 % of the height (sits high or low). Fix by leaving `area` out so pieces fill the default area, or by making nodes bigger |

Only elements visible above 5% alpha count (rects are measured in frame pixels after the camera, except HUD items), and rects are in scene coordinates before the camera transform. To silence a real, intended overlap (a badge on a card) set `overlap: true` on the element that sits on top, not on everything.
