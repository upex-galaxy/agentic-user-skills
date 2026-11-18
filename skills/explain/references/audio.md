# Audio: sound effects and voice-over

Both are optional and off by default. The video is silent unless a build turns sound on, picks a voice provider, or both. Everything here runs with Bun and Chrome: the mix and the MP4's audio track are made in the page, without ffmpeg.

## Settings and where they come from

| Setting | Values | Flag | explain.json | Env var | Default |
|---|---|---|---|---|---|
| Sound effects | `on`, `off` | `--sound` | `sound` | `EXPLAIN_SOUND` | `off` |
| Voice provider | `none`, `kokoro`, `elevenlabs` | `--voice` | `voice.provider` | `EXPLAIN_VOICE` | `none` |
| Voice id | Kokoro voice name or ElevenLabs voice id | `--voice-id` | `voice.id` | `EXPLAIN_VOICE_ID` | Kokoro `ef_dora` (Spanish), `af_heart` (others); ElevenLabs has no default |
| ElevenLabs model | a model id | `--voice-model` | `voice.model` | `EXPLAIN_ELEVENLABS_MODEL` | `eleven_flash_v2_5`, the cheapest speech model |
| Preset | a preset name | `--preset` | `preset` | `EXPLAIN_PRESET` | `hologram` |

- **Precedence on every build:** the flag, then `explain.json`, then the env var, then the default. For the preset, the scene file's `export const preset` sits between `explain.json` and `EXPLAIN_PRESET`.
- `explain.json`'s `voice.id` and `voice.model` apply only when its `voice.provider` is the provider in use.
- `audio use <dir> --sound on --voice kokoro [--voice-id <id>] [--voice-model <model>]` saves the choice in `explain.json`. A one-off flag never rewrites it.
- `new` writes only what a flag or an env var chose. It never pins a default, so a later `EXPLAIN_*` still applies.
- The language of the voice is the spec's `lang`, else it is detected from the title and the spoken lines. Set `lang` when the video has a voice: it picks Kokoro's default voice, and one accented word in an English script would otherwise pick the Spanish one.
- `audio use --voice elevenlabs` also records the model, the default one included. The model is part of every line's cache key, so a later change of `EXPLAIN_ELEVENLABS_MODEL` does not regenerate a saved video.

## Narration: `say` on a scene

```js
scene({
  name: 'ci',
  dur: 8,
  say: 'El pipeline corre en cada push.',                 // one cue
  // or beats:
  // say: [
  //   { text: 'Primero corren los tests.', at: 0.6, key: 'tests' }, // `at`: scene-local start; `key`: s.cue('tests')
  //   { text: 'Si fallan, el merge se bloquea.', hold: 1 },          // no `at`: 0.25 s after the previous clip (+ its hold)
  //   { text: 'Supabase guarda el resultado.', spoken: 'Supabéis guarda el resultado.' },
  // ],
  build(s) {
    s.terminal({ id: 'term', at: s.voice[0].at, steps: [/* ... */] });
    s.stamp({ text: 'BLOCKED', cx: 960, cy: 820, at: s.voice[1].end - 0.3 });
  },
}),
```

- `say` lives on the scene, outside `build`. The CLI reads every line in Bun without a browser, and `build(s)` gets `s.voice`: `[{ at, end, text }]` in scene-local seconds. Place the visuals on the voice; the voice never waits on a piece.
- The first cue starts at `max(0.3, trIn + 0.1)`, where `trIn` is the incoming transition. Each next cue starts 0.25 s after the previous clip ends, plus that beat's `hold`.
- **`hold`** (0 to 2.5 s) is silence after a beat's clip so the picture settles before the voice goes on; on the last beat it lengthens the scene's tail. **`key`** names a beat: `s.cue('tests')` returns its `{ at, end, text, key }` (an unknown key throws and lists the keys). Neither field reaches the voice, so neither changes a line's cache key.
- With a voice, a clip lasts its real length. Without one, it is estimated at 15 characters per second, so a scene chained to `s.voice` still lays out sensibly when the video is silent.
- **The scene stretches; the voice is never cut or sped up.** With a voice, a scene's duration becomes `max(dur, last clip end + its hold + 0.5 + the outgoing transition)`. Only the settled hold after the last animation grows; authored times do not move. `fit: false` keeps `dur`, and the QA gate then fails a clip that leaves the window.
- `spoken` replaces the text sent to the voice for that cue. Use it for words the voice misreads.
- `~/.explain/pronunciation.txt` (or `EXPLAIN_PRONUNCIATION`) holds one rule per line: `pattern<two spaces or a tab>replacement`. Matching is case-insensitive and on whole words, longest pattern first.
- Write narration as speech, first, before the scenes: [narration.md](narration.md) has the pace (about 150 words per minute), the register and the checklist. With a voice the script sets the length: a lesson runs 2 to 5 minutes.

