// Page runtime: waits for fonts, builds the engine from the scene, wires the preview UI
// (play/pause, scrub, MP4 export button) and exposes the QA hooks.
//
// URL parameters:
//   ?t=<seconds>   static frame, UI hidden (used for stills and screenshots)
//   ?qa=1          run the QA gate and write the JSON report into <pre id="qa">
//   ?export=1 / ?still=<t,t,...> / ?sheet=<t,...|all>   handed to engine/export.js (runExport) when that module is present
//   ?info=1        build only and report the scene list (no QA run)
// Page hooks:
//   window.__explainQA(times?, opts?)  -> JSON report from engine/qa.js (see runQA for the options)
//   window.__explainRender(t)          -> draw one frame
//   window.__explainAudio              -> { offset(), playing(), enabled(), time() } preview sound state, for tests
//   window.__ready                     -> true once fonts are loaded and the first frame is drawn
import { createEngine, kit } from './index.js';
import { narrationOf, pageMix, readPageAudio } from './page-audio.js';
import { detectLang } from './pieces/titles.js';
import { definePreset } from './preset.js';
import { runQA } from './qa.js';

const LABELS = {
  en: { play: 'Play', pause: 'Pause', soundOn: 'Sound on', soundOff: 'Sound off', export: 'Export MP4', exporting: 'Exporting...', failed: 'Export failed' },
  es: { play: 'Reproducir', pause: 'Pausa', soundOn: 'Sonido: sí', soundOff: 'Sonido: no', export: 'Exportar MP4', exporting: 'Exportando...', failed: 'Error al exportar' },
};

/** Player UI labels in the video's language ('es' or anything else for English). */
export const labels = lang => (lang === 'es' ? LABELS.es : LABELS.en);

async function loadFonts(style) {
  await Promise.all(style.faces.map(f => document.fonts.load(`600 24px "${f.family}"`, 'AaÁáÉéÑñÜü')));
  await document.fonts.ready;
}

const SOUND_KEY = 'explain-sound';

// localStorage can throw (private mode, blocked storage): the page works without it.
const readSound = () => {
  try { return localStorage.getItem(SOUND_KEY) === '1'; }
  catch { return false; }
};
const writeSound = (on) => {
  try { localStorage.setItem(SOUND_KEY, on ? '1' : '0'); }
  catch {}
};

