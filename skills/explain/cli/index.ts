#!/usr/bin/env bun
/**
 * explain - CLI entry point: scene.js -> self-contained index.html -> checked MP4.
 *
 *   bun <skill-dir>/cli/index.ts <new|build|check|stills|export|preview> ...
 *
 * STDOUT carries the result of a command (a path, the QA JSON, the export summary); progress and
 * diagnostics go to stderr. Output lives under ~/explainers/ (override: EXPLAIN_HOME) or the given
 * directory, never the cwd.
 *
 * Exit codes: 0 ok | 1 runtime failure or QA errors | 2 usage error.
 * Bun and node: built-ins only, no install step.
 */
import type { StyleName } from './build.ts';
import type { PageInfo } from './headless.ts';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { buildHash, buildPage, insideSkillDir, readBuildHash, sceneStyle, STYLES } from './build.ts';
import { exportVideo, stills, stillsFromMp4 } from './export.ts';
import { inspectPage } from './headless.ts';
import { summarizeReport } from './qa.ts';

// ---------------------------------------------------------------------------
// Pure helpers (tested)
// ---------------------------------------------------------------------------

export class UsageError extends Error {}

export interface ParsedArgs {
  positional: string[]
  flags: Record<string, string | true>
}

const VALUE_FLAGS = new Set(['style', 'title', 'at', 'out', 'bitrate']);

export function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h') { flags.help = true; }
    else if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const key = eq > 0 ? arg.slice(2, eq) : arg.slice(2);
      if (VALUE_FLAGS.has(key)) {
        const value = eq > 0 ? arg.slice(eq + 1) : args[++i];
        if (value === undefined) { throw new UsageError(`--${key} needs a value`); }
        flags[key] = value;
      }
      else { flags[key] = true; }
    }
    else { positional.push(arg); }
  }
  return { positional, flags };
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

export function dateStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const explainersRoot = () => process.env.EXPLAIN_HOME ? resolve(process.env.EXPLAIN_HOME) : join(homedir(), 'explainers');

export function explainerDir(slug: string, d = new Date()): string {
  const clean = slugify(slug);
  if (!clean) { throw new UsageError(`"${slug}" has no usable characters for a folder name`); }
  return join(explainersRoot(), `${dateStamp(d)}-${clean}`);
}

export function parseStyle(value: string | true | undefined): StyleName | undefined {
  if (value === undefined) { return undefined; }
  if (typeof value !== 'string' || !(STYLES as readonly string[]).includes(value)) { throw new UsageError(`--style must be one of: ${STYLES.join(', ')}`); }
  return value as StyleName;
}

/** Parse --bitrate in Mbps ("2.5") into bits per second; undefined keeps the engine default. */
export function parseBitrate(value: string | true | undefined): number | undefined {
  if (value === undefined) { return undefined; }
  const mbps = typeof value === 'string' ? Number(value) : Number.NaN;
  if (!(mbps >= 0.5 && mbps <= 50)) { throw new UsageError('--bitrate needs megabits per second between 0.5 and 50, for example --bitrate 2'); }
  return mbps * 1e6;
}

/** Parse "1,5.5,9" into seconds. */
export function parseTimes(value: string): number[] {
  const times = value.split(',').map(s => Number(s.trim()));
  if (times.length === 0 || times.some(t => !Number.isFinite(t) || t < 0)) { throw new UsageError(`--at needs comma-separated seconds, got "${value}"`); }
  return times;
}

/** Default stills: 2 per scene, at 40 % and 85 % of the scene's own time. */
export function defaultStillTimes(scenes: { start: number, dur: number }[]): number[] {
  const out: number[] = [];
  for (const s of scenes) {
    for (const f of [0.4, 0.85]) { out.push(Math.round((s.start + s.dur * f) * 100) / 100); }
  }
  return out;
}

