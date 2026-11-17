// Page runtime: waits for fonts, builds the engine from the scene, wires the preview UI
// (play/pause, scrub, MP4 export button) and exposes the QA hooks.
//
// URL parameters:
//   ?t=<seconds>   static frame, UI hidden (used for stills and screenshots)
//   ?qa=1          run the QA gate and write the JSON report into <pre id="qa">
//   ?export=1 / ?still=<t,t,...>   handed to engine/export.js (runExport) when that module is present
// Page hooks:
//   window.__explainQA(times?, opts?)  -> JSON report from engine/qa.js (see runQA for the options)
//   window.__explainRender(t)          -> draw one frame
//   window.__ready                     -> true once fonts are loaded and the first frame is drawn
import { createEngine, kit } from './index.js';
import { detectLang } from './pieces/titles.js';
import { runQA } from './qa.js';

const LABELS = {
  en: { play: 'Play', pause: 'Pause', export: 'Export MP4', exporting: 'Exporting...', failed: 'Export failed' },
  es: { play: 'Reproducir', pause: 'Pausa', export: 'Exportar MP4', exporting: 'Exportando...', failed: 'Error al exportar' },
};

/** Player UI labels in the video's language ('es' or anything else for English). */
export const labels = lang => (lang === 'es' ? LABELS.es : LABELS.en);

async function loadFonts(style) {
  await Promise.all(style.faces.map(f => document.fonts.load(`600 24px "${f.family}"`, 'AaÁáÉéÑñÜü')));
  await document.fonts.ready;
}

const mmss = (s) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export async function boot({ makeScene, style, loadExport }) {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const canvas = $('c');
  await loadFonts(style);
  const spec = makeScene(kit);
  const engine = createEngine({ canvas, style, spec });
  const { duration, fps } = engine;
  document.title = spec.title ?? document.title;
  // The player UI speaks the video's language: `lang` on the spec, else detected from the title and the on-screen text.
  const lang = spec.lang ?? detectLang([spec.title, ...engine.texts().map(x => x.text)]);
  const L = labels(lang);
  document.documentElement.lang = lang;

  window.__explainEngine = engine;
  window.__explainRender = t => engine.render(t);
  window.__explainQA = (times, opts) => runQA(engine, times, opts);

  engine.render(Number(params.get('t')) || 0);

  if (params.has('qa')) {
    // ?qa=1 writes the QA report into the page (read it with chrome --dump-dom or the console).
    document.body.classList.add('still');
    const pre = document.createElement('pre');
    pre.id = 'qa';
    pre.textContent = JSON.stringify(runQA(engine));
    document.body.appendChild(pre);
    window.__ready = true;
    return engine;
  }

  if (params.has('t')) {
    document.body.classList.add('still');
    window.__ready = true;
    return engine;
  }
  if (params.has('export') || params.has('still')) {
    const m = await loadExport();
    window.__ready = true;
    await m.runExport?.({ canvas, render: engine.render, duration, fps });
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
  scrub.max = String(duration);
  scrub.step = String(1 / fps);

  const show = (t) => {
    cur = t;
    scrub.value = String(t);
    time.textContent = `${mmss(t)} / ${mmss(duration)}`;
    engine.render(t);
  };
  const setPaused = (v) => {
    paused = v;
    play.textContent = v ? L.play : L.pause;
    t0 = real.now() - cur * 1000;
  };
  play.onclick = () => setPaused(!paused);
  scrub.oninput = () => {
    setPaused(true);
    show(Number(scrub.value));
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
      const data = await fn({ canvas, render: engine.render, duration, fps });
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
    if (!paused) { show(((real.now() - t0) / 1000) % duration); }
    real.raf(frame);
  };
  show(0);
  window.__ready = true;
  real.raf(frame);
  return engine;
}
