# content-teardown gotchas

One line per trap already paid for. Criteria for adding one: see "Gotchas: read and feed" in `SKILL.md`.

- 2026-11-14 · YouTube answers 429 when captions are requested with a wildcard (`en.*`) -> it pulls ~14 translated tracks -> use exact languages (`en-orig,es-orig,en,es`, the default) and `--sleep-subtitles 2`.
- 2026-11-14 · After a 429 the audio formats give 403 for a while -> a rate limit of its own -> wait ~1 min and retry.
- 2026-11-14 · A `yt-dlp` older than 90 days gives 403 on YouTube -> old version -> `brew upgrade yt-dlp`.
- 2026-11-14 · With `--skip-download`, `yt-dlp` leaves subtitles as `.vtt` even when `srt` is requested -> the script converts them with ffmpeg.
- 2026-11-14 · Automatic subtitles repeat themselves (each cue carries the tail of the previous one) -> the script strips the word overlap between cues.
- 2026-11-14 · An image page (for example Wikimedia) makes `yt-dlp` "succeed" with no duration -> it is detected by `duration=NA` plus an image extension, and goes through `gallery-dl`.
- 2026-11-15 · Instagram carousel: `yt-dlp` says "No video formats found" and `gallery-dl` redirects to login; the public embed gives only slide 1 plus the caption -> use the dedicated, logged-in profile through `playwright-cli` (default `~/.content-teardown/.sessions/instagram`).
- 2026-11-15 · `--cookies-from-browser chrome` opens the keychain dialog ("Chrome Safe Storage") -> that key is shared by every Chrome profile on the Mac -> leave it unused; Chrome itself (through playwright) decrypts its own cookies with no dialog.
- 2026-11-15 · `playwright-cli` ties a session to the working directory -> the script launches all its calls with the same `cwd`.
