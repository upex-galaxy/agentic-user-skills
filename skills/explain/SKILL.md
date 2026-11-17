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

Nothing to install. Needs Bun and a Chrome or Chromium. The search order is: `EXPLAIN_CHROME=<binary>` (an error when it does not exist), system Chrome, the newest Playwright browser (Chrome for Testing or Chromium under `PLAYWRIGHT_BROWSERS_PATH`, `~/Library/Caches/ms-playwright` or `~/.cache/ms-playwright`), `google-chrome` or `chromium` on PATH, and last the Playwright headless shell, which can run `check` and `stills` but not `export` (it writes full-range video). `ffprobe` is optional: when present, `export` verifies the MP4. `ffmpeg` is needed only for `stills --from-mp4`. All commands run as `bun <skill-dir>/cli/index.ts <command>`; `--help` lists them.

## Loop

1. **Understand and source the topic.** Read the material the video must be true to: the docs page, the document, or for a PR its diff (`gh pr diff`) and description. Note the exact source of every fact.
2. **Storyboard 5 to 9 scenes**, one idea each, 6 to 12 s per scene (45 to 90 s in total). Per scene write: the one thing to show, the hero element, the piece that fits it, the source. Pick a style: `hologram` for technical and dark, `sketch` for friendly and explanatory ([references/styles.md](references/styles.md)).
3. **`new <slug> --style <style>`** creates `scene.js` from a template and prints its path.
4. **Write `scene.js`.** Compose pieces ([references/pieces.md](references/pieces.md)); use `s.raw(fn)` only when no piece fits. File shape, layout, camera and transitions: [references/scene-api.md](references/scene-api.md). Composition rules: [references/direction.md](references/direction.md); read it before the first scene.
5. **`build <dir>`, then `check <dir>`** until it exits 0 with no errors. Each error names the scene, the element id and the time; fix the scene, not the gate. Warnings (an empty half of the frame, small or off-center content) do not block the export, because balance is a heuristic and a deliberate composition can trip it. They are still real findings: resolve every one by rebalancing, or keep it and justify it in the delivery message, scene by scene.
6. **`stills <dir>`** writes PNGs to `<dir>/stills/` (2 per scene, or `--at 1,5.5,9` in global seconds), replacing the ones from the previous run. Look at every still. QA cannot see a wrong arrow, a hidden hero or an unreadable scene; you can. Fix and re-run steps 5 and 6.
7. **`export <dir>`** runs the gate again, writes `<dir>/<slug>.mp4` and prints its path, duration and size. The default bitrate is 2 Mbps (H.264, 1080p30): about 15 MB per minute in `hologram` (its glow and grid are costly to encode) and about 5 MB per minute in `sketch`. 2 Mbps measured SSIM 0.994 against 5 Mbps on hologram with no visible damage. For a smaller file pass `--bitrate <Mbps>` (for example `--bitrate 1`) and look at the result. After the export, `stills <dir> --from-mp4` cuts the same frames from the MP4 with ffmpeg into `<dir>/stills/mp4/`, so encoder damage can be reviewed too.
8. **Deliver** the MP4 path and the `index.html` path (the preview has a play, scrub and export UI in the video's language), plus one line per `composition-balance` warning you kept and why. Offer to publish the HTML as a claude.ai Artifact: it is self-contained and works offline.

`preview <dir>` opens the page in the browser; `build` rebuilds the page and `check`, `stills`, `export` rebuild it when the scene, the style or the engine changed (the page carries a content hash). A target is an explainer folder or a scene file; a scene file not named `scene.js` (such as `examples/pr.scene.js`) builds into its own folder `~/explainers/<yyyy-mm-dd>-<name>/`, and nothing is ever written inside the skill folder. The style comes from `--style`, else `explain.json`, else `export const style = 'sketch'` in the scene file, else `hologram`.

## Hard rules

- `render(t)` is pure. Every value derives from the scene-local time `t`; the engine replaces `Date.now`, `performance.now` and `Math.random` with frame-driven versions, and `check` renders frames twice to prove it.
- On-screen text never starts with the Spanish opening marks (the characters that open a question or an exclamation). Close with `?` or `!` only. `check` fails on them.
- Text is written in the language of the user's request (Spanish request, Spanish video). The `sourceFooter` prefix follows the scene's language ("Fuente: " for Spanish, "Source: " otherwise); set `lang` on the video spec to force it ([references/pieces.md](references/pieces.md), `sourceFooter`).
- Every scene that states a fact carries `s.sourceFooter` naming the document it came from.
- Colors are style tokens (`ink`, `dim`, `accent`, `accent2`, `good`, `warn`, `bad`), never hex values, so one scene file works in both styles.
- Use `s.heading({ text })` for the scene heading and leave `area` out: pieces default to the content area between the heading and the caption (`s.area`, 1760x636), and layout pieces center in it and grow to about 80 % of it. The heading, section tag, caption and footer are screen-space HUD: the camera never moves them.

## References

- [references/pieces.md](references/pieces.md): every piece and helper, options and defaults.
- [references/scene-api.md](references/scene-api.md): scene file, kit, transitions, camera, layout and text helpers, raw escape hatch, QA report.
- [references/direction.md](references/direction.md): the visual rules, with numbers.
- [references/styles.md](references/styles.md): the two styles, tokens and fonts.
- `examples/smoke.scene.js` and `examples/pieces/*.scene.js`: one runnable scene per piece family; copy from them.

## With nobody at the keyboard

Do not ask about style or length: choose by the topic (technical or process content takes `hologram`, a concept for newcomers takes `sketch`, 45 to 75 s), say which you chose in the report, and deliver.
