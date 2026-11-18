// In-page export: encodes H.264 with WebCodecs (Mediabunny) and POSTs the result to the local CLI server.
// Modes by query string: ?export=1 -> MP4 to /__export ; ?still=1.5,4 -> PNGs to /__still?t=<t>&i=<index> ;
// ?sheet=1.5,4,...&cols=3&rows=2 -> one contact-sheet PNG (cols x rows frames at 960x540) to /__sheet.
// Every POST carries the per-run token the CLI put in the page URL (?token=) as the x-explain-token header.
// A page with audio (sound effects or narration) gets an AAC (else Opus) track built from the page mix, and the export
// POSTs the mix report to /__audio before the MP4.
import { AudioBufferSource, BufferTarget, CanvasSource, getFirstEncodableAudioCodec, Mp4OutputFormat, Output } from '../vendor/mediabunny.min.mjs';
import { pageMix } from './page-audio.js';

const WIDTH = 1920;
const HEIGHT = 1080;
const DEFAULT_BITRATE = 2e6; // H.264 at 1080p30: 1.8 Mbps showed no banding or glow blur against 5 Mbps, so 2 keeps a margin
const SAMPLE_RATE = 48000;
const AUDIO_BITRATE = 160e3;
export const NO_AUDIO_CODEC = 'This Chrome cannot encode AAC or Opus audio. Use Google Chrome (or set EXPLAIN_CHROME), or export with --sound off --voice none.';

async function post(path, body, type) {
  const token = new URLSearchParams(location.search).get('token') ?? '';
  const res = await fetch(path, { method: 'POST', body, headers: { 'content-type': type, 'x-explain-token': token } });
  if (!res.ok) { throw new Error(`POST ${path} failed: ${res.status}`); }
}

async function reportError(message) {
  try {
    await post('/__error', String(message), 'text/plain');
  }
  catch {}
}

// avc1.640028 = High profile, level 4.0 (covers 1080p30). Baseline/Main are fallbacks.
async function pickAvcCodec(bitrate, fps) {
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42001f']) {
    const r = await VideoEncoder.isConfigSupported({ codec, width: WIDTH, height: HEIGHT, bitrate, framerate: fps });
    if (r.supported) { return codec; }
  }
  throw new Error('WebCodecs H.264 (avc1) encoding is not supported by this Chrome build');
}

/** The audio codec for the MP4: AAC, else Opus; throws NO_AUDIO_CODEC when neither encodes. `first` is injectable for tests. */
export async function pickAudioCodec(first = getFirstEncodableAudioCodec) {
  const codec = await first(['aac', 'opus'], { numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: AUDIO_BITRATE });
  if (!codec) { throw new Error(NO_AUDIO_CODEC); }
  return codec;
}

/** A stereo AudioBuffer of exactly `length` samples from the mix: trimmed, or padded with silence. */
function mixBuffer({ left, right }, length) {
  const buf = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: SAMPLE_RATE });
  buf.copyToChannel(left.length > length ? left.subarray(0, length) : left, 0);
  buf.copyToChannel(right.length > length ? right.subarray(0, length) : right, 1);
  return buf;
}

/**
 * MP4 bytes (ArrayBuffer) of the canvas animation. With page audio (`engine` + `audio`), adds a 48 kHz stereo track of
 * exactly frames / fps seconds; `onAudio({ codec, ...report })` then receives the codec and the mix report.
 */
