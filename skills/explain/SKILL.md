---
name: explain
description: "Animated explainer video (MP4 plus an HTML preview, optional sound effects and voice-over) from a topic, a PR or a document. Use when the user wants something animated: a video, an animation, an animated explainer or diagram, \"explicame X en un video\". Not for plain text explanations, not for breaking down automated tests (test-automation explain mode), not for slides or a static diagram."
license: MIT
compatibility: [claude-code, opencode, cursor, codex]
allowed-tools: Bash(bun:*), Bash(command:*), Bash(ffprobe:*), Bash(ffmpeg:*), Bash(gh:*)
complementary_categories: [meta-skill]
metadata:
  author: UPEX Galaxy
---

# explain: an animated explainer video from a scene file

You write one `scene.js`; the bundled CLI turns it into a self-contained `index.html` (a player) and a 1920x1080, 30 fps, H.264 MP4. A QA gate checks the layout before anything is delivered. Everything lands under `~/explainers/<yyyy-mm-dd>-<slug>/` (override with `EXPLAIN_HOME`), never the cwd.

## Read this first

Open only the reference the step needs:

| You need | Open |
|---|---|
| A starting scene to copy | `examples/skill.scene.js` (explain a skill), `examples/gallery.scene.js` (every family), `examples/pieces/<family>.scene.js` |
| A piece's options and a runnable call | [references/pieces.md](references/pieces.md), searched by piece name |
| Where to place things without typing coordinates | [references/direction.md](references/direction.md), "Layout recipes" |
| Rhythm, hierarchy, text and source rules | [references/direction.md](references/direction.md) |
| Camera, transitions, layouts, raw drawing, QA error types | [references/scene-api.md](references/scene-api.md) |
| Choosing or making a preset | [references/presets.md](references/presets.md) |
| Writing the narration of a narrated video: pace, register, holds, reveals on cues | [references/narration.md](references/narration.md) |
| Sound effects or voice-over: `say`, Kokoro, ElevenLabs, levels, audio QA | [references/audio.md](references/audio.md) |

## Setup (first run)

Nothing to install. Needs Bun and a Chrome or Chromium. The search order is: `EXPLAIN_CHROME=<binary>` (an error when it does not exist), system Chrome, the newest Playwright browser (Chrome for Testing or Chromium under `PLAYWRIGHT_BROWSERS_PATH`, `~/Library/Caches/ms-playwright` or `~/.cache/ms-playwright`), `google-chrome` or `chromium` on PATH, and last the Playwright headless shell, which can run `check`, `stills` and `sheet` but not `export` (it writes full-range video). `ffprobe` is optional: when present, `export` verifies the MP4. `ffmpeg` is needed only for `--from-mp4`. All commands run as `bun <skill-dir>/cli/index.ts <command>`; `--help` lists them.

Sound effects and voice-over are optional and off by default; tell the user they exist (see Preferences). Effects need nothing. A voice comes from **Kokoro** (local and free: `voice doctor` says whether it is installed) or **ElevenLabs** through an ElevenLabs MCP in your harness, never an API key. Details: [references/audio.md](references/audio.md).

## Preferences

Resolve preset, length, sound and voice in this order, before step 2:

1. **The request.** "con voz de ElevenLabs", "sin sonido", "en sketch": pass it as flags and ask nothing about it.
2. **A person at the keyboard** (an interactive session nobody else launched): ask once, in one call of your harness's question tool, only what step 1 left open:
   - The preset: hologram, sketch, poster, user presets.
   - The length: short 30-45 s, standard 45-75 s, long 75-90 s; with a voice also lesson, 2-5 min.
   - Sound effects: off, on.
   - The voice: none; Kokoro, with its status from `voice doctor`; ElevenLabs, at about 2 credits per character, roughly 900 characters per minute of narration.
   
   Mark as recommended what step 3 or 4 would pick, and keep the answers for the session.
3. **Stored preferences**: project instruction files, user instruction files, your memory (an "explain preferences" entry), then `EXPLAIN_PRESET`, `EXPLAIN_SOUND`, `EXPLAIN_VOICE`, `EXPLAIN_VOICE_ID`. Turn what you find into flags; the CLI reads the env vars itself too.
4. **Defaults**: `hologram`, standard length, no sound, no voice.

Save the result in the folder with `new --preset ...` and `audio use <dir> --sound on --voice kokoro|elevenlabs [--voice-id <id>]`.

## Loop

