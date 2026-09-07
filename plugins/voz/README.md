# voz

Speaks a short spoken summary at the end of every reply, **without changing the reply itself**.

You keep working exactly as you do now: you type (or dictate), the agent answers in
full with its tables, code and detail. On top of that, a voice tells you the outcome
in two or three sentences, so you can act without reading the whole thing first.

Nothing listens. There is no microphone, no wake word, no conversation loop. This is
output only.

## Install

```
/plugin marketplace add upex-galaxy/agentic-user-skills
/plugin install voz@upex-agentic
```

Then, in any session you want it:

```
/voz:voz on
```

It takes effect on your **next** message. Turn it off with `/voz:voz off`.

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

**ElevenLabs (optional, cloud, paid).** Set the provider and your key in
`/plugin` → voz → Configure. Falls back to Kokoro automatically if the key is missing
or the request fails, so you are never left mute.

Check everything with:

```
/voz:voz doctor
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

**It fails silent, always.** No sentinel, no marked line, no speech endpoint, a dead
provider: every one of those paths exits 0 without a word. A voice problem can never
interrupt your work.

## Pronunciation

Small speech models butcher English technical terms inside other languages. "Supabase"
comes out as a Spanish word, "n8n" as noise.

`config/pronunciation.txt` ships 50 rules that rewrite the text before it reaches the
engine. It is a plain text layer, so it works with any provider.

The base map is tuned for **Spanish speech reading English terms**. Add your own rules,
or rules for another language, in a `pronunciation.txt` inside the plugin's data
directory (`/voz:voz doctor` prints the exact path). Yours are applied last, win on
conflict, and survive plugin updates.

```
middleware      mídelwer
Supabase        Supabéis
n8n             ene ocho ene
```

## Settings

All configurable from `/plugin` → voz → Configure.

| Setting | Default | What it does |
| --- | --- | --- |
| `PROVIDER` | `kokoro` | `kokoro` or `elevenlabs` |
| `KOKORO_URL` | `http://127.0.0.1:8880` | Where the local engine listens |
| `VOICE` | `af_heart` | Kokoro voice id. `ef_dora` / `em_alex` for Spanish |
| `SPEED` | `1.0` | Below 1 is slower |
| `ELEVENLABS_API_KEY` | — | Stored in secure storage |
| `ELEVENLABS_VOICE_ID` | — | Required when the provider is elevenlabs |

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