export async function encodeMp4({ canvas, render, duration, fps = 30, bitrate = DEFAULT_BITRATE, engine, audio, onAudio }) {
  if (typeof VideoEncoder === 'undefined') { throw new TypeError('WebCodecs VideoEncoder is not available in this browser'); }
  const codec = await pickAvcCodec(bitrate, fps);
  const mixed = audio ? pageMix(engine, audio) : null;
  const audioCodec = mixed ? await pickAudioCodec() : null;
  if (audioCodec === 'opus') { console.warn('Exporting Opus audio: QuickTime may not play Opus inside MP4.'); }
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  // CanvasSource wraps VideoFrame(canvas): RGB canvas converts to limited-range BT.709 yuv420p.
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate, fullCodecString: codec, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: fps });
  const sound = mixed ? new AudioBufferSource({ codec: audioCodec, bitrate: AUDIO_BITRATE }) : null;
  if (sound) { output.addAudioTrack(sound); }
  await output.start();
  const frames = Math.round(duration * fps);
  if (sound) {
    // One buffer for the whole video, then close: the muxer interleaves it with the frames added below.
    await sound.add(mixBuffer(mixed, Math.round((frames / fps) * SAMPLE_RATE)));
    sound.close();
    const { events: _events, ...report } = mixed.report;
    onAudio?.({ codec: audioCodec, ...report });
  }
  for (let i = 0; i < frames; i++) {
    render(i / fps);
    await source.add(i / fps, 1 / fps);
  }
  await output.finalize();
  return output.target.buffer;
}

async function stills({ canvas, render, times }) {
  for (const [i, t] of times.entries()) {
    render(t);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    await post(`/__still?t=${encodeURIComponent(t)}&i=${i}`, blob, 'image/png');
  }
  await post('/__done', '', 'text/plain');
}

/**
 * Contact sheet drawn in the page: each time rendered on the main canvas and copied, scaled to 960x540, into a
 * cols x rows grid (a 3x2 sheet is 2880x1080). Returns the sheet canvas. No ffmpeg involved.
 */
export function drawSheet({ canvas, render, times, cols = 3, rows = 2, cellW = 960 }) {
  const cellH = Math.round((cellW * canvas.height) / canvas.width);
  const sheet = document.createElement('canvas');
  sheet.width = cols * cellW;
  sheet.height = rows * cellH;
  const g = sheet.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, sheet.width, sheet.height);
  times.slice(0, cols * rows).forEach((t, i) => {
    render(t);
    g.drawImage(canvas, (i % cols) * cellW, Math.floor(i / cols) * cellH, cellW, cellH);
  });
  return sheet;
}

/** Evenly spread sheet times: the middle of each of n equal slices of the video. */
export const sheetTimes = (duration, n) => Array.from({ length: n }, (_, i) => Math.round((duration * (i + 0.5) / n) * 100) / 100);

/** Entry point: call once the scene is ready. No-op without ?export=1 or ?still=. */
export async function runExport({ canvas, render, duration, fps = 30, bitrate = DEFAULT_BITRATE, engine, audio }) {
  const params = new URLSearchParams(location.search);
  bitrate = Number(params.get('bitrate')) || bitrate; // ?bitrate=<bits per second> overrides the default (the CLI's --bitrate)
  try {
    if (params.has('sheet')) {
      const cols = Number(params.get('cols')) || 3;
      const rows = Number(params.get('rows')) || 2;
      const raw = params.get('sheet');
      const times = raw === 'all' ? sheetTimes(duration, cols * rows) : raw.split(',').map(Number).filter(Number.isFinite);
      const sheet = drawSheet({ canvas, render, times, cols, rows });
      const blob = await new Promise(resolve => sheet.toBlob(resolve, 'image/png'));
      await post('/__sheet', blob, 'image/png');
    }
    else if (params.has('still')) {
      const times = params.get('still').split(',').map(Number).filter(Number.isFinite);
      await stills({ canvas, render, times });
    }
    else if (params.has('export')) {
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      let report = null;
      const buffer = await encodeMp4({ canvas, render, duration, fps, bitrate, engine, audio, onAudio: (r) => { report = r; } });
      if (report) { await post('/__audio', JSON.stringify(report), 'application/json'); }
      await post('/__export', buffer, 'video/mp4');
    }
  }
  catch (err) {
    await reportError(err instanceof Error ? err.message : err);
  }
}
