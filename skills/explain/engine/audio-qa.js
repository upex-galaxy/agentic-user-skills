// Audio QA: the checks that run on the page's soundtrack when sound or voice is on (called by runQA in engine/qa.js).
// Errors: narration-overlap, narration-window, voice-missing, voice-suspect, audio-clipping, audio-nondeterministic.
// Warnings: loudness, silent-gap, sfx-density, cue-after-end. Issues have the shape runQA uses: { type, scene, id, t, count, detail }.
import { blockLoudness, CLIP_SR, coalesce, loudness, mix, resolveSound } from './audio.js';
import { decodeClips, pageMix } from './page-audio.js';

const EPS = 1e-6;
const round = x => Math.round(x * 100) / 100;
/** Silence is -Infinity, which JSON turns into null: the report carries -120 instead. */
const finite = x => Math.max(-120, x);
const dbOf = x => (x > 0 ? 20 * Math.log10(x) : -Infinity);

/** The mix input pageMix builds, so a direct second run sees exactly the same data. */
function mixInput(engine, audio, clips) {
  const placed = engine.voice.filter(v => clips.has(v.id)).map(v => ({ t: v.t, pcm: clips.get(v.id) }));
  return { duration: engine.duration, events: audio.sound ? engine.events() : [], clips: placed, sound: resolveSound(engine.style.sound), sfx: audio.sound };
}

/** The scene (from engine.scenes) that holds global time t, or the last one. */
function sceneAt(engine, t) {
  return engine.scenes.find(sc => t >= sc.start && t < sc.end) ?? engine.scenes[engine.scenes.length - 1];
}

/** Effects past the density caps (more than perSecond in any [a, a + 1) window, more than perScene in a scene): [{ type, scene, t, detail }]. */
export function densityIssues(events, { perSecond = 3, perScene = 12 } = {}) {
  const out = [];
  const list = [...events].sort((a, b) => a.t - b.t);
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    let j = i;
    while (j < list.length && list[j].t - list[i].t < 1) { j++; }
    if (j - i > perSecond && !seen.has(list[i].sceneIndex)) {
      out.push({ scene: list[i].scene, t: list[i].t, detail: `${j - i} effects within 1 s from t=${round(list[i].t)}s (cap ${perSecond})` });
      seen.add(list[i].sceneIndex);
    }
  }
  const per = new Map();
  for (const ev of list) { per.set(ev.scene, (per.get(ev.scene) ?? 0) + 1); }
  for (const [scene, n] of per) {
    if (n > perScene) { out.push({ scene, t: list.find(e => e.scene === scene).t, detail: `${n} effects in one scene (cap ${perScene})` }); }
  }
  return out;
}

/**
 * Audit the page's soundtrack. `audio` is the page's audio data ({ sound, narration }); returns
 * { errors, warnings, audio: { integratedLufs, peakDbfs, voiceSeconds, sfxEvents } }. `deps` swaps the mixer (tests).
 */
