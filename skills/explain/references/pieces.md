# Pieces and helpers

Every piece is a method on the scene builder `s` inside `build(s)`: `s.node({...})`. It returns its item. Times (`at`, `dur`, `until`, `step`) are seconds of scene-local time. Colors are palette tokens (`ink`, `dim`, `accent`, `accent2`, `good`, `warn`, `bad`, `panel`, `onPanel`, `onAccent`); code colors are the syntax tokens. Text is fitted: it shrinks to `defaults.minPx` of the preset, then `check` reports `text-overflow`.

Runnable scenes for every family: `examples/pieces/*.scene.js`; all of them together: `examples/gallery.scene.js`. 63 pieces are listed here.

## Placing a piece

Most new pieces take the first that applies:

1. `rect: { x, y, w, h }`, or the four numbers `x`, `y`, `w`, `h`.
2. `in: '<id>'` (a registered id) with an optional `inset`. Hosting: `in: '<id>.body'` places a piece inside a browser or editor body, `in: 'ph.screen'` inside a phone. A hosted piece may overlap its host without a QA error.
3. An `id` already registered by a layout (`s.row`, `s.grid`...): write the id only.

Positioned base pieces (`node`, `label`, `code`) also take `place: { to: '<id>', side, gap }`. No position is a build error. Area pieces (`mindMap`, `flow`, `table`, `timeline`, `sequence`, `architecture`, `codeBlock`, `anatomy`, `stateMachine`, `folderTree`) default to the content area `s.area` (`{ x: 80, y: 244, w: 1760, h: 636 }`); leave `area` out in the usual case.

Pieces that finish animating expose `end` (scene-local time when done). Some expose `marks` (named times): chain the next beat to them, for example `at: term.marks.test + 0.5`. Common to every new piece: `at` (appear), `until` (fade out), `z`.

| Family | Pieces |
|---|---|
| Base and layout | `node`, `edge`, `label`, `group`, `code` |
| Diagrams | `folderTree`, `mindMap`, `timeline`, `flow`, `table`, `sequence`, `architecture`, `codeBlock`, `anatomy`, `stateMachine` |
| Titles and HUD | `titleCard`, `heading`, `caption`, `sectionTag`, `sourceFooter`, `journeyRail` |
| Icons | `icon` |
| Screens | `editor`, `terminal`, `diffView` |
| Devices | `browser`, `phone`, `appScreen`, `prPage`, `cursor` |
| Numbers | `counter`, `progress`, `gauge`, `chart`, `dotGrid` |
| Annotate | `kineticText`, `callout`, `stamp`, `bubble`, `chip`, `scribble` |
| Movement | `packets`, `particles`, `burst`, `parallax`, `spotlight`, `splitScreen`, `journeyRail` |
| Systems | `pipeline`, `gitGraph`, `machine`, `fleet`, `layers` |
| Wrappers | `animate`, `enter`, `exit`, `reveal` |
| Motion | `pulse`, `shake`, `highlight`, `travelDot`, `morph`, `expand`, `squeeze` |

(`journeyRail` is listed under both Titles and HUD and Movement; it is one piece.)

## Base and layout

| Piece | Options (defaults) |
|---|---|
| `node` | `id` (required), `text`, `at` (0), `dur` (0.6), `shape` (`round`, `rect`, `ellipse`, `pill`), `color` (stroke, `accent`), `fill` (`panel`; `null` for none), `textColor` (`ink`), `font` (`body`, `display`, `mono`), `px`, `minPx`, `pad`, `weight`, `type` (typewriter), `typeAt`, `typeDur`, `z`, `overlap`, `overlapWith: [ids]` |
| `edge` | `from`, `to` (ids, required), `id` (`from->to`), `fromAnchor`, `toAnchor` (`auto`, `edge`, `top`, `bottom`, `left`, `right`, `center`, `tl`, `tr`, `bl`, `br`), `route` (`straight`, `elbow`), `gap` (6), `at` (0), `dur` (0.8), `color` (`dim`), `head` (true), `dash` (`[14, 10]`), `lw` |
| `label` | `text`, position, `id`, `at` (0), `dur` (0.5), `px`, `font`, `weight`, `align` (`center`, `left`), `color` (`ink`), `type`, `typeAt`, `typeDur`, `overlap` |
| `group` | `id`, `children` (ids, required), `title`, `pad` (28), `at` (0), `dur` (0.7), `color` (`dim`). A dashed frame behind its children; create it before them |
| `code` | `id`, `lines` (string or `{ text, color }`), position, `at`, `dur`, `highlight` (0-based line indexes), `hlAt`, `type` (`false` shows all lines), `typeAt`, `typeDur`, `px`, `color`. A plain panel; for a window use `codeBlock` or `editor` |