export function sceneTemplate(title: string): string {
  return `// Explainer scene file. Edit it, then: bun <skill-dir>/cli/index.ts check <this folder>
// Canvas is 1920x1080. Colors are style tokens ('ink', 'dim', 'accent', 'accent2', 'good'), never hex values.
// Never start on-screen text with the opening marks used in Spanish questions or exclamations.
export const title = ${JSON.stringify(title)};

export default ({ scene }) => ({
  title,
  scenes: [
    // Scene 1: section tag, heading, two nodes joined by an edge, source. 'dur' is in seconds, 'at' is local scene time.
    scene({
      name: 'intro',
      dur: 2.4,
      transition: { type: 'light-sweep', dur: 0.4 }, // how this scene hands over to the next one
      build(s) {
        s.sectionTag({ index: 1, total: 2, name: 'Intro', at: 0.1 });
        s.heading({ text: 'Replace this heading', at: 0.1 }); // HUD: the camera never moves it
        s.row([{ id: 'a', w: 480, h: 400 }, { id: 'b', w: 480, h: 400 }], { gap: 200 }); // no area: fills the content area
        s.node({ id: 'a', text: 'First idea', at: 0.5, color: 'accent' });
        s.node({ id: 'b', text: 'Second idea', at: 0.9, color: 'good' });
        s.edge({ from: 'a', to: 'b', at: 1.3, color: 'ink' });
        s.sourceFooter({ text: 'Name the document each fact comes from', at: 0.3 });
      },
    }),
    // Scene 2: one result and the sentence to remember.
    scene({
      name: 'closing',
      dur: 2.0,
      build(s) {
        s.sectionTag({ index: 2, total: 2, name: 'Takeaway', at: 0.1 });
        s.heading({ text: 'One takeaway', at: 0.1 });
        s.row([{ id: 'cause', w: 480, h: 400 }, { id: 'result', w: 480, h: 400 }], { gap: 200 });
        s.node({ id: 'cause', text: 'What changes', at: 0.3, color: 'accent' });
        s.node({ id: 'result', text: 'The result', at: 0.6, color: 'accent2' });
        s.edge({ from: 'cause', to: 'result', at: 0.9, color: 'ink' });
        s.sourceFooter({ text: 'Name the document each fact comes from', at: 0.3 });
      },
    }),
  ],
});
`;
}

export interface Target {
  /** Output folder: index.html, explain.json, stills/, the MP4. */
  dir: string
  scene: string
}

/**
 * A target is an explainer folder (with scene.js), its scene.js, or any other scene file. Another scene file gets its
 * own output folder under the explainers root, named after the file (`pr.scene.js` -> `<date>-pr/`), so two scene
 * files never share a build and nothing is written next to them (a consumer repo, the skill's examples).
 */
export function resolveTarget(arg: string | undefined): Target {
  if (!arg) { throw new UsageError('missing <dir|scene.js>'); }
  const p = resolve(arg);
  if (!existsSync(p)) { throw new UsageError(`not found: ${p}`); }
  let t: Target;
  if (statSync(p).isDirectory()) {
    const scene = join(p, 'scene.js');
    if (!existsSync(scene)) { throw new UsageError(`no scene.js in ${p}`); }
    t = { dir: p, scene };
  }
  else if (basename(p) === 'scene.js') { t = { dir: dirname(p), scene: p }; }
  else { t = { dir: explainerDir(basename(p).replace(/(?:\.scene)?\.[cm]?js$/, '')), scene: p }; }
  if (insideSkillDir(t.dir)) { throw new UsageError(`${t.dir} is inside the skill folder; pass a scene file (it builds under ${explainersRoot()}) or copy it to an explainer folder`); }
  return t;
}

/** `--out`: an absolute path stays; a relative one is inside the explainer folder, never the cwd. */
export function resolveOut(out: string | true | undefined, t: Target): string {
  if (typeof out === 'string') { return isAbsolute(out) ? out : join(t.dir, out); }
  return join(t.dir, `${slugify(basename(t.dir).replace(/^\d{4}-\d{2}-\d{2}-/, '')) || 'video'}.mp4`);
}

const configFile = (dir: string) => join(dir, 'explain.json');

function readConfig(dir: string): { style?: StyleName, title?: string } {
  try { return JSON.parse(readFileSync(configFile(dir), 'utf8')) as { style?: StyleName, title?: string }; }
  catch { return {}; }
}

const log = (msg: string) => console.error(msg);

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Style precedence: --style, explain.json, `export const style` in the scene, hologram. */
export async function ensureBuilt(t: Target, style: StyleName | undefined, force = false): Promise<string> {
  const index = join(t.dir, 'index.html');
  const cfg = readConfig(t.dir);
  const chosen = style ?? cfg.style ?? await sceneStyle(t.scene) ?? 'hologram';
  if (!force && existsSync(index) && readBuildHash(index) === buildHash(t.scene, chosen)) { return index; }
  const r = await buildPage({ scenePath: t.scene, style: chosen, outDir: t.dir });
  if (style && style !== cfg.style) { writeFileSync(configFile(t.dir), `${JSON.stringify({ ...cfg, style }, null, 2)}\n`); }
  log(`built ${r.indexHtml} (${(r.bytes / 1024 / 1024).toFixed(1)} MB, style ${chosen})`);
  return r.indexHtml;
}

