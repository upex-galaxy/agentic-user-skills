import type { VoiceSettings } from './voice.ts';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { decodeWav as decodeWavUntyped, encodeWav as encodeWavUntyped } from '../engine/wav.js';
import { findChrome } from './chrome.ts';
import { applyPronunciation, clipSeconds, cueKey, defaultVoiceId, formatPlan, ingest, kokoroInstall, loadPronunciation, planVoice, runKokoro, voiceDir, voiceDoctor } from './voice.ts';

const decodeWav = decodeWavUntyped as (bytes: Uint8Array) => { sampleRate: number, channels: Float32Array[] };
const encodeWav = encodeWavUntyped as (channels: Float32Array[], sampleRate: number) => Uint8Array<ArrayBuffer>;

const tmp = mkdtempSync(join(tmpdir(), 'explain-voice-'));
const saved = { ...process.env };
beforeAll(() => {
  process.env.EXPLAIN_VOICE_DIR = join(tmp, 'voice');
  process.env.EXPLAIN_PRONUNCIATION = join(tmp, 'none.txt');
});
afterAll(() => {
  for (const k of ['EXPLAIN_VOICE_DIR', 'EXPLAIN_PRONUNCIATION', 'EXPLAIN_KOKORO_URL', 'EXPLAIN_KOKORO_DIR']) {
    if (saved[k] === undefined) { delete process.env[k]; }
    else { process.env[k] = saved[k]; }
  }
});

const kokoro: VoiceSettings = { provider: 'kokoro', voiceId: 'af_heart', model: 'kokoro', speed: 1, lang: 'en' };
const eleven: VoiceSettings = { provider: 'elevenlabs', voiceId: 'v1', model: 'eleven_flash_v2_5', speed: 1, lang: 'en' };
const cues = (n: number, tag = 'x') => Array.from({ length: n }, (_, i) => ({ id: `0.${i}`, scene: 'intro', text: `Line ${tag} number ${i}.` }));
const tone = (rate: number, seconds: number) => Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => 0.3 * Math.sin(2 * Math.PI * 440 * i / rate));

// A Kokoro stub: /health plus /v1/audio/speech returning a 24 kHz mono WAV, or HTTP 500 when `fail` is set.
function stub(port = 0, fail = false) {
  const state = { speech: 0 };
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port,
    fetch(req) {
      const p = new URL(req.url).pathname;
      if (p === '/health') { return new Response('{"status":"healthy"}'); }
      if (p === '/v1/audio/speech') {
        state.speech++;
        if (fail) { return new Response('boom', { status: 500 }); }
        return new Response(encodeWav([tone(24000, 0.2)], 24000), { headers: { 'content-type': 'audio/wav' } });
      }
      return new Response('nope', { status: 404 });
    },
  });
  return { server, state, url: `http://127.0.0.1:${server.port}` };
}

const answers = async (url: string) => {
  try { return (await fetch(`${url}/health`, { signal: AbortSignal.timeout(500) })).ok; }
  catch { return false; }
};

describe('cue keys and pronunciation', () => {
  test('cueKey is stable and changes with every input', () => {
    const base = cueKey(kokoro, 'hello');
    expect(cueKey(kokoro, 'hello')).toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    for (const other of [{ ...kokoro, voiceId: 'x' }, { ...kokoro, model: 'm' }, { ...kokoro, speed: 1.1 }]) {
      expect(cueKey(other, 'hello')).not.toBe(base);
    }
    expect(cueKey(kokoro, 'hello!')).not.toBe(base);
    // No provider receives the language: a detected language that flips must not regenerate (or re-bill) a line.
    expect(cueKey({ ...kokoro, lang: 'es' }, 'hello')).toBe(base);
  });
  test('applyPronunciation: longest first, whole words, case-insensitive', () => {
    const rules = [{ pattern: 'API', replacement: 'A P I' }, { pattern: 'API key', replacement: 'ay pee eye key' }];
    expect(applyPronunciation('An api key and the API, not rapid or APIs.', rules)).toBe('An ay pee eye key and the A P I, not rapid or APIs.');
    expect(applyPronunciation('plain', [])).toBe('plain');
  });
  test('loadPronunciation parses rules, skips comments and a missing file', () => {
    const f = join(tmp, 'pron.txt');
    writeFileSync(f, '# comment\n\nAPI  A P I\nkubectl\tcube control\nbroken line\n');
    expect(loadPronunciation(f)).toEqual([{ pattern: 'API', replacement: 'A P I' }, { pattern: 'kubectl', replacement: 'cube control' }]);
    expect(loadPronunciation(join(tmp, 'missing.txt'))).toEqual([]);
  });
  test('defaultVoiceId', () => {
    expect(defaultVoiceId('kokoro', 'es')).toBe('ef_dora');
    expect(defaultVoiceId('kokoro', 'en')).toBe('af_heart');
    expect(defaultVoiceId('elevenlabs', 'es')).toBeUndefined();
  });
});