```js
s.row([{ id: 'a', w: 480, h: 300 }, { id: 'b', w: 480, h: 300 }], { gap: 200 });
s.node({ id: 'a', text: 'Request', at: 0.5, color: 'accent' });
s.node({ id: 'b', text: 'Response', at: 0.9, color: 'good' });
s.edge({ from: 'a', to: 'b', at: 1.4 });
s.label({ text: 'One line of context', place: { to: 'a', side: 'bottom', gap: 60 }, w: 900, h: 80, color: 'dim', type: true, at: 1.8 });
s.group({ id: 'box', children: ['a', 'b'], title: 'Same trust zone', at: 0.2 });
s.code({ id: 'snip', rect: { x: 200, y: 700, w: 700, h: 120 }, lines: ['const a = 1;'], at: 2 });
```

## Diagram pieces

**`folderTree`**: `data` (nested object, an object value is a folder; or an indented string), `root`, `area`/`rect`, `at`, `step` (seconds per row), `px`, `highlight` (path, `[paths]` or `[{ path, at }]`), `hlAt`, `hlStep` (1.4), `hlColor`, `dirColor`, `place: 'start'`.
```js
s.folderTree({ root: 'my-skill', data: { 'SKILL.md': null, scripts: { 'run.sh': null } }, highlight: ['my-skill/SKILL.md'] });
```

**`mindMap`**: `hub` (text or `{ text, color }`), `branches` (text or `{ text, color, children }`), `id` (`map`), `area`, `at`, `step`, `colors`. Ids `<id>.hub`, `<id>.b1`, `<id>.b1.1`.
```js
s.mindMap({ hub: 'Skill', branches: ['Frontmatter', { text: 'Body', children: ['Steps', 'Rules'] }, 'Scripts'] });
```

**`timeline`**: `milestones` (text or `{ label, date, color }`), `area`, `at`, `dur` (4), `to` (0..1), `px`, `color`.
```js
s.timeline({ milestones: [{ label: 'Draft', date: 'Mon' }, { label: 'Review', date: 'Wed' }, { label: 'Release', date: 'Fri' }] });
```

**`flow`**: `steps` (text or `{ id, text, color, state }`), `layout` (`row`, `snake`), `cols`, `links` (`[[fromId, toId]]`), `id` (`flow`; step ids `<id>-1`...), `area`, `at`, `step` (0.35), `runAt`, `per` (0.9), `dwell` (0.45), `w`, `h`, `gap`, `gapY`, `px`.
```js
s.flow({ id: 'ci', steps: ['Code', 'Build', 'Tests', 'Deploy'], at: 0.5 });
```

**`table`**: `columns` (text or `{ text, align }`), `rows`, `area`, `w`, `rowH`, `at`, `step` (0.55), `px`, `highlight` (`{ row | col, at, color }`), `firstColBold` (true).
```js
s.table({ columns: ['Mode', 'You', 'Claude'], rows: [['default', 'yes', 'yes'], ['user only', 'yes', 'no']], highlight: { row: 1 } });
```

**`sequence`**: `actors` (text or `{ id, text, color }`), `messages` (`{ from, to, text, kind: 'sync' | 'async' | 'return', color }`), `activation`, `activations` (`[{ actor, from, to }]`), `area`, `at`, `step` (0.9), `msgDur` (0.6), `times`.
```js
s.sequence({ actors: ['Client', 'API'], messages: [{ from: 'Client', to: 'API', text: 'POST /login' }, { from: 'API', to: 'Client', text: '200 OK', kind: 'return' }] });
```

