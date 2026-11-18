// Voice-over cache for the explain CLI: the plan of missing narration lines, the ingest of ElevenLabs MP3 takes an
// agent saved through an ElevenLabs MCP (this module never talks to ElevenLabs and reads no key), and a Kokoro server
// that starts, synthesizes and stops inside one call. Clips are 24 kHz mono 16-bit WAVs under ~/.explain/voice.
import type { ChromeHandle } from './chrome.ts';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { decodeWav as decodeWavUntyped, encodeWav as encodeWavUntyped } from '../engine/wav.js';
import { runSession } from './session.ts';

const SAMPLE_RATE = 24000;
// The engine module is untyped JS; give its two functions the types they honour.
const decodeWav = decodeWavUntyped as (bytes: Uint8Array) => { sampleRate: number, channels: Float32Array[] };
const encodeWav = encodeWavUntyped as (channels: Float32Array[], sampleRate: number) => Uint8Array;

export interface VoiceSettings {
  provider: 'kokoro' | 'elevenlabs'
  voiceId: string
  model: string
  speed: number
  lang: string
}

export interface PlanEntry {
  id: string
  scene: string
  text: string
  /** The text actually sent to the voice, after pronunciation rules. */
  spoken: string
  key: string
  chars: number
  cached: boolean
  /** The normalized clip, <voiceDir>/<key>.wav. */
  wav: string
  /** Where a raw take must be saved (ElevenLabs MP3), or null for Kokoro. */
  source: string | null
}

export interface PronunciationRule { pattern: string, replacement: string }

/** The voice cache folder: EXPLAIN_VOICE_DIR, else ~/.explain/voice. */
export const voiceDir = (): string => process.env.EXPLAIN_VOICE_DIR ? resolve(process.env.EXPLAIN_VOICE_DIR) : join(homedir(), '.explain', 'voice');

/** The built-in voice of a provider and language; ElevenLabs has none (the agent picks one from the MCP). */
export function defaultVoiceId(provider: VoiceSettings['provider'], lang: string): string | undefined {
  if (provider === 'elevenlabs') { return undefined; }
  return lang === 'es' ? 'ef_dora' : 'af_heart';
}

/** Read pronunciation rules (`pattern<2+ spaces or a tab>replacement`, `#` comments); a missing file gives []. */
export function loadPronunciation(file = process.env.EXPLAIN_PRONUNCIATION || join(homedir(), '.explain', 'pronunciation.txt')): PronunciationRule[] {
  if (!existsSync(file)) { return []; }
  const rules: PronunciationRule[] = [];
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) { continue; }
    const gap = /\t| {2,}/.exec(line);
    if (!gap) { continue; }
    const pattern = line.slice(0, gap.index).trim();
    const replacement = line.slice(gap.index).trim();
    if (pattern && replacement) { rules.push({ pattern, replacement }); }
  }
  return rules;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replace whole words, case-insensitive, trying the longest pattern first. */
