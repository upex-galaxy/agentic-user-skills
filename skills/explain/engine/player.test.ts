import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';
import { resolveAudio } from '../cli/audio.ts';
import { findChrome } from '../cli/chrome.ts';
import { withErrorProbe } from '../cli/headless.ts';
import { ensureBuilt, resolveTarget } from '../cli/index.ts';
import { runSession } from '../cli/session.ts';
import { planVoice } from '../cli/voice.ts';
import { ciLimit } from './ci-limit.ts';
import { labels } from './player.js';
import { encodeWav } from './wav.js';

describe('player labels', () => {
  test('follow the video language: Spanish for es, English otherwise, never an opening mark', () => {
    expect(labels('es').play).toBe('Reproducir');
    expect(labels('en').play).toBe('Play');
    expect(labels(undefined).export).toBe('Export MP4');
    expect(labels('es').soundOn).toBe('Sonido: sí');
    expect(labels('en').soundOff).toBe('Sound off');
    for (const l of [labels('es'), labels('en')]) { expect(/[¿¡]/.test(Object.values(l).join(' '))).toBe(false); }
  });
});

const temps: string[] = [];
const temp = (prefix: string) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
};
afterAll(() => { for (const d of temps) { rmSync(d, { recursive: true, force: true }); } });

// 14 s narrated scene plus 6 s: long enough to seek to 12 s. Scene 1 has a 3 s voice clip.
const SCENE = `export const title = 'Sonido';
export default ({ scene }) => ({ title, lang: 'es', scenes: [
  scene({ name: 'uno', dur: 14, say: 'Hola, esto es una prueba.', build(s) { s.heading({ text: 'Uno' }); } }),
  scene({ name: 'dos', dur: 6, build(s) { s.heading({ text: 'Dos' }); } }),
] });
`;

/** Build a page in a temp folder; `audio` true gives sound on plus a Kokoro voice from a fake cache. */
async function builtPage(audio: boolean): Promise<string> {
  const dir = temp('explain-player-');
  process.env.EXPLAIN_VOICE_DIR = temp('explain-voice-');
  writeFileSync(join(dir, 'scene.js'), SCENE);
  if (!audio) { return readFileSync((await ensureBuilt(resolveTarget(dir), undefined)).index, 'utf8'); }
  const a = await resolveAudio(join(dir, 'scene.js'), { voice: 'kokoro' }, {});
  for (const e of planVoice(a.cues, a.voice!)) {
    writeFileSync(e.wav, encodeWav([new Float32Array(24000 * 3).map((_, i) => Math.sin(i / 9) * 0.3)], 24000));
  }
  return readFileSync((await ensureBuilt(resolveTarget(dir), undefined, false, { voice: 'kokoro', sound: 'on' })).index, 'utf8');
}

// Counts AudioContext constructions; `breakStorage` makes localStorage throw, to prove the page does not need it.
const INIT = (breakStorage: boolean) => `<script>
window.__ctxCount = 0;
(function () {
  var Real = window.AudioContext;
  window.AudioContext = function (o) { window.__ctxCount++; return new Real(o); };
  window.AudioContext.prototype = Real.prototype;
  if (${breakStorage}) {
    Storage.prototype.getItem = function () { throw new Error('blocked'); };
    Storage.prototype.setItem = function () { throw new Error('blocked'); };
  }
})();
</script>`;

/* eslint-disable ts/no-explicit-any -- the probe returns page-defined JSON */
/** Serve the page with a probe that runs `body` (async JS in the page, returns a JSON value) once __ready; resolves with it. */
async function inChrome(html: string, query: Record<string, string>, body: string, breakStorage = false): Promise<Record<string, any>> {
  let result: Record<string, any> = {};
  const probe = `<script>
(function () {
  var token = new URLSearchParams(location.search).get('token') || '';
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var timer = setInterval(async function () {
    if (!window.__ready) { return; }
    clearInterval(timer);
    var out = await (async function () { ${body} })();
    fetch('/result', { method: 'POST', headers: { 'x-explain-token': token }, body: JSON.stringify(out) });
  }, 50);
})();
</script>`;
  const served = withErrorProbe(html).replace('<head>', `<head>${INIT(breakStorage)}`).replace('</body>', `${probe}</body>`);
  await runSession({
    html: served,
    query,
    label: 'Player test',
    timeoutMs: 60_000,
    limits: { result: 64 * 1024 },
    onPost: (_name, _url, buf) => {
      result = JSON.parse(new TextDecoder().decode(buf));
      return true;
    },
  });
  return result;
}

