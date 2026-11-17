import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PLAYWRIGHT_CACHE = join(homedir(), 'Library/Caches/ms-playwright');

function newestUnderPlaywright(prefix: string, sub: (dir: string) => string[]): string | null {
  if (!existsSync(PLAYWRIGHT_CACHE)) { return null; }
  const dirs = readdirSync(PLAYWRIGHT_CACHE)
    .filter(d => d.startsWith(prefix))
    .sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()));
  for (const d of dirs) {
    for (const rel of sub(join(PLAYWRIGHT_CACHE, d))) {
      if (existsSync(rel)) { return rel; }
    }
  }
  return null;
}

/** Locate a Chrome/Chromium binary, or return null. Order: EXPLAIN_CHROME, system Chrome, Playwright cache, PATH. */
export function findChrome(): string | null {
  const env = process.env.EXPLAIN_CHROME;
  if (env && existsSync(env)) { return env; }
  if (existsSync(MAC_CHROME)) { return MAC_CHROME; }
  const chromium = newestUnderPlaywright('chromium-', dir =>
    readdirSync(dir).filter(d => d.startsWith('chrome-mac')).map(d => join(dir, d, 'Chromium.app/Contents/MacOS/Chromium')));
  if (chromium) { return chromium; }
  const shell = newestUnderPlaywright('chromium_headless_shell-', dir =>
    readdirSync(dir).filter(d => d.startsWith('chrome-headless-shell')).map(d => join(dir, d, 'chrome-headless-shell')));
  if (shell) { return shell; }
  for (const name of ['google-chrome', 'chromium', 'chromium-browser']) {
    const found = Bun.which(name);
    if (found) { return found; }
  }
  return null;
}

export interface ChromeHandle {
  binary: string
  kill: () => Promise<void>
}

/** Spawn headless Chrome on `url` with a throwaway profile under ~/.explain/chrome-profile. */
export function launchChrome(url: string): ChromeHandle {
  const binary = findChrome();
  if (!binary) { throw new Error('No Chrome/Chromium found. Install Google Chrome or set EXPLAIN_CHROME to a binary path.'); }
  const root = join(homedir(), '.explain', 'chrome-profile');
  mkdirSync(root, { recursive: true });
  const profile = join(root, `p-${process.pid}-${Date.now()}`);
  const args = [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${profile}`,
    url,
  ];
  const proc = Bun.spawn([binary, ...args], { stdout: 'ignore', stderr: 'ignore' });
  let killed = false;
  return {
    binary,
    async kill() {
      if (killed) {
        return;
      }
      killed = true;
      proc.kill();
      await proc.exited;
      // Chrome helper processes can hold the profile briefly; retry, it is ours and disposable.
      for (let i = 0; i < 10; i++) {
        try {
          rmSync(profile, { recursive: true, force: true });
          return;
        }
        catch {
          await Bun.sleep(200);
        }
      }
    },
  };
}