export function applyPronunciation(text: string, rules: PronunciationRule[]): string {
  if (!rules.length) { return text; }
  const sorted = [...rules].sort((a, b) => b.pattern.length - a.pattern.length);
  const map = new Map(sorted.map(r => [r.pattern.toLowerCase(), r.replacement]));
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${sorted.map(r => escapeRe(r.pattern)).join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
  return text.replace(re, m => map.get(m.toLowerCase()) ?? m);
}

/**
 * The cache key of a line: sha256 of the provider, model, voice, speed and spoken text. The language is left out: no
 * provider call receives it (it only picks Kokoro's default voice, which the key already holds), so a detected
 * language that flips never regenerates, or re-bills, a line.
 */
export function cueKey(s: VoiceSettings, spokenText: string): string {
  return createHash('sha256').update(JSON.stringify([s.provider, s.model, s.voiceId, s.speed, spokenText, 'wav24k-v1'])).digest('hex');
}

interface CueLike { id: string, scene: string, text: string, spoken?: string }

/** One entry per narration cue, with its cache key, clip path and (ElevenLabs) the MP3 target path. */
export function planVoice(cues: CueLike[], settings: VoiceSettings, rules: PronunciationRule[] = loadPronunciation()): PlanEntry[] {
  const dir = voiceDir();
  return cues.map((c) => {
    const spoken = applyPronunciation(c.spoken ?? c.text, rules);
    const key = cueKey(settings, spoken);
    const wav = join(dir, `${key}.wav`);
    return {
      id: c.id,
      scene: c.scene,
      text: c.text,
      spoken,
      key,
      chars: spoken.length,
      cached: existsSync(wav),
      wav,
      source: settings.provider === 'elevenlabs' ? join(dir, `${key}.mp3`) : null,
    };
  });
}

// Credits per character per take through the claude.ai ElevenLabs connector: eleven_flash_v2_5 measured 1 (31 credits
// for a 31-character take, 2026-11-18); its model guide says eleven_v3 and eleven_v4 cost twice as much as flash or turbo.
const creditRate = (model: string) => /eleven_v[34]/i.test(model) ? 2 : 1;

/** The text `voice plan` prints: one block per line still to generate, a credits estimate and the agent's steps. */
export function formatPlan(entries: PlanEntry[], settings: VoiceSettings): string {
  // Cues that say the same line share one key, so the agent generates and pays for it once.
  const unique = [...new Map(entries.map(e => [e.key, e])).values()];
  const missing = unique.filter(e => !e.cached);
  const todo = missing.filter(e => !(e.source && existsSync(e.source)));
  const waiting = missing.length - todo.length;
  const out: string[] = [];
  if (!missing.length) { return `Voice plan: all ${unique.length} lines are cached. Nothing to generate.`; }
  out.push(`Voice plan (${settings.provider}): ${todo.length} of ${unique.length} lines to generate, ${unique.length - missing.length} cached.`, '');
  for (const e of todo) {
    out.push(
      `Line ${e.id} (scene "${e.scene}")`,
      `  text:     ${e.spoken}`,
      `  provider: ${settings.provider}`,
      `  voice:    ${settings.voiceId}`,
      `  model:    ${settings.model}`,
      `  chars:    ${e.chars}`,
      `  save to:  ${e.source ?? e.wav}`,
      '',
    );
  }
  if (waiting) { out.push(`${waiting} more line(s) already have an MP3 waiting to be ingested.`, ''); }
  const chars = todo.reduce((n, e) => n + e.chars, 0);
  const rate = creditRate(settings.model);
  out.push(`Missing characters: ${chars}. Estimated credits: about ${Math.round(2 * chars * rate)} (2 takes per line by default x ${rate} credit per character for ${settings.model}).`);
  if (settings.provider === 'elevenlabs') {
    out.push(
      '',
      'Agent steps: generate each line with the ElevenLabs MCP using exactly this voice and model, pick one take, and download it to the "save to" path above.',
      'Then run any build command on this target (build, check, stills or export, with the same voice settings): it ingests the saved files by hash, keeping each MP3.',
    );
  }
  return out.join('\n');
}

const sidecarOf = (wav: string) => wav.replace(/\.wav$/, '.json');

function writeClip(e: PlanEntry, s: VoiceSettings, samples: Float32Array, source: 'mp3' | 'kokoro'): void {
  mkdirSync(voiceDir(), { recursive: true });
  writeFileSync(e.wav, encodeWav([samples], SAMPLE_RATE));
  writeFileSync(sidecarOf(e.wav), `${JSON.stringify({
    provider: s.provider,
    model: s.model,
    voice: s.voiceId,
    speed: s.speed,
    lang: s.lang,
    chars: e.chars,
    seconds: samples.length / SAMPLE_RATE,
    source,
    created: new Date().toISOString(),
  })}\n`);
}

// The page decodes each MP3 at 24 kHz (OfflineAudioContext resamples), downmixes to mono and posts the samples.
const INGEST_PAGE = `<!doctype html><meta charset="utf-8"><title>ingest</title><script type="application/json" id="clips">__CLIPS__</script><script>
(async function () {
  var token = new URLSearchParams(location.search).get('token') || '';
  var headers = { 'x-explain-token': token };
  function fail(m) { return fetch('/__error', { method: 'POST', headers: headers, body: String(m) }); }
  try {
    var clips = JSON.parse(document.getElementById('clips').textContent);
    for (var i = 0; i < clips.length; i++) {
      var bin = atob(clips[i]);
      var bytes = new Uint8Array(bin.length);
      for (var j = 0; j < bin.length; j++) { bytes[j] = bin.charCodeAt(j); }
      var ctx = new OfflineAudioContext(1, 1, 24000);
      var buf = await ctx.decodeAudioData(bytes.buffer);
      var n = buf.length, mono = new Float32Array(n);
      for (var c = 0; c < buf.numberOfChannels; c++) {
        var ch = buf.getChannelData(c);
        for (var k = 0; k < n; k++) { mono[k] += ch[k] / buf.numberOfChannels; }
      }
      var r = await fetch('/clip?i=' + i + '&rate=' + buf.sampleRate, { method: 'POST', headers: headers, body: mono.buffer });
      if (!r.ok) { throw new Error('post failed ' + r.status); }
    }
  } catch (e) { await fail('could not decode a take: ' + (e && e.message || e)); }
})();
</script>`;

/** Decode the MP3 takes of entries that have no clip yet into 24 kHz mono WAVs (one headless Chrome); keeps the MP3s. */
export async function ingest(entries: PlanEntry[], settings: VoiceSettings, opts: { launch?: (url: string) => ChromeHandle, timeoutMs?: number } = {}): Promise<{ ingested: string[], missing: string[] }> {
  const todo: PlanEntry[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    const source = e.source && existsSync(e.source) ? e.source : null;
    // A take saved after its clip was made (the agent replaced a bad one) is ingested again.
    const fresh = existsSync(e.wav) && !(source && statSync(source).mtimeMs > statSync(e.wav).mtimeMs);
    if (fresh || seen.has(e.key)) { continue; }
    if (source) { todo.push(e); seen.add(e.key); }
    else { missing.push(e.id); }
  }
  const ingested: string[] = [];
  if (!todo.length) { return { ingested, missing }; }
  const clips = todo.map(e => Buffer.from(readFileSync(e.source!)).toString('base64'));
  // Escape "<" so a base64 payload can never close the script element.
  const html = INGEST_PAGE.replace('__CLIPS__', () => JSON.stringify(clips).replace(/</g, '\\u003c'));
  let received = 0;
  await runSession({
    html,
    query: {},
    label: 'Ingest',
    timeoutMs: opts.timeoutMs ?? 120_000,
    limits: { clip: 64 * 1024 * 1024 },
    launch: opts.launch,
    onPost: (_name, url, body) => {
      const i = Number(url.searchParams.get('i'));
      const e = todo[i];
      if (!e || body.byteLength % 4) { throw new Error('The page sent a malformed clip.'); }
      const rate = Number(url.searchParams.get('rate'));
      if (rate !== SAMPLE_RATE) { throw new Error(`Chrome decoded a take at ${rate} Hz, expected ${SAMPLE_RATE}.`); }
      writeClip(e, settings, new Float32Array(body.slice(0)), 'mp3');
      ingested.push(e.id);
      received++;
      return received === todo.length;
    },
  });
  return { ingested, missing };
}

/** Seconds of a cached clip: from its sidecar, else by reading the WAV. */
export function clipSeconds(key: string): number {
  const wav = join(voiceDir(), `${key}.wav`);
  try {
    const s = JSON.parse(readFileSync(sidecarOf(wav), 'utf8')) as { seconds?: number };
    if (typeof s.seconds === 'number' && Number.isFinite(s.seconds)) { return s.seconds; }
  }
  catch {}
  const d = decodeWav(readFileSync(wav));
  return d.channels[0].length / d.sampleRate;
}

/** Where Kokoro-FastAPI lives and whether it is installed (python in its venv plus the model weights). */
export function kokoroInstall(): { dir: string, python: string, model: string, installed: boolean } {
  const dir = process.env.EXPLAIN_KOKORO_DIR ? resolve(process.env.EXPLAIN_KOKORO_DIR) : join(homedir(), '.voicemode', 'services', 'kokoro');
  const python = join(dir, '.venv', 'bin', 'python');
  const model = join(dir, 'api', 'src', 'models', 'v1_0', 'kokoro-v1_0.pth');
  return { dir, python, model, installed: existsSync(python) && existsSync(model) };
}

/** The Kokoro server URL: EXPLAIN_KOKORO_URL, else http://127.0.0.1:8880. */
export const kokoroUrl = (): string => (process.env.EXPLAIN_KOKORO_URL || 'http://127.0.0.1:8880').replace(/\/+$/, '');

const kokoroLog = () => join(voiceDir(), 'kokoro.log');

async function healthy(url: string, timeoutMs = 1000): Promise<boolean> {
  try { return (await fetch(`${url}/health`, { signal: AbortSignal.timeout(timeoutMs) })).ok; }
  catch { return false; }
}

function logTail(lines = 12): string {
  try { return readFileSync(kokoroLog(), 'utf8').trimEnd().split('\n').slice(-lines).join('\n'); }
  catch { return ''; }
}

export interface KokoroResult { started: boolean, startSeconds: number, stopSeconds: number, peakRssMb: number, lines: number, seconds: number }

/** Synthesize every entry without a clip. Uses a server already answering (left running), else starts one and stops it. */
export async function runKokoro(entries: PlanEntry[], settings: VoiceSettings, opts: { healthTimeoutMs?: number } = {}): Promise<KokoroResult> {
  const url = kokoroUrl();
  const result: KokoroResult = { started: false, startSeconds: 0, stopSeconds: 0, peakRssMb: 0, lines: 0, seconds: 0 };
  const todo = entries.filter(e => !existsSync(e.wav));
  if (!todo.length) { return result; }
  mkdirSync(voiceDir(), { recursive: true });

  let proc: ReturnType<typeof Bun.spawn> | undefined;
  let logFd: number | undefined;
  let sampler: ReturnType<typeof setInterval> | undefined;
  let onSignal: (() => void) | undefined;
  const stop = async () => {
    if (!proc) { return; }
    const t0 = performance.now();
    const p = proc;
    proc = undefined;
    p.kill('SIGTERM');
    const timer = setTimeout(() => p.kill('SIGKILL'), 5000);
    await p.exited;
    clearTimeout(timer);
    result.stopSeconds = (performance.now() - t0) / 1000;
  };
  try {
    if (!await healthy(url)) {
      const inst = kokoroInstall();
      if (!inst.installed) {
        throw new Error(`Kokoro is not installed (no server answers at ${url}, and ${inst.python} or the model is missing). Install it with \`uvx voice-mode-install --yes\` and then \`voicemode service install kokoro\`. Installing downloads about 2 GB, so ask the user first (a worker asks its conductor). Or pass --voice none.`);
      }
      const port = new URL(url).port || '8880';
      logFd = openSync(kokoroLog(), 'a');
      const t0 = performance.now();
      proc = Bun.spawn([inst.python, '-m', 'uvicorn', 'api.src.main:app', '--host', '127.0.0.1', '--port', port], {
        cwd: inst.dir,
        stdout: logFd,
        stderr: logFd,
        env: {
          ...process.env,
          USE_GPU: 'true',
          USE_ONNX: 'false',
          PYTHONPATH: `${inst.dir}:${join(inst.dir, 'api')}`,
          MODEL_DIR: 'src/models',
          VOICES_DIR: 'src/voices/v1_0',
          WEB_PLAYER_PATH: join(inst.dir, 'web'),
          DEVICE_TYPE: 'mps',
          PYTORCH_ENABLE_MPS_FALLBACK: '1',
        },
      });
      result.started = true;
      const child = proc;
      // Ctrl-C or a kill while Kokoro runs: stop the child for real (TERM, then KILL after 5 s) before exiting, since
      // process.exit skips the finally below. A second signal kills it at once.
      let stopping = false;
      onSignal = () => {
        if (stopping) {
          child.kill('SIGKILL');
          process.exit(130);
        }
        stopping = true;
        child.kill('SIGTERM');
        const force = setTimeout(() => child.kill('SIGKILL'), 5000);
        void child.exited.then(() => {
          clearTimeout(force);
          process.exit(130);
        });
      };
      process.on('SIGINT', onSignal);
      process.on('SIGTERM', onSignal);
      sampler = setInterval(() => {
        const r = Bun.spawnSync(['ps', '-o', 'rss=', '-p', String(child.pid)]);
        const mb = Number(r.stdout.toString().trim()) / 1024;
        if (Number.isFinite(mb) && mb > result.peakRssMb) { result.peakRssMb = mb; }
      }, 500);
      const limit = opts.healthTimeoutMs ?? 120_000;
      let exited = false;
      void child.exited.then(() => { exited = true; });
      for (;;) {
        if (await healthy(url)) { break; }
        if (exited || performance.now() - t0 > limit) {
          throw new Error(`Kokoro did not become healthy (${exited ? 'it exited' : `${Math.round(limit / 1000)} s`}). Last lines of ${kokoroLog()}:\n${logTail()}`);
        }
        await Bun.sleep(250);
      }
      result.startSeconds = (performance.now() - t0) / 1000;
    }
    for (const e of todo) {
      const res = await fetch(`${url}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'kokoro', input: e.spoken, voice: settings.voiceId, response_format: 'wav', speed: settings.speed }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) { throw new Error(`Kokoro answered HTTP ${res.status} for line ${e.id}.`); }
      const wav = decodeWav(new Uint8Array(await res.arrayBuffer()));
      if (wav.sampleRate !== SAMPLE_RATE || wav.channels.length !== 1) {
        throw new Error(`Kokoro returned ${wav.sampleRate} Hz with ${wav.channels.length} channel(s) for line ${e.id}; expected ${SAMPLE_RATE} Hz mono.`);
      }
      writeClip(e, settings, wav.channels[0], 'kokoro');
      result.lines++;
      result.seconds += wav.channels[0].length / SAMPLE_RATE;
    }
  }
  finally {
    if (sampler) { clearInterval(sampler); }
    await stop();
    if (onSignal) {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
    }
    if (logFd !== undefined) { closeSync(logFd); }
  }
  return result;
}

/** Lines for `voice doctor`: Kokoro install and health, how ElevenLabs works, the cache, and ffprobe. */
export async function voiceDoctor(): Promise<string[]> {
  const k = kokoroInstall();
  const url = kokoroUrl();
  const running = await healthy(url);
  const dir = voiceDir();
  let clips = 0;
  let bytes = 0;
  try {
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.wav')) { clips++; }
      if (/\.(?:wav|mp3|json)$/.test(f)) { bytes += statSync(join(dir, f)).size; }
    }
  }
  catch {}
  return [
    `Kokoro: ${k.installed ? 'installed' : 'not installed'} (${k.dir}); ${running ? `a server answers at ${url}` : `not running (nothing answers at ${url}; it starts and stops per use)`}. Log: ${kokoroLog()}`,
    'ElevenLabs: only through an ElevenLabs MCP in the agent\'s harness; no API key is read.',
    `Cache: ${dir} holds ${clips} clip(s), ${(bytes / 1e6).toFixed(1)} MB.`,
    `ffprobe: ${Bun.which('ffprobe') ? 'on PATH' : 'not on PATH (optional)'}.`,
  ];
}
