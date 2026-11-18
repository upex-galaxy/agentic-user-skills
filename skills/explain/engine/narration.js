// Narration as scene data. A scene may carry `say`: one string, or beats [{ text, at?, spoken? }] (strings allowed).
// It lives on the scene definition, outside build(), so the CLI reads every line in Bun without Chrome (specCues) and
// the engine lays the cues out before build() runs, handing them to the builder as `s.voice`.
//
// Timing (scene-local seconds): the first cue starts at max(0.3, trIn + 0.1), each next one CUE_GAP after the previous
// clip ends plus the beat's `hold` (seconds of silence that let the picture settle); an explicit `at` wins. A clip lasts its real duration when the page carries narration, else an estimate
// of 15 characters per second. With narration on, a scene stretches so its last clip ends CUE_TAIL before its
// outgoing transition, after the last beat's hold (fitDur); `fit: false` keeps the authored dur. `key` names a beat so
// build() can find its window with s.cue(key). Neither hold nor key reaches the voice, so neither changes a cache key.

export const CHARS_PER_SECOND = 15;
export const CUE_GAP = 0.25;
export const CUE_TAIL = 0.5;
export const FIRST_CUE_MIN = 0.3;
/** The longest beat hold: past it the silence reads as a gap (QA warns on 3 s without voice). */
export const MAX_HOLD = 2.5;

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
    if (beat.hold !== undefined && !(Number.isFinite(beat.hold) && beat.hold >= 0 && beat.hold <= MAX_HOLD)) { throw new Error(`Scene "${where}": say[${i}].hold must be 0 to ${MAX_HOLD} seconds`); }
    if (beat.key !== undefined && (typeof beat.key !== 'string' || !beat.key.trim())) { throw new Error(`Scene "${where}": say[${i}].key must be a non-empty string`); }
    const out = { text: beat.text.trim(), spoken: (beat.spoken ?? beat.text).trim() };
    if (beat.at !== undefined) { out.at = beat.at; }
    if (beat.hold !== undefined) { out.hold = beat.hold; }
    if (beat.key !== undefined) { out.key = beat.key.trim(); }
    return out;
  }).map((b, i, all) => {
    if (b.key !== undefined && all.findIndex(o => o.key === b.key) !== i) { throw new Error(`Scene "${where}": say[${i}].key "${b.key}" repeats`); }
    return b;
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
 * estimate is used and `estimated` is true). Returns [{ id, at, end, seconds, hold, text, estimated, key? }].
 */
export function layoutCues(cues, { trIn = 0, seconds = () => undefined } = {}) {
  const out = [];
  let next = Math.max(FIRST_CUE_MIN, trIn + 0.1);
  for (const c of cues) {
    const real = seconds(c.id);
    const len = Number.isFinite(real) && real > 0 ? real : estimateSeconds(c.spoken ?? c.text);
    const at = c.at ?? next;
    const end = at + len;
    const hold = c.hold ?? 0;
    const cue = { id: c.id, at, end, seconds: len, hold, text: c.text, estimated: !(Number.isFinite(real) && real > 0) };
    if (c.key !== undefined) { cue.key = c.key; }
    out.push(cue);
    next = end + hold + CUE_GAP;
  }
  return out;
}

/** A scene's duration once its narration fits: max(dur, last clip end + its hold + CUE_TAIL + the outgoing transition's dur). */
export function fitDur(dur, layout, trOutDur = 0) {
  if (!layout.length) { return dur; }
  const last = Math.max(...layout.map(c => c.end + (c.hold ?? 0)));
  return Math.max(dur, last + CUE_TAIL + trOutDur);
}

/**
 * The script's weight per narrated scene, from the text alone (no clips, no Chrome): [{ scene, dur, speech, words }],
 * `speech` estimated at CHARS_PER_SECOND. `voice plan` prints it so a thin scene is fixed before any line is paid for.
 */
export function scriptCover(spec) {
  return (spec?.scenes ?? []).flatMap((def, si) => {
    const scene = def.name ?? `scene-${si + 1}`;
    const beats = sayOf(def, scene);
    if (!beats.length) { return []; }
    const speech = beats.reduce((n, b) => n + estimateSeconds(b.spoken), 0);
    const words = beats.reduce((n, b) => n + b.text.split(/\s+/).filter(Boolean).length, 0);
    return [{ scene, dur: def.dur, speech, words }];
  });
}

/** The lines `voice plan` prints for scriptCover: one per narrated scene, a THIN mark under half its authored dur. */
export function formatCover(cover, minCover = 0.5) {
  if (!cover.length) { return []; }
  const total = cover.reduce((n, c) => n + c.speech, 0);
  const lines = [`Script: ${cover.length} narrated scenes, about ${Math.round(total)} s of speech (estimated at ${CHARS_PER_SECOND} characters per second).`];
  for (const c of cover) {
    const pct = Math.round(100 * c.speech / c.dur);
    lines.push(`  ${c.speech < minCover * c.dur ? 'THIN' : 'ok  '} ${c.scene}: ${c.words} words, about ${c.speech.toFixed(1)} s of speech for ${c.dur} s authored (${pct}%)`);
  }
  if (cover.some(c => c.speech < minCover * c.dur)) { lines.push('  A THIN scene says too little about what it shows: write more narration, or shorten the scene, before generating.'); }
  return lines;
}
