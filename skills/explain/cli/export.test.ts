import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';
import { NO_AUDIO_CODEC, pickAudioCodec } from '../engine/export.js';
import { audioBlock } from './build.ts';
import { findChrome } from './chrome.ts';
import { exportLimit, exportVideo, parseAudioReport, readPageAudio, stills } from './export.ts';
import { audioLine, verifyVideo } from './index.ts';

const temps: string[] = [];
/** A temp dir removed after the file's tests. */
function temp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}
afterAll(() => { for (const d of temps) { rmSync(d, { recursive: true, force: true }); } });

const engine = join(import.meta.dir, '../engine/export.js');

/** Self-contained page: Mediabunny + engine/export.js bundled and inlined as one module script. */
async function buildTestPage(duration: number): Promise<string> {
  const dir = temp('explain-entry-');
  mkdirSync(dir, { recursive: true });
  const entry = join(dir, 'entry.js');
  writeFileSync(entry, `import { runExport } from ${JSON.stringify(engine)};\nwindow.runExport = runExport;\n`);
  const built = await Bun.build({ entrypoints: [entry], target: 'browser', format: 'esm' });
  if (!built.success) { throw new Error(`bundle failed: ${built.logs.join('\n')}`); }
  const code = (await built.outputs[0].text()).replaceAll('</script', '<\\/script');
  return `<!doctype html><html><body style="margin:0"><canvas id="c" width="1920" height="1080"></canvas>
<script type="module">
${code}
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
function render(t) {
  ctx.fillStyle = '#1b2333'; ctx.fillRect(0, 0, 1920, 1080);
  ctx.fillStyle = '#ffb454'; ctx.fillRect(100 + (t / ${duration}) * 1500, 400, 200, 200);
}
render(0);
window.runExport({ canvas, render, duration: ${duration}, fps: 30 });
</script></body></html>`;
}

const chrome = findChrome();
const maybe = chrome ? test : test.skip;

describe('headless export', () => {
  maybe('exports a 3 s H.264 MP4', async () => {
    const out = join(temp('explain-'), 'test.mp4');
    const res = await exportVideo({ html: await buildTestPage(3), out, duration: 3, fps: 30, timeoutMs: 120_000 });
    expect(statSync(out).size).toBeGreaterThan(1000);
    expect(res.bytes).toBe(statSync(out).size);
    expect(await Bun.file(out).slice(0, 12).text()).toContain('ftyp');
    expect(res.audio).toBeUndefined();
    // A silent page exports exactly as before: no audio stream.
    if (Bun.which('ffprobe')) { expect(await verifyVideo(out)).toEqual({ line: 'ffprobe: h264 yuv420p 1920x1080 30.00 fps OK', ok: true }); }
  }, 150_000);

  maybe('writes PNG stills', async () => {
    const outDir = temp('explain-');
    const res = await stills({ html: await buildTestPage(3), outDir, times: [0, 1.5], timeoutMs: 60_000 });
    expect(res.files.length).toBe(2);
  }, 90_000);

  if (!chrome) { test.skip('needs a Chrome/Chromium binary (set EXPLAIN_CHROME)', () => {}); }
});

describe('audio track plumbing', () => {
  test('no encodable audio codec refuses with the fix; AAC is asked first, Opus second', async () => {
    const asked: unknown[] = [];
    const canEncodeAudio = async () => false;
    const first = async (codecs: string[], cfg: unknown) => {
      asked.push(codecs, cfg);
      for (const c of codecs) { if (await canEncodeAudio()) { return c; } }
      return null;
    };
    expect((await pickAudioCodec(first).then(() => null, (e: Error) => e))?.message).toBe(NO_AUDIO_CODEC);
    expect(NO_AUDIO_CODEC).toBe('This Chrome cannot encode AAC or Opus audio. Use Google Chrome (or set EXPLAIN_CHROME), or export with --sound off --voice none.');
    expect(asked).toEqual([['aac', 'opus'], { numberOfChannels: 2, sampleRate: 48000, bitrate: 160e3 }]);
    expect(await pickAudioCodec(async () => 'opus')).toBe('opus');
  });

  test('exportLimit adds the 160 kbps audio track only when audio is on', () => {
    const big = 600; // 10 min at 2 Mbps: past the 64 MB floor
    expect(exportLimit(big, 2e6, true) - exportLimit(big, 2e6)).toBe(Math.ceil(4 * (big * 2e6 / 8 + big * 160e3 / 8)) - Math.ceil(4 * big * 2e6 / 8));
    expect(exportLimit(3, 2e6, true)).toBe(exportLimit(3, 2e6));
  });

  test('readPageAudio reads the block build writes; a silent page has none', () => {
    const audio = { sound: true, narration: null };
    expect(readPageAudio(`<html><body>${audioBlock(audio)}</body></html>`)).toEqual(audio);
    expect(readPageAudio(`<html>${audioBlock({ sound: false, narration: null })}</html>`)).toBeNull();
    expect(readPageAudio('<html></html>')).toBeNull();
  });

  test('the /__audio report is validated, and the audio line reads it', () => {
    const r = { codec: 'aac', sfxEvents: 9, voiceSeconds: 41.23, integratedLufs: -14.08, peakDbfs: -2.31 };
    const body = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).buffer;
    expect(parseAudioReport(body({ ...r, events: [] }))).toEqual(r);
    expect(() => parseAudioReport(body({ codec: 'aac' }))).toThrow('bad audio report');
    expect(() => parseAudioReport(new TextEncoder().encode('{').buffer)).toThrow('not JSON');
    const narration = { provider: 'kokoro' as const, voice: 'ef_dora', model: 'kokoro', cues: [], clips: {} };
    expect(audioLine({ sound: true, narration }, r)).toBe('audio: aac 48000 Hz stereo, voice kokoro/ef_dora 41.2 s, 9 effects, -14.1 LUFS, peak -2.3 dBFS');
    expect(audioLine({ sound: true, narration: null }, { ...r, sfxEvents: 1 })).toBe('audio: aac 48000 Hz stereo, no voice, 1 effect, -14.1 LUFS, peak -2.3 dBFS');
    expect(audioLine(null, undefined)).toBe('audio: off (add --sound on and --voice kokoro|elevenlabs, or set EXPLAIN_SOUND / EXPLAIN_VOICE)');
  });
});
