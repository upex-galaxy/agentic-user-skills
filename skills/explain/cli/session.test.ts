import type { ChromeHandle } from './chrome.ts';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';
import { ciLimit } from '../engine/ci-limit.ts';
import { stillFile, stills } from './export.ts';
import { runSession, startServer, TOKEN_HEADER } from './session.ts';

const temps: string[] = [];
afterAll(() => { for (const d of temps) { rmSync(d, { recursive: true, force: true }); } });

/** A launcher that plays the page itself: `script` gets the page URL; it never exits on its own. */
function fakeChrome(script: (pageUrl: URL) => Promise<void>, exitCode?: number): (url: string) => ChromeHandle {
  return (url) => {
    let exit!: (code: number) => void;
    const exited = new Promise<number>(r => exit = r);
    if (exitCode !== undefined) { setTimeout(() => exit(exitCode), 50); }
    else { void script(new URL(url)); }
    return { binary: 'fake-chrome', exited, stderrTail: () => 'fake stderr line', kill: async () => exit(0) };
  };
}

const post = async (u: URL, path: string, headers: Record<string, string>, body = 'x') => fetch(new URL(path, u.origin), { method: 'POST', body, headers });
const auth = (u: URL) => ({ [TOKEN_HEADER]: u.searchParams.get('token') ?? '', origin: u.origin });

describe('local server security', () => {
  test('a POST without the token or from another origin is rejected and does not touch the session', async () => {
    let calls = 0;
    const srv = startServer({ html: '<p>page</p>', query: { qa: '1' }, limits: { __info: 1024 }, onPost: () => {
      calls++;
      return true;
    } });
    const u = new URL(srv.pageUrl);
    try {
      expect((await post(u, '/__info', { origin: u.origin })).status).toBe(403);
      expect((await post(u, '/__info', { [TOKEN_HEADER]: 'guess', origin: u.origin })).status).toBe(403);
      expect((await post(u, '/__info', { [TOKEN_HEADER]: srv.token, origin: 'https://evil.example' })).status).toBe(403);
      expect((await post(u, '/__error', { origin: 'https://evil.example' })).status).toBe(403);
      expect((await fetch(new URL('/', u.origin))).status).toBe(404);
      expect(calls).toBe(0);
      expect(await Promise.race([srv.done.then(() => 'settled', () => 'settled'), Bun.sleep(100).then(() => 'pending')])).toBe('pending');
      expect((await fetch(u)).status).toBe(200);
      expect((await post(u, '/__info', auth(u), 'x'.repeat(2048))).status).toBe(413);
      expect((await post(u, '/__nope', auth(u))).status).toBe(404);
      expect((await post(u, '/__info', auth(u))).status).toBe(200);
      await srv.done;
      expect(calls).toBe(1);
    }
    finally { await srv.stop(); }
  });

  test('a still name with a path is rejected and writes nothing; a valid one lands in the stills folder', async () => {
    const root = mkdtempSync(join(tmpdir(), 'explain-trav-'));
    temps.push(root);
    const outDir = join(root, 'stills');
    mkdirSync(outDir);
    const statuses: number[] = [];
    const res = await stills({
      html: '<p>page</p>',
      outDir,
      times: [1],
      timeoutMs: 10_000,
      launch: fakeChrome(async (u) => {
        for (const t of ['/../../ESCAPED', '../x', '-1', 'NaN', '']) { statuses.push((await post(u, `/__still?t=${encodeURIComponent(t)}`, auth(u))).status); }
        statuses.push((await post(u, '/__still?t=1', auth(u), 'png')).status);
        await post(u, '/__done', auth(u));
      }),
    });
    expect(statuses).toEqual([400, 400, 400, 400, 400, 200]);
    expect(res.files).toEqual([join(outDir, 'still-1.png')]);
    expect(readdirSync(root).sort()).toEqual(['stills']);
    expect(readdirSync(outDir)).toEqual(['still-1.png']);
    expect(existsSync(join(root, 'ESCAPED.png'))).toBe(false);
    expect(() => stillFile(outDir, '/../../ESCAPED')).toThrow();
  });
});

describe('dead Chrome', () => {
  test('an early exit fails at once with the exit code and the stderr tail', async () => {
    const start = performance.now();
    const run = runSession({ html: '<p/>', query: {}, label: 'QA', timeoutMs: 60_000, limits: {}, onPost: () => true, launch: fakeChrome(async () => {}, 3) });
    const err = await run.then(() => null, (e: Error) => e);
    expect(err?.message).toMatch(/exited with code 3[\s\S]*fake stderr line/);
    // Far under the 60 s session timeout, which is what a missed exit would wait for.
    expect(performance.now() - start).toBeLessThan(ciLimit(2000, 3));
  });
});