## Voice providers

Builds never synthesize speech. They read the cache (`~/.explain/voice/<hash>.wav`, or `EXPLAIN_VOICE_DIR`) and fail with the exact next command when a line is missing. A line's hash covers the provider, model, voice, speed and spoken text, so an unchanged line is never generated twice, a line said twice is generated once, and editing one line regenerates only that one. Each clip is a 24 kHz mono WAV with a `.json` sidecar.

### Kokoro (local, free)

- **`voice kokoro <dir>`** starts the installed Kokoro server, synthesizes every missing line, caches them, and stops the server in a `finally`, even on failure or Ctrl-C. A server already answering at `EXPLAIN_KOKORO_URL` (default `http://127.0.0.1:8880`) is used and left running.
- It starts `~/.voicemode/services/kokoro` directly (`EXPLAIN_KOKORO_DIR` overrides the folder), skipping VoiceMode's start script, which reinstalls packages on every start. Measured on an Apple Silicon Mac: healthy in 12 s, about 3 s per line, stopped in 0.2 s, about 950 MB of memory while it runs. Its log goes to `~/.explain/voice/kokoro.log`.
- **Not installed?** `voice doctor` says so. Installing is `uvx voice-mode-install --yes`, then `voicemode service install kokoro`. That downloads about 2 GB, so it is never done unasked (see SKILL.md).
- Kokoro has two Spanish voices, `ef_dora` and `em_alex`, and mispronounces some English terms. Fix those with `spoken` or the pronunciation file.

### ElevenLabs (through an MCP, never an API key)

The CLI reads no ElevenLabs key and calls no ElevenLabs endpoint. The agent generates each line with the ElevenLabs MCP its harness has. For example, the claude.ai ElevenLabs connector: `creative_list_voices`, `creative_generate_speech`, `creative_get_flow_run_status`.

1. **Pick a voice.** Ask the MCP for voices in the video's language (`creative_list_voices` with `languages`). Then save the id: `audio use <dir> --voice elevenlabs --voice-id <id>`.
2. **`voice plan <dir>`** first prints a `Script:` block: per narrated scene, its words and estimated speech against the authored `dur`, `THIN` under half (fix those before paying for a line). Then it lists every line missing from the cache. For each line it gives the exact text to send, the voice, the model, the character count and the target path (`~/.explain/voice/<hash>.mp3`), plus the estimated credits.
3. **For each listed line:**
   - Call `creative_generate_speech` with exactly that text, voice and model (`eleven_flash_v2_5` unless the user asked for a professional one; record the model with `audio use --voice-model`).
   - Poll `creative_get_flow_run_status` until it completes.
   - The connector makes two takes by default: pick one, download its audio URL to the target path, and keep it.
   - Never repeat a generation call to retry: each call is charged.
   - To replace a bad take, save the new MP3 over the old one. The next build ingests it again, because the newer file wins.
4. **Run any build command** (`build`, `check`, `export`) with the same voice settings. It ingests each saved MP3 by its hash (decoded in headless Chrome to a 24 kHz WAV; the MP3 stays next to it) and builds.

Cost, measured through the claude.ai connector: `eleven_flash_v2_5` charged 31 credits for one 31-character take, so a two-take line costs about 2 credits per character. A minute of narration is about 900 characters. Its model guide says `eleven_v3` and `eleven_v4` cost twice as much as flash.

