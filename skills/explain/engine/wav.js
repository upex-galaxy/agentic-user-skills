// WAV codec shared by the CLI (voice cache) and the page (embedded narration). Pure functions over bytes; no I/O.
// Decoding walks the RIFF chunks instead of assuming a 44-byte header (Kokoro's WAV carries an extra chunk).

/** Decode a RIFF/WAVE file (PCM 16-bit, or IEEE float 32-bit) into { sampleRate, channels: Float32Array[] }. */
export function decodeWav(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const tag = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (u8.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') { throw new Error('not a RIFF/WAVE file'); }
  let fmt = null;
  let data = null;
  for (let o = 12; o + 8 <= u8.length;) {
    const id = tag(o);
    // A streamed WAV may carry 0 or 0xFFFFFFFF as the data size: it then runs to the end of the file.
    let size = dv.getUint32(o + 4, true);
    if (id === 'data' && (size === 0 || size === 0xFFFFFFFF || o + 8 + size > u8.length)) { size = u8.length - o - 8; }
    if (id === 'fmt ') { fmt = { format: dv.getUint16(o + 8, true), channels: dv.getUint16(o + 10, true), sampleRate: dv.getUint32(o + 12, true), bits: dv.getUint16(o + 22, true) }; }
    else if (id === 'data') { data = { offset: o + 8, size }; }
    o += 8 + size + (size % 2);
  }
  if (!fmt || !data) { throw new Error('WAV file has no fmt or data chunk'); }
  // 0xFFFE (extensible) carries the real format in its sub-format GUID; 16-bit there is PCM, 32-bit is float.
  const float = fmt.format === 3 || (fmt.format === 0xFFFE && fmt.bits === 32);
  if (!(fmt.format === 1 || float || fmt.format === 0xFFFE) || !(fmt.bits === 16 || (float && fmt.bits === 32))) { throw new Error(`unsupported WAV encoding (format ${fmt.format}, ${fmt.bits} bit)`); }
  const step = fmt.bits / 8;
  const frames = Math.floor(data.size / (step * fmt.channels));
  const channels = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < fmt.channels; c++) {
      const o = data.offset + (i * fmt.channels + c) * step;
      channels[c][i] = float ? dv.getFloat32(o, true) : dv.getInt16(o, true) / 32768;
    }
  }
  return { sampleRate: fmt.sampleRate, channels };
}

/** Encode Float32 channels (-1..1, clipped) as a 16-bit PCM WAV. Returns a Uint8Array. */
export function encodeWav(channels, sampleRate) {
  const list = Array.isArray(channels) ? channels : [channels];
  const n = list.length;
  const frames = list[0]?.length ?? 0;
  const size = frames * n * 2;
  const u8 = new Uint8Array(44 + size);
  const dv = new DataView(u8.buffer);
  const put = (o, s) => { for (let i = 0; i < 4; i++) { u8[o + i] = s.charCodeAt(i); } };
  put(0, 'RIFF');
  dv.setUint32(4, 36 + size, true);
  put(8, 'WAVE');
  put(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, n, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * n * 2, true);
  dv.setUint16(32, n * 2, true);
  dv.setUint16(34, 16, true);
  put(36, 'data');
  dv.setUint32(40, size, true);
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < n; c++) {
      const v = Math.max(-1, Math.min(1, list[c][i]));
      dv.setInt16(44 + (i * n + c) * 2, Math.round(v < 0 ? v * 32768 : v * 32767), true);
    }
  }
  return u8;
}

/** Seconds of audio in a decoded WAV. */
export const wavSeconds = w => (w.channels[0]?.length ?? 0) / w.sampleRate;
