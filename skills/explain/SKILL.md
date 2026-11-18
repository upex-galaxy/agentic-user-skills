---
name: explain
description: "Animated explainer video (MP4 plus an HTML preview) from a topic, a PR or a document. Use when the user wants something animated: a video, an animation, an animated explainer or diagram, \"explicame X en un video\". Not for plain text explanations, not for breaking down automated tests (test-automation explain mode), not for slides or a static diagram."
license: MIT
compatibility: [claude-code, opencode, cursor, codex]
allowed-tools: Bash(bun:*), Bash(command:*), Bash(ffprobe:*), Bash(ffmpeg:*), Bash(gh:*)
complementary_categories: [meta-skill]
metadata:
  author: UPEX Galaxy
---

# explain: an animated explainer video from a scene file

You write one `scene.js`; the bundled CLI turns it into a self-contained `index.html` (a player) and a 1920x1080, 30 fps, H.264 MP4. A QA gate checks the layout before anything is delivered. Everything lands under `~/explainers/<yyyy-mm-dd>-<slug>/` (override with `EXPLAIN_HOME`), never the cwd.

## Setup (first run)

Nothing to install. Needs Bun and a Chrome or Chromium. The search order is: `EXPLAIN_CHROME=<binary>` (an error when it does not exist), system Chrome, the newest Playwright browser (Chrome for Testing or Chromium under `PLAYWRIGHT_BROWSERS_PATH`, `~/Library/Caches/ms-playwright` or `~/.cache/ms-playwright`), `google-chrome` or `chromium` on PATH, and last the Playwright headless shell, which can run `check`, `stills` and `sheet` but not `export` (it writes full-range video). `ffprobe` is optional: when present, `export` verifies the MP4. `ffmpeg` is needed only for `--from-mp4`. All commands run as `bun <skill-dir>/cli/index.ts <command>`; `--help` lists them.

## Loop