const mmss = (s) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export async function boot({ makeScene, preset, loadExport }) {
  const $ = id => document.getElementById(id);
  const style = definePreset(preset);
  const params = new URLSearchParams(location.search);
  const canvas = $('c');
  await loadFonts(style);
  const spec = makeScene(kit);
  // Sound and narration the build embedded (null for a silent page): narration sets the scene timing.
  const audio = readPageAudio(document);
  const engine = createEngine({ canvas, style, spec, narration: narrationOf(audio) });
  window.__explainPageAudio = audio;
  const { duration, fps } = engine;
  document.title = spec.title ?? document.title;
  // The player UI speaks the video's language: `lang` on the spec, else detected from the title and the on-screen text.
  const lang = spec.lang ?? detectLang([spec.title, ...engine.texts().map(x => x.text)]);
  const L = labels(lang);
  document.documentElement.lang = lang;

  window.__explainEngine = engine;
  window.__explainRender = t => engine.render(t);
  // QA, the export and the preview read the page's audio (null for a silent page) through these hooks.
  window.__explainQA = (times, opts) => runQA(engine, times, { audio, ...opts });

  engine.render(Number(params.get('t')) || 0);

  if (params.has('info')) {
    // ?info=1: the scene list only, for the CLI to resolve scene-local times (the QA report slot carries a stub).
    document.body.classList.add('still');
    const pre = document.createElement('pre');
    pre.id = 'qa';
    pre.textContent = JSON.stringify({ ok: true, errors: [], warnings: [], stats: {}, skipped: true });
    document.body.appendChild(pre);
    window.__ready = true;
    return engine;
  }

  if (params.has('qa')) {
    // ?qa=1 writes the QA report into the page (read it with chrome --dump-dom or the console).
    document.body.classList.add('still');
    const pre = document.createElement('pre');
    pre.id = 'qa';
    pre.textContent = JSON.stringify(runQA(engine, undefined, { audio }));
    document.body.appendChild(pre);
    window.__ready = true;
    return engine;
  }

  if (params.has('t')) {
    document.body.classList.add('still');
    window.__ready = true;
    return engine;
  }
  if (params.has('export') || params.has('still') || params.has('sheet')) {
    const m = await loadExport();
    window.__ready = true;
    await m.runExport?.({ canvas, render: engine.render, duration, fps, engine, audio });
    return engine;
  }

  const clock = globalThis.__explainClock;
  const real = clock?.real ?? { raf: requestAnimationFrame.bind(window), now: performance.now.bind(performance) };
  const scrub = $('scrub');
  const play = $('play');
  const time = $('time');
  play.textContent = L.pause;
  $('export').textContent = L.export;
  let cur = 0;
  let paused = false;
  let t0 = real.now();
  // Preview sound. While a source plays, the audio clock drives the time: t = ctx.currentTime - startedAt + offset.
  const sound = $('sound');
  let soundOn = !!audio && readSound();
  let ctx = null;
  let buffer = null;
  let src = null;
  let startedAt = 0;
  let offset = 0;
  let resumeAfterScrub = false;
  scrub.max = String(duration);
  scrub.step = String(1 / fps);

  const show = (t) => {
    cur = t;
    scrub.value = String(t);
    time.textContent = `${mmss(t)} / ${mmss(duration)}`;
    engine.render(t);
  };
  const audioTime = () => ctx.currentTime - startedAt + offset;
  const stopAudio = () => {
    if (!src) { return; }
    try { src.stop(); }
    catch {}
    src.disconnect();
    src = null;
  };
  // Creates the one AudioContext (48 kHz) and the one AudioBuffer on first use; must run inside a click.
  const ensureAudio = () => {
    if (!ctx) { ctx = new AudioContext({ sampleRate: 48000 }); }
    if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); }
    if (!buffer) {
      const m = pageMix(engine, audio);
      buffer = ctx.createBuffer(2, m.left.length, 48000);
      buffer.copyToChannel(m.left, 0);
      buffer.copyToChannel(m.right, 1);
    }
  };
  const startAudio = (at) => {
    stopAudio();
    src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    offset = at;
    startedAt = ctx.currentTime;
    src.start(0, at);
  };
  // Make the source match the state: playing with sound on means a source at `cur`; anything else means none.
  const syncAudio = () => {
    if (soundOn && !paused && ctx) { startAudio(cur); }
    else { stopAudio(); }
  };
  const setPaused = (v) => {
    paused = v;
    play.textContent = v ? L.play : L.pause;
    t0 = real.now() - cur * 1000;
    syncAudio();
  };
  const renderSound = () => {
    sound.textContent = soundOn ? L.soundOn : L.soundOff;
    sound.setAttribute('aria-pressed', String(soundOn));
  };
  if (audio) {
    sound.hidden = false;
    renderSound();
    sound.onclick = () => {
      // Sound remembered as on but not started yet (the browser needs this click first): start it, keep it on.
      if (!(soundOn && !ctx)) { soundOn = !soundOn; }
      writeSound(soundOn);
      renderSound();
      if (soundOn) { ensureAudio(); }
      // Off hands the clock back to performance.now at the same t (setPaused-style rebase); on starts the source at `cur`.
      t0 = real.now() - cur * 1000;
      syncAudio();
    };
  }
  play.onclick = () => {
    if (paused && soundOn) { ensureAudio(); }
    setPaused(!paused);
  };
  scrub.oninput = () => {
    // Scrubbing is silent; with sound on, a scrub that interrupted playback resumes when the handle is released.
    if (!resumeAfterScrub) { resumeAfterScrub = soundOn && !paused; }
    setPaused(true);
    show(Number(scrub.value));
  };
  scrub.onchange = () => {
    if (!resumeAfterScrub) { return; }
    resumeAfterScrub = false;
    if (soundOn) {
      ensureAudio();
      setPaused(false);
    }
  };
  window.__explainAudio = {
    offset: () => (src ? audioTime() : cur),
    playing: () => !!src && !paused,
    enabled: () => soundOn,
    time: () => cur,
  };

  $('export').onclick = async (ev) => {
    const btn = ev.currentTarget;
    const label = btn.textContent;
    setPaused(true);
    btn.disabled = true;
    btn.textContent = L.exporting;
    try {
      const m = await loadExport();
      const fn = m.exportMp4 ?? m.encodeMp4;
      const data = await fn({ canvas, render: engine.render, duration, fps, engine, audio });
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: 'video/mp4' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(spec.title ?? 'explainer').replace(/[^\w-]+/g, '-')}.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    catch (err) {
      console.error(err);
      time.textContent = `${L.failed}: ${err instanceof Error ? err.message : err}`;
    }
    btn.disabled = false;
    btn.textContent = label;
    show(cur);
  };

  const frame = () => {
    if (!paused) {
      if (src) {
        let t = audioTime();
        if (t >= duration) {
          // Loop wrap: the source ran off the end of the mix; start it again at 0.
          t = 0;
          startAudio(0);
        }
        show(t);
      }
      else { show(((real.now() - t0) / 1000) % duration); }
    }
    real.raf(frame);
  };
  show(0);
  window.__ready = true;
  real.raf(frame);
  return engine;
}
