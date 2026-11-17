import type { QaReport } from './qa.ts';
import { launchChrome } from './chrome.ts';

export interface SceneInfo {
  name: string
  start: number
  dur: number
  end: number
}

export interface PageInfo {
  qa: QaReport
  scenes: SceneInfo[]
  duration: number
  fps: number
  chrome: string
  seconds: number
}

// Appended to the served copy of the page (never to the file on disk). It waits for the engine,
// then POSTs the QA report (the page runs it itself under ?qa=1) and the scene list.
const PROBE = `<script>
(function () {
  var started = Date.now();
  var timer = setInterval(function () {
    var pre = document.getElementById('qa');
    var eng = window.__explainEngine;
    if (window.__ready && pre && eng) {
      clearInterval(timer);
      fetch('/__info', { method: 'POST', body: JSON.stringify({ qa: JSON.parse(pre.textContent), scenes: eng.scenes, duration: eng.duration, fps: eng.fps }) });
    }
    else if (Date.now() - started > 60000) {
      clearInterval(timer);
      fetch('/__error', { method: 'POST', body: 'The page never became ready (fonts or scene build failed).' });
    }
  }, 100);
  window.addEventListener('error', function (e) { fetch('/__error', { method: 'POST', body: String(e.message) }); });
})();
</script>`;

/** Load the built page headless with ?qa=1 and return its QA report and scene list. */
export async function inspectPage(html: string, timeoutMs = 120_000): Promise<PageInfo> {
  const start = performance.now();
  const served = html.includes('</body>') ? html.replace('</body>', `${PROBE}</body>`) : html + PROBE;
  let resolve!: (v: Omit<PageInfo, 'chrome' | 'seconds'>) => void;
  let reject!: (e: Error) => void;
  const done = new Promise<Omit<PageInfo, 'chrome' | 'seconds'>>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === 'GET' && url.pathname === '/') { return new Response(served, { headers: { 'content-type': 'text/html; charset=utf-8' } }); }
      if (req.method === 'POST') {
        const body = await req.text();
        if (url.pathname === '/__error') { reject(new Error(`Page error: ${body}`)); }
        else if (url.pathname === '/__info') { resolve(JSON.parse(body) as Omit<PageInfo, 'chrome' | 'seconds'>); }
        return new Response('ok');
      }
      return new Response('not found', { status: 404 });
    },
  });
  const chrome = launchChrome(`http://127.0.0.1:${server.port}/?qa=1`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(`QA timed out after ${Math.round(timeoutMs / 1000)} s (Chrome: ${chrome.binary})`)), timeoutMs);
  });
  try {
    const info = await Promise.race([done, timeout]);
    return { ...info, chrome: chrome.binary, seconds: (performance.now() - start) / 1000 };
  }
  finally {
    clearTimeout(timer);
    await chrome.kill();
    await server.stop(true);
  }
}