function cmdNew(p: ParsedArgs): number {
  const slug = p.positional[0];
  if (!slug) { throw new UsageError('missing <slug>'); }
  const style = parseStyle(p.flags.style) ?? 'hologram';
  const title = typeof p.flags.title === 'string' ? p.flags.title : slug.replace(/[-_]+/g, ' ');
  const dir = explainerDir(slug);
  if (existsSync(join(dir, 'scene.js'))) { throw new UsageError(`already exists: ${join(dir, 'scene.js')}`); }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'scene.js'), sceneTemplate(title));
  writeFileSync(configFile(dir), `${JSON.stringify({ style, title }, null, 2)}\n`);
  console.log(join(dir, 'scene.js'));
  return 0;
}

async function cmdBuild(p: ParsedArgs): Promise<number> {
  const t = resolveTarget(p.positional[0]);
  const index = await ensureBuilt(t, parseStyle(p.flags.style), true);
  console.log(index);
  return 0;
}

async function runCheck(t: Target, style: StyleName | undefined): Promise<{ info: PageInfo, index: string }> {
  const index = await ensureBuilt(t, style);
  const info = await inspectPage(readFileSync(index, 'utf8'));
  log(summarizeReport(info.qa));
  return { info, index };
}

async function cmdCheck(p: ParsedArgs): Promise<number> {
  const { info } = await runCheck(resolveTarget(p.positional[0]), parseStyle(p.flags.style));
  console.log(JSON.stringify(info.qa, null, 2));
  return info.qa.errors.length > 0 || !info.qa.ok ? 1 : 0;
}

async function cmdStills(p: ParsedArgs): Promise<number> {
  const t = resolveTarget(p.positional[0]);
  const index = await ensureBuilt(t, parseStyle(p.flags.style));
  const html = readFileSync(index, 'utf8');
  const times = typeof p.flags.at === 'string' ? parseTimes(p.flags.at) : defaultStillTimes((await inspectPage(html)).scenes);
  let res: { files: string[], seconds: number };
  if (p.flags['from-mp4'] === true) {
    const mp4 = resolveOut(p.flags.out, t);
    if (!existsSync(mp4)) { throw new UsageError(`no MP4 at ${mp4}: run export first (or pass its --out)`); }
    res = await stillsFromMp4({ mp4, outDir: join(t.dir, 'stills', 'mp4'), times });
  }
  else { res = await stills({ html, outDir: join(t.dir, 'stills'), times }); }
  for (const f of res.files.sort()) { console.log(f); }
  log(`${res.files.length} stills in ${res.seconds.toFixed(1)} s`);
  return res.files.length === times.length ? 0 : 1;
}

/** Verify the MP4 with ffprobe when it is on PATH. Returns the line to print and whether it passed. */
export async function verifyVideo(file: string): Promise<{ line: string, ok: boolean }> {
  const ffprobe = Bun.which('ffprobe');
  if (!ffprobe) { return { line: 'ffprobe not found: verification skipped', ok: true }; }
  const proc = Bun.spawn([ffprobe, '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,pix_fmt,width,height,avg_frame_rate', '-of', 'json', file], { stdout: 'pipe', stderr: 'ignore' });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  const s = (JSON.parse(out) as { streams?: { codec_name: string, pix_fmt: string, width: number, height: number, avg_frame_rate: string }[] }).streams?.[0];
  if (!s) { return { line: 'ffprobe: no video stream', ok: false }; }
  const [n, d] = String(s.avg_frame_rate).split('/').map(Number);
  const fps = d ? n / d : n;
  const ok = s.codec_name === 'h264' && s.pix_fmt === 'yuv420p' && s.width === 1920 && s.height === 1080 && Math.abs(fps - 30) < 0.01;
  return { line: `ffprobe: ${s.codec_name} ${s.pix_fmt} ${s.width}x${s.height} ${fps.toFixed(2)} fps ${ok ? 'OK' : 'MISMATCH (expected h264 yuv420p 1920x1080 30 fps)'}`, ok };
}

