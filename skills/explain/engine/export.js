// In-page export: encodes H.264 with WebCodecs (Mediabunny) and POSTs the result to the local CLI server.
// Modes by query string: ?export=1 -> MP4 to /__export ; ?still=1.5,4 -> PNGs to /__still?t=<t>.
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output } from '../vendor/mediabunny.min.mjs';

const WIDTH = 1920;
const HEIGHT = 1080;
const DEFAULT_BITRATE = 2e6; // H.264 at 1080p30: 1.8 Mbps showed no banding or glow blur against 5 Mbps, so 2 keeps a margin

async function post(path, body, type) {
  const res = await fetch(path, { method: 'POST', body, headers: { 'content-type': type } });
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

export async function encodeMp4({ canvas, render, duration, fps = 30, bitrate = DEFAULT_BITRATE }) {
  if (typeof VideoEncoder === 'undefined') { throw new TypeError('WebCodecs VideoEncoder is not available in this browser'); }
  const codec = await pickAvcCodec(bitrate, fps);
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  // CanvasSource wraps VideoFrame(canvas): RGB canvas converts to limited-range BT.709 yuv420p.
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate, fullCodecString: codec, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();
  const frames = Math.round(duration * fps);
  for (let i = 0; i < frames; i++) {
    render(i / fps);
    await source.add(i / fps, 1 / fps);
  }
  await output.finalize();
  return output.target.buffer;
}

async function stills({ canvas, render, times }) {
  for (const t of times) {
    render(t);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    await post(`/__still?t=${encodeURIComponent(t)}`, blob, 'image/png');
  }
  await post('/__done', '', 'text/plain');
}

/** Entry point: call once the scene is ready. No-op without ?export=1 or ?still=. */
export async function runExport({ canvas, render, duration, fps = 30, bitrate = DEFAULT_BITRATE }) {
  const params = new URLSearchParams(location.search);
  bitrate = Number(params.get('bitrate')) || bitrate; // ?bitrate=<bits per second> overrides the default (the CLI's --bitrate)
  try {
    if (params.has('still')) {
      const times = params.get('still').split(',').map(Number).filter(Number.isFinite);
      await stills({ canvas, render, times });
    }
    else if (params.has('export')) {
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const buffer = await encodeMp4({ canvas, render, duration, fps, bitrate });
      await post('/__export', buffer, 'video/mp4');
    }
  }
  catch (err) {
    await reportError(err instanceof Error ? err.message : err);
  }
}
