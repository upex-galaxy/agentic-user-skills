import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';
import { buildHash, buildPage, insideSkillDir, readBuildHash, SKILL_DIR } from './build.ts';
import { findChrome } from './chrome.ts';
import { dateStamp, defaultAt, defaultStillTimes, diskSpaceProblem, ensureBuilt, explainerDir, freeBytes, parseArgs, parseAt, parseBitrate, parsePreset, parseTimes, planStills, resolveOut, resolveTarget, sceneTemplate, sheetTimes, slugify, UsageError } from './index.ts';
import { listPresets, newPreset } from './presets.ts';

const temps: string[] = [];
/** A temp dir removed after the file's tests. */
function temp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}
afterAll(() => { for (const d of temps) { rmSync(d, { recursive: true, force: true }); } });

const cli = join(import.meta.dir, 'index.ts');

async function run(args: string[], home: string) {
  const p = Bun.spawn(['bun', cli, ...args], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, EXPLAIN_HOME: home, TZ: Intl.DateTimeFormat().resolvedOptions().timeZone } });
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
  test('sheet frames sit at the settled time of scenes spread over the video (70 % without one)', () => {
    const scenes = [{ start: 0, dur: 10 }, { start: 9, dur: 10 }, { start: 18, dur: 10 }];
    expect(sheetTimes(scenes, 3)).toEqual([7, 16, 25]);
    expect(sheetTimes(scenes, 6)).toHaveLength(6);
    expect(sheetTimes([{ start: 0, dur: 10, settle: 8.6 }, { start: 9, dur: 10, settle: 5 }], 2)).toEqual([8.6, 14]);
  });
  test('export refuses with a clear message under about 1 GB free', () => {
    expect(diskSpaceProblem('/x', 300 * 1024 ** 2)).toContain('only 0.29 GB free');
    expect(diskSpaceProblem('/x', 300 * 1024 ** 2)).toContain('needs about 1.00 GB');
    expect(diskSpaceProblem('/x', 5 * 1024 ** 3)).toBeNull();
    expect(freeBytes(join(tmpdir(), 'not', 'there', 'yet'))).toBeGreaterThan(0);
  });
  test('a repeated --at adds to the list', () => {
    expect(parseArgs(['x', '--at', 'a:1', '--at', 'b:2']).flags.at).toBe('a:1,b:2');
  });
  test('missing value is a usage error', () => {
    expect(() => parseArgs(['--style'])).toThrow(UsageError);
  });
  test('preset and times validation', () => {
    expect(parsePreset({ preset: 'hologram' })).toBe('hologram');
    expect(parsePreset({ style: 'sketch' })).toBe('sketch');
    expect(parsePreset({})).toBeUndefined();
    expect(() => parsePreset({ preset: 'neon' })).toThrow(UsageError);
    expect(parseTimes('1,5.5,9')).toEqual([1, 5.5, 9]);
    expect(() => parseTimes('a,2')).toThrow(UsageError);
  });
  test('--at takes scene-local times and names stills NN-<scene>@<lt>.png', () => {
    const scenes = [{ name: 'intro', start: 0, dur: 6 }, { name: 'ci', start: 5.4, dur: 8 }];
    expect(parseAt('ci:3.5,12.4')).toEqual([{ scene: 'ci', t: 3.5 }, { t: 12.4 }]);
    const plan = planStills(parseAt('ci:3.5,12.4,1'), scenes);
    expect(plan).toEqual([{ t: 8.9, name: '02-ci@3.5.png' }, { t: 12.4, name: '02-ci@7' + '.png' }, { t: 1, name: '01-intro@1.png' }]);
    // ci:3.5 is the same frame as global 8.9.
    expect(planStills([{ t: 8.9 }], scenes)[0].t).toBe(plan[0].t);
    expect(() => planStills(parseAt('nope:1'), scenes)).toThrow(UsageError);
    expect(() => planStills(parseAt('ci:9'), scenes)).toThrow('past its end');
    expect(defaultAt(scenes)).toHaveLength(4);
    expect(defaultAt(scenes, 'ci').map(e => e.t)).toEqual([1.6, 3.2, 4.8, 6.8]);
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
    const home = temp('explain-home-');
    process.env.EXPLAIN_HOME = home;
    expect(dateStamp(new Date(2026, 10, 7))).toBe('2026-11-07');
    expect(explainerDir('Mi Demo', new Date(2026, 10, 7))).toBe(join(home, '2026-11-07-mi-demo'));
    expect(() => explainerDir('???')).toThrow(UsageError);
    delete process.env.EXPLAIN_HOME;
  });
  test('resolveTarget accepts a folder or a scene file and rejects others', () => {
    const dir = temp('explain-t-');
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
    const home = temp('explain-home-');
    const r = await run(['new', 'Demo Uno', '--style', 'sketch', '--title', 'Demo'], home);
    expect(r.code).toBe(0);
    const path = r.stdout.trim();
    expect(path.startsWith(home)).toBe(true);
    expect(path.endsWith(`${dateStamp()}-demo-uno/scene.js`)).toBe(true);
    expect(readFileSync(path, 'utf8')).toContain('"Demo"');
    expect(JSON.parse(readFileSync(join(path, '../explain.json'), 'utf8')).preset).toBe('sketch');
    expect((await run(['new', 'Demo Uno'], home)).code).toBe(2);
  });
  test('usage errors exit 2, help exits 0', async () => {
    const home = temp('explain-home-');
    expect((await run(['bogus'], home)).code).toBe(2);
    expect((await run(['new'], home)).code).toBe(2);
    const h = await run(['export', '--help'], home);
    expect(h.code).toBe(0);
    expect(h.stdout).toContain('--force');
  });
});