## Sound effects

Effects come from the engine, not from the scene author:

| Event | Sound |
|---|---|
| A scene transition starts | `whoosh`, `glitch` for `glitch`, `riser` for `zoom-through` |
| `stamp` lands | `stamp` |
| `counter` runs, then lands | `tick` (about 3 per second), then `ding` |
| `kineticText` in `slam` or `drop` mode | `hit` per word |
| `titleCard` appears | `swell` |
| `burst`; `particles` in `burst` or `confetti` mode | `sparkle` |
| `packets` with `ping: true` arrive | `blip` |
| `prPage` merges; a `pipeline` job fails | `success`; `fail` |

- Plain appearances (`node`, `edge`, `label`, layouts) are silent. A piece opts in with `sound: true` (a `pop`) or `sound: '<kind>'`, and any piece mutes itself with `sound: false`.
- `s.sfx({ kind, at, gain, pan })` adds one effect by hand. The kinds are `pop`, `tick`, `blip`, `sparkle`, `hit`, `stamp`, `ding`, `whoosh`, `glitch`, `riser`, `swell`, `success` and `fail`.
- Effects of one kind within 120 ms merge. At most 3 effects per second and 12 per scene play, and the first kinds in that list drop first. The pan follows the piece's position on screen.
- Each preset gives the effects its own character through an optional `sound` block (see [presets.md](presets.md)): `sketch` wood and paper, `hologram` digital blips and sweeps, `poster` bouncy pops and claps.

## Mix, preview and export

- **One mix per page.** It is computed in plain JS at 48 kHz stereo and is bit-exact on every run. The preview, the QA gate and the export use the same samples.
- **Levels with a voice:** the voice is normalized to -16 LUFS, effects sit 12 dB under it and duck a further 8 dB while it speaks, and the whole mix is brought to -14 LUFS. A limiter keeps peaks at or below -2 dBFS.
- **Levels with effects only:** the loudest effect peaks at -6 dBFS.
- **Preview:** a page with audio shows a sound button, off by default. Browsers only play audio after a click, so someone who opens the page hears nothing until they press it. While it plays, the picture follows the audio clock, and scrubbing is silent.
- **Export:** the MP4 gets an AAC track at 48 kHz stereo (Opus when Chrome has no AAC encoder; QuickTime may not play Opus in MP4). `export` prints one `audio:` line and verifies the audio stream with ffprobe. A silent video has no audio track.
- **Page size:** each second of narration adds about 64 KB to `index.html`. The build warns above 12 MB; a claude.ai Artifact holds 16 MB.

## QA

The audio checks run with the rest of `check` when sound or a voice is on.

| Type | Kind | Rule |
|---|---|---|
| `narration-overlap` | error | two clips of a scene overlap |
| `narration-window` | error | a clip starts before the incoming transition ends or overruns into the outgoing one (only with `fit: false` or a late `at`) |
| `voice-missing` | error | a cue has no clip |
| `voice-suspect` | error | a clip is too short or too long for its text, or nearly silent: a broken take |
| `audio-clipping` | error | the mix peaks above -1 dBFS |
| `audio-nondeterministic` | error | two mixes of the same input differ |
| `loudness` | warning | with a voice, the mix is outside -14 ± 1 LUFS; with effects only, a 400 ms block is above -12 LUFS |
| `silent-gap` | warning | in a narrated video, more than 3 s without voice between cues, or a scene with no `say` |
| `narration-sparse` | warning | a narrated scene's clips cover under half of its duration: the voice explains too little of what is on screen |
| `sfx-density` | warning | more than 3 effects in a second or 12 in a scene |
| `cue-after-end` | warning | an effect after its scene ends |

## Commands

- `voice doctor` reports whether Kokoro is installed or running, the ElevenLabs route, the cache size and ffprobe.
- `voice <dir>` shows each line as cached or missing.
- `voice plan <dir>` and `voice kokoro <dir>` are covered above.
- `audio use <dir> ...` saves the settings.
- `--sound`, `--voice`, `--voice-id` and `--voice-model` work on `build`, `check`, `stills`, `sheet`, `export` and `preview`.
