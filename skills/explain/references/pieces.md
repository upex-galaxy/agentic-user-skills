# Pieces and helpers

Every piece is a method on the scene builder `s` inside `build(s)`: `s.node({...})`. Times (`at`, `dur`, `until`, `step`) are seconds of scene-local time. Colors are style tokens (`ink`, `dim`, `accent`, `accent2`, `good`, `warn`, `bad`). Text is always fitted: it shrinks to a minimum size, and `check` reports `text-overflow` when it still does not fit.

Pieces fall in two groups. **Positioned** pieces (`node`, `label`, `code`, `caption`...) sit in a rect you give them. **Area** pieces (`mindMap`, `flow`, `table`, `timeline`, `sequence`, `architecture`, `codeBlock`, `anatomy`, `stateMachine`, `folderTree`) lay themselves out inside `area`. The default is the content area `s.area`, `{x:80, y:244, w:1760, h:636}`: below the heading band, above the caption and footer. Leave `area` out in the usual case. `flow`, `stateMachine`, `architecture` and `timeline` called without `area` are scaled up (about 80 % of the area's width or height, whichever binds, at most 2.2x) and centered; pass `fill: false` to keep their natural size, or an `area` to place them yourself. `mindMap` spreads over the whole area by itself; `table`, `codeBlock` and `anatomy` size their text from the area.

## Giving a positioned piece a place

`node`, `label`, `code` take the first that applies:

1. `id` already registered by a layout (`s.row`, `s.grid`...), so you only write the id.
2. `rect: { x, y, w, h }`, or the four numbers `x`, `y`, `w`, `h` directly.
3. `place: { to: '<id>', side: 'bottom' | 'top' | 'left' | 'right', gap: 24 }` plus `w` (default: width of the target) and `h` (default 64).

No position is a build error.

## Base pieces

| Piece | Options (defaults) |
|---|---|
| `node` | `id` (required), `text`, `at` (0), `dur` (0.6), `shape` (`round`, `rect`, `ellipse`, `pill`; default `round`), `color` (stroke, `accent`), `fill` (`panel`; `null` for none), `textColor` (`ink`), `font` (`body`, `display`, `mono`), `px`, `minPx`, `pad`, `weight`, `type` (typewriter), `typeAt`, `typeDur`, `z`, `overlap`, `overlapWith: [ids]` |
| `edge` | `from`, `to` (ids, required), `id` (`from->to`), `fromAnchor`, `toAnchor` (`auto`, `edge`, `top`, `bottom`, `left`, `right`, `center`, `tl`, `tr`, `bl`, `br`), `route` (`straight`, `elbow`), `gap` (6), `at` (0), `dur` (0.8), `color` (`dim`), `head` (true), `dash` (e.g. `[14, 10]`), `lw` |
| `label` | `text`, position, `id`, `at` (0), `dur` (0.5), `px`, `font`, `weight`, `align` (`center`, `left`), `color` (`ink`), `type`, `typeAt`, `typeDur`, `overlap` |
| `group` | `id`, `children` (ids, required), `title`, `pad` (28), `at` (0), `dur` (0.7), `color` (`dim`). A dashed frame behind its children; create it before them |
| `code` | `id`, `lines` (string or `{ text, color }`), position, `at`, `dur`, `highlight` (0-based line indexes), `hlAt`, `type` (`false` shows all lines at once), `typeAt`, `typeDur`, `px`, `color`. A plain code panel; for a window with line numbers use `codeBlock` |

```js
s.row([{ id: 'a', w: 480, h: 300 }, { id: 'b', w: 480, h: 300 }], { gap: 200 }); // no area: centered in s.area and grown to fill it
s.node({ id: 'a', text: 'Request', at: 0.5, color: 'accent' });
s.node({ id: 'b', text: 'Response', at: 0.9, color: 'good' });
s.edge({ from: 'a', to: 'b', at: 1.4 });
s.label({ text: 'One line of context', place: { to: 'a', side: 'bottom', gap: 60 }, w: 900, h: 80, color: 'dim', type: true, at: 1.8 });
s.group({ id: 'box', children: ['a', 'b'], title: 'Same trust zone', at: 0.2 });
```

## Titles and frame furniture

| Piece | Options (defaults) |
|---|---|
| `titleCard` | `title` (or `text`), `subtitle`, `id`, `rect` or `w`/`h` (1500 x 460, centered), `at`, `px` (120), `subPx`, `color`, `subColor`, `typeDur`. Title types on, then an accent rule, then the subtitle |
| `heading` | `text`, `at` (0.2), `px` (the larger of 76 and 1.55x the style's label size), `color`, `type` (true), `typeDur`, `rect` (`{x:120, y:124, w:W-240, h:104}`, id `heading`). The scene heading, centered above the content area. HUD: never moved by the camera, and it fades out while the camera is zoomed in |
| `caption` | `text`, `at`, `until` (fades out), `rect` (`{x:160, y:H-190, w:W-320, h:96}`), `px`, `color`, `textColor`, `typeDur`. Bottom bar that types in; do not overlap two captions in time |
| `sectionTag` | `index`, `total`, `name` (renders `02 / 09 Name`), or `text` for free text; `at`, `x` (64), `y` (48), `px`, `color`. Top-left pill |
| `sourceFooter` | `text`, `lang`, `prefix`, `rect` (`{x:80, y:H-78, w:W-160, h:44}`), `at`, `dur`, `px`. The prefix is "Fuente: " for Spanish and "Source: " otherwise; the language is `lang` here, else `lang` on the video spec, else detected from the video title and the texts already in the scene (so create the footer after the heading). `prefix` overrides both. Text that already starts with `Source` or `Fuente` is not prefixed again |

```js
s.titleCard({ title: 'How a skill loads', subtitle: 'From description to context', at: 0.2 });
s.heading({ text: 'Only the description is always loaded' });
s.sectionTag({ index: 2, total: 7, name: 'Discovery', at: 0.1 });
s.caption({ text: 'Only the description is always in context.', at: 4, until: 8.5 });
s.sourceFooter({ text: 'Claude Code docs, Skills' }); // "Source: Claude Code docs, Skills" in an English scene
```

## Structure pieces

**`folderTree`**: `data` (nested object, where an object value is a folder, or an indented string), `root` (extra root folder name), `area`/`rect`, `at`, `step` (seconds per row, default `3 / rows` clamped 0.08 to 0.4), `px`, `highlight` (path, `[paths]` or `[{ path, at }]`, one at a time), `hlAt`, `hlStep` (1.4), `hlColor`, `dirColor`, `place: 'start'` (top-left instead of centered).
```js
s.folderTree({ root: 'my-skill', data: { 'SKILL.md': null, scripts: { 'run.sh': null } }, area: { x: 80, y: 244, w: 800, h: 636 }, highlight: ['my-skill/SKILL.md', 'my-skill/scripts'] });
```

**`mindMap`**: `hub` (text or `{ text, color }`), `branches` (text or `{ text, color, children: [text | { text }] }`, one or two levels), `id` (prefix `map`), `area`, `at`, `step`, `colors`. Branches split into a right and a left column around the hub (clockwise from the top right), each in its own row slot with its leaves stacked beyond it; column widths, node heights and text follow the area, with curved connectors. Node ids: `<id>.hub`, `<id>.b1`, `<id>.b1.1`, so the camera and `pulse` can target them. Returns an item with `.ids`.
```js
s.sectionTag({ index: 1, total: 6, name: 'Overview' });
s.mindMap({ hub: 'Skill', branches: ['Frontmatter', { text: 'Body', children: ['Steps', 'Rules'] }, 'Scripts'] });
```

**`timeline`**: `milestones` (text or `{ label, date, color }`), `area`, `at`, `dur` (marker travel time, 4), `to` (0..1 how far the marker goes), `px`, `color`. Labels alternate above and below the axis; a milestone lights when the marker reaches it.
```js
s.timeline({ milestones: [{ label: 'Draft', date: 'Mon' }, { label: 'Review', date: 'Wed' }, { label: 'Release', date: 'Fri' }], dur: 4 });
```

**`flow`**: `steps` (text or `{ id, text, color, state }`, 2 or more), `layout` (`row`, `snake`), `cols`, `links` (`[[fromId, toId]]`, default consecutive), `id` (prefix `flow`; step ids `<id>-1`...), `area`, `at`, `step` (0.35 between step reveals), `runAt`, `per` (0.9 per link), `dwell` (0.45), `w` (up to 560), `h` (default: as wide as high for a row, capped at 86 % of the area height), `gap`, `gapY`, `px`. A dot travels the links; steps go pending (dim), active (accent), done (good); a step `state` fixes it.
```js
s.flow({ id: 'ci', steps: ['Code', 'Build', 'Tests', 'Deploy'], at: 0.5 });
```

**`table`**: `columns` (text or `{ text, align }`), `rows` (arrays of cells), `area`, `w`, `rowH`, `at`, `step` (0.55 per row), `px`, `highlight` (`{ row | col, at, color }`, 0-based), `firstColBold` (true). One font size for the whole grid.
```js
s.table({ columns: ['Mode', 'You can call it', 'Claude can call it'], rows: [['default', 'yes', 'yes'], ['user only', 'yes', 'no']], highlight: { row: 1 } });
```

## Diagram pieces

**`sequence`**: `actors` (text or `{ id, text, color }`), `messages` (`{ from, to, text, kind, color }`, `from` and `to` are actor ids; `kind`: `sync` solid accent, `async` dashed accent2, `return` dashed dim; `from === to` draws a self-call), `activation` (bars on the receiving lifeline), `activations` (`[{ actor, from, to }]` message indexes), `area`, `at`, `step` (0.9), `msgDur` (0.6), `times` (explicit start per message). Actor ids are registered as node ids.
```js
s.sequence({ actors: ['Client', 'API', { id: 'db', text: 'Database' }], messages: [{ from: 'Client', to: 'API', text: 'POST /login' }, { from: 'API', to: 'db', text: 'find user' }, { from: 'API', to: 'Client', text: '200 OK', kind: 'return' }], activation: true });
```

**`architecture`**: `zones` (`{ id, title, color, nodes: [text | { id, text, color, shape }] }`), `links` (`[from, to, label]` or `{ from, to, label, color, dash }`; ids are node ids), `layout` (`layers` stacks zones top to bottom, `columns` puts them side by side), `area`, `at`, `zoneStep` (0.5), `nodeStep` (0.2), `linkStep` (0.5). Order of reveal: zones, nodes, links. Node and zone ids are registered.
```js
s.architecture({ layout: 'layers', zones: [{ id: 'client', title: 'Client', nodes: [{ id: 'web', text: 'Web app' }] }, { id: 'server', title: 'Server', nodes: [{ id: 'api', text: 'API' }, { id: 'db', text: 'Database' }] }], links: [['web', 'api', 'HTTPS'], ['api', 'db']] });
```

**`codeBlock`**: a code window (title bar, line numbers). `lines` (string or `{ text, color }`), `title`, `id`, `area`/`rect`, `at`, `dur`, `type` (`'type'` default, `'appear'`, `false`), `typeAt`, `typeDur`, `lineStep` (0.22, for `appear`), `px`, `highlights` (`[{ lines: 2 | [2, 3], at, until, color }]`, 1-based, each band stays until the next), `pointer` (`{ line, text, at, until, color }`, a callout to the right of the window).
```js
s.codeBlock({ title: 'login.ts', lines: ['const user = await find(email);', 'if (!user) throw new Error("none");'], highlights: [{ lines: 2, at: 3 }], pointer: { line: 2, text: 'Unknown users stop here', at: 3.5 } });
```

**`anatomy`**: an object from simple shapes with numbered callouts. `parts` (`{ id, shape, x, y, w, h, color, text, fill }`, coordinates are fractions 0..1 of the object box; `shape` as for `node`), `labels` (`{ part, text, side: 'left' | 'right', color, at }` or `{ target: {x,y,w,h}, text }` in fractions), `aspect` (width / height, 1), `draw(api, box, p, t)` (custom object drawing instead of `parts`), `maxH` (700), `labelW` (520), `partStep` (0.14), `step` (0.9), `area`, `at`. Part ids are registered as `<id>.<partId>`.
```js
s.anatomy({ id: 'phone', aspect: 0.5, parts: [{ id: 'body', x: 0, y: 0, w: 1, h: 1, color: 'dim' }, { id: 'screen', shape: 'rect', x: 0.08, y: 0.1, w: 0.84, h: 0.7, color: 'accent2' }], labels: [{ part: 'screen', text: 'Touch screen' }, { part: 'body', text: 'Casing' }] });
```

**`stateMachine`**: `states` (text or `{ id, text, color }`), `transitions` (`[from, to, label]` or `{ from, to, label, color, flip }`; `from === to` draws a self-loop), `layout` (`row`, `ring`, `grid`; default by count: 4 or fewer row, 6 or fewer ring, else grid), `positions` (`{ id: [fx, fy] }` fractions of the area), `gap`, `path` (state ids to walk with a glowing marker), `pathAt`, `pathStep` (1.4), `activeColor` (`warn`), `at`, `nodeStep` (0.25), `transitionStep` (0.5), `area`. Transition labels slide along their own curve until they clear every other label and every state, so crossing arcs (a `ring`) never stack two labels on one spot.
```js
s.stateMachine({ states: ['Draft', { id: 'review', text: 'In review' }, 'Published'], transitions: [['Draft', 'review', 'submit'], ['review', 'Draft', 'reject'], ['Published', 'Published', 'edit']], path: ['Draft', 'review', 'Published'] });
```

## Object animation (motion helpers)

Call them after the target exists (`s.node`, `s.codeBlock`...). `target` is an item or registered id; ids come from layouts and pieces.

| Helper | Options (defaults) |
|---|---|
| `pulse` | `target`, `at`, `dur` (1.2), `times` (2), `scale` (0.08), `color` (`accent`), `ring` (true) |
| `shake` | `target`, `at`, `dur` (0.7), `amp` (12 px), `cycles` (6) |
| `highlight` | `target`, `style` (`glow`, `underline`), `at`, `dur` (0.6), `until`, `color` (`warn`), `pad` (10) |
| `travelDot` | one of `path` (ids), `edge` (edge id, or ids), `points` (`[[x, y]]`); `at`, `dur` (2), `color`, `size` (18), `trail` (6), `repeat` (1), `ease`, `stay` |
| `morph` | `from`, `to` (ids or rects), `at`, `dur` (1), `fromText`, `toText`, `fromShape`, `toShape`, `color`, `toColor`, `keep`. `from` hides at `at`; the `to` node shows when it ends |
| `expand` | `target`, `at`, `dur` (0.9), `rect` (final panel, default centered 68% x 80%), `title`, `lines` (bullets), `closeAt`, `color`, `id` (registers the panel) |
| `squeeze` | `targets` (2 or more ids), `into` (`{ id, text, rect, color }` or an id), `at`, `dur` (1.2). Targets slide into one node; edges touching them vanish |

```js
s.pulse({ target: 'api', at: 2, times: 2 });
s.travelDot({ path: ['web', 'api', 'db'], at: 3, dur: 2.5 });
s.highlight({ target: 'db', style: 'underline', at: 5, until: 7 });
s.squeeze({ targets: ['t1', 't2', 't3'], into: { id: 'all', text: 'One service', color: 'good' }, at: 4 });
```

## Layout and camera

Layout helpers (`s.row`, `s.stack`, `s.grid`, `s.radial`, `s.tree`), `s.connect`, `s.camera` and text helpers live in [scene-api.md](scene-api.md).