1. **Understand and source the topic.** Read the material the video must be true to: the docs page, the document, or for a PR its diff (`gh pr diff`) and description. Note the exact source of every fact.
2. **Storyboard 5 to 9 scenes**, one idea each, 6 to 12 s per scene (45 to 90 s in total). Per scene write: the one thing to show, the hero, the piece that fits it, the source. **With a voice, write the narration first**: every scene's `say` beats as spoken teaching, before any `build(s)`, following [references/narration.md](references/narration.md) (about 150 words per minute, the voice covering at least half of each scene, a lesson of 6 to 12 scenes of 12 to 40 s). The scenes are then built around the beats. Pick a preset ([references/presets.md](references/presets.md)): `sketch` friendly and explanatory (light paper), `hologram` technical (dark), `poster` bold violet for broad audiences, or a user preset from `preset list`.
3. **`new <slug> --preset <name>`** creates `scene.js` from a template and prints its path.
4. **Write `scene.js`** from the arsenal below. With a voice, paste in the narration from step 2, run `voice plan <dir>` and fix every scene its `Script:` block marks `THIN` before generating; then place each visual on its beat (`s.cue('<key>').at`, `s.voice[i].at`) and give a big reveal a beat `hold` so it settles before the voice goes on: [references/narration.md](references/narration.md), [references/audio.md](references/audio.md). File shape, layouts, camera, transitions, raw escape hatch, QA types: [references/scene-api.md](references/scene-api.md). Composition rules: [references/direction.md](references/direction.md); read it before the first scene.
5. **With a voice, make the clips first.**
   - Kokoro: `voice kokoro <dir>` starts the server, synthesizes, caches and always stops it. Run it in a subagent when your harness has one.
   - ElevenLabs: `voice plan <dir>` lists the missing lines. Generate each with the ElevenLabs MCP, save one take at its target path, then go on.
   
   Builds never synthesize: a missing line fails with the command to run. **`build <dir>`, then `check <dir>`** until it exits 0 with no errors. Each error names the scene, the element id and the time; fix the scene, not the gate. Warnings (`composition-balance`, `widow`) do not block the export; resolve each by rebalancing, or keep it and justify it in the delivery message, scene by scene.
6. **`stills <dir>`** writes PNGs named `NN-<scene>@<seconds>.png` to `<dir>/stills/` (2 per scene; `--scene <name>` gives 4 of one scene). Aim at a moment with `--at scene:t`, for example `--at ci:3.5,git:5.2` (scene-local seconds; plain numbers are global). Then **`sheet <dir>`** writes one contact sheet `<dir>/sheet.png` without ffmpeg, each frame at a scene's settled time (after its last caption or typing finishes). Look at every still and the sheet: QA cannot see a wrong arrow, a hidden hero or an unreadable scene. Fix and re-run steps 5 and 6.
7. **`export <dir>`** checks for about 1 GB of free disk, runs the gate again and writes `<dir>/<slug>.mp4`. Bitrate: `--bitrate <Mbps>`, else the preset's (`sketch` 4 Mbps, the others 2), else 2. `stills <dir> --from-mp4` reviews the encoded frames.
8. **Deliver** the MP4 path and the `index.html` path (the preview has play, scrub, sound and export in the video's language), plus one line per warning you kept and why. Add the audio line: with sound or voice off, `Sound effects and voice were off. Add --sound on and --voice kokoro|elevenlabs, or set EXPLAIN_SOUND / EXPLAIN_VOICE.`; with them on, the provider, the voice and the ElevenLabs characters generated. Offer to publish the HTML as a claude.ai Artifact: it is self-contained and works offline. The MP4 is transient: offer to upload it to Loom or a storage, then run `prune <dir> --yes` (`--all` for every explainer folder; without `--yes` it only lists). `export <dir>` rebuilds it from `scene.js` and the voice cache.

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
- Text is written in the language of the user's request. Every scene that states a fact carries `s.sourceFooter` naming the document it came from; illustrative content says `(ejemplo ilustrativo)` in that footer.
- Spanish on screen is neutral and uses tú, never voseo ("Pruébalo", not "Probalo"); labels are infinitives or short noun phrases ("Leer el cambio", "Riesgos honestos").
- Use `s.heading({ text })` and leave `area` out: pieces default to the content area `s.area` (1760x636), and layouts grow to fill it. HUD items (heading, tag, caption, footer, rail) are never moved by the camera.
- A camera `focus` fits the target into the content area: do not zoom past it, and keep the target clear of the HUD.

## References

- [references/pieces.md](references/pieces.md): every piece, options, defaults, a runnable call.
- [references/scene-api.md](references/scene-api.md): scene file, kit, transitions, camera, layout, raw, QA report.
- [references/presets.md](references/presets.md): the three presets, the contract, the user workflow.
- [references/direction.md](references/direction.md): the visual rules, with numbers.
- [references/narration.md](references/narration.md): writing the narration first, pace, spoken register, holds and reveals on cues.
- [references/audio.md](references/audio.md): sound effects, voice-over (`say`, Kokoro, ElevenLabs through an MCP), levels, audio QA.
- `examples/narrated.scene.js`: a 3-scene narrated video with `say` beats, `s.voice` and `s.sfx`.
- `examples/skill.scene.js` (explain a skill, built from the layout recipes), `examples/gallery.scene.js` (every family in 7 scenes) and `examples/pieces/*.scene.js` (one runnable scene per family): copy from them.

## With nobody at the keyboard

A fleet worker, a subagent, a scheduled routine or a non-interactive run (`claude -p`, `codex exec`) skips step 2 of Preferences. Use the request, then stored preferences, then the defaults (`hologram`, 45 to 75 s, no sound, no voice). Say what you chose in the report, and deliver.

- **ElevenLabs asked for but no ElevenLabs MCP in your tools:** use Kokoro if `voice doctor` says it is installed, else no voice, and say so.
- **Kokoro not installed:** installing downloads about 2 GB, so never install unasked. A worker asks its conductor; with nobody to ask, export with `--voice none` and report what was missing.
- **A voice command fails:** export with `--voice none` and put its error line in the report.
