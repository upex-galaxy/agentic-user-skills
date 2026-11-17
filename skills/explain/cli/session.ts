// One headless session: serve the built page on 127.0.0.1, open it in Chrome, take the page's POSTs, clean up.
// Security: the server binds loopback on a random port and requires, on every request, the Host it listens on; on
// every POST, the server's own Origin and the per-run random token in the x-explain-token header (a no-cors request
// from another page cannot carry a custom header). Each endpoint has a body cap. The page learns the token from its
// own URL (?token=); it is never written into the page.
import type { ChromeHandle } from './chrome.ts';
import { randomBytes } from 'node:crypto';
import { launchChrome } from './chrome.ts';

export const TOKEN_HEADER = 'x-explain-token';

/** Thrown by an `onPost` handler to answer 400 without ending the session. */
export class BadRequest extends Error {}

export interface SessionOptions {
  html: string
  /** Extra query parameters for the page URL (for example { export: '1' }). */
  query: Record<string, string>
  /** Used in timeout and crash messages: 'QA', 'Export', 'Stills'. */
  label: string
  timeoutMs: number
  /** Accepted POST endpoints (path without the slash) and their body cap in bytes. `__error` is always accepted. */
  limits: Record<string, number>
  /** Handle an authenticated POST. Return true when the session is complete; throw to fail it. */
  onPost: (name: string, url: URL, body: ArrayBuffer) => boolean | undefined
  /** Injected in tests; defaults to a headless Chrome. */
  launch?: (url: string) => ChromeHandle
}

const ERROR_LIMIT = 64 * 1024;

const within = async (p: Promise<unknown>, ms: number) => Promise.race([p.then(() => true, () => true), Bun.sleep(ms).then(() => false)]);

export interface SessionServer {
  pageUrl: string
  origin: string
  token: string
  /** Resolves when `onPost` reports completion; rejects on a page error or a handler failure. */
  done: Promise<void>
  stop: () => Promise<void>
}

export function startServer(opts: Pick<SessionOptions, 'html' | 'query' | 'limits' | 'onPost'>): SessionServer {
  const token = randomBytes(24).toString('hex');
  const limits: Record<string, number> = { __error: ERROR_LIMIT, ...opts.limits };
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const done = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  done.catch(() => {});
  let host = '';
  let origin = '';
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    maxRequestBodySize: Math.max(...Object.values(limits)),
    async fetch(req) {
      const url = new URL(req.url);
      if (req.headers.get('host') !== host) { return new Response('forbidden', { status: 403 }); }
      if (req.method === 'GET') {
        if (url.pathname === '/' && url.searchParams.get('token') === token) { return new Response(opts.html, { headers: { 'content-type': 'text/html; charset=utf-8' } }); }
        return new Response('not found', { status: 404 });
      }
      if (req.method !== 'POST') { return new Response('method not allowed', { status: 405 }); }
      if (req.headers.get('origin') !== origin || req.headers.get(TOKEN_HEADER) !== token) { return new Response('forbidden', { status: 403 }); }
      const name = url.pathname.slice(1);
      const limit = Object.hasOwn(limits, name) ? limits[name] : undefined;
      if (limit === undefined) { return new Response('not found', { status: 404 }); }
      if (Number(req.headers.get('content-length') ?? 0) > limit) { return new Response('too large', { status: 413 }); }
      const body = await req.arrayBuffer();
      if (body.byteLength > limit) { return new Response('too large', { status: 413 }); }
      if (name === '__error') {
        reject(new Error(`The page threw: ${new TextDecoder().decode(body)}`));
        return new Response('ok');
      }
      try {
        if (opts.onPost(name, url, body)) { resolve(); }
      }
      catch (e) {
        if (e instanceof BadRequest) { return new Response(e.message, { status: 400 }); }
        reject(e as Error);
      }
      return new Response('ok');
    },
  });
  host = `127.0.0.1:${server.port}`;
  origin = `http://${host}`;
  const query = new URLSearchParams({ token, ...opts.query });
  return {
    pageUrl: `${origin}/?${query}`,
    origin,
    token,
    done,
    async stop() { await within(server.stop(true), 2000); },
  };
}

/** Serve the page, open it in Chrome and wait for completion, a page error, Chrome exiting, or the timeout. */
export async function runSession(opts: SessionOptions): Promise<{ chrome: string }> {
  const srv = startServer(opts);
  let chrome: ChromeHandle;
  try { chrome = (opts.launch ?? launchChrome)(srv.pageUrl); }
  catch (e) {
    await srv.stop();
    throw e;
  }
  const tail = () => {
    const t = chrome.stderrTail();
    return t ? `\nChrome stderr (tail):\n${t}` : '';
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${opts.label} timed out after ${Math.round(opts.timeoutMs / 1000)} s (Chrome: ${chrome.binary})${tail()}`)), opts.timeoutMs);
  });
  const crashed = chrome.exited.then((code) => {
    throw new Error(`Chrome exited with code ${code} before the page finished (${opts.label}; Chrome: ${chrome.binary})${tail()}`);
  });
  crashed.catch(() => {});
  try {
    await Promise.race([srv.done, timeout, crashed]);
  }
  finally {
    clearTimeout(timer);
    await chrome.kill();
    await srv.stop();
  }
  return { chrome: chrome.binary };
}
