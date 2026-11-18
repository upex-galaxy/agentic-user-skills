// Narration as scene data. A scene may carry `say`: one string, or beats [{ text, at?, spoken? }] (strings allowed).
// It lives on the scene definition, outside build(), so the CLI reads every line in Bun without Chrome (specCues) and
// the engine lays the cues out before build() runs, handing them to the builder as `s.voice`.
//
// Timing (scene-local seconds): the first cue starts at max(0.3, trIn + 0.1), each next one CUE_GAP after the previous
// clip ends; an explicit `at` wins. A clip lasts its real duration when the page carries narration, else an estimate
// of 15 characters per second. With narration on, a scene stretches so its last clip ends CUE_TAIL before its
// outgoing transition (fitDur); `fit: false` keeps the authored dur.

export const CHARS_PER_SECOND = 15;
export const CUE_GAP = 0.25;
export const CUE_TAIL = 0.5;
export const FIRST_CUE_MIN = 0.3;

/** A cue's id in the narration manifest: `<scene index>.<cue index>` (scene names may repeat; positions do not). */
export const cueId = (sceneIndex, index) => `${sceneIndex}.${index}`;

/** The scene's `say` normalized to [{ text, spoken, at? }]; [] when it has none. Throws on a malformed entry. */
export function sayOf(def, where = def?.name ?? 'scene') {
  const raw = def?.say;
  if (raw === undefined || raw === null) { return []; }
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((b, i) => {
    const beat = typeof b === 'string' ? { text: b } : b;
    if (!beat || typeof beat.text !== 'string' || !beat.text.trim()) { throw new Error(`Scene "${where}": say[${i}] needs a non-empty text`); }
    if (beat.spoken !== undefined && (typeof beat.spoken !== 'string' || !beat.spoken.trim())) { throw new Error(`Scene "${where}": say[${i}].spoken must be a non-empty string`); }
    if (beat.at !== undefined && !(Number.isFinite(beat.at) && beat.at >= 0)) { throw new Error(`Scene "${where}": say[${i}].at must be a number of seconds, 0 or more`); }
    const out = { text: beat.text.trim(), spoken: (beat.spoken ?? beat.text).trim() };
    if (beat.at !== undefined) { out.at = beat.at; }
    return out;
  });
}

/** Every narration cue of a scene spec, in order: [{ id, scene, sceneIndex, index, text, spoken, at? }]. */
export function specCues(spec) {
  return (spec?.scenes ?? []).flatMap((def, si) => {
    const scene = def.name ?? `scene-${si + 1}`;
    return sayOf(def, scene).map((c, index) => ({ id: cueId(si, index), scene, sceneIndex: si, index, ...c }));
  });
}

/** Estimated seconds of a spoken line when no clip exists (voice off). */
export const estimateSeconds = text => Math.max(0.6, text.length / CHARS_PER_SECOND);

/**
 * Scene-local windows of one scene's cues. `seconds(id)` returns a clip's real length or undefined (then the
 * estimate is used and `estimated` is true). Returns [{ id, at, end, seconds, text, estimated }].
 */
export function layoutCues(cues, { trIn = 0, seconds = () => undefined } = {}) {
  const out = [];
  let next = Math.max(FIRST_CUE_MIN, trIn + 0.1);
  for (const c of cues) {
    const real = seconds(c.id);
    const len = Number.isFinite(real) && real > 0 ? real : estimateSeconds(c.spoken ?? c.text);
    const at = c.at ?? next;
    const end = at + len;
    out.push({ id: c.id, at, end, seconds: len, text: c.text, estimated: !(Number.isFinite(real) && real > 0) });
    next = end + CUE_GAP;
  }
  return out;
}

/** A scene's duration once its narration fits: max(dur, last clip end + CUE_TAIL + the outgoing transition's dur). */
export function fitDur(dur, layout, trOutDur = 0) {
  if (!layout.length) { return dur; }
  const last = Math.max(...layout.map(c => c.end));
  return Math.max(dur, last + CUE_TAIL + trOutDur);
}
