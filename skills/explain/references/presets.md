# Presets

A preset is the look of a video: palette, fonts, stroke and fill renderers, texture, transition flavor. Motion, layout and pieces never depend on it, so one `scene.js` renders in every preset. Text metrics differ between presets, so rebuild and `check` after switching.

## Pick a preset

| Preset | Look | Pick it when |
|---|---|---|
| `sketch` | warm paper, hand-drawn boiling strokes, Caveat, marker highlights | friendly and explanatory: teaching, walkthroughs, a concept for newcomers, managers, students or clients |
| `hologram` | dark grid, glowing neon lines, scanlines, a tearing glitch, Inter | technical: architecture, code, pipelines, protocols, PR walkthroughs, engineers or QA |
| `poster` | saturated violet field, flat shapes with hard shadows, thick round strokes, Fredoka | bold and broad: product explainers, pitches, a wide audience |
| a user preset | your brand or a variation of one of the three | the user names a look the built-ins lack |

In doubt: `hologram` for technical content, `sketch` for everything else. One video uses one preset. Run `preset list` to see built-in and user presets.

| | `sketch` | `hologram` | `poster` |
|---|---|---|---|
| `bg` / `ink` / `accent` / `accent2` | `#faf6ec` / `#23201c` / `#e4572e` / `#2a6f97` | `#060a13` / `#e8f2ff` / `#4de1ff` / `#ff5cc8` | `#4a2bc2` / `#fff8ea` / `#ffd23f` / `#ff8fc7` |
| Fonts | Caveat, JetBrains Mono | Inter, JetBrains Mono | Fredoka, JetBrains Mono |
| `nodePx`, `labelPx`, `codePx`, `minPx` | 58, 60, 34, 30 | 34, 34, 28, 18 | 38, 40, 28, 20 |
| `export.bitrate` | 4 Mbps | 2 Mbps | 2 Mbps |

Handwriting is large and wide: in `sketch` write shorter labels or give shapes more room.

## Use a preset

```sh
bun <skill-dir>/cli/index.ts new my-topic --preset sketch      # explain.json records the preset
bun <skill-dir>/cli/index.ts build <dir> --preset poster       # one-off build in <dir>/presets/poster/
bun <skill-dir>/cli/index.ts preset use <dir> poster           # save it in <dir>/explain.json
```

Precedence: `--preset` (alias `--style`), then `explain.json`, then `export const preset = '...'` in the scene file, then `hologram`. A `--preset` other than the configured one is a one-off build in `<dir>/presets/<name>/`; it never rewrites `explain.json`. Only `new` and `preset use` write it.

## Make a user preset

1. `preset new <name> --from sketch|hologram|poster` copies a built-in into `~/.explain/presets/<name>/` (or `$EXPLAIN_PRESETS`) with a `README.md` checklist. The name is lowercase letters, digits and dashes; it may not reuse a built-in name.
2. Edit `preset.js`. Keep `name` equal to the folder name.
3. `preset check <name>` validates the preset, builds `examples/gallery.scene.js` in it, runs QA and writes `sheet.png`. It must pass with 0 errors; look at the printed sheet.
4. `preset use <dir> <name>` or `--preset <name>` on any command.
5. `preset promote <name>` (maintainers) re-runs the check and copies the preset into `<skill>/presets/`.

## The contract

`presets/<name>/preset.js` is a factory with no imports, so it also works from `~/.explain/presets/`:

```js
export default ({ math, rough }) => ({ name, description, palette, faces, stacks, weights, defaults, export, background, shape, line, poly, text, highlight, overlay, fill, dot, transitions });
```

`math` is the kit's `clamp, lerp, hexA, rng, ...`; `rough` is Rough.js. A missing member makes one error that lists all of them.

| Member | Content |
|---|---|
| `name`, `description` | `name` equals the folder; the description is the pick-it line `preset list` shows |
| `palette` | required: `bg, ink, dim, accent, accent2, good, warn, bad, panel`. Optional: `onPanel` (text on panel, default `ink`), `onAccent` (text on a solid accent fill, default `panel`), `shadow`, `syntax { comment, string, keyword, number, type, fn, plain }`. Extra named tokens are fine |
| `faces` | `[{ family, file, weight }]`. `file` is relative to the preset folder (`fonts/x.woff2`) or `vendor:fonts/...` for the skill's shared fonts (`caveat`, `inter`, `jetbrains-mono`). Fonts are embedded as base64; nothing loads from the network. Bundle only OFL or similar fonts and keep the license file beside them |
| `stacks`, `weights` | CSS font stacks and weights per role `body`, `display`, `mono` |
| `defaults` | `{ nodePx, labelPx, codePx, minPx, lw, pad, radius, fillAlpha }`. Every piece sizes text from these; `minPx` is the fitting floor |
| `export` | `{ bitrate }` in bits per second (`4e6`). Precedence: `--bitrate` over the preset over 2 Mbps |

Contrast: `definePreset` warns when `ink` on `bg`, `onPanel` on `panel` or `onAccent` on `accent` is under 4.5:1. Fix the palette, not the warning.

### Renderers

All take `api` first. Required: `background(api)`, `shape(api, rect, o)`, `line(api, pts, o)`, `poly(api, pts, o)`, `text(api, str, x, y, o)`, `highlight(api, rect, o)`. Optional: `overlay(api)` (drawn over the finished frame: vignette, scanlines), `fill(api, rect, o)` (flat filled rect), `dot(api, x, y, r, o)`; a missing one falls back to a plain canvas version.

| Renderer | Options every preset honors |
|---|---|
| `shape` | `kind` (`round`, `rect`, `ellipse`, `pill`), `p` (draw-on 0..1), `stroke`, `fill`, `fillAlpha`, `lw`, `r`, `dash`, `dashOffset`, `alpha` |
| `line` | `p`, `color`, `lw`, `head`, `dash`, `dashOffset`, `alpha`, `smooth` |
| `poly` | `closed`, `p`, `stroke`, `fill`, `fillAlpha`, `lw`, `alpha`, `smooth` |
| `text` | `px`, `role` (`body`, `display`, `mono`), `weight`, `color`, `align`, `alpha` |
| `highlight` | `p`, `color`, `alpha` |
| `fill` | `color`, `alpha`, `radius` |
| `dot` | `color`, `alpha` |

Hints a preset may ignore: `seed`, `still`, `glow`, `hatch`, `shadow`.

Rules for renderers:

- Set alpha only through `api.alpha(a)`, which multiplies the scene alpha `api.sa`, so `api.fade(k)` composes. Never write `ctx.globalAlpha` directly.
- Save and restore the context. Animate only from `api.t`; use `rng(seed)`, never `Math.random` or `Date`.
- Colors come from `api.color(token)`. Text uses `ink` on the background, `onPanel` in panels, `onAccent` on accent fills.

### Transition hooks

`transitions: { sweep, glitch, flash, ring, edge }`, each `(api, p, spec, origin)` with progress `p` 0..1, the transition spec and `origin` already resolved to frame pixels. They draw in frame space after the layers. A transition without a hook of that name uses the engine default (`glitch` has none: a plain cut). The `glitch` hook may read the canvas; keep it pure in `p`.
