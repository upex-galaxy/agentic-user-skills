# readback

Speaks a short spoken summary at the end of every reply, **without changing the reply itself**.

You keep working exactly as you do now: you type (or dictate), the agent answers in
full with its tables, code and detail. On top of that, a voice tells you the outcome
in two or three sentences, so you can act without reading the whole thing first.

Nothing listens. There is no microphone, no wake word, no conversation loop. This is
output only.

## Install

```
/plugin marketplace add upex-galaxy/agentic-user-skills
/plugin install readback@upex-agentic
```

Then, in any session you want it:

```
/readback:speak on
```

It takes effect on your **next** message. Turn it off with `/readback:speak off`.

The plugin ships its own visual deck, `how-it-works.es.html` and `how-it-works.en.html` (same format as every skill in this repo). It opens in your browser, offline:

```
/readback:speak docs
```

## Requirements

You need a speech endpoint. The plugin ships with no model and downloads nothing.

**Kokoro (default, local, free).** Any OpenAI-compatible `/v1/audio/speech` server on
`http://127.0.0.1:8880`. The simplest way to get one:

```bash
uvx voice-mode-install --yes
voicemode service install kokoro
```

That installs [VoiceMode](https://github.com/mbailey/voicemode), which runs Kokoro as a
background service (~150 MB of RAM, 0% CPU idle). You do not need the rest of VoiceMode.

**ElevenLabs (cloud, paid, best voice).** In `/plugin` -> readback -> Configure, set
`ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` (the ID of the voice, not its name). That is
all: the default `PROVIDER=auto` uses ElevenLabs as soon as both are present. If a request
fails, readback tries Kokoro, then the macOS system voice, so you are never left mute, and
the next reply tells you why it failed. Voice Library voices need a paid ElevenLabs plan.

Check everything with:

```
/readback:speak doctor
```

## Compatibility

| | Status | Notes |
| --- | --- | --- |
| **macOS** | ✅ Tested | Uses `afplay`, ships with the OS |
| **Linux** | ⚠️ Untested | Needs one of `mpg123`, `ffplay`, `paplay`, `aplay` |
| **Windows (Git Bash / WSL)** | ⚠️ Untested | Falls back to `powershell.exe` |

| | Status | Notes |
| --- | --- | --- |
| **Claude Code** | ✅ Tested | `Stop` + `UserPromptSubmit` hooks |
| **Codex CLI** | ⚠️ Not packaged | Its `Stop` hook provides the same `last_assistant_message` field, so `scripts/` should work as-is behind a `.codex/hooks.json`. Not yet verified. |
| **OpenCode** | ❌ Needs a rewrite | Its `session.status` event carries no assistant text; the plugin would have to query the server. Different language too (TypeScript). |

Runtime dependencies: `bash`, `python3`, `curl` and an audio player. On macOS all four
ship with the system. No npm, no pip, no virtualenv.

## How it works

```
you send a message
   → UserPromptSubmit hook checks the session sentinel
     → if on, injects the instruction to close with a 🔊 line
   → the agent answers normally, ending with that line
   → Stop hook reads last_assistant_message from its payload
     → extracts the 🔊 line, applies the pronunciation map
     → POSTs to the speech endpoint, plays the audio in the background
```

The `Stop` hook returns control in **under half a second**. Audio generation and
playback happen detached, so nothing blocks your session.

**It never interrupts you.** Every path exits 0. A voice problem is logged and reported on
your next message instead of breaking the session.

## Pronunciation

Small speech models butcher English technical terms inside other languages. "Supabase"
comes out as a Spanish word, "n8n" as noise.

`config/pronunciation.txt` ships 50 rules that rewrite the text before it reaches the
engine. It is a plain text layer, so it works with any provider.

The base map is tuned for **Spanish speech reading English terms**. Add your own rules,
or rules for another language, in a `pronunciation.txt` inside the plugin's data
directory (`/readback:speak doctor` prints the exact path). Yours are applied last, win on
conflict, and survive plugin updates.

```
middleware      mídelwer
Supabase        Supabéis
n8n             ene ocho ene
```

## Settings

All configurable from `/plugin` -> readback -> Configure.

| Setting | Default | What it does |
| --- | --- | --- |
| `PROVIDER` | `auto` | `auto` = ElevenLabs, then Kokoro, then the system voice. Or force `elevenlabs`, `kokoro`, `say` |
| `ELEVENLABS_API_KEY` | (none) | Stored in secure storage |
| `ELEVENLABS_VOICE_ID` | (none) | Required for ElevenLabs |
| `PERSONA` | `companion` | `companion`, `sarcastic`, `serious` or `professional` |
| `ELEVENLABS_MODEL` | `eleven_flash_v2_5` | Fast and cheap. `eleven_v4` is more expressive (about double the price) and enables expression tags |
| `LANGUAGE` | (auto) | `es` or `en`. Improves pronunciation and picks the backup system voice |
| `VOLUME` | `1.5` | Playback gain. Raise it if music drowns the voice |
| `SHOW_USAGE` | `on` | One-line ElevenLabs credit footer after each reply |
| `SPEED` | `1.0` | Below 1 is slower (not available on v3/v4) |
| `VOICE`, `KOKORO_URL` | | Local Kokoro engine, advanced |

## Personalities

`PERSONA` changes two things: how the agent writes the spoken line, and the voice
stability sent to ElevenLabs (lower is more expressive).

| Persona | Sounds like | Stability |
| --- | --- | --- |
| `companion` | Warm teammate, a little humor | 0.45 |
| `sarcastic` | Dry and playful, one joke per line, facts always exact | 0.35 |
| `serious` | Calm, short declarative sentences, no jokes | 0.70 |
| `professional` | Clear status update, neutral warmth | 0.65 |

The writing rules live in `config/voice-style.txt` (shared, adapted from the humanizer
skill: outcome first, mixed sentence length, no filler, no closing offers) and
`config/personas/<name>.txt`. With a v3 or v4 model the agent may also add one
expression tag such as `[sarcastic]`; on other models tags are stripped before sending.

## Loudness

ElevenLabs has no volume parameter, so readback levels the audio itself: `ffmpeg`
`loudnorm` when `ffmpeg` is installed (set `NORMALIZE=off` in the environment to skip),
then plays it at `VOLUME` through `afplay -v`.

## Credit footer

After each reply the Stop hook can show a user-only line such as
`readback · ElevenLabs 3,420 / 10,000 chars (34%) · resets Dec 03`. It is a hook
`systemMessage`: the model never sees it. The real numbers come from
`GET /v1/user/subscription`; if the key has no permission to read the account, the footer
falls back to what readback itself spent this month. It is built from a cache, so it
trails by one reply at most. Hide it with `SHOW_USAGE=off`.

## When it stays silent

Every failure is written to `readback.log` in the plugin data folder (never the text, never
the key), and a short notice reaches you on your next message. The ElevenLabs error body is
kept in `elevenlabs-last-error.json`.

## Multiple sessions

Each session decides on its own; the sentinel is per session id. Sessions that never
turn it on are unaffected.

When two sessions speak at once they queue rather than overlap, via a lock in the data
directory. A lock older than five minutes is treated as dead and reclaimed.

## Privacy

The spoken line is the only text that leaves the process, and with the default provider
it goes to `127.0.0.1`. Nothing is recorded, nothing is stored, no microphone is ever
opened. Choosing ElevenLabs sends that line to their API instead; everything else stays
the same.