export function auditAudio(engine, audio, deps = {}) {
  const run = deps.mix ?? mix;
  const memo = deps.pageMix ?? pageMix;
  const errors = [];
  const warnings = [];
  const add = (list, type, scene, id, t, detail, count = 1) => list.push({ type, scene, id, t: round(t), count, detail });
  const voiceOn = !!audio.narration;
  const clips = decodeClips(audio);
  const winOf = (sc, i) => ({
    lo: i > 0 ? engine.scenes[i - 1].end - sc.start : 0,
    hi: sc.dur - (i < engine.scenes.length - 1 ? sc.end - engine.scenes[i + 1].start : 0),
  });

  for (const sc of engine.scenes) {
    const i = engine.scenes.indexOf(sc);
    const cues = engine.voice.filter(v => v.sceneIndex === i).sort((a, b) => a.at - b.at);
    const { lo, hi } = winOf(sc, i);
    for (let k = 0; k < cues.length; k++) {
      const c = cues[k];
      const next = cues[k + 1];
      if (next && c.at + c.seconds > next.at + EPS) { add(errors, 'narration-overlap', sc.name, `${c.id}/${next.id}`, sc.start + next.at, `clip ${c.id} runs to ${round(c.at + c.seconds)}s, after clip ${next.id} starts at ${round(next.at)}s (scene-local)`); }
      if (c.at < lo - EPS) { add(errors, 'narration-window', sc.name, c.id, c.t, `clip ${c.id} starts at ${round(c.at)}s, before the scene's transition in ends (${round(lo)}s)`); }
      else if (c.at + c.seconds > hi + EPS) { add(errors, 'narration-window', sc.name, c.id, c.t, `clip ${c.id} ends at ${round(c.at + c.seconds)}s, after the scene's outgoing transition starts (${round(hi)}s): use fit: true or shorten the line`); }
    }
  }

  if (voiceOn) {
    for (const v of engine.voice) {
      const pcm = clips.get(v.id);
      if (!pcm) { add(errors, 'voice-missing', v.scene, v.id, v.t, `cue ${v.id} has no clip in the narration manifest`); continue; }
      const secs = pcm.length / CLIP_SR;
      const chars = v.text.length;
      let sum = 0;
      for (let i = 0; i < pcm.length; i++) { sum += pcm[i] * pcm[i]; }
      const rms = dbOf(Math.sqrt(sum / Math.max(1, pcm.length)));
      if (secs < 0.03 * chars) { add(errors, 'voice-suspect', v.scene, v.id, v.t, `clip ${v.id} is ${round(secs)}s for ${chars} characters (under 0.03 s per character): truncated?`); }
      else if (secs > 0.2 * chars) { add(errors, 'voice-suspect', v.scene, v.id, v.t, `clip ${v.id} is ${round(secs)}s for ${chars} characters (over 0.2 s per character)`); }
      else if (rms < -45) { add(errors, 'voice-suspect', v.scene, v.id, v.t, `clip ${v.id} has RMS ${round(rms)} dBFS (under -45): silent?`); }
    }
  }

  const out = memo(engine, audio);
  const { report, left, right } = out;
  const meter = loudness(left, right);
  if (meter.peak > -1) { add(errors, 'audio-clipping', '-', 'mix', 0, `the mix peaks at ${round(meter.peak)} dBFS (limit -1.0)`); }
  const again = run(mixInput(engine, audio, clips));
  const same = (a, b) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  if (!same(left, again.left) || !same(right, again.right)) { add(errors, 'audio-nondeterministic', '-', 'mix', 0, 'mixing the same input twice produced different samples'); }

  if (voiceOn && report.voiceSeconds > 0) {
    if (Number.isFinite(meter.integrated) && Math.abs(meter.integrated + 14) > 1) { add(warnings, 'loudness', '-', 'mix', 0, `integrated loudness is ${round(meter.integrated)} LUFS (target -14 ± 1)`); }
  }
  else if (audio.sound) {
    const blocks = blockLoudness(left, right);
    const loud = blocks.map((b, k) => [b, k]).filter(([b]) => b > -12);
    if (loud.length) {
      const t = loud[0][1] * 0.1;
      add(warnings, 'loudness', sceneAt(engine, t)?.name ?? '-', 'mix', t, `${loud.length} 400 ms blocks above -12 LUFS (loudest ${round(Math.max(...loud.map(l => l[0])))} LUFS)`, loud.length);
    }
  }

  if (voiceOn) {
    const cues = [...engine.voice].sort((a, b) => a.t - b.t);
    for (let k = 1; k < cues.length; k++) {
      const gap = cues[k].t - (cues[k - 1].t + cues[k - 1].seconds);
      if (gap > 3) { add(warnings, 'silent-gap', cues[k].scene, `${cues[k - 1].id}/${cues[k].id}`, cues[k - 1].t + cues[k - 1].seconds, `${round(gap)} s without voice between cues ${cues[k - 1].id} and ${cues[k].id}`); }
    }
    engine.scenes.forEach((sc, i) => {
      if (!engine.voice.some(v => v.sceneIndex === i)) { add(warnings, 'silent-gap', sc.name, '-', sc.start, `scene "${sc.name}" has no narration cue`); }
    });
  }

  if (audio.sound) {
    for (const d of densityIssues(report.events ?? coalesce(engine.events()))) { add(warnings, 'sfx-density', d.scene, '-', d.t, d.detail); }
    for (const ev of deps.events ?? engine.events()) {
      const sc = engine.scenes[ev.sceneIndex];
      if (sc && ev.t > sc.end + EPS) { add(warnings, 'cue-after-end', ev.scene, ev.id, ev.t, `effect "${ev.kind}" at ${round(ev.t)}s is after the scene ends (${round(sc.end)}s)`); }
    }
  }

  return { errors, warnings, audio: { integratedLufs: finite(meter.integrated), peakDbfs: finite(meter.peak), voiceSeconds: report.voiceSeconds, sfxEvents: report.sfxEvents } };
}
