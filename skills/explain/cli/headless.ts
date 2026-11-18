import type { ChromeHandle } from './chrome.ts';
import type { QaReport } from './qa.ts';
import { runSession } from './session.ts';

export interface SceneInfo {
  name: string
  start: number
  dur: number
  end: number
  /** Scene-local time the scene has settled (last caption or typing done), for contact sheets. */
  settle?: number
}

export interface PageInfo {
  qa: QaReport
  scenes: SceneInfo[]
  duration: number
  fps: number
  width?: number
  height?: number
  chrome: string
  seconds: number
}

// Appended to the served copy of the page (never to the file on disk). It waits for the engine,
// then POSTs the QA report (the page runs it itself under ?qa=1) and the scene list.
const PROBE = `<script>
(function () {
  var started = Date.now();
  var headers = { 'x-explain-token': new URLSearchParams(location.search).get('token') || '' };
  var timer = setInterval(function () {
    var pre = document.getElementById('qa');
    var eng = window.__explainEngine;
    if (window.__ready && pre && eng) {
      clearInterval(timer);
      fetch('/__info', { method: 'POST', headers: headers, body: JSON.stringify({ qa: JSON.parse(pre.textContent), scenes: eng.scenes, duration: eng.duration, fps: eng.fps, width: eng.W, height: eng.H }) });
    }
    else if (Date.now() - started > 60000) {
      clearInterval(timer);
      fetch('/__error', { method: 'POST', headers: headers, body: 'The page never became ready (fonts or scene build failed).' });
    }
  }, 100);
})();
</script>`;

// Injected at the top of <head> in every headless session (check, stills, export) so an uncaught error or an
// unhandled rejection (the engine boots asynchronously, so a throwing scene rejects) reaches the runner at once
// instead of leaving it waiting for a timeout.
const ERROR_PROBE = `<script>
(function () {
  var sent = false;
  function report(msg) {
    if (sent) { return; }
    sent = true;
    var token = new URLSearchParams(location.search).get('token') || '';
    try { fetch('/__error', { method: 'POST', headers: { 'x-explain-token': token }, body: String(msg), keepalive: true }); } catch (e) {}
  }
  window.addEventListener('error', function (e) { report((e.error && e.error.message) || e.message || 'uncaught error'); });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    report((r && r.message) || (r !== undefined ? String(r) : 'unhandled promise rejection'));
  });
})();
</script>`;

/** Insert the error reporter before any other script of the page. */
export function withErrorProbe(html: string): string {
  const head = /<head[^>]*>/i.exec(html);
  return head ? html.replace(head[0], `${head[0]}${ERROR_PROBE}`) : ERROR_PROBE + html;
}

/** Load the built page headless with ?qa=1 and return its QA report and scene list (`info: true`: scene list only, no QA run). */
export async function inspectPage(html: string, timeoutMs = 120_000, launch?: (url: string) => ChromeHandle, opts: { info?: boolean } = {}): Promise<PageInfo> {
  const start = performance.now();
  const probed = html.includes('</body>') ? html.replace('</body>', `${PROBE}</body>`) : html + PROBE;
  let info: Omit<PageInfo, 'chrome' | 'seconds'> | undefined;
  const session = await runSession({
    html: withErrorProbe(probed),
    query: opts.info ? { info: '1' } : { qa: '1' },
    label: opts.info ? 'Scenes' : 'QA',
    timeoutMs,
    limits: { __info: 8 * 1024 * 1024 },
    launch,
    onPost: (name, _url, body) => {
      if (name !== '__info') { return false; }
      info = JSON.parse(new TextDecoder().decode(body)) as Omit<PageInfo, 'chrome' | 'seconds'>;
      return true;
    },
  });
  return { ...info!, chrome: session.chrome, seconds: (performance.now() - start) / 1000 };
}

/** The page's scene list and timing, without running the QA gate. */
export async function pageScenes(html: string): Promise<{ scenes: SceneInfo[], duration: number }> {
  const info = await inspectPage(html, 120_000, undefined, { info: true });
  return { scenes: info.scenes, duration: info.duration };
}
