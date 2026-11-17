# Styles

Two styles, chosen with `new <slug> --style <name>` or `build|check|stills|export <dir> --style <name>` (the choice is saved in `<dir>/explain.json`; with no flag the saved style is used, then `hologram`). A scene file never changes between styles: pieces draw through the style and colors are tokens. Switch style, rebuild, check again; text metrics differ, so a scene that passes in one style can overflow in the other.

## Color tokens

| Token | `hologram` | `sketch` | Use |
|---|---|---|---|
| `bg` | `#060a13` | `#faf7f0` | background (not drawn by you) |
| `ink` | `#e8f2ff` | `#222222` | primary text and outlines |
| `dim` | `#6f88a8` | `#7a7468` | secondary text, frames, edges |
| `accent` | `#4de1ff` (cyan) | `#e4572e` (orange red) | the hero |
| `accent2` | `#ff5cc8` (magenta) | `#2a6f97` (blue) | second group, contrast |
| `good` | `#6bffb0` (green) | `#3a8a4f` | pass, success |
| `warn` | `#ffc857` (amber) | `#d99a00` | attention, active step |
| `bad` | `#ff6b7a` | `#c0392b` | fail, error |
| `panel` | `rgba(10,20,38,0.86)` | `#ffffff` | node and card fill |

`hologram` also accepts the aliases `cyan`, `magenta`, `green`, `amber`. A raw CSS color string also passes through, but use tokens so both styles work.

## Fonts and sizes

All fonts are bundled (`vendor/fonts/`, SIL OFL) and embedded as base64 in each page; nothing loads from the network.

| | `hologram` | `sketch` |
|---|---|---|
| Body, display | Inter (display 700, body 500) | Caveat (display 700, body 600) |
| Mono (code, trees) | JetBrains Mono | JetBrains Mono (bundled in both styles) |
| Default sizes (`nodePx`, `labelPx`, `codePx`) | 34, 34, 28 | 54, 56, 40 |
| Minimum text size, padding, line width | 18 px, 18, 3 | 26 px, 20, 3 |

The handwriting font is large and wide, so sketch labels hold fewer words per shape: write shorter labels, or enlarge rects.

## Look

- **`hologram`**: dark blue grid with drifting particles, glowing strokes, a vignette overlay, a cyan light sweep. Strokes are crisp.
- **`sketch`**: warm paper with faint dots, hand-drawn strokes (Rough.js, fixed seeds so frames never jitter), no glow.

## When to pick which

| Pick `hologram` when | Pick `sketch` when |
|---|---|
| technical content: architecture, code, pipelines, protocols, PR walkthroughs | a concept for newcomers, a process, a story, a "how does X work" for a mixed audience |
| the video has code, file trees or tables with many cells | the tone is friendly and informal |
| the audience is engineers or QA | the audience is managers, students or clients |
| in doubt | the user asked for "hand-drawn", "whiteboard" or "simple" |

Do not mix styles inside one video: a page has exactly one.
