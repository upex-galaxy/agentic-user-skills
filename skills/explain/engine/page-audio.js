// The audio a built page carries (cli/build.ts writes it as JSON in <script id="explain-audio">): the sound-effects
// switch and the narration clips. One mix per page, computed on demand and shared by the preview, the QA gate and the
// MP4 export, so the three hear the same samples.
import { mix, resolveSound } from './audio.js';
import { decodeWav } from './wav.js';

/** The page's audio data, or null for a silent page. `doc` defaults to the global document. */
export function readPageAudio(doc = globalThis.document) {
  const el = doc?.getElementById?.('explain-audio');
  if (!el) { return null; }
  const data = JSON.parse(el.textContent);
  return data && (data.sound || data.narration) ? data : null;
}

/** The narration manifest createEngine takes ({ cues: [{ id, seconds }] }), or undefined when the page has no voice. */
export const narrationOf = audio => (audio?.narration ? { cues: audio.narration.cues.map(c => ({ id: c.id, seconds: c.seconds })) } : undefined);

const b64 = (s) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) { out[i] = bin.charCodeAt(i); }
  return out;
};

/** Decoded narration clips by cue id: Map<id, Float32Array> (24 kHz mono). */
export function decodeClips(audio) {
  const byKey = new Map();
  const out = new Map();
  for (const c of audio?.narration?.cues ?? []) {
    if (!byKey.has(c.key)) { byKey.set(c.key, decodeWav(b64(audio.narration.clips[c.key])).channels[0]); }
    out.set(c.id, byKey.get(c.key));
  }
  return out;
}

/**
 * The page's mix: { left, right, report } at 48 kHz, or null for a silent page. Effects come from engine.events()
 * when sound is on; clips sit at engine.voice times. Memoized per engine.
 */
const cache = new WeakMap();
export function pageMix(engine, audio) {
  if (!audio) { return null; }
  if (cache.has(engine)) { return cache.get(engine); }
  const clips = decodeClips(audio);
  const placed = engine.voice.filter(v => clips.has(v.id)).map(v => ({ t: v.t, pcm: clips.get(v.id) }));
  const out = mix({ duration: engine.duration, events: audio.sound ? engine.events() : [], clips: placed, sound: resolveSound(engine.style.sound), sfx: audio.sound });
  cache.set(engine, out);
  return out;
}