**`architecture`**: `zones` (`{ id, title, color, nodes: [text | { id, text, color, shape }] }`), `links` (`[from, to, label]` or `{ from, to, label, color, dash }`), `layout` (`layers`, `columns`), `area`, `at`, `zoneStep` (0.5), `nodeStep` (0.2), `linkStep` (0.5).
```js
s.architecture({ layout: 'layers', zones: [{ id: 'client', title: 'Client', nodes: [{ id: 'web', text: 'Web app' }] }, { id: 'server', title: 'Server', nodes: [{ id: 'api', text: 'API' }] }], links: [['web', 'api', 'HTTPS']] });
```

**`codeBlock`**: window with line numbers. `lines`, `title`, `id`, `area`/`rect`, `at`, `dur`, `type` (`'type'`, `'appear'`, `false`), `typeAt`, `typeDur`, `lineStep` (0.22), `px`, `highlights` (`[{ lines: 2 | [2, 3], at, until, color }]`, 1-based), `pointer` (`{ line, text, at, until, color }`). For a live editor with edits use `editor`.
```js
s.codeBlock({ title: 'login.ts', lines: ['const user = await find(email);', 'if (!user) throw new Error("none");'], highlights: [{ lines: 2, at: 3 }] });
```

**`anatomy`**: `parts` (`{ id, shape, x, y, w, h, color, text, fill }` in fractions 0..1), `labels` (`{ part, text, side, color, at }`), `aspect` (1), `draw(api, box, p, t)`, `maxH` (700), `labelW` (520), `partStep` (0.14), `step` (0.9), `area`, `at`. Part ids `<id>.<partId>`.
```js
s.anatomy({ id: 'phone', aspect: 0.5, parts: [{ id: 'body', x: 0, y: 0, w: 1, h: 1, color: 'dim' }, { id: 'screen', shape: 'rect', x: 0.08, y: 0.1, w: 0.84, h: 0.7, color: 'accent2' }], labels: [{ part: 'screen', text: 'Touch screen' }] });
```

**`stateMachine`**: `states` (text or `{ id, text, color }`), `transitions` (`[from, to, label]` or `{ from, to, label, color, flip }`), `layout` (`row`, `ring`, `grid`), `positions` (`{ id: [fx, fy] }`), `gap`, `path` (ids to walk), `pathAt`, `pathStep` (1.4), `activeColor` (`warn`), `at`, `nodeStep` (0.25), `transitionStep` (0.5), `area`.
```js
s.stateMachine({ states: ['Draft', 'Review', 'Published'], transitions: [['Draft', 'Review', 'submit'], ['Review', 'Published', 'approve']], path: ['Draft', 'Review', 'Published'] });
```

## Titles and HUD

HUD pieces (`heading`, `caption`, `sectionTag`, `sourceFooter`, `journeyRail`) draw in screen space: the camera never moves them.