describe('plan', () => {
  test('elevenlabs plan lists only missing lines with mp3 targets and a credits footer', () => {
    const entries = planVoice(cues(3, 'plan'), eleven, []);
    mkdirSync(voiceDir(), { recursive: true });
    writeFileSync(entries[0].wav, encodeWav([tone(24000, 0.1)], 24000));
    entries[0].cached = true;
    const text = formatPlan(entries, eleven);
    expect(text).toContain('2 of 3 lines to generate');
    expect(text).not.toContain(entries[0].source!);
    for (const e of entries.slice(1)) {
      expect(text).toContain(e.source!);
      expect(e.source!.endsWith('.mp3')).toBe(true);
      expect(text).toContain(e.spoken);
    }
    const chars = entries[1].chars + entries[2].chars;
    expect(text).toContain(`Missing characters: ${chars}`);
    expect(text).toMatch(/Estimated credits: about 76 /);
    expect(text).toContain('eleven_flash_v2_5');
  });
  test('a line said twice is listed and estimated once', () => {
    const twice = [{ id: '0.0', scene: 'a', text: 'La misma línea.' }, { id: '1.0', scene: 'b', text: 'La misma línea.' }];
    const text = formatPlan(planVoice(twice, eleven, []), eleven);
    expect(text).toContain('1 of 1 lines to generate');
    expect(text.match(/save to:/g)?.length).toBe(1);
  });
  test('kokoro entries have no source and applied pronunciation', () => {
    const [e] = planVoice([{ id: '0.0', scene: 's', text: 'Use the API' }], kokoro, [{ pattern: 'API', replacement: 'A P I' }]);
    expect(e.source).toBeNull();
    expect(e.spoken).toBe('Use the A P I');
    expect(e.key).toBe(cueKey(kokoro, 'Use the A P I'));
    expect(e.wav).toBe(join(voiceDir(), `${e.key}.wav`));
  });
});

describe('runKokoro with a running server', () => {
  test('synthesizes once, then 0 requests, and leaves the server up', async () => {
    const s = stub();
    process.env.EXPLAIN_KOKORO_URL = s.url;
    try {
      const entries = planVoice(cues(3, 'reuse'), kokoro, []);
      const first = await runKokoro(entries, kokoro);
      expect(first.started).toBe(false);
      expect(first.lines).toBe(3);
      expect(s.state.speech).toBe(3);
      for (const e of entries) {
        expect(existsSync(e.wav)).toBe(true);
        expect(clipSeconds(e.key)).toBeCloseTo(0.2, 2);
        const d = decodeWav(readFileSync(e.wav));
        expect(d.sampleRate).toBe(24000);
        expect(d.channels.length).toBe(1);
        expect(JSON.parse(readFileSync(e.wav.replace('.wav', '.json'), 'utf8')).source).toBe('kokoro');
      }
      const second = await runKokoro(planVoice(cues(3, 'reuse'), kokoro, []), kokoro);
      expect(second.lines).toBe(0);
      expect(s.state.speech).toBe(3);
      expect(second.started).toBe(false);
      expect(await answers(s.url)).toBe(true);
    }
    finally { await s.server.stop(true); }
  });
});

