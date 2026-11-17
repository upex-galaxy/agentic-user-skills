import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

export interface ChromeSearch {
  env: Record<string, string | undefined>
  home: string
  /** System Chrome install paths, checked in order. */
  systemPaths: string[]
  which: (name: string) => string | null
}

const defaultSearch = (): ChromeSearch => ({
  env: process.env,
  home: homedir(),
  systemPaths: process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', join(homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')]
    : [],
  which: name => Bun.which(name),
});

/** The Playwright headless shell encodes full-range video (yuvj420p): fine for QA and stills, refused for export. */
export const isHeadlessShell = (binary: string) => /headless[-_]shell/.test(basename(binary));

const listDirs = (dir: string) => {
  try { return readdirSync(dir); }
  catch { return []; }
};

/** Playwright browser roots: PLAYWRIGHT_BROWSERS_PATH, then the macOS and Linux default caches. */
function playwrightRoots(s: ChromeSearch): string[] {
  const roots = [s.env.PLAYWRIGHT_BROWSERS_PATH, join(s.home, 'Library/Caches/ms-playwright'), join(s.home, '.cache/ms-playwright')];
  return [...new Set(roots.filter((r): r is string => !!r && r !== '0' && existsSync(r)))];
}

/** Newest-first binaries under `<root>/<prefix><revision>/<platform dir>/<binary>`. */
function playwrightBinaries(s: ChromeSearch, prefix: string, binaries: (platformDir: string) => string[]): string[] {
  const found: { rev: number, path: string }[] = [];
  for (const root of playwrightRoots(s)) {
    for (const d of listDirs(root).filter(d => d.startsWith(prefix))) {
      const rev = Number(d.slice(prefix.length));
      if (!Number.isFinite(rev)) { continue; }
      for (const pd of listDirs(join(root, d))) {
        for (const rel of binaries(pd)) {
          const p = join(root, d, pd, rel);
          if (existsSync(p)) { found.push({ rev, path: p }); }
        }
      }
    }
  }
  return found.sort((a, b) => b.rev - a.rev).map(f => f.path);
}

const fullBrowser = (pd: string) => pd.startsWith('chrome-mac')
  ? ['Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'Chromium.app/Contents/MacOS/Chromium']
  : pd.startsWith('chrome-linux') ? ['chrome'] : [];
const headlessShell = (pd: string) => pd.startsWith('chrome-headless-shell') ? ['chrome-headless-shell'] : [];

/**
 * Locate a Chrome/Chromium binary, or return null. Order: EXPLAIN_CHROME (an error when set but missing), system
 * Chrome, the newest full Playwright browser (Chrome for Testing or Chromium; macOS and Linux layouts), a browser on
 * PATH, and last the Playwright headless shell.
 */
export function findChrome(search: Partial<ChromeSearch> = {}): string | null {
  const s = { ...defaultSearch(), ...search };
  const forced = s.env.EXPLAIN_CHROME;
  if (forced) {
    if (!existsSync(forced)) { throw new Error(`EXPLAIN_CHROME is set but does not exist: ${forced}`); }
    return forced;
  }
  for (const p of s.systemPaths) { if (existsSync(p)) { return p; } }
  const playwright = playwrightBinaries(s, 'chromium-', fullBrowser);
  if (playwright.length) { return playwright[0]; }
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const found = s.which(name);
    if (found) { return found; }
  }
  return playwrightBinaries(s, 'chromium_headless_shell-', headlessShell)[0] ?? null;
}

export interface ChromeHandle {
  binary: string
  /** Resolves with the exit code when Chrome exits on its own or is killed. */
  exited: Promise<number>
  /** The last lines Chrome wrote to stderr. */
  stderrTail: () => string
  /** SIGTERM, then SIGKILL after 3 s; returns within about 5 s whatever Chrome does. */
  kill: () => Promise<void>
}

const PROFILE_MAX_AGE_MS = 24 * 3600_000;
const TAIL_CHARS = 4096;

const within = async (p: Promise<unknown>, ms: number) => Promise.race([p.then(() => true), Bun.sleep(ms).then(() => false)]);

/** Remove throwaway profiles older than a day (left by an interrupted run). */
function sweepProfiles(root: string): void {
  const now = Date.now();
  for (const d of listDirs(root).filter(d => d.startsWith('p-'))) {
    try {
      if (now - statSync(join(root, d)).mtimeMs > PROFILE_MAX_AGE_MS) { rmSync(join(root, d), { recursive: true, force: true }); }
    }
    catch {}
  }
}

/** Spawn headless Chrome on `url` with a throwaway profile under ~/.explain/chrome-profile. */
export function launchChrome(url: string, binary = findChrome()): ChromeHandle {
  if (!binary) { throw new Error('No Chrome/Chromium found. Install Google Chrome, run `bunx playwright install chromium`, or set EXPLAIN_CHROME to a binary path.'); }
  const root = join(homedir(), '.explain', 'chrome-profile');
  mkdirSync(root, { recursive: true });
  sweepProfiles(root);
  const profile = join(root, `p-${process.pid}-${Date.now()}`);
  const args = [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    // Without these, Chrome for Testing on macOS waits on the keychain and never loads the page.
    '--use-mock-keychain',
    '--password-store=basic',
    '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${profile}`,
    url,
  ];
  const proc = Bun.spawn([binary, ...args], { stdout: 'ignore', stderr: 'pipe' });
  // Drain stderr continuously (Chrome is chatty; a full pipe would block it) and keep only the tail.
  let tail = '';
  void (async () => {
    const decoder = new TextDecoder();
    const reader = proc.stderr.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) { break; }
        tail = (tail + decoder.decode(value, { stream: true })).slice(-TAIL_CHARS);
      }
    }
    catch {}
  })();
  let killing: Promise<void> | undefined;
  return {
    binary,
    exited: proc.exited,
    stderrTail: () => tail.trim().split('\n').slice(-12).join('\n'),
    async kill() {
      killing ??= (async () => {
        proc.kill('SIGTERM');
        if (!await within(proc.exited, 3000)) {
          proc.kill('SIGKILL');
          await within(proc.exited, 2000);
        }
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
      })();
      return killing;
    },
  };
}