1. **Understand and source the topic.** Read the material the video must be true to: the docs page, the document, or for a PR its diff (`gh pr diff`) and description. Note the exact source of every fact.
2. **Storyboard 5 to 9 scenes**, one idea each, 6 to 12 s per scene (45 to 90 s in total). Per scene write: the one thing to show, the hero, the piece that fits it, the source. Pick a preset ([references/presets.md](references/presets.md)): `sketch` friendly and explanatory (light paper), `hologram` technical (dark), `poster` bold violet for broad audiences, or a user preset from `preset list`.
3. **`new <slug> --preset <name>`** creates `scene.js` from a template and prints its path.
4. **Write `scene.js`** from the arsenal below. File shape, layouts, camera, transitions, raw escape hatch, QA types: [references/scene-api.md](references/scene-api.md). Composition rules: [references/direction.md](references/direction.md); read it before the first scene.
5. **`build <dir>`, then `check <dir>`** until it exits 0 with no errors. Each error names the scene, the element id and the time; fix the scene, not the gate. Warnings (`composition-balance`, `widow`) do not block the export; resolve each by rebalancing, or keep it and justify it in the delivery message, scene by scene.
6. **`stills <dir>`** writes PNGs named `NN-<scene>@<seconds>.png` to `<dir>/stills/` (2 per scene; `--scene <name>` gives 4 of one scene). Aim at a moment with `--at scene:t`, for example `--at ci:3.5,git:5.2` (scene-local seconds; plain numbers are global). Then **`sheet <dir>`** writes one contact sheet `<dir>/sheet.png` without ffmpeg. Look at every still and the sheet: QA cannot see a wrong arrow, a hidden hero or an unreadable scene. Fix and re-run steps 5 and 6.
7. **`export <dir>`** runs the gate again and writes `<dir>/<slug>.mp4`. Bitrate: `--bitrate <Mbps>`, else the preset's (`sketch` 4 Mbps, the others 2), else 2. `stills <dir> --from-mp4` reviews the encoded frames.
8. **Deliver** the MP4 path and the `index.html` path (the preview has play, scrub and export in the video's language), plus one line per warning you kept and why. Offer to publish the HTML as a claude.ai Artifact: it is self-contained and works offline.

`preview <dir>` opens the page. `build`, `check`, `stills`, `sheet` and `export` rebuild it when the scene, the preset or the engine changed. A target is an explainer folder or a scene file; a scene file not named `scene.js` builds into `~/explainers/<yyyy-mm-dd>-<name>/`. Nothing is written inside the skill folder. `--preset` (alias `--style`) on any command is a one-off build in `<dir>/presets/<name>/`; only `new` and `preset use` write `explain.json`.

## Arsenal

63 pieces, one table by family; options, defaults and a runnable call for each are in [references/pieces.md](references/pieces.md). A piece may be hosted inside another with `in: '<id>.body'`; many expose `end` and `marks`.

| Family | Pieces |
|---|---|
| Base, layout | `node`, `edge`, `label`, `group`, `code`; `s.row`, `s.stack`, `s.grid`, `s.radial`, `s.tree` |
| Diagrams | `flow`, `architecture`, `sequence`, `stateMachine`, `mindMap`, `timeline`, `table`, `folderTree`, `codeBlock`, `anatomy` |
| Titles, HUD | `titleCard`, `heading`, `caption`, `sectionTag`, `sourceFooter`, `journeyRail` |
| Icons | `icon` (22 kinds) |
| Screens | `editor`, `terminal`, `diffView` |
| Devices | `browser`, `phone`, `appScreen`, `prPage`, `cursor` |
| Numbers | `counter`, `progress`, `gauge`, `chart`, `dotGrid` |
| Annotate | `kineticText`, `callout`, `stamp`, `bubble`, `chip`, `scribble` |
| Movement | `packets`, `particles`, `burst`, `parallax`, `spotlight`, `splitScreen` |
| Systems | `pipeline`, `gitGraph`, `machine`, `fleet`, `layers` |
| Wrappers | `animate`, `enter`, `exit`, `reveal` |
| Motion | `pulse`, `shake`, `highlight`, `travelDot`, `morph`, `expand`, `squeeze`; `s.camera` |

## Presets

`preset list`, `preset new <name> [--from sketch|hologram|poster]`, `preset check <name>`, `preset use <dir> <name>`, `preset promote <name>` (maintainers). A preset changes only the look. Contract, renderers and workflow: [references/presets.md](references/presets.md).

## Hard rules

- `render(t)` is pure. Every value derives from the scene-local time `t`; the engine replaces `Date.now`, `performance.now` and `Math.random` with frame-driven versions, and `check` renders frames twice to prove it.
- On-screen text never starts with the Spanish opening marks (the characters that open a question or an exclamation). Close with `?` or `!` only. `check` fails on them.
- Colors are palette tokens (`ink`, `dim`, `accent`, `accent2`, `good`, `warn`, `bad`, `panel`, `onPanel`, `onAccent`, syntax tokens), never hex values, so one scene file works in every preset.
- Never branch on the preset name. Size text from `s.style.defaults`, never a fixed small pixel count.
- Text is written in the language of the user's request. Every scene that states a fact carries `s.sourceFooter` naming the document it came from.
- Use `s.heading({ text })` and leave `area` out: pieces default to the content area `s.area` (1760x636), and layouts grow to fill it. HUD items (heading, tag, caption, footer, rail) are never moved by the camera.
- A camera `focus` fits the target into the content area: do not zoom past it, and keep the target clear of the HUD.

## References

- [references/pieces.md](references/pieces.md): every piece, options, defaults, a runnable call.
- [references/scene-api.md](references/scene-api.md): scene file, kit, transitions, camera, layout, raw, QA report.
- [references/presets.md](references/presets.md): the three presets, the contract, the user workflow.
- [references/direction.md](references/direction.md): the visual rules, with numbers.
- `examples/gallery.scene.js` (every family in 7 scenes) and `examples/pieces/*.scene.js` (one runnable scene per family): copy from them.

## With nobody at the keyboard

Do not ask about preset or length: choose by the topic (technical or process content `hologram`, a concept for newcomers `sketch`, a broad product audience `poster`, 45 to 75 s), say which you chose in the report, and deliver.