async function cmdExport(p: ParsedArgs): Promise<number> {
  const t = resolveTarget(p.positional[0]);
  const bitrate = parseBitrate(p.flags.bitrate);
  const { info, index } = await runCheck(t, parseStyle(p.flags.style));
  if ((info.qa.errors.length > 0 || !info.qa.ok) && p.flags.force !== true) {
    log('Refusing to export: QA has errors. Fix them or pass --force.');
    return 1;
  }
  if (info.fps !== 30 || (info.width ?? 1920) !== 1920 || (info.height ?? 1080) !== 1080) {
    log(`Refusing to export: the exporter writes 1920x1080 at 30 fps, and the spec asks for ${info.width}x${info.height} at ${info.fps} fps. Remove width, height and fps from the spec.`);
    return 1;
  }
  const out = resolveOut(p.flags.out, t);
  const res = await exportVideo({ html: readFileSync(index, 'utf8'), out, duration: info.duration, fps: info.fps, bitrate });
  console.log(res.file);
  console.log(`duration ${info.duration.toFixed(1)} s, size ${(res.bytes / 1024 / 1024).toFixed(2)} MB, took ${res.seconds.toFixed(1)} s`);
  const v = await verifyVideo(res.file);
  console.log(v.line);
  return v.ok ? 0 : 1;
}

async function cmdPreview(p: ParsedArgs): Promise<number> {
  const t = resolveTarget(p.positional[0]);
  const index = await ensureBuilt(t, parseStyle(p.flags.style));
  const cmd = process.platform === 'darwin' ? ['open', index] : process.platform === 'win32' ? ['cmd', '/c', 'start', '', index] : ['xdg-open', index];
  Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore' });
  console.log(index);
  return 0;
}

// ---------------------------------------------------------------------------
// Help and dispatch
// ---------------------------------------------------------------------------

const HELP: Record<string, string> = {
  new: 'new <slug> [--style sketch|hologram] [--title "..."]\n  Create ~/explainers/<yyyy-mm-dd>-<slug>/scene.js from a 2-scene template; prints its path.',
  build: 'build <dir|scene.js> [--style sketch|hologram]\n  Build the self-contained index.html into the explainer folder (a scene file other than scene.js builds into ~/explainers/<date>-<name>/); prints its path.',
  check: 'check <dir|scene.js> [--style ...]\n  Build if needed, run the QA gate headless; QA JSON on stdout. Exit 1 on errors, 0 on warnings only.',
  stills: 'stills <dir|scene.js> [--at 1,5,9] [--from-mp4 [--out video.mp4]]\n  PNGs to <dir>/stills/ (old ones replaced). Default: 2 per scene, at 40 % and 85 % of each scene. --from-mp4 cuts them from the exported MP4 with ffmpeg into <dir>/stills/mp4/.',
  export: 'export <dir|scene.js> [--out video.mp4] [--bitrate 2] [--force]\n  Run check (refuses on errors unless --force), export <dir>/<slug>.mp4 (a relative --out is inside <dir>), print path, duration, size, time; ffprobe verifies when available.',
  preview: 'preview <dir>\n  Open index.html in the default browser.',
};

const USAGE = `explain: scene.js -> index.html -> MP4

Usage: bun <skill-dir>/cli/index.ts <command> [args]

${Object.values(HELP).map(h => `  ${h}`).join('\n')}

Outputs go under ~/explainers/ (override with EXPLAIN_HOME) or the given directory. Exit: 0 ok, 1 failure/QA errors, 2 usage.`;

export async function main(argv: string[]): Promise<number> {
  try {
    const [cmd, ...rest] = argv;
    if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') { console.log(USAGE); return 0; }
    if (!(cmd in HELP)) { throw new UsageError(`unknown command "${cmd}"`); }
    const p = parseArgs(rest);
    if (p.flags.help) { console.log(HELP[cmd]); return 0; }
    switch (cmd) {
      case 'new': return cmdNew(p);
      case 'build': return await cmdBuild(p);
      case 'check': return await cmdCheck(p);
      case 'stills': return await cmdStills(p);
      case 'export': return await cmdExport(p);
      default: return await cmdPreview(p);
    }
  }
  catch (e) {
    if (e instanceof UsageError) {
      console.error(`explain: ${e.message}\nRun with --help for usage.`);
      return 2;
    }
    console.error(`explain: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

if (import.meta.main) { process.exit(await main(process.argv.slice(2))); }