describe('runKokoro spawn path', () => {
  const installDir = join(tmp, 'kokoro');
  const free = () => {
    const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('') });
    const port = probe.port!;
    void probe.stop(true);
    return port;
  };
  beforeAll(() => {
    mkdirSync(join(installDir, '.venv', 'bin'), { recursive: true });
    mkdirSync(join(installDir, 'api', 'src', 'models', 'v1_0'), { recursive: true });
    writeFileSync(join(installDir, 'api', 'src', 'models', 'v1_0', 'kokoro-v1_0.pth'), 'x');
    // The stub server reads --port and the MODE file next to it, so one script serves both the happy and the failing run.
    writeFileSync(join(installDir, 'stub.ts'), `
import { writeFileSync } from 'node:fs';
const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
const fail = (await Bun.file(${JSON.stringify(join(installDir, 'MODE'))}).text()).trim() === 'fail';
const wav = ${JSON.stringify(Array.from(encodeWav([tone(24000, 0.2)], 24000)))};
Bun.serve({ hostname: '127.0.0.1', port, fetch(req) {
  const p = new URL(req.url).pathname;
  if (p === '/health') return new Response('ok');
  if (p === '/v1/audio/speech') return fail ? new Response('boom', { status: 500 }) : new Response(new Uint8Array(wav));
  return new Response('no', { status: 404 });
} });
console.log('stub listening', port);
`);
    const py = join(installDir, '.venv', 'bin', 'python');
    writeFileSync(py, `#!/bin/sh\nexec ${process.execPath} ${join(installDir, 'stub.ts')} "$@"\n`);
    chmodSync(py, 0o755);
  });

  test('starts the server, synthesizes, stops it', async () => {
    const port = free();
    process.env.EXPLAIN_KOKORO_URL = `http://127.0.0.1:${port}`;
    process.env.EXPLAIN_KOKORO_DIR = installDir;
    writeFileSync(join(installDir, 'MODE'), 'ok');
    expect(kokoroInstall().installed).toBe(true);
    const r = await runKokoro(planVoice(cues(2, 'spawn'), kokoro, []), kokoro);
    expect(r.started).toBe(true);
    expect(r.lines).toBe(2);
    expect(r.startSeconds).toBeGreaterThan(0);
    expect(await answers(`http://127.0.0.1:${port}`)).toBe(false);
    expect(readFileSync(join(voiceDir(), 'kokoro.log'), 'utf8')).toContain('stub listening');
  }, 30_000);

  test('stops the server when speech fails with HTTP 500', async () => {
    const port = free();
    process.env.EXPLAIN_KOKORO_URL = `http://127.0.0.1:${port}`;
    process.env.EXPLAIN_KOKORO_DIR = installDir;
    writeFileSync(join(installDir, 'MODE'), 'fail');
    const err = await runKokoro(planVoice(cues(2, 'fail'), kokoro, []), kokoro).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/HTTP 500/);
    expect(await answers(`http://127.0.0.1:${port}`)).toBe(false);
  }, 30_000);

  test('not installed and nothing answering: tells the agent to ask before installing', async () => {
    process.env.EXPLAIN_KOKORO_URL = `http://127.0.0.1:${free()}`;
    process.env.EXPLAIN_KOKORO_DIR = join(tmp, 'absent');
    const err = await runKokoro(planVoice(cues(1, 'absent'), kokoro, []), kokoro).catch(e => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('voicemode service install kokoro');
    expect((err as Error).message).toContain('uvx voice-mode-install --yes');
    expect((err as Error).message).toMatch(/ask/);
    expect((err as Error).message).toContain('2 GB');
  });
});

describe('ingest', () => {
  const chrome = (() => {
    try { return findChrome(); }
    catch { return null; }
  })();
  (chrome ? test : test.skip)('decodes a take to a 24 kHz mono wav and keeps the mp3', async () => {
    const entries = planVoice([{ id: '0.0', scene: 's', text: 'Ingest me please.' }, { id: '0.1', scene: 's', text: 'Nothing saved for me.' }], eleven, []);
    mkdirSync(voiceDir(), { recursive: true });
    // Chrome sniffs the content, so a 44.1 kHz WAV stands in for the MP3.
    writeFileSync(entries[0].source!, encodeWav([tone(44100, 1.5)], 44100));
    const r = await ingest(entries, eleven);
    expect(r.ingested).toEqual(['0.0']);
    expect(r.missing).toEqual(['0.1']);
    const d = decodeWav(readFileSync(entries[0].wav));
    expect(d.sampleRate).toBe(24000);
    expect(d.channels.length).toBe(1);
    expect(Math.abs(d.channels[0].length / 24000 - 1.5)).toBeLessThan(0.01);
    expect(existsSync(entries[0].source!)).toBe(true);
    const side = JSON.parse(readFileSync(entries[0].wav.replace('.wav', '.json'), 'utf8'));
    expect(side.source).toBe('mp3');
    expect(clipSeconds(entries[0].key)).toBeCloseTo(1.5, 2);
  }, 60_000);
});

describe('doctor', () => {
  test('reports kokoro, elevenlabs, cache and ffprobe', async () => {
    process.env.EXPLAIN_KOKORO_URL = 'http://127.0.0.1:9';
    process.env.EXPLAIN_KOKORO_DIR = join(tmp, 'absent');
    const lines = await voiceDoctor();
    expect(lines.join('\n')).toContain('not installed');
    expect(lines.join('\n')).toContain('no API key is read');
    expect(lines.join('\n')).toMatch(/Cache: .* clip\(s\)/);
    expect(lines.join('\n')).toContain('ffprobe');
  });
});

describe('hard rules', () => {
  test('no ElevenLabs key or API host anywhere in cli/ or engine/', () => {
    const root = join(import.meta.dir, '..');
    const banned = [`ELEVENLABS_${'API_KEY'}`, `xi-api${'-key'}`, `api.elevenlabs${'.io'}`];
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]);
    const files = [...walk(join(root, 'cli')), ...walk(join(root, 'engine'))].filter(f => /\.(?:ts|js)$/.test(f) && f !== import.meta.path);
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const b of banned) { expect(`${f}:${text.includes(b)}`).toBe(`${f}:false`); }
    }
  });
});