const maybe = findChrome() ? test : test.skip;

describe('preview sound in Chrome', () => {
  maybe('seek lands within 20 ms, and over 5 s of playback engine time follows the audio clock within 33 ms', async () => {
    const html = await builtPage(true);
    const r = await inChrome(html, {}, `
      var $ = function (id) { return document.getElementById(id); };
      var before = { hidden: $('sound').hidden, enabled: window.__explainAudio.enabled(), ctx: window.__ctxCount };
      $('sound').click();
      var scrub = $('scrub');
      scrub.value = '12';
      scrub.dispatchEvent(new Event('input'));
      var silentWhileScrubbing = !window.__explainAudio.playing();
      scrub.dispatchEvent(new Event('change'));
      var seek = window.__explainAudio.offset();
      var playing = window.__explainAudio.playing();
      var worst = 0;
      var t0 = performance.now();
      var from = window.__explainAudio.offset();
      while (performance.now() - t0 < 5000) {
        await sleep(40);
        worst = Math.max(worst, Math.abs(window.__explainAudio.offset() - window.__explainAudio.time()));
      }
      var advanced = window.__explainAudio.offset() - from;
      $('play').click();
      var paused = { playing: window.__explainAudio.playing(), offset: window.__explainAudio.offset() };
      return { before: before, seek: seek, playing: playing, silentWhileScrubbing: silentWhileScrubbing, worst: worst, advanced: advanced, paused: paused, ctx: window.__ctxCount, label: $('sound').textContent, stored: localStorage.getItem('explain-sound') };
    `);
    expect(r.before).toEqual({ hidden: false, enabled: false, ctx: 0 });
    expect(r.silentWhileScrubbing).toBe(true);
    expect(Math.abs(r.seek - 12)).toBeLessThan(ciLimit(0.02, 2));
    expect(r.playing).toBe(true);
    // The drift is the time since the last drawn frame, and runners reached 48 ms. A stalled loop or a wrong clock base drifts by seconds.
    expect(r.worst).toBeLessThan(ciLimit(0.033, 3));
    expect(r.advanced).toBeGreaterThan(5 - ciLimit(0.5, 2));
    expect(r.paused.playing).toBe(false);
    expect(Math.abs(r.paused.offset - 17)).toBeLessThan(ciLimit(0.5, 2));
    expect(r.ctx).toBe(1);
    expect(r.label).toBe('Sonido: sí');
    expect(r.stored).toBe('1');
  }, 120_000);

  maybe('?t=, ?qa=1 and ?info=1 never create an AudioContext', async () => {
    const html = await builtPage(true);
    for (const q of [{ t: '5' }, { qa: '1' }, { info: '1' }] as Record<string, string>[]) {
      const r = await inChrome(html, q, 'await sleep(300); return { ctx: window.__ctxCount };');
      expect(r.ctx).toBe(0);
    }
  }, 120_000);

  maybe('a silent page keeps the sound button hidden and still plays', async () => {
    const html = await builtPage(false);
    const r = await inChrome(html, {}, `
      var b = document.getElementById('sound');
      await sleep(${ciLimit(300, 3)});
      return { hidden: b.hidden, display: getComputedStyle(b).display, audio: !!window.__explainAudio && window.__explainAudio.enabled(), ctx: window.__ctxCount, t: Number(document.getElementById('scrub').value) };
    `);
    expect(r).toMatchObject({ hidden: true, display: 'none', audio: false, ctx: 0 });
    expect(r.t).toBeGreaterThan(0);
  }, 120_000);

  maybe('the page works when localStorage throws', async () => {
    const html = await builtPage(true);
    const r = await inChrome(html, {}, `
      var b = document.getElementById('sound');
      b.click();
      return { enabled: window.__explainAudio.enabled(), playing: window.__explainAudio.playing(), label: b.textContent };
    `, true);
    expect(r).toEqual({ enabled: true, playing: true, label: 'Sonido: sí' });
  }, 120_000);
});