const sceneSrc = (name: string, extra = '') => `${extra}export const title = 'T ${name}';\nexport default ({ scene }) => ({ title, scenes: [scene({ name: '${name}', dur: 2, build(s) { s.heading({ text: 'H ${name}' }); } })] });\n`;

describe('builds per scene file (fresh by content hash)', () => {
  test('two scene files in one folder build into their own folders under the explainers root', async () => {
    const home = temp('explain-b1-');
    const src = temp('explain-src-');
    process.env.EXPLAIN_HOME = home;
    try {
      writeFileSync(join(src, 'alpha.scene.js'), sceneSrc('alpha-scene'));
      writeFileSync(join(src, 'beta.scene.js'), sceneSrc('beta-scene'));
      const a = resolveTarget(join(src, 'alpha.scene.js'));
      const b = resolveTarget(join(src, 'beta.scene.js'));
      expect(a.dir).toBe(join(home, `${dateStamp()}-alpha`));
      expect(b.dir).toBe(join(home, `${dateStamp()}-beta`));
      const ia = readFileSync((await ensureBuilt(a, undefined)).index, 'utf8');
      const ib = readFileSync((await ensureBuilt(b, undefined)).index, 'utf8');
      expect(ia).toContain('alpha-scene');
      expect(ia).not.toContain('beta-scene');
      expect(ib).toContain('beta-scene');
      expect(existsSync(join(src, 'index.html'))).toBe(false);
    }
    finally { delete process.env.EXPLAIN_HOME; }
  });

  test('a touch does not rebuild; a content change does; the scene can carry its style', async () => {
    const dir = temp('explain-fresh-');
    const scene = join(dir, 'scene.js');
    writeFileSync(scene, sceneSrc('one'));
    const t = resolveTarget(dir);
    const { index } = await ensureBuilt(t, undefined);
    utimesSync(index, new Date(2000, 0, 1), new Date(2000, 0, 1));
    const old = statSync(index).mtimeMs;
    utimesSync(scene, new Date(), new Date());
    await ensureBuilt(t, undefined);
    expect(statSync(index).mtimeMs).toBe(old);
    writeFileSync(scene, sceneSrc('two'));
    await ensureBuilt(t, undefined);
    expect(statSync(index).mtimeMs).not.toBe(old);
    expect(readFileSync(index, 'utf8')).toContain('H two');
    // A fresh path: the scene module is imported once per process.
    const styled = temp('explain-style-');
    writeFileSync(join(styled, 'scene.js'), sceneSrc('three', 'export const style = \'sketch\';\n'));
    const si = (await ensureBuilt(resolveTarget(styled), undefined)).index;
    expect(readBuildHash(si)).toBe(buildHash(join(styled, 'scene.js'), 'sketch'));
  });

  test('nothing is ever written inside the skill folder', async () => {
    expect(insideSkillDir(join(SKILL_DIR, 'examples', 'not-there'))).toBe(true);
    expect(insideSkillDir(temp('explain-out-'))).toBe(false);
    const err = await buildPage({ scenePath: join(SKILL_DIR, 'examples/smoke.scene.js'), preset: 'hologram', outDir: join(SKILL_DIR, 'examples/not-there') }).then(() => null, (e: Error) => e);
    expect(err?.message).toContain('skill folder');
    expect(existsSync(join(SKILL_DIR, 'examples/not-there'))).toBe(false);
  });

  test('a target that is neither a folder nor a .js scene is a usage error', () => {
    const d = temp('explain-mp4-');
    writeFileSync(join(d, 'video.mp4'), '');
    expect(() => resolveTarget(join(d, 'video.mp4'))).toThrow('not a scene file');
  });

  test('a relative --out lands in the explainer folder, never the cwd', () => {
    const root = temp('explain-out-root-');
    const t = { dir: join(root, '2026-11-17-demo'), scene: '/x/scene.js' };
    expect(resolveOut('video.mp4', t)).toBe(join(root, '2026-11-17-demo/video.mp4'));
    expect(resolveOut(join(root, 'v.mp4'), t)).toBe(join(root, 'v.mp4'));
    expect(resolveOut(undefined, t)).toBe(join(root, '2026-11-17-demo/demo.mp4'));
    expect(() => resolveOut('../../x.mp4', t)).toThrow('leaves the explainer folder');
    expect(() => resolveOut(join(SKILL_DIR, 'x.mp4'), t)).toThrow('skill folder');
  });
});