| Piece | Options (defaults) |
|---|---|
| `titleCard` | `title` (or `text`), `subtitle`, `id`, `rect` or `w`/`h` (1500 x 460), `at`, `px` (120), `subPx`, `color`, `subColor`, `typeDur` |
| `heading` | `text`, `at` (0.2), `px`, `color`, `type` (true), `typeDur`, `rect` (`{ x: 120, y: 124, w: W - 240, h: 104 }`, id `heading`). Fades while the camera is zoomed |
| `caption` | `text`, `at`, `until`, `rect` (`{ x: 160, y: H - 190, w: W - 320, h: 96 }`), `px`, `color`, `textColor`, `typeDur`. Never overlap two captions in time |
| `sectionTag` | `index`, `total`, `name` (renders `02 / 09 Name`) or `text`; `at`, `x` (64), `y` (48), `px`, `color` |
| `sourceFooter` | `text`, `lang`, `prefix`, `rect`, `at`, `dur`, `px`. Prefix "Fuente: " for Spanish, "Source: " otherwise (from `lang`, the spec's `lang`, or detected). Create it after the heading |
| `journeyRail` | `steps` (labels), `active` (0), `from` (active - 1), `at` (0.25), `rect`, `z`. Sits right of the section tag (add the tag first); fades between zoom 1 and 1.15. Exposes `marks.arrive`, `end` |

```js
s.titleCard({ title: 'How a skill loads', subtitle: 'From description to context', at: 0.2 });
s.heading({ text: 'Only the description is always loaded' });
s.sectionTag({ index: 2, total: 7, name: 'Discovery', at: 0.1 });
s.journeyRail({ steps: ['Send', 'Process', 'Store'], active: 1 });
s.caption({ text: 'Only the description is always in context.', at: 4, until: 8.5 });
s.sourceFooter({ text: 'Claude Code docs, Skills' });
```

## Icons

`icon`: `kind` (required, one of 22: `laptop`, `server`, `database`, `cloud`, `package`, `container`, `user`, `gear`, `doc`, `rocket`, `globe`, `shield`, `lock`, `heart`, `clock`, `bolt`, `branch`, `check`, `cross`, `phone`, `bug`, `eye`; an unknown kind lists them), `id`, position (`rect`, `in`, a layout id, or `x`, `y`, `size` (160)), `at`, `dur` (0.6 draw-on), `color`, `label`, `labelSide` (`bottom`, `top`, `left`, `right`), `labelPx`, `labelColor`, `idle` (`float`, `bob`, `sway`, `pulse`), `spin` (rad/s, gear and clock), `until`. The registered rect covers icon, label and idle motion.
```js
s.row(['a', 'b'].map(id => ({ id, w: 300, h: 360 })), { gap: 80 });
s.icon({ id: 'a', kind: 'laptop', label: 'Your laptop', at: 0.4 });
s.icon({ id: 'b', kind: 'rocket', label: 'Production', at: 0.8, idle: 'float', color: 'accent2' });
```

## Screens

Window pieces; every string they show reaches QA. Registered ids: `<id>.body`, `<id>.l<n>` per line.

**`editor`**: `rect | in`, `file` (tab), `title`, `tree` or `sidebar` (names; indent two spaces per level; a trailing `*` marks the active one), `lines` (string or `{ text, mark: '+' | '-', at, markAt, typed, pause }`; `-` lines are existing code shown at once), `at`, `typeAt` (`at + 0.9`), `cps` (26), `type` (`false` shows all lines), `edits` (`[{ line, to, at, erase (0.4), type }]`: a line erases back to the common prefix and retypes), `highlights` (`[{ lines | line, to, at, until, color (warn) }]`), `cursorLine`, `lineNumbers` (true), `px`, `until`. Exposes `end`.
```js
s.editor({ id: 'ed', rect: s.area, file: 'auth.ts', lines: ['export function login() {', { text: '  return verify();', mark: '+', at: 3 }, '}'], highlights: [{ line: 2, at: 4 }] });
```

**`terminal`**: `rect | in`, `title` (`terminal`), `prompt` (`$`), `at`, `typeAt`, `cps` (22), `px`, `until`, `steps` (`[{ name, cmd, at, out (string | string[] | { text, color }[]), outAt, outStep (0.12), wait (0.3), pause (0.45) }]`; a step without `cmd` only prints). Exposes `end` and `marks` by step index and name (when its output finished).
```js
s.terminal({ id: 'term', rect: s.area, steps: [{ name: 'test', cmd: 'bun test', out: ['2 pass'] }] });
```

**`diffView`**: `rect | in`, `file`, `stat`, `lines` (`[{ op: '+' | '-' | ' ', text }]`), `at`, `step` (0.15), `px`, `until`. Exposes `end`.
```js
s.diffView({ id: 'diff', rect: s.area, file: 'src/auth.ts', stat: '+1 -1', lines: [{ op: '-', text: 'check(p)' }, { op: '+', text: 'verify(p)' }] });
```

## Devices

| Piece | Options (defaults) |
|---|---|
| `browser` | `rect | in`, `url`, `typeUrl` (true), `at`, `dur` (0.7), `color`, `until`. Registers `<id>.body` |
| `phone` | `rect | in`, `at`, `dur` (0.7), `tilt` (0, degrees it settles from), `color`, `until`. Kept 1:2; registers `<id>.screen` |
| `appScreen` | `rect | in`, `at`, `title`, `rows` (`[{ label, value?, on? }]`), `total` (`{ label, from, to, at, dur (1.2), prefix, suffix, decimals }`), `cta`, `banner` (text or `{ text, at, color }`), `feature` (`{ label, at, badge }`), `color`, `until`. Registers `<id>.total`, `.cta`, `.feature` |
| `prPage` | `rect | in`, `at`, `title`, `number`, `from`, `to`, `author`, `stats` (`{ add, del }`), `labels`, `checks` (`[{ name, start, end, ok }]`), `reviewers` (`[{ name, initials, approveAt }]`), `button` (call-to-action text: the page starts as a draft and `openAt` opens it), `openAt`, `mergeAt`. Merge unlocks when every check passed and every reviewer approved. Registers `<id>.badge`, `.checks`, `.reviewers`, `.merge` (alias `.button`). Exposes `end`, `marks { open, ready, merge }` |
| `cursor` | `path` (`[[t, x, y] | [t, id | { id, anchor }]]`, eased), `clicks` (`[t]`), `color`, `until`. Exposes `pos(t)`, `end` |

```js
s.browser({ id: 'web', rect: s.area, url: 'github.com/acme/web/pull/7', at: 0.3 });
s.prPage({ id: 'pr', in: 'web.body', title: 'Add coupon', number: 7, from: 'feat/coupon', to: 'main', author: 'Lu', button: 'Open', openAt: 3, checks: [{ name: 'tests', start: 3.6, end: 5 }], reviewers: [{ name: 'Ana', approveAt: 6 }], mergeAt: 8 });
const b = s.reg.get('pr.button');
s.cursor({ path: [[1, 900, 300], [2.8, b.x + b.w * 0.8, b.y + b.h * 0.6]], clicks: [3], until: 5 });
s.phone({ id: 'ph', rect: { x: 100, y: 244, w: 340, h: 636 } });
s.appScreen({ in: 'ph.screen', title: 'Shop', rows: [{ label: 'Shirt', value: '$ 25' }], total: { label: 'Total', from: 25, to: 49, prefix: '$ ' }, cta: 'Pay' });
```

## Numbers

All take `rect | in`, `at`, `until`.

| Piece | Options (defaults) |
|---|---|
| `counter` | `from` (0), `to`, `dur` (1.5) or `keys` (`[[t, value]]`), `decimals`, `prefix`, `suffix`, `sep`, `label`, `ease`, `color`, `px`, `font`. Fitted for its widest value; bumps when it lands |
| `progress` | `dur` (2), `from` (0), `to` (1), `label`, `pct` (true), `segments`, `color`, `doneColor` (`good`), `linear` |
| `gauge` | `to` (1), `dur` (1.5), `label`, `suffix` (` %`), `scale` (100), `color` |
| `chart` | `type` (`line`, `area`, `bars`), `data` (numbers, or arrays for several lines), `labels`, `colors`, `title`, `yMax`, `dur` (2), `step` (bars one by one), `mark` (`{ i, text, color }` on a line or area point) |
| `dotGrid` | `rows`, `cols`, `dur` (2), `fail` (indices that turn bad), `color` (`good`) |

```js
s.counter({ rect: { x: 100, y: 260, w: 560, h: 260 }, to: 12480, label: 'active users', at: 0.6 });
s.progress({ rect: { x: 100, y: 640, w: 560, h: 110 }, label: 'Migration', segments: 20 });
s.gauge({ rect: { x: 760, y: 260, w: 500, h: 360 }, to: 0.87, label: 'coverage', color: 'good' });
s.chart({ rect: { x: 1300, y: 250, w: 540, h: 620 }, type: 'bars', data: [18, 31, 24], labels: ['A', 'B', 'C'], step: 0.5 });
s.dotGrid({ rect: { x: 760, y: 680, w: 500, h: 200 }, rows: 3, cols: 10, fail: [7] });
```

## Annotate

| Piece | Options (defaults) |
|---|---|
| `kineticText` | `text` (markup: `*word*` emphasis, `\|` or newline breaks a line) or `lines`, `rect | in`, `mode` (`pop`, `rise`, `drop`, `slam`, `slide`; `rise`), `step` (0.09 per word), `at`, `until`, `px` (up to 3 x nodePx), `emphasis` (`{ word: token }`), `emphColor` (`accent`), `color`, `underline` (`[words]`), `underlineColor`, `align` (`center`, `left`), `weight` (700), `lineHeight` (1.25) |
| `callout` | `target` (id, `[x, y]`, `{ id, anchor }` or rect), `text`, `side` (`right`, `left`, `top`, `bottom`), `dist`, `w`, `h`, `rect`, `bend`, `color` (`warn`), `px`, `at`, `until`. Exposes `arrow` |
| `stamp` | `text`, `rect` or `cx`, `cy`, `color` (`good`), `rot` (-0.14 rad), `px`, `at`, `until` |
| `bubble` | `rect | in`, `text`, `initials`, `side` (`left`, `right`: avatar), `tail` (`left`, `right`, `top`, `bottom`, `none`), `tailAt` (0..1), `typing` (0.6 s of dots), `color` (`accent2`), `px`, `at`, `until` |
| `chip` | `text`, `x`, `y` or `cx`, `cy` or `rect`, `color` (`accent`), `solid`, `mono`, `icon` (`check`, `cross`, `spinner`, `dot` or an icon kind), `px`, `at`, `until`, `states` (`[{ at, text, color, icon, solid }]`: flips at `at`; each state inherits what it omits) |
| `scribble` | `target` (id or rect), `kind` (`circle`, `underline`, `box`), `at`, `dur` (0.6), `until`, `color`, `pad`, `lw` |

```js
s.kineticText({ rect: { x: 160, y: 150, w: 1600, h: 320 }, text: 'A *clear* review|in three steps', mode: 'slam', underline: ['clear'], at: 0.3 });
s.node({ id: 'db', text: 'save()', rect: { x: 760, y: 590, w: 420, h: 140 } });
s.callout({ target: 'db', text: 'Check the stock here', side: 'right', w: 520, at: 3 });
s.chip({ cx: 410, cy: 520, text: 'queued', color: 'warn', icon: 'dot', states: [{ at: 5, text: 'done', color: 'good', icon: 'check', solid: true }] });
s.stamp({ text: 'REVIEW', cx: 1560, cy: 830, color: 'warn', at: 5 });
s.bubble({ rect: { x: 200, y: 300, w: 1150, h: 170 }, initials: 'QA', side: 'left', text: 'The second card fails', at: 0.6 });
s.scribble({ target: 'db', kind: 'circle', at: 4, color: 'bad' });
```

## Movement

| Piece | Options (defaults) |
|---|---|
| `packets` | `path` (2+ waypoints: ids, `[x, y]`, `{ id, anchor }`) or `edge`, `curve` (`straight`, `arc`, `s`, `sv`), `bend` (px for `arc`), `at`, `until` (last emission), `every` (0.35), `count`, `dur` (1.2), `shape` (`dot`, `box`, or an icon kind), `size`, `color` or `colors`, `trail` (3), `track` (true, dashed path), `trackColor`, `fadeAt`, `ping` (ring on arrival), `ease`. Exposes `pts`, `arriveAt`, `end`, `positions(t)` |
| `particles` | `mode` (`burst`, `confetti`, `ambient`, `hearts`), `origin` (id or `[x, y]`) or `rect`, `at`, `dur`, `until`, `count`, `colors`, `size` (12), `speed` (420), `gravity` (320), `seed`. Exposes `end`, `sample(t)` |
| `burst` | `origin` or `target`, `at`, `dur` (1.1), `count` (24), `radius` (220), `colors`, `gravity` (140), `size` (5), `shape` (`dot`, `spark`), `seed`. Exposes `end` |
| `parallax` | `kind` (`shapes`, `dots`, `rings`), `layers` (3), `count` (8), `seed`, `colors`, `drift` (14 px/s), `alpha`, `at`, `until`, `z` (-5). Decoration: far layers follow the camera less; no QA record |
| `spotlight` | `target`, `at`, `until`, `pad` (16), `strength` (0.62), `color` (`warn`). Dims everything else; no QA record |
| `splitScreen` | `area` (rect or id; `s.area`), `ratio` (0.5), `slant` (0), `gap` (48), `left` / `right` (`{ color, label }`), `at`, `dur` (0.7). Registers `<id>.left`, `<id>.right` for `in:` |
| `journeyRail` | see Titles and HUD |

```js
s.icon({ id: 'a', kind: 'laptop', rect: { x: 160, y: 380, w: 280, h: 340 }, label: 'Client' });
s.icon({ id: 'b', kind: 'server', rect: { x: 820, y: 300, w: 280, h: 340 }, label: 'Server', at: 0.4 });
s.packets({ path: ['a', 'b'], curve: 'arc', bend: -110, shape: 'doc', at: 1.6, until: 2.8, every: 0.6, dur: 1.4, ping: true });
s.burst({ origin: 'b', at: 4 });
s.particles({ mode: 'confetti', rect: s.area, at: 5, dur: 2.5 });
s.parallax({ kind: 'dots' });
s.spotlight({ target: 'b', at: 6, until: 8 });
s.splitScreen({ ratio: 0.5, left: { label: 'Before' }, right: { label: 'After', color: 'good' } });
```

## Systems

All take `rect | in`, `at`, and are composites (QA sees their inner texts).

**`pipeline`**: `title`, `runAt` (`at + 1`), `timeScale` (14), `gap`, `stages` (`[{ name, jobs: [{ name, id, start, dur (1.5), ok (true), secs }] }]`). A stage without job `start` begins when the previous ends. Registers `<id>.s<N>`, `<id>.j<N>.<M>`. Exposes `end`, `marks.stageEnd = { <stage name>: t }`.
```js
s.pipeline({ id: 'ci', rect: s.area, stages: [{ name: 'Build', jobs: [{ name: 'Compile', dur: 1.4 }] }, { name: 'Test', jobs: [{ name: 'E2E', dur: 2, ok: false }] }] });
```

**`gitGraph`**: `lanes` (`[{ name, color }]` top to bottom), `cols`, `r`, `commits` (`[{ id, lane, col, at, parents, label, tag }]`). Registers `<id>.<commit id>`; exposes `end`, `marks.<commit id>`.
```js
s.gitGraph({ id: 'g', rect: s.area, lanes: [{ name: 'main' }, { name: 'feat', color: 'accent2' }], commits: [{ id: 'c1', lane: 'main', col: 0, at: 1 }, { id: 'f1', lane: 'feat', col: 1, at: 2, parents: ['c1'] }, { id: 'm', lane: 'main', col: 2, at: 3, parents: ['c1', 'f1'], tag: 'v1' }] });
```

**`machine`**: `inputs` (`[{ kind, label, color }]`, icon kinds), `output` (`{ kind, label, color }`), `machine` (`{ kind: 'gear', label }`), `feedStep` (0.8), `travel` (1.3), `processDur` (1.6). Registers `<id>.machine`, `<id>.out`; exposes `end`, `marks { processStart, processEnd }`.
```js
s.machine({ id: 'mq', rect: s.area, inputs: [{ kind: 'doc', label: 'code' }, { kind: 'database', label: 'data' }], machine: { label: 'Pack' }, output: { kind: 'package', label: 'app.zip', color: 'good' } });
```

**`fleet`**: `count` (3), `cols`, `from` (`v1`), `to` (`v2`), `lb` (true, or the balancer's label), `startAt` (`at + 1.5`), `step` (1.5), `flipDur` (0.7). Registers `<id>.s<N>`, `<id>.lb`; exposes `end`, `marks.flip<N>`.
```js
s.fleet({ id: 'fl', rect: s.area, count: 3, from: 'v1', to: 'v2' });
```

**`layers`**: `layers` (`[{ text, color }]`, bottom first), `step` (0.5). Registers `<id>.l<N>` (1 is the bottom); exposes `end`.
```js
s.layers({ id: 'stack', rect: s.area, layers: [{ text: 'Database' }, { text: 'API', color: 'accent2' }, { text: 'Web', color: 'accent' }] });
```

## Wrappers

Wrap items that already exist (`targets`: id or array; ids registered by composites work). QA follows the motion: a moved rect is checked where it really is, and an enter that leaves the frame fails `out-of-bounds`. They return an item with `end`.

| Wrapper | Options (defaults) |
|---|---|
| `animate` | `targets`, any of `x`, `y` (px), `scale`, `rot` (degrees), `alpha`, each a keyframe list `[[t, value], ...]`; `origin` (`center`, `[x, y]`, id), `ease` (`inOut`) |
| `enter` | `targets`, `at` (0), `dur` (0.7), `from` (`fade` default, `left`, `right`, `top`, `bottom`, `pop`, `spin`), `dist`, `ease`. Hidden and unchecked before `at` |
| `exit` | `targets`, `at` (0), `dur` (0.5), `to` (`fade` default; same names), `dist`, `ease`. Stays hidden |
| `reveal` | `targets`, `at` (0), `dur` (0.9), `shape` (`wipe`, `wipe-y`, `iris`, `scan`, `blinds`), `dir` (wipe `left`/`right`, wipe-y `top`/`bottom`, blinds, scan), `origin` (iris), `color`, `slats` (8), `ease`. QA treats the target as hidden until progress 0.5 |

```js
s.animate({ targets: 'a', x: [[1, 0], [2, 200]], scale: [[1, 1], [2, 1.2]] });
s.enter({ targets: 'b', at: 0.4, from: 'left' });
s.exit({ targets: 'b', at: 6, to: 'fade' });
s.reveal({ targets: 'trend', at: 1, shape: 'wipe', dir: 'left' });
```

## Motion helpers

Call after the target exists. `target` is an item or a registered id.

| Helper | Options (defaults) |
|---|---|
| `pulse` | `target`, `at`, `dur` (1.2), `times` (2), `scale` (0.08), `color` (`accent`), `ring` (true) |
| `shake` | `target`, `at`, `dur` (0.7), `amp` (12 px), `cycles` (6) |
| `highlight` | `target`, `style` (`glow`, `underline`), `at`, `dur` (0.6), `until`, `color` (`warn`), `pad` (10) |
| `travelDot` | one of `path` (ids), `edge` (id), `points` (`[[x, y]]`); `at`, `dur` (2), `color`, `size` (18), `trail` (6), `repeat` (1), `ease`, `stay` |
| `morph` | `from`, `to` (ids or rects), `at`, `dur` (1), `fromText`, `toText`, `fromShape`, `toShape`, `color`, `toColor`, `keep` |
| `expand` | `target`, `at`, `dur` (0.9), `rect`, `title`, `lines`, `closeAt`, `color`, `id` |
| `squeeze` | `targets` (2+ ids), `into` (`{ id, text, rect, color }` or an id), `at`, `dur` (1.2) |

```js
s.pulse({ target: 'api', at: 2, times: 2 });
s.shake({ target: 'api', at: 3 });
s.highlight({ target: 'db', style: 'underline', at: 5, until: 7 });
s.travelDot({ path: ['web', 'api', 'db'], at: 3, dur: 2.5 });
s.morph({ from: 'old', to: 'new', at: 4 });
s.expand({ target: 'api', at: 6, title: 'API', lines: ['Validates', 'Stores'] });
s.squeeze({ targets: ['t1', 't2', 't3'], into: { id: 'all', text: 'One service', color: 'good' }, at: 4 });
```

Layout helpers (`s.row`, `s.stack`, `s.grid`, `s.radial`, `s.tree`), `s.connect`, `s.camera` and `s.raw` live in [scene-api.md](scene-api.md).
