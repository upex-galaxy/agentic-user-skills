import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';
import { main } from './index.ts';

const temps: string[] = [];
function temp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}
afterAll(() => { for (const d of temps) { rmSync(d, { recursive: true, force: true }); } });

const cli = join(import.meta.dir, 'index.ts');
async function run(args: string[], env: Record<string, string>) {
  const p = Bun.spawn(['bun', cli, ...args], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, ...env } });
  const [stdout, stderr] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  return { code: await p.exited, stdout, stderr };
}

/** A fake explainer folder with its sibling files, a voice cache and an outside folder with an MP4. */
function fixture() {
  const root = temp('explain-prune-');
  const home = join(root, 'home');
  const dir = join(home, '2026-01-01-demo');
  mkdirSync(join(dir, 'stills'), { recursive: true });
  mkdirSync(join(dir, 'a', 'b', 'c'), { recursive: true });
  const voice = join(dir, 'voice-cache');
  mkdirSync(voice);
  const outside = join(root, 'outside');
  mkdirSync(outside);
  writeFileSync(join(dir, 'scene.js'), 'x');
  writeFileSync(join(dir, 'explain.json'), '{}');
  writeFileSync(join(dir, 'index.html'), '<html>');
  writeFileSync(join(dir, 'stills', '01.png'), 'png');
  writeFileSync(join(dir, 'demo.mp4'), '0123456789');
  writeFileSync(join(dir, 'a', 'out.MP4'), '01234');
  writeFileSync(join(dir, 'a', 'b', 'c', 'deep.mp4'), 'too deep');
  writeFileSync(join(dir, 'notes.mp4.txt'), 'keep');
  writeFileSync(join(voice, 'clip.mp4'), 'cache');
  writeFileSync(join(voice, 'clip.wav'), 'wav');
  writeFileSync(join(outside, 'other.mp4'), 'outside');
  symlinkSync(outside, join(dir, 'link'));
  symlinkSync(join(outside, 'other.mp4'), join(dir, 'linked.mp4'));
  return { root, home, dir, voice, outside, env: { EXPLAIN_HOME: home, EXPLAIN_VOICE_DIR: voice } };
}

describe('prune', () => {
  test('dry run lists the MP4s and deletes nothing', async () => {
    const f = fixture();
    const r = await run(['prune', f.dir], f.env);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`would delete ${join(f.dir, 'demo.mp4')}`);
    expect(r.stdout).toContain(join(f.dir, 'a', 'out.MP4'));
    expect(r.stdout).toContain('dry run: 2 MP4 files, 15 bytes');
    expect(r.stdout).toContain(`export ${f.dir}`);
    expect(existsSync(join(f.dir, 'demo.mp4'))).toBe(true);
    expect(existsSync(join(f.dir, 'a', 'out.MP4'))).toBe(true);
  });

  test('--yes deletes only .mp4 files and leaves everything else', async () => {
    const f = fixture();
    const r = await run(['prune', f.dir, '--yes'], f.env);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('deleted 2 MP4 files, freed 15 bytes');
    expect(existsSync(join(f.dir, 'demo.mp4'))).toBe(false);
    expect(existsSync(join(f.dir, 'a', 'out.MP4'))).toBe(false);
    for (const keep of ['scene.js', 'explain.json', 'index.html', 'stills/01.png', 'notes.mp4.txt', 'a/b/c/deep.mp4', 'voice-cache/clip.mp4', 'voice-cache/clip.wav']) {
      expect(existsSync(join(f.dir, keep))).toBe(true);
    }
  });

  test('never follows a symlink out of the folder', async () => {
    const f = fixture();
    await run(['prune', f.dir, '--yes'], f.env);
    expect(existsSync(join(f.outside, 'other.mp4'))).toBe(true);
  });

  test('refuses a folder that is not an explainer folder', async () => {
    const f = fixture();
    const r = await run(['prune', f.outside, '--yes'], f.env);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('not an explainer folder');
    expect(existsSync(join(f.outside, 'other.mp4'))).toBe(true);
  });

  test('refuses a parent of explainer folders and the voice cache', async () => {
    const f = fixture();
    expect((await run(['prune', f.home, '--yes'], f.env)).code).toBe(2);
    expect((await run(['prune', f.root, '--yes'], f.env)).code).toBe(2);
    expect(existsSync(join(f.dir, 'demo.mp4'))).toBe(true);
  });

  test('needs a folder or --all', async () => {
    const f = fixture();
    expect((await run(['prune'], f.env)).code).toBe(2);
    expect((await run(['prune', f.dir, '--all'], f.env)).code).toBe(2);
  });

  test('--all covers the explainer folders under EXPLAIN_HOME and skips other folders', async () => {
    const f = fixture();
    const plain = join(f.home, 'not-an-explainer');
    mkdirSync(plain);
    writeFileSync(join(plain, 'keep.mp4'), 'keep');
    const r = await run(['prune', '--all', '--yes'], f.env);
    expect(r.code).toBe(0);
    expect(existsSync(join(f.dir, 'demo.mp4'))).toBe(false);
    expect(existsSync(join(plain, 'keep.mp4'))).toBe(true);
  });

  test('the voice cache survives even when it holds an MP4 and is the pruned root', async () => {
    const f = fixture();
    const r = await run(['prune', f.dir, '--yes'], { ...f.env, EXPLAIN_VOICE_DIR: join(f.dir, 'a') });
    expect(r.code).toBe(0);
    expect(existsSync(join(f.dir, 'a', 'out.MP4'))).toBe(true);
    expect(existsSync(join(f.dir, 'demo.mp4'))).toBe(false);
  });

  test('main reports usage errors with exit 2', async () => {
    const err = console.error;
    console.error = () => {};
    try { expect(await main(['prune'])).toBe(2); }
    finally { console.error = err; }
  });
});
