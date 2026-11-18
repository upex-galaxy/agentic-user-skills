# Narration: writing the voice of a narrated video

With a voice on, the narration is the spine of the video. The viewer learns from what the voice says, and the picture shows what the voice is talking about. Write the narration first, scene by scene and beat by beat, then build each scene around its beats. The mechanics of `say`, `s.voice`, providers and audio QA are in [audio.md](audio.md); this file is about what to write.

## Order of work

1. **Outline the lesson.** List what the viewer must understand at the end, in the order they need it. One scene per idea.
2. **Write every scene's narration** as beats, before any `build(s)`. Read it aloud once. It should sound like a person teaching a friend at a desk, not like a document being read.
3. **Run `voice plan <dir>`.** Its `Script:` block estimates each narrated scene's speech against its authored `dur` and marks a scene `THIN` under half. Fix every `THIN` scene now: lines cost credits once generated, and a changed line is a new line.
4. **Freeze the spoken text.** Decide how the voice says every term it may misread (English words, acronyms, file names) and write it in `spoken` or the pronunciation file before generating anything.
5. **Generate the clips, then build the scenes on the voice**: each piece enters at `s.cue('<key>').at` or `s.voice[i].at`, never at a guessed second.

## How much to say

- **Pace: about 140 to 160 words per minute in Spanish** (2.3 to 2.7 words per second), about 150 in English. A minute of narration is about 900 characters.
- **Every scene explains itself.** A scene's voice covers at least half of its duration; QA warns `narration-sparse` below that. A scene longer than 10 s never carries a one-liner. Rule of thumb: a 20 s scene wants 45 to 50 words.
- **Length follows the lesson, not a fixed budget.** A teaching video with a voice runs 2 to 5 minutes, 6 to 12 scenes of 12 to 40 s each. A short promo stays at the silent budgets in [direction.md](direction.md).
- **Too much to say for one scene?** Split it in two scenes. Never speed the voice up; the scene stretches to the voice, and the voice is never cut.

## What to say in a scene

- **Explain what is on screen and why it matters.** Name the thing the viewer is looking at, then say what it does or why they should care. The picture shows; the voice explains.
- **Never read the on-screen text word for word.** The heading says "Guías y sensores"; the voice says what a guide is, with an example. Saying the heading aloud wastes the viewer's time.
- **One idea per sentence.** Short sentences, 8 to 18 words. Break a long one in two.
- **Give a concrete fact or example in every scene**: a file name said as words, a number, what happens when a check fails. Abstract claims ("mejora la calidad") teach nothing.
- **Signpost the path.** Open a scene by telling the viewer where they are: "Primero...", "Ahora fíjate en...", "Vamos al segundo paso.", "Esto es lo importante.". Close the video by saying what to do next.
- **Point with the voice where the picture changes.** When a beat says "el linter", that is the moment the linter appears: give that beat a `key` and put the piece at `s.cue(key).at`.

## Spoken register

Built from the `humanizer` rules (load that skill before writing) and adapted to speech:

| Rule | Do | Don't |
|---|---|---|
| Plain words | "usa", "ayuda", "muchos" | "utiliza", "facilita", "numerosos" |
| No AI vocabulary | "importante", "clave" said once | "crucial", "fundamental", "robusto", "potenciar", "en el panorama actual" |
| No forced groups of three | the natural number of items | "rápido, fiable y escalable" by reflex |
| Active voice, a named actor | "El linter rechaza el cambio." | "El cambio es rechazado." |
| Concrete over abstract | "Si un test falla, el agente lo ve y lo corrige." | "Se mejora el ciclo de calidad." |
| No filler or generic closings | "Prueba esto mañana en tu repo." | "El futuro es prometedor." |

Speech-only rules:

- **Talk like a person.** Use "tú", short questions the voice answers ("Y esto, para qué sirve? Para que el agente no repita el error."), and light connectors ("bueno", "o sea", "fíjate") at most once per scene.
- **A light, warm personality.** Speak to one viewer. A small aside or a human reaction is welcome ("esto me pasó a mí la primera vez"), one per scene at most. No jokes that need the picture to land.
- **Rhythm.** Alternate a short sentence with a longer one. A short sentence after an idea lets it land.
- **Numbers and symbols as they are said**: "unas cien líneas", "tres pasos", "agents punto m d" in `spoken`, never `AGENTS.md` sent raw to the voice.
- **No paths or identifiers in the voice.** Say what the thing is ("el archivo de instrucciones del agente") and let the screen show the name.

## Spanish

- **Neutral Spanish with tú**, never voseo: "fíjate", "prueba", "mira"; not "fijate", "probá", "mirá".
- **Never write the opening ¿ or ¡**, in a heading, a caption or a `say` line: on-screen text fails `check` with them, and the voice must sound right without them. A question works when its words make it a question ("Y qué pasa si el test falla?"), not only its marks.
- English terms the audience uses as-is ("harness", "linter", "hook", "pull request") stay in English on screen; check how the voice says each one in the first take and fix it with `spoken` or the pronunciation file.

## Pauses and holds

- **The picture waits for the voice.** With a voice on, a scene lasts as long as its narration plus a short tail ([audio.md](audio.md), "The scene stretches"). Author `dur` close to the estimate from `voice plan`, so the stretch is small and the motion stays spread across the scene.
- **`hold` gives the picture a pause.** A beat's `hold: 1.2` adds 1.2 s of silence after that clip, before the next beat (0 to 2.5 s). Use it after a beat that triggers a big reveal (a diagram drawing, a stamp, a counter) so the viewer sees it settle before the voice goes on, and on the last beat of a scene whose final picture needs a moment.
- **Reveal on the cue, not before.** A piece that appears before the voice names it steals attention; one that appears three seconds after feels late. Start it 0.2 to 0.6 s after its beat's `at`.
- **Keep it moving while the voice explains.** A long beat over a still picture reads as a slide: give it a slow motion (a `travelDot`, `packets`, a `highlight` on the part being named, a gentle camera `focus`).

## Before you generate: checklist

- [ ] Every narrated scene is `ok` in the `voice plan` script block (none `THIN`).
- [ ] No sentence reads the heading or a label aloud.
- [ ] Every scene has a concrete example or fact, and its source in the `sourceFooter`.
- [ ] Every English term, acronym and file name has its `spoken` form.
- [ ] No ¿ or ¡ anywhere; tú forms only.
- [ ] Read aloud: nothing sounds like a document.
