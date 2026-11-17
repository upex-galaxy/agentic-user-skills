import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';
import { findChrome, isHeadlessShell, launchChrome } from './chrome.ts';

const temps: string[] = [];
const temp = (p: string) => {
  const d = mkdtempSync(join(tmpdir(), p));
  temps.push(d);
  return d;
};
afterAll(() => { for (const d of temps) { rmSync(d, { recursive: true, force: true }); } });

const touch = (p: string) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, '');
  return p;
};
const CFT = 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

describe('chrome discovery order (fake directory tree)', () => {
  const none = { env: {}, systemPaths: [], which: () => null };

  test('EXPLAIN_CHROME wins, and a missing one is an error, not a silent fallback', () => {
    const home = temp('explain-chrome-');
    const forced = touch(join(home, 'my-chrome'));
    const system = touch(join(home, 'Applications/Chrome'));
    expect(findChrome({ ...none, home, env: { EXPLAIN_CHROME: forced }, systemPaths: [system] })).toBe(forced);
    expect(() => findChrome({ ...none, home, env: { EXPLAIN_CHROME: join(home, 'gone') } })).toThrow('EXPLAIN_CHROME');
  });

  test('system Chrome, then the newest full Playwright browser (numeric revision), then PATH, then the headless shell', () => {
    const home = temp('explain-chrome-');
    const cache = join(home, 'Library/Caches/ms-playwright');
    const shell = touch(join(cache, 'chromium_headless_shell-1300/chrome-headless-shell-mac-arm64/chrome-headless-shell'));
    expect(findChrome({ ...none, home })).toBe(shell);
    expect(findChrome({ ...none, home, which: n => n === 'chromium' ? '/usr/bin/chromium' : null })).toBe('/usr/bin/chromium');
    const old = touch(join(cache, 'chromium-999/chrome-mac/Chromium.app/Contents/MacOS/Chromium'));
    expect(findChrome({ ...none, home })).toBe(old);
    const newest = touch(join(cache, 'chromium-1254/chrome-mac-arm64', CFT));
    touch(join(cache, 'chromium-1223/chrome-mac-arm64', CFT));
    expect(findChrome({ ...none, home, which: () => '/usr/bin/chromium' })).toBe(newest);
    const system = touch(join(home, 'Google Chrome'));
    expect(findChrome({ ...none, home, systemPaths: [system] })).toBe(system);
  });

  test('the Linux cache layout and PLAYWRIGHT_BROWSERS_PATH are searched', () => {
    const home = temp('explain-chrome-');
    const linux = touch(join(home, '.cache/ms-playwright/chromium-1254/chrome-linux64/chrome'));
    expect(findChrome({ ...none, home })).toBe(linux);
    const custom = temp('explain-pw-');
    const pinned = touch(join(custom, 'chromium-2000/chrome-linux/chrome'));
    expect(findChrome({ ...none, home, env: { PLAYWRIGHT_BROWSERS_PATH: custom } })).toBe(pinned);
  });

  test('headless shell detection', () => {
    expect(isHeadlessShell('/x/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/chrome-headless-shell')).toBe(true);
    expect(isHeadlessShell(`/x/chromium-1254/chrome-mac-arm64/${CFT}`)).toBe(false);
  });
});

describe('chrome process handling', () => {
  test('kill() returns within seconds even when the process ignores SIGTERM', async () => {
    const dir = temp('explain-stubborn-');
    const bin = join(dir, 'stubborn');
    writeFileSync(bin, '#!/bin/sh\ntrap \'\' TERM\necho "stubborn started" >&2\nwhile :; do sleep 0.1; done\n');
    chmodSync(bin, 0o755);
    const chrome = launchChrome('http://127.0.0.1:1/', bin);
    await Bun.sleep(300);
    const start = performance.now();
    await chrome.kill();
    expect(performance.now() - start).toBeLessThan(6500);
    expect(chrome.stderrTail()).toContain('stubborn started');
  }, 15_000);
});