describe('presets (one-off builds, user presets)', () => {
  test('a --preset other than the configured one builds in <dir>/presets/<name>/ and leaves explain.json byte-identical', async () => {
    const dir = temp('explain-oneoff-');
    writeFileSync(join(dir, 'scene.js'), sceneSrc('oneoff'));
    const cfg = '{\n  "preset": "hologram",\n  "title": "x"\n}\n';
    writeFileSync(join(dir, 'explain.json'), cfg);
    const t = resolveTarget(dir);
    const main = await ensureBuilt(t, undefined);
    expect(main.dir).toBe(dir);
    const one = await ensureBuilt(t, 'sketch');
    expect(one.dir).toBe(join(dir, 'presets', 'sketch'));
    expect(existsSync(one.index)).toBe(true);
    expect(readFileSync(join(dir, 'explain.json'), 'utf8')).toBe(cfg);
    expect((await ensureBuilt(t, 'hologram')).dir).toBe(dir);
  });

  test('preset new copies a built-in, list shows it, an edited accent rebuilds', async () => {
    const presets = temp('explain-presets-');
    process.env.EXPLAIN_PRESETS = presets;
    try {
      const dir = newPreset('foo', 'hologram');
      expect(dir).toBe(join(presets, 'foo'));
      expect(existsSync(join(dir, 'README.md'))).toBe(true);
      expect(listPresets().map(p => p.name)).toEqual(expect.arrayContaining(['sketch', 'hologram', 'foo']));
      expect(() => newPreset('foo', 'hologram')).toThrow('already exists');
      const work = temp('explain-foo-');
      writeFileSync(join(work, 'scene.js'), sceneSrc('foo'));
      const t = resolveTarget(work);
      const first = await ensureBuilt(t, 'foo');
      const h1 = readBuildHash(first.index);
      const file = join(dir, 'preset.js');
      writeFileSync(file, readFileSync(file, 'utf8').replace(/accent: '#[0-9a-f]{6}'/i, 'accent: \'#ff8800\''));
      const second = await ensureBuilt(t, 'foo');
      expect(readBuildHash(second.index)).not.toBe(h1);
      expect(readFileSync(second.index, 'utf8')).toContain('#ff8800');
      expect(() => parsePreset({ preset: 'foo' })).not.toThrow();
    }
    finally { delete process.env.EXPLAIN_PRESETS; }
  });

  test('a user preset may not reuse a built-in name', () => {
    const presets = temp('explain-clash-');
    process.env.EXPLAIN_PRESETS = presets;
    try {
      mkdirSync(join(presets, 'sketch'));
      writeFileSync(join(presets, 'sketch', 'preset.js'), 'export default () => ({});\n');
      expect(() => listPresets()).toThrow('built-in name');
    }
    finally { delete process.env.EXPLAIN_PRESETS; }
  });
});

const maybe = findChrome() ? test : test.skip;

describe('a scene that throws', () => {
  maybe('check, stills and export exit 1 within seconds and name the scene and the error', async () => {
    const home = temp('explain-throw-');
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
    const home = temp('explain-e2e-');
    const scene = (await run(['new', 'e2e'], home)).stdout.trim();
    const dir = join(scene, '..');
    const b = await run(['build', dir], home);
    expect(b.code).toBe(0);
    expect(existsSync(b.stdout.trim())).toBe(true);
    const c = await run(['check', dir], home);
    expect(c.stderr).toBeTruthy();
    expect(c.code).toBe(0);
    expect(JSON.parse(c.stdout).ok).toBe(true);
    expect(JSON.parse(c.stdout).warnings).toEqual([]);
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
