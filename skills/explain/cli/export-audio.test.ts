// MP4 export with an audio track, end to end through the CLI: a narrated page with sound effects exports h264 + aac
// (48 kHz stereo, as long as the video), and the same scene with sound and voice off exports no audio stream.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { encodeWav } from '../engine/wav.js';
import { resolveAudio } from './audio.ts';
import { findChrome, isHeadlessShell } from './chrome.ts';
import { main } from './index.ts';
import { planVoice } from './voice.ts';

const temps: string[] = [];
function temp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}
afterAll(() => { for (const d of temps) { rmSync(d, { recursive: true, force: true }); } });

const ENV_KEYS = ['EXPLAIN_SOUND', 'EXPLAIN_VOICE', 'EXPLAIN_VOICE_ID', 'EXPLAIN_PRESET', 'EXPLAIN_VOICE_DIR', 'EXPLAIN_HOME'];
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) { delete process.env[k]; }
    else { process.env[k] = saved[k]; }
  }
});

const SCENE = `export const title = 'Narrado';
export default ({ scene }) => ({ title, lang: 'es', scenes: [
  scene({ name: 'uno', dur: 2, say: 'Hola, esto es una prueba.', transition: { type: 'crossfade', dur: 0.4 }, build(s) { s.heading({ text: 'Uno' }); s.node({ id: 'n', text: 'Fin', x: 700, y: 400, w: 400, h: 200, at: s.voice[0].end }); } }),
  scene({ name: 'dos', dur: 2, build(s) { s.heading({ text: 'Dos' }); } }),
] });
`;

/** A folder with scene.js, and a temp voice cache holding a 3 s Kokoro clip (24 kHz mono) for every cue. */
async function narratedFolder(): Promise<string> {
  const dir = temp('explain-export-audio-');
  process.env.EXPLAIN_VOICE_DIR = temp('explain-voice-');
  writeFileSync(join(dir, 'scene.js'), SCENE);
  const a = await resolveAudio(join(dir, 'scene.js'), { voice: 'kokoro' }, {});
  for (const e of planVoice(a.cues, a.voice!)) {
    writeFileSync(e.wav, encodeWav([new Float32Array(24000 * 3).map((_, i) => Math.sin(i / 9) * 0.3)], 24000));
  }
  return dir;
}

/** Run the CLI in-process; returns its exit code and stdout. */
async function cli(argv: string[]): Promise<{ code: number, out: string }> {
  const log = console.log;
  let out = '';
  console.log = (s: string) => { out += `${s}\n`; };
  try { return { code: await main(argv), out }; }
  finally { console.log = log; }
}

const chrome = findChrome();
const ready = chrome && !isHeadlessShell(chrome) && Bun.which('ffprobe');
const maybe = ready ? test : test.skip;

describe('export with audio', () => {
  maybe('sound on + kokoro voice: h264 + aac 48 kHz stereo as long as the video; sound off: no audio stream', async () => {
    process.env.EXPLAIN_HOME = temp('explain-home-');
    const dir = await narratedFolder();
    const voiced = await cli(['export', dir, '--voice', 'kokoro', '--sound', 'on', '--out', 'voiced.mp4']);
    console.error(voiced.out);
    expect(voiced.code).toBe(0);
    expect(voiced.out).toMatch(/^audio: (aac|opus) 48000 Hz stereo, voice kokoro\/ef_dora 3\.0 s, \d+ effects?, -?[\d.]+ LUFS, peak -?[\d.]+ dBFS$/m);
    const probe = voiced.out.split('\n').find(l => l.startsWith('ffprobe:'))!;
    expect(probe).toMatch(/^ffprobe: h264 yuv420p 1920x1080 30\.00 fps \+ aac 48000 Hz 2 ch [\d.]+ s OK$/);
    // Raw ffprobe, independent of verifyVideo: the audio track lasts as long as the video, within 0.05 s.
    const p = Bun.spawn([Bun.which('ffprobe')!, '-v', 'error', '-show_entries', 'stream=codec_type,duration', '-of', 'json', join(dir, 'voiced.mp4')], { stdout: 'pipe' });
    const streams = (JSON.parse(await new Response(p.stdout).text()) as { streams: { codec_type: string, duration: string }[] }).streams;
    const sec = (type: string) => Number(streams.find(s => s.codec_type === type)?.duration);
    console.error(`video ${sec('video')} s, audio ${sec('audio')} s`);
    expect(Math.abs(sec('audio') - sec('video'))).toBeLessThanOrEqual(0.05);

    const silent = await cli(['export', dir, '--out', 'silent.mp4']);
    console.error(silent.out);
    expect(silent.code).toBe(0);
    expect(silent.out).toContain('audio: off (add --sound on and --voice kokoro|elevenlabs, or set EXPLAIN_SOUND / EXPLAIN_VOICE)');
    expect(silent.out.split('\n').find(l => l.startsWith('ffprobe:'))).toBe('ffprobe: h264 yuv420p 1920x1080 30.00 fps OK');
  }, 300_000);

  if (!ready) { test.skip('needs Google Chrome (not the headless shell) and ffprobe on PATH', () => {}); }
});
