import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { findChrome } from './chrome.ts';
import { dateStamp, defaultStillTimes, explainerDir, parseArgs, parseBitrate, parseStyle, parseTimes, resolveTarget, sceneTemplate, slugify, UsageError } from './index.ts';

const cli = join(import.meta.dir, 'index.ts');

async function run(args: string[], home: string) {
  const p = Bun.spawn(['bun', cli, ...args], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, EXPLAIN_HOME: home } });
  const [stdout, stderr] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  return { code: await p.exited, stdout, stderr };
}

describe('bitrate flag', () => {
  test('--bitrate takes megabits per second and rejects nonsense', () => {
    expect(parseArgs(['d', '--bitrate', '2.5']).flags.bitrate).toBe('2.5');
    expect(parseBitrate('2.5')).toBe(2.5e6);
    expect(parseBitrate(undefined)).toBeUndefined();
    expect(() => parseBitrate('0.1')).toThrow(UsageError);
    expect(() => parseBitrate(true)).toThrow(UsageError);
  });
});

describe('argument parsing', () => {
  test('splits positionals and flags, value flags consume one token', () => {
    const p = parseArgs(['demo', '--style', 'sketch', '--force', '--title=Hola mundo']);
    expect(p.positional).toEqual(['demo']);
    expect(p.flags).toEqual({ style: 'sketch', force: true, title: 'Hola mundo' });
  });
  test('boolean flag does not eat the next positional', () => {
    expect(parseArgs(['--force', 'dir']).positional).toEqual(['dir']);
  });
  test('missing value is a usage error', () => {
    expect(() => parseArgs(['--style'])).toThrow(UsageError);
  });
  test('style and times validation', () => {
    expect(parseStyle('hologram')).toBe('hologram');
    expect(parseStyle(undefined)).toBeUndefined();
    expect(() => parseStyle('neon')).toThrow(UsageError);
    expect(parseTimes('1,5.5,9')).toEqual([1, 5.5, 9]);
    expect(() => parseTimes('a,2')).toThrow(UsageError);
  });
  test('default still times: 40 % and 85 % of each scene', () => {
    expect(defaultStillTimes([{ start: 0, dur: 10 }, { start: 9, dur: 4 }])).toEqual([4, 8.5, 10.6, 12.4]);
  });
});

describe('folder naming', () => {
  test('slugify strips accents and symbols', () => {
    expect(slugify('Cómo viaja un PR!')).toBe('como-viaja-un-pr');
    expect(slugify('  --a__b--  ')).toBe('a-b');
    expect(slugify('???')).toBe('');
  });
  test('dated folder under EXPLAIN_HOME', () => {
    const home = mkdtempSync(join(tmpdir(), 'explain-home-'));
    process.env.EXPLAIN_HOME = home;
    expect(dateStamp(new Date(2026, 10, 7))).toBe('2026-11-07');
    expect(explainerDir('Mi Demo', new Date(2026, 10, 7))).toBe(join(home, '2026-11-07-mi-demo'));
    expect(() => explainerDir('???')).toThrow(UsageError);
    delete process.env.EXPLAIN_HOME;
  });
  test('resolveTarget accepts a folder or a scene file and rejects others', () => {
    const dir = mkdtempSync(join(tmpdir(), 'explain-t-'));
    expect(() => resolveTarget(dir)).toThrow(UsageError);
    writeFileSync(join(dir, 'scene.js'), 'x');
    expect(resolveTarget(dir).scene).toBe(join(dir, 'scene.js'));
    expect(resolveTarget(join(dir, 'scene.js')).dir).toBe(dir);
    expect(() => resolveTarget(undefined)).toThrow(UsageError);
  });
});

describe('template', () => {
  test('is valid JS with a 4 s, 2-scene shape and no opening marks', () => {
    const src = sceneTemplate('Título "raro"');
    expect(src).toContain('export const title = "Título \\"raro\\"";');
    expect((src.match(/scene\(\{/g) ?? []).length).toBe(2);
    expect(/[¿¡]/.test(src.replace(/opening marks used in Spanish questions or exclamations/, ''))).toBe(false);
    expect(new Bun.Transpiler({ loader: 'js' }).transformSync(src)).toBeTruthy();
  });
  test('cli new writes it under EXPLAIN_HOME and prints the path', async () => {
    const home = mkdtempSync(join(tmpdir(), 'explain-home-'));
    const r = await run(['new', 'Demo Uno', '--style', 'sketch', '--title', 'Demo'], home);
    expect(r.code).toBe(0);
    const path = r.stdout.trim();
    expect(path.startsWith(home)).toBe(true);
    expect(path.endsWith(`${dateStamp()}-demo-uno/scene.js`)).toBe(true);
    expect(readFileSync(path, 'utf8')).toContain('"Demo"');
    expect(JSON.parse(readFileSync(join(path, '../explain.json'), 'utf8')).style).toBe('sketch');
    expect((await run(['new', 'Demo Uno'], home)).code).toBe(2);
  });
  test('usage errors exit 2, help exits 0', async () => {
    const home = mkdtempSync(join(tmpdir(), 'explain-home-'));
    expect((await run(['bogus'], home)).code).toBe(2);
    expect((await run(['new'], home)).code).toBe(2);
    const h = await run(['export', '--help'], home);
    expect(h.code).toBe(0);
    expect(h.stdout).toContain('--force');
  });
});

const maybe = findChrome() ? test : test.skip;

describe('a scene that throws', () => {
  maybe('check, stills and export exit 1 within seconds and name the scene and the error', async () => {
    const home = mkdtempSync(join(tmpdir(), 'explain-throw-'));
    const scene = (await run(['new', 'boom'], home)).stdout.trim();
    const dir = join(scene, '..');
    writeFileSync(scene, 'export default ({ scene }) => ({ scenes: [scene({ name: \'boom-scene\', dur: 2, build(s) { s.doesNotExist(); } })] });\n');
    for (const args of [['check', dir], ['stills', dir, '--at', '1'], ['export', dir]]) {
      const start = performance.now();
      const r = await run(args, home);
      const seconds = (performance.now() - start) / 1000;
      expect(r.code).toBe(1);
      expect(seconds).toBeLessThan(25);
      expect(r.stderr).toContain('boom-scene');
      expect(r.stderr).toContain('doesNotExist');
    }
  }, 120_000);
});

describe('end to end', () => {
  maybe('new, build, check, stills, export on the template', async () => {
    const home = mkdtempSync(join(tmpdir(), 'explain-e2e-'));
    const scene = (await run(['new', 'e2e'], home)).stdout.trim();
    const dir = join(scene, '..');
    const b = await run(['build', dir], home);
    expect(b.code).toBe(0);
    expect(existsSync(b.stdout.trim())).toBe(true);
    const c = await run(['check', dir], home);
    expect(c.stderr).toBeTruthy();
    expect(c.code).toBe(0);
    expect(JSON.parse(c.stdout).ok).toBe(true);
    const s = await run(['stills', dir], home);
    expect(s.code).toBe(0);
    expect(s.stdout.trim().split('\n').length).toBe(4);
    const e = await run(['export', dir], home);
    expect(e.code).toBe(0);
    const file = e.stdout.split('\n')[0];
    expect(file.endsWith('.mp4')).toBe(true);
    expect(existsSync(file)).toBe(true);
    expect(e.stdout).toContain('duration 4.0 s');
  }, 300_000);
});
