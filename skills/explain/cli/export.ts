import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { launchChrome } from './chrome.ts';

export interface ExportResult {
  file: string
  bytes: number
  seconds: number
  chrome: string
}

interface Session {
  files: string[]
  done: Promise<void>
  chrome: string
}

const DEFAULT_TIMEOUT_MS = 10 * 60_000;

/**
 * Serve `html` on 127.0.0.1, open it in headless Chrome with `query`, and handle the page's POSTs.
 * `onPost` returns true when the session is complete.
 */
async function runSession(
  html: string,
  query: string,
  timeoutMs: number,
  onPost: (path: string, url: URL, body: ArrayBuffer) => boolean,
): Promise<Session> {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const done = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    maxRequestBodySize: 1024 * 1024 * 1024,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === 'GET' && url.pathname === '/') { return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }); }
      if (req.method === 'POST') {
        const body = await req.arrayBuffer();
        if (url.pathname === '/__error') {
          reject(new Error(`Export failed in the page: ${new TextDecoder().decode(body)}`));
          return new Response('ok');
        }
        try {
          if (onPost(url.pathname, url, body)) { resolve(); }
        }
        catch (e) {
          reject(e as Error);
        }
        return new Response('ok');
      }
      return new Response('not found', { status: 404 });
    },
  });
  const chrome = launchChrome(`http://127.0.0.1:${server.port}/${query}`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(`Export timed out after ${Math.round(timeoutMs / 1000)} s (Chrome: ${chrome.binary})`)), timeoutMs);
  });
  try {
    await Promise.race([done, timeout]);
  }
  finally {
    clearTimeout(timer);
    await chrome.kill();
    await server.stop(true);
  }
  return { files: [], done, chrome: chrome.binary };
}

export async function exportVideo(opts: { html: string, out: string, duration: number, fps?: number, timeoutMs?: number }): Promise<ExportResult> {
  const start = performance.now();
  let bytes = 0;
  const session = await runSession(opts.html, '?export=1', opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, (path, _url, body) => {
    if (path !== '/__export') { return false; }
    mkdirSync(dirname(opts.out), { recursive: true });
    writeFileSync(opts.out, new Uint8Array(body));
    bytes = body.byteLength;
    return true;
  });
  return { file: opts.out, bytes, seconds: (performance.now() - start) / 1000, chrome: session.chrome };
}

export async function stills(opts: { html: string, outDir: string, times: number[], timeoutMs?: number }): Promise<{ files: string[], seconds: number, chrome: string }> {
  const start = performance.now();
  const files: string[] = [];
  mkdirSync(opts.outDir, { recursive: true });
  const session = await runSession(opts.html, `?still=${opts.times.join(',')}`, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, (path, url, body) => {
    if (path === '/__done') { return true; }
    if (path !== '/__still') { return false; }
    const file = join(opts.outDir, `still-${url.searchParams.get('t')}.png`);
    writeFileSync(file, new Uint8Array(body));
    files.push(file);
    return false;
  });
  return { files, seconds: (performance.now() - start) / 1000, chrome: session.chrome };
}
