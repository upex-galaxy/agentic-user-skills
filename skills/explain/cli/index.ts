#!/usr/bin/env bun
/**
 * explain - CLI entry point: scene.js -> self-contained index.html -> checked MP4.
 *
 *   bun <skill-dir>/cli/index.ts <new|build|check|stills|export|prune|preview> ...
 *
 * STDOUT carries the result of a command (a path, the QA JSON, the export summary); progress and
 * diagnostics go to stderr. Output lives under ~/explainers/ (override: EXPLAIN_HOME) or the given
 * directory, never the cwd.
 *
 * `prune` deletes exported MP4s (they re-export from scene.js and the voice cache); dry run unless --yes.
 *
 * Exit codes: 0 ok | 1 runtime failure or QA errors | 2 usage error.
 * Bun and node: built-ins only, no install step.
 */
import type { AudioConfig, PageAudio, Provider } from './audio.ts';
import type { ExportAudio } from './export.ts';
import type { PageInfo } from './headless.ts';
import { existsSync, mkdirSync, readFileSync, statfsSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { AudioUsageError, DEFAULT_ELEVENLABS_MODEL, formatCover, pageAudio, resolveAudio, resolveProvider, resolveSound, resolveVoice } from './audio.ts';
import { buildHash, buildPage, insideSkillDir, PAGE_WARN_BYTES, readBuildHash, scenePreset, SKILL_DIR } from './build.ts';
import { exportVideo, readPageAudio, sheet, sheetFromMp4, stillName, stills, stillsFromMp4 } from './export.ts';
import { inspectPage, pageScenes } from './headless.ts';
import { findPreset, listPresets, loadPreset, newPreset, presetNames, promotePreset } from './presets.ts';
import { deleteFile, explainerDirsUnder, findMp4s, isExplainerDir } from './prune.ts';
import { summarizeReport } from './qa.ts';
import { formatPlan, ingest, planJson, planVoice, runKokoro, voiceDir, voiceDoctor } from './voice.ts';

// ---------------------------------------------------------------------------
// Pure helpers (tested)
// ---------------------------------------------------------------------------

export class UsageError extends Error {}

export interface ParsedArgs {
  positional: string[]
  flags: Record<string, string | true>
}

const VALUE_FLAGS = new Set(['style', 'preset', 'title', 'at', 'out', 'bitrate', 'from', 'scene', 'cols', 'rows', 'sound', 'voice', 'voice-id', 'voice-model', 'takes']);

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
        // A repeated --at adds to the list instead of replacing it.
        flags[key] = key === 'at' && typeof flags.at === 'string' ? `${flags.at},${value}` : value;
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

/** The --preset value (--style is an alias), validated against the discovered presets. */
export function parsePreset(flags: Record<string, string | true>): string | undefined {
  const value = flags.preset ?? flags.style;
  if (value === undefined) { return undefined; }
  const names = presetNames();
  if (typeof value !== 'string' || !names.includes(value)) { throw new UsageError(`--preset must be one of: ${names.join(', ')}`); }
  return value;
}

/** Parse --bitrate in Mbps ("2.5") into bits per second; undefined keeps the engine default. */
export function parseBitrate(value: string | true | undefined): number | undefined {
  if (value === undefined) { return undefined; }
  const mbps = typeof value === 'string' ? Number(value) : Number.NaN;
  if (!(mbps >= 0.5 && mbps <= 50)) { throw new UsageError('--bitrate needs megabits per second between 0.5 and 50, for example --bitrate 2'); }
  return mbps * 1e6;
}

/** Parse --takes (1 to 4) for the credit estimate; undefined keeps the default (2). */
export function parseTakes(value: string | true | undefined): number | undefined {
  if (value === undefined) { return undefined; }
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!(n >= 1 && n <= 4)) { throw new UsageError('--takes needs a whole number from 1 to 4'); }
  return n;
}

/** Parse "1,5.5,9" into seconds. */
export function parseTimes(value: string): number[] {
  const times = value.split(',').map(s => Number(s.trim()));
  if (times.length === 0 || times.some(t => !Number.isFinite(t) || t < 0)) { throw new UsageError(`--at needs comma-separated seconds, got "${value}"`); }
  return times;
}

/** One requested still: a global time, or a scene name and a scene-local time. */
export interface AtEntry { scene?: string, t: number }

/** Parse "ci:3.5,git:5.2,12.4": `<scene>:<local seconds>` or global seconds. */
export function parseAt(value: string): AtEntry[] {
  const out = value.split(',').map((raw) => {
    const part = raw.trim();
    const m = /^(.+):([\d.]+)$/.exec(part);
    const t = Number(m ? m[2] : part);
    if (!part || !Number.isFinite(t) || t < 0) { throw new UsageError(`--at needs "<scene>:<seconds>" or global seconds, comma-separated; got "${part}"`); }
    return m ? { scene: m[1], t } : { t };
  });
  return out;
}

export interface StillPlan { t: number, name: string }

/**
 * Resolve still requests against the scene list: a scene-local time becomes global (start + t, rejected past the
 * scene's end), a global time is named after the scene showing it (the latest one started). Files: NN-<scene>@<lt>.png.
 */
export function planStills(entries: AtEntry[], scenes: { name: string, start: number, dur: number }[]): StillPlan[] {
  return entries.map((e) => {
    if (e.scene !== undefined) {
      const i = scenes.findIndex(sc => sc.name === e.scene);
      if (i < 0) { throw new UsageError(`no scene "${e.scene}" (scenes: ${scenes.map(sc => sc.name).join(', ')})`); }
      const sc = scenes[i];
      if (e.t > sc.dur) { throw new UsageError(`scene "${sc.name}" lasts ${sc.dur} s; ${e.t} is past its end`); }
      return { t: Math.round((sc.start + e.t) * 1000) / 1000, name: stillName(i, sc.name, e.t) };
    }
    let i = 0;
    scenes.forEach((sc, k) => { if (sc.start <= e.t + 1e-9) { i = k; } });
    return { t: e.t, name: stillName(i, scenes[i].name, e.t - scenes[i].start) };
  });
}

/** Default still requests: 2 per scene at 40 % and 85 % of its time, or 4 (20, 40, 60, 85 %) for one --scene. */
export function defaultAt(scenes: { name: string, dur: number }[], only?: string): AtEntry[] {
  if (only !== undefined && !scenes.some(sc => sc.name === only)) { throw new UsageError(`no scene "${only}" (scenes: ${scenes.map(sc => sc.name).join(', ')})`); }
  const fr = only === undefined ? [0.4, 0.85] : [0.2, 0.4, 0.6, 0.85];
  return scenes.filter(sc => only === undefined || sc.name === only).flatMap(sc => fr.map(f => ({ scene: sc.name, t: Math.round(sc.dur * f * 100) / 100 })));
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
  else if (!/\.[cm]?js$/.test(p)) { throw new UsageError(`${p} is not a scene file or an explainer folder (to cut a sheet or stills from the MP4, pass the folder or scene with --from-mp4)`); }
  else { t = { dir: explainerDir(basename(p).replace(/(?:\.scene)?\.[cm]?js$/, '')), scene: p }; }
  if (insideSkillDir(t.dir)) { throw new UsageError(`${t.dir} is inside the skill folder; pass a scene file (it builds under ${explainersRoot()}) or copy it to an explainer folder`); }
  return t;
}

/** `--out`: an absolute path stays; a relative one is inside the build folder (a one-off preset has its own), never the cwd. */
export function resolveOut(out: string | true | undefined, t: Target, b?: { dir: string }): string {
  const dir = b?.dir ?? t.dir;
  if (typeof out === 'string') {
    const file = isAbsolute(out) ? resolve(out) : resolve(dir, out);
    if (!isAbsolute(out) && !file.startsWith(`${resolve(dir)}/`)) { throw new UsageError(`--out ${out} leaves the explainer folder; pass an absolute path to write elsewhere`); }
    if (insideSkillDir(file)) { throw new UsageError(`--out ${file} is inside the skill folder; write the video under your explainers folder`); }
    return file;
  }
  return join(dir, `${slugify(basename(t.dir).replace(/^\d{4}-\d{2}-\d{2}-/, '')) || 'video'}.mp4`);
}

const configFile = (dir: string) => join(dir, 'explain.json');

interface Config extends AudioConfig { preset?: string, style?: string, title?: string }

function readConfig(dir: string): Config {
  try { return JSON.parse(readFileSync(configFile(dir), 'utf8')) as Config; }
  catch { return {}; }
}

/** One build of a target: the folder its page, stills and MP4 go to, and the preset it uses. */
export interface Build {
  dir: string
  scene: string
  preset: string
  index: string
}

/** EXPLAIN_PRESET when it names a known preset (an unknown name is a usage error). */
export function envPreset(env = process.env): string | undefined {
  const v = env.EXPLAIN_PRESET?.trim();
  if (!v) { return undefined; }
  const names = presetNames();
  if (!names.includes(v)) { throw new UsageError(`EXPLAIN_PRESET must be one of: ${names.join(', ')}`); }
  return v;
}

/** The preset a target uses when no flag is given: explain.json, then the scene file, then EXPLAIN_PRESET, then hologram. */
export async function configuredPreset(t: Target): Promise<string> {
  const cfg = readConfig(t.dir);
  return cfg.preset ?? cfg.style ?? await scenePreset(t.scene) ?? envPreset() ?? 'hologram';
}

const log = (msg: string) => console.error(msg);

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const audioNote = (a: { sound: boolean, narration: { provider: string, voice: string, cues: unknown[] } | null }) =>
  `${a.sound ? ', sound on' : ''}${a.narration ? `, voice ${a.narration.provider}/${a.narration.voice} (${a.narration.cues.length} line${a.narration.cues.length === 1 ? '' : 's'})` : ''}`;

/**
 * Preset precedence: --preset, explain.json, `export const preset` in the scene, hologram. A --preset other than the
 * configured one is a one-off: it builds into <dir>/presets/<name>/ and never rewrites explain.json (only `new` and
 * `preset use` write it).
 */
export async function ensureBuilt(t: Target, preset: string | undefined, force = false, flags: Record<string, string | true> = {}): Promise<Build> {
  const configured = await configuredPreset(t);
  const chosen = preset ?? configured;
  const dir = chosen === configured ? t.dir : join(t.dir, 'presets', chosen);
  const index = join(dir, 'index.html');
  // Audio (sound effects, narration clips from the cache) is part of the build; it never synthesizes anything.
  const settings = await audioSettings(t, flags);
  const { audio, hash: audioHash } = await pageAudio(settings, t.dir);
  const key = audio.sound || audio.narration ? audioHash : '';
  if (!force && existsSync(index) && readBuildHash(index) === buildHash(t.scene, chosen, key)) { return { dir, scene: t.scene, preset: chosen, index }; }
  const r = await buildPage({ scenePath: t.scene, preset: chosen, outDir: dir, audio, audioHash: key });
  log(`built ${r.indexHtml} (${(r.bytes / 1024 / 1024).toFixed(1)} MB, preset ${chosen}${audioNote(audio)})`);
  if (r.bytes > PAGE_WARN_BYTES) { log(`warning: the page is ${(r.bytes / 1024 / 1024).toFixed(1)} MB; a claude.ai Artifact holds 16 MB at most (narration clips take about 64 KB per second)`); }
  return { dir, scene: t.scene, preset: chosen, index: r.indexHtml };
}

/** Audio settings of a build: flags, explain.json, env vars, defaults (a bad value is a usage error). */
async function audioSettings(t: Target, flags: Record<string, string | true>) {
  try { return await resolveAudio(t.scene, flags, readConfig(t.dir)); }
  catch (e) {
    if (e instanceof AudioUsageError) { throw new UsageError(e.message); }
    throw e;
  }
}

/**
 * The audio fields `new` and `audio use` write to explain.json: each chosen by a flag, else by its env var (or, for
 * `audio use`, kept from the existing file). Defaults are never written.
 */
export function audioChoice(flags: Record<string, string | true>, env: Record<string, string | undefined>, cfg: AudioConfig = {}): AudioConfig {
  const out: AudioConfig = {};
  const pick = (flag: string, name: string) => (flags[flag] !== undefined ? flags[flag] : env[name]?.trim() || undefined);
  try {
    const sound = pick('sound', 'EXPLAIN_SOUND');
    if (sound !== undefined) { out.sound = resolveSound({ sound }, {}, {}) ? 'on' : 'off'; }
    else if (cfg.sound) { out.sound = cfg.sound; }
    const prov = pick('voice', 'EXPLAIN_VOICE');
    const provider: Provider | undefined = prov !== undefined ? resolveProvider({ voice: prov }, {}, {}) : cfg.voice?.provider;
    if (provider) {
      const keep = cfg.voice?.provider === provider ? cfg.voice : {};
      const id = pick('voice-id', 'EXPLAIN_VOICE_ID') ?? keep?.id;
      // The ElevenLabs model is recorded even when it is the default: it is part of every line's cache key, so a later
      // change of EXPLAIN_ELEVENLABS_MODEL never silently regenerates (and re-bills) a saved video.
      const model = provider === 'elevenlabs' ? (pick('voice-model', 'EXPLAIN_ELEVENLABS_MODEL') ?? keep?.model ?? DEFAULT_ELEVENLABS_MODEL) : undefined;
      out.voice = { provider, ...(id && provider !== 'none' ? { id: String(id) } : {}), ...(model ? { model: String(model) } : {}) };
    }
  }
  catch (e) { throw new UsageError(e instanceof Error ? e.message : String(e)); }
  return out;
}

function cmdNew(p: ParsedArgs): number {
  const slug = p.positional[0];
  if (!slug) { throw new UsageError('missing <slug>'); }
  // Only what a flag or an env var chose is written: a pinned default would hide EXPLAIN_* on every later build, and a
  // scene's own `export const preset` still applies when nothing chose a preset.
  const preset = parsePreset(p.flags) ?? envPreset();
  const title = typeof p.flags.title === 'string' ? p.flags.title : slug.replace(/[-_]+/g, ' ');
  const audio = audioChoice(p.flags, process.env);
  const dir = explainerDir(slug);
  if (existsSync(join(dir, 'scene.js'))) { throw new UsageError(`already exists: ${join(dir, 'scene.js')}`); }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'scene.js'), sceneTemplate(title));
  writeFileSync(configFile(dir), `${JSON.stringify({ ...(preset ? { preset } : {}), title, ...audio }, null, 2)}\n`);
  console.log(join(dir, 'scene.js'));
  return 0;
}

async function cmdBuild(p: ParsedArgs): Promise<number> {
  const t = resolveTarget(p.positional[0]);
  const b = await ensureBuilt(t, parsePreset(p.flags), true, p.flags);
  console.log(b.index);
  return 0;
}

async function runCheck(t: Target, preset: string | undefined, flags: Record<string, string | true> = {}): Promise<{ info: PageInfo, build: Build }> {
  const build = await ensureBuilt(t, preset, false, flags);
  const info = await inspectPage(readFileSync(build.index, 'utf8'));
  log(summarizeReport(info.qa));
  return { info, build };
}

async function cmdCheck(p: ParsedArgs): Promise<number> {
  const { info } = await runCheck(resolveTarget(p.positional[0]), parsePreset(p.flags), p.flags);
  console.log(JSON.stringify(info.qa, null, 2));
  return info.qa.errors.length > 0 || !info.qa.ok ? 1 : 0;
}

async function cmdStills(p: ParsedArgs): Promise<number> {
  const t = resolveTarget(p.positional[0]);
  const b = await ensureBuilt(t, parsePreset(p.flags), false, p.flags);
  const html = readFileSync(b.index, 'utf8');
  const { scenes } = await pageScenes(html);
  const only = typeof p.flags.scene === 'string' ? p.flags.scene : undefined;
  const entries = typeof p.flags.at === 'string' ? parseAt(p.flags.at).map(e => (only !== undefined && e.scene === undefined ? { ...e, scene: only } : e)) : defaultAt(scenes, only);
  const plan = planStills(entries, scenes);
  const times = plan.map(x => x.t);
  let res: { files: string[], seconds: number };
  if (p.flags['from-mp4'] === true) {
    const mp4 = resolveOut(p.flags.out, t, b);
    if (!existsSync(mp4)) { throw new UsageError(`no MP4 at ${mp4}: run export first (or pass its --out)`); }
    res = await stillsFromMp4({ mp4, outDir: join(b.dir, 'stills', 'mp4'), times });
  }
  else { res = await stills({ html, outDir: join(b.dir, 'stills'), times, names: plan.map(x => x.name) }); }
  for (const f of res.files.sort()) { console.log(f); }
  log(`${res.files.length} stills in ${res.seconds.toFixed(1)} s`);
  return res.files.length === times.length ? 0 : 1;
}

/**
 * Verify the MP4 with ffprobe when it is on PATH. Returns the line to print and whether it passed. Video: h264 yuv420p
 * 1920x1080 30 fps. With `expectAudio`, a:0 must be aac or opus, 48000 Hz, 2 channels, within 0.05 s of the video;
 * without it, the file must carry no audio stream.
 */
export async function verifyVideo(file: string, expectAudio = false): Promise<{ line: string, ok: boolean }> {
  const ffprobe = Bun.which('ffprobe');
  if (!ffprobe) { return { line: 'ffprobe not found: verification skipped', ok: true }; }
  const proc = Bun.spawn([ffprobe, '-v', 'error', '-show_entries', 'stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,sample_rate,channels,duration', '-of', 'json', file], { stdout: 'pipe', stderr: 'ignore' });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  interface Stream { codec_type: string, codec_name: string, pix_fmt: string, width: number, height: number, avg_frame_rate: string, sample_rate?: string, channels?: number, duration?: string }
  const streams = (JSON.parse(out || '{}') as { streams?: Stream[] }).streams ?? [];
  const s = streams.find(x => x.codec_type === 'video');
  if (!s) { return { line: 'ffprobe: no video stream', ok: false }; }
  const [n, d] = String(s.avg_frame_rate).split('/').map(Number);
  const fps = d ? n / d : n;
  const videoOk = s.codec_name === 'h264' && s.pix_fmt === 'yuv420p' && s.width === 1920 && s.height === 1080 && Math.abs(fps - 30) < 0.01;
  const video = `ffprobe: ${s.codec_name} ${s.pix_fmt} ${s.width}x${s.height} ${fps.toFixed(2)} fps`;
  if (!videoOk) { return { line: `${video} MISMATCH (expected h264 yuv420p 1920x1080 30 fps)`, ok: false }; }
  const a = streams.find(x => x.codec_type === 'audio');
  if (!expectAudio) {
    return a ? { line: `${video} + ${a.codec_name} MISMATCH (expected no audio stream)`, ok: false } : { line: `${video} OK`, ok: true };
  }
  if (!a) { return { line: `${video} MISMATCH (expected an aac or opus audio stream, found none)`, ok: false }; }
  const aSec = Number(a.duration);
  const vSec = Number(s.duration);
  const ok = ['aac', 'opus'].includes(a.codec_name) && Number(a.sample_rate) === 48000 && a.channels === 2 && Number.isFinite(aSec) && Number.isFinite(vSec) && Math.abs(aSec - vSec) <= 0.05;
  const line = `${video} + ${a.codec_name} ${a.sample_rate} Hz ${a.channels} ch ${aSec.toFixed(2)} s`;
  return { line: `${line} ${ok ? 'OK' : `MISMATCH (expected aac or opus 48000 Hz 2 ch within 0.05 s of the video's ${vSec.toFixed(2)} s)`}`, ok };
}

/** The one audio line of an export: codec, voice, effects, loudness and peak; or how to turn audio on. */
export function audioLine(page: PageAudio | null, r: ExportAudio | undefined): string {
  if (!page) { return 'audio: off (add --sound on and --voice kokoro|elevenlabs, or set EXPLAIN_SOUND / EXPLAIN_VOICE)'; }
  if (!r) { return 'audio: the page has audio but sent no mix report'; }
  const voice = page.narration ? `voice ${page.narration.provider}/${page.narration.voice} ${r.voiceSeconds.toFixed(1)} s` : 'no voice';
  const sfx = page.sound ? `${r.sfxEvents} effect${r.sfxEvents === 1 ? '' : 's'}` : 'effects off';
  return `audio: ${r.codec} 48000 Hz stereo, ${voice}, ${sfx}, ${r.integratedLufs.toFixed(1)} LUFS, peak ${r.peakDbfs.toFixed(1)} dBFS`;
}

/** Least free space an export needs (the MP4, Chrome's profile and caches): about 1 GB. */
export const MIN_FREE_BYTES = 1024 ** 3;

/** Free bytes on the volume of `dir` (its nearest existing ancestor). */
export function freeBytes(dir: string): number {
  let cur = resolve(dir);
  while (!existsSync(cur) && dirname(cur) !== cur) { cur = dirname(cur); }
  const st = statfsSync(cur);
  return Number(st.bavail) * Number(st.bsize);
}

/** A clear message when `free` bytes are under `need`, else null. */
export function diskSpaceProblem(dir: string, free: number, need = MIN_FREE_BYTES): string | null {
  if (free >= need) { return null; }
  const gb = (n: number) => (n / 1024 ** 3).toFixed(2);
  return `Refusing to export: only ${gb(free)} GB free on the disk of ${dir}; an export needs about ${gb(need)} GB (the MP4 plus Chrome's working files). Free some space and run export again.`;
}

async function cmdExport(p: ParsedArgs): Promise<number> {
  const t = resolveTarget(p.positional[0]);
  const space = diskSpaceProblem(t.dir, freeBytes(t.dir));
  if (space) {
    log(space);
    return 1;
  }
  const { info, build } = await runCheck(t, parsePreset(p.flags), p.flags);
  // Bitrate precedence: --bitrate, the preset's export.bitrate, the engine default (2 Mbps).
  const bitrate = parseBitrate(p.flags.bitrate) ?? (await loadPreset(findPreset(build.preset))).export.bitrate;
  if ((info.qa.errors.length > 0 || !info.qa.ok) && p.flags.force !== true) {
    log('Refusing to export: QA has errors. Fix them or pass --force.');
    return 1;
  }
  if (info.fps !== 30 || (info.width ?? 1920) !== 1920 || (info.height ?? 1080) !== 1080) {
    log(`Refusing to export: the exporter writes 1920x1080 at 30 fps, and the spec asks for ${info.width}x${info.height} at ${info.fps} fps. Remove width, height and fps from the spec.`);
    return 1;
  }
  const out = resolveOut(p.flags.out, t, build);
  const html = readFileSync(build.index, 'utf8');
  const page = readPageAudio(html);
  const res = await exportVideo({ html, out, duration: info.duration, fps: info.fps, bitrate });
  console.log(res.file);
  console.log(`duration ${info.duration.toFixed(1)} s, size ${(res.bytes / 1024 / 1024).toFixed(2)} MB, took ${res.seconds.toFixed(1)} s`);
  console.log(audioLine(page, res.audio));
  if (res.audio?.codec === 'opus') { log('warning: the audio track is Opus; QuickTime may not play Opus inside MP4. Google Chrome encodes AAC.'); }
  const v = await verifyVideo(res.file, page !== null);
  console.log(v.line);
  log(`The MP4 is transient: upload it to Loom or a storage, then run \`prune ${t.dir} --yes\`.`);
  return v.ok ? 0 : 1;
}

/** prune [<dir> | --all] [--yes]: list (dry run) or delete exported MP4s in explainer folders. */
function cmdPrune(p: ParsedArgs): number {
  const arg = p.positional[0];
  const all = p.flags.all === true;
  if (arg && all) { throw new UsageError('pass a <dir> or --all, not both'); }
  if (!arg && !all) { throw new UsageError('prune needs a <dir> or --all'); }
  let dirs: string[];
  if (arg) {
    const dir = resolve(arg);
    if (!existsSync(dir)) { throw new UsageError(`not found: ${dir}`); }
    if (!isExplainerDir(dir)) { throw new UsageError(`${dir} is not an explainer folder (no scene.js or explain.json)`); }
    dirs = [dir];
  }
  else { dirs = explainerDirsUnder(explainersRoot()); }
  const yes = p.flags.yes === true;
  const cache = voiceDir();
  let count = 0;
  let bytes = 0;
  let failed = 0;
  for (const dir of dirs) {
    for (const f of findMp4s(dir, cache)) {
      if (yes) {
        try { deleteFile(f.file); }
        catch (e) {
          log(`could not delete ${f.file}: ${e instanceof Error ? e.message : String(e)}`);
          failed++;
          continue;
        }
      }
      console.log(`${yes ? 'deleted' : 'would delete'} ${f.file} (${(f.bytes / 1024 / 1024).toFixed(2)} MB)`);
      count++;
      bytes += f.bytes;
    }
  }
  const rebuild = dirs.length === 1 ? ` Rebuild with: export ${dirs[0]}` : ' Rebuild one with: export <dir>';
  const mb = (bytes / 1024 / 1024).toFixed(2);
  console.log(count === 0 ? 'no MP4 files found' : yes ? `deleted ${count} MP4 file${count === 1 ? '' : 's'}, freed ${bytes} bytes (${mb} MB).${rebuild}` : `dry run: ${count} MP4 file${count === 1 ? '' : 's'}, ${bytes} bytes (${mb} MB) would be freed; nothing deleted. Run again with --yes to delete.${rebuild}`);
  return failed ? 1 : 0;
}

async function cmdPreview(p: ParsedArgs): Promise<number> {
  const t = resolveTarget(p.positional[0]);
  const { index } = await ensureBuilt(t, parsePreset(p.flags), false, p.flags);
  const cmd = process.platform === 'darwin' ? ['open', index] : process.platform === 'win32' ? ['cmd', '/c', 'start', '', index] : ['xdg-open', index];
  Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore' });
  console.log(index);
  return 0;
}

/**
 * Default contact-sheet frames: n scenes spread over the video (first and last included), each at its settled time
 * (after its last caption or typing finishes, see settleOf in engine/core.js; 70 % of the scene without one), so a
 * frame shows a finished scene instead of a transition or a caption mid-typing.
 */
export function sheetTimes(scenes: { start: number, dur: number, settle?: number }[], n: number): number[] {
  if (!scenes.length) { return []; }
  return Array.from({ length: n }, (_, i) => {
    const sc = scenes[n === 1 ? scenes.length - 1 : Math.round((i * (scenes.length - 1)) / (n - 1))];
    return Math.round((sc.start + (sc.settle ?? sc.dur * 0.7)) * 100) / 100;
  });
}

/** Write <build dir>/sheet.png: cols x rows frames rendered in the page (or cut from the MP4 with --from-mp4). */
async function writeSheet(t: Target, b: Build, p: ParsedArgs): Promise<string> {
  const cols = p.flags.cols === undefined ? 3 : Number(p.flags.cols);
  const rows = p.flags.rows === undefined ? 2 : Number(p.flags.rows);
  if (![cols, rows].every(n => Number.isInteger(n) && n >= 1 && n <= 8)) { throw new UsageError('--cols and --rows need whole numbers from 1 to 8'); }
  const out = join(b.dir, 'sheet.png');
  const html = readFileSync(b.index, 'utf8');
  if (p.flags['from-mp4'] === true) {
    const mp4 = resolveOut(p.flags.out, t, b);
    if (!existsSync(mp4)) { throw new UsageError(`no MP4 at ${mp4}: run export first (or pass its --out)`); }
    const { duration } = await pageScenes(html);
    return (await sheetFromMp4({ mp4, out, duration, cols, rows })).file;
  }
  const { scenes } = await pageScenes(html);
  const times = typeof p.flags.at === 'string' ? planStills(parseAt(p.flags.at), scenes).map(x => x.t) : sheetTimes(scenes, cols * rows);
  return (await sheet({ html, out, times, cols, rows })).file;
}

async function cmdSheet(p: ParsedArgs): Promise<number> {
  const t = resolveTarget(p.positional[0]);
  const b = await ensureBuilt(t, parsePreset(p.flags), false, p.flags);
  console.log(await writeSheet(t, b, p));
  return 0;
}

/** Run the preset check: validate, build the gallery scene in it, QA must pass. Returns the build. */
export async function checkPreset(name: string): Promise<{ ok: boolean, build: Build, warnings: string[] }> {
  const info = findPreset(name);
  const resolved = await loadPreset(info);
  const gallery = join(SKILL_DIR, 'examples', 'gallery.scene.js');
  const scene = existsSync(gallery) ? gallery : join(SKILL_DIR, 'examples', 'smoke.scene.js');
  const dir = join(explainersRoot(), 'preset-check', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(configFile(dir), `${JSON.stringify({ preset: name, title: `preset ${name}` }, null, 2)}\n`);
  const t: Target = { dir, scene };
  const { info: page, build } = await runCheck(t, undefined);
  for (const w of resolved.warnings) { log(`preset ${name}: ${w}`); }
  log(`sheet: ${await writeSheet(t, build, { positional: [], flags: {} })}`);
  return { ok: page.qa.errors.length === 0 && page.qa.ok, build, warnings: resolved.warnings };
}

async function cmdPreset(p: ParsedArgs): Promise<number> {
  const [sub, a, b] = p.positional;
  switch (sub) {
    case 'list': {
      for (const x of listPresets()) {
        const r = await loadPreset(x);
        console.log(`${x.name.padEnd(14)} ${x.builtin ? 'built-in' : 'user    '}  ${r.description || ''}  ${x.dir}`);
      }
      return 0;
    }
    case 'new': {
      if (!a) { throw new UsageError('missing <name>'); }
      const from = typeof p.flags.from === 'string' ? p.flags.from : 'hologram';
      console.log(newPreset(a, from));
      return 0;
    }
    case 'check': {
      if (!a) { throw new UsageError('missing <name>'); }
      const r = await checkPreset(a);
      console.log(r.build.index);
      log(r.ok ? `preset ${a}: check passed` : `preset ${a}: QA errors (see above)`);
      return r.ok ? 0 : 1;
    }
    case 'use': {
      if (!a || !b) { throw new UsageError('usage: preset use <dir> <name>'); }
      const t = resolveTarget(a);
      findPreset(b);
      mkdirSync(t.dir, { recursive: true });
      writeFileSync(configFile(t.dir), `${JSON.stringify({ ...readConfig(t.dir), preset: b, style: undefined }, null, 2)}\n`);
      console.log(configFile(t.dir));
      return 0;
    }
    case 'promote': {
      if (!a) { throw new UsageError('missing <name>'); }
      const r = await checkPreset(a);
      if (!r.ok) { log(`preset ${a}: not promoted, its check fails`); return 1; }
      console.log(promotePreset(a));
      return 0;
    }
    default: throw new UsageError('preset needs a subcommand: list | new | check | use | promote');
  }
}

/**
 * voice doctor | voice plan <dir> | voice kokoro <dir> | voice <dir>. Kokoro is started, used and stopped by
 * `voice kokoro`; ElevenLabs takes come from an ElevenLabs MCP the agent calls (plan lists them, a build ingests them).
 */
async function cmdVoice(p: ParsedArgs): Promise<number> {
  const [sub, arg] = p.positional;
  if (sub === 'doctor') {
    for (const line of await voiceDoctor()) { console.log(line); }
    return 0;
  }
  const takes = parseTakes(p.flags.takes);
  const isSub = sub === 'plan' || sub === 'kokoro';
  const t = resolveTarget(isSub ? arg : sub);
  const flags = sub === 'kokoro' ? { ...p.flags, voice: 'kokoro' } : p.flags;
  const a = await audioSettings(t, flags);
  if (!a.voice) { throw new UsageError('the voice is none for this video: pass --voice kokoro|elevenlabs, save it with `audio use <dir> --voice ...`, or set EXPLAIN_VOICE'); }
  if (!a.cues.length) {
    if (sub === 'plan' && p.flags.json === true) { console.log(JSON.stringify(planJson([], a.voice, takes))); }
    else { log('no scene has `say`: nothing to narrate'); }
    return 0;
  }
  const entries = planVoice(a.cues, a.voice);
  if (a.voice.provider === 'elevenlabs') { await ingest(entries, a.voice); }
  if (sub === 'plan') {
    if (p.flags.json === true) {
      mkdirSync(voiceDir(), { recursive: true });
      console.log(JSON.stringify(planJson(planVoice(a.cues, a.voice), a.voice, takes)));
      return 0;
    }
    // The agent saves each take straight at its target path: the cache folder must exist.
    mkdirSync(voiceDir(), { recursive: true });
    console.log([...formatCover(a.cover), '', formatPlan(planVoice(a.cues, a.voice), a.voice, takes)].join('\n'));
    return 0;
  }
  if (sub === 'kokoro') {
    const r = await runKokoro(entries, a.voice);
    const how = r.started ? `server started in ${r.startSeconds.toFixed(1)} s and stopped in ${r.stopSeconds.toFixed(2)} s, peak ${Math.round(r.peakRssMb)} MB RSS` : r.lines ? 'used the Kokoro server already running (left running)' : 'every line was cached; Kokoro was not started';
    console.log(`kokoro: ${r.lines} new line${r.lines === 1 ? '' : 's'}, ${r.seconds.toFixed(1)} s of speech, voice ${a.voice.voiceId}; ${how}`);
    return 0;
  }
  for (const e of planVoice(a.cues, a.voice)) { console.log(`${e.cached ? 'cached ' : 'missing'} ${e.id.padEnd(5)} ${e.scene}: ${e.text}`); }
  return 0;
}

/** audio use <dir> [--sound on|off] [--voice none|kokoro|elevenlabs] [--voice-id <id>] [--voice-model <model>]. */
function cmdAudio(p: ParsedArgs): number {
  const [sub, a] = p.positional;
  if (sub !== 'use' || !a) { throw new UsageError('usage: audio use <dir> [--sound on|off] [--voice none|kokoro|elevenlabs] [--voice-id <id>] [--voice-model <model>]'); }
  const t = resolveTarget(a);
  const cfg = readConfig(t.dir);
  const chosen = audioChoice(p.flags, {}, cfg);
  if (chosen.voice?.provider === 'elevenlabs' && !chosen.voice.id) {
    try { resolveVoice('elevenlabs', {}, {}, 'es', {}); }
    catch (e) { throw new UsageError(e instanceof Error ? e.message : String(e)); }
  }
  const { sound: _s, voice: _v, ...rest } = cfg;
  writeFileSync(configFile(t.dir), `${JSON.stringify({ ...rest, ...chosen }, null, 2)}\n`);
  console.log(configFile(t.dir));
  return 0;
}

// ---------------------------------------------------------------------------
// Help and dispatch
// ---------------------------------------------------------------------------

const HELP: Record<string, string> = {
  new: 'new <slug> [--preset <name>] [--title "..."]\n  Create ~/explainers/<yyyy-mm-dd>-<slug>/scene.js from a 2-scene template and explain.json with the preset; prints its path.',
  build: 'build <dir|scene.js> [--preset <name>] [--sound on|off] [--voice none|kokoro|elevenlabs] [--voice-id <id>]\n  Build the self-contained index.html into the explainer folder (a scene file other than scene.js builds into ~/explainers/<date>-<name>/); prints its path. A --preset other than the configured one (explain.json, else the scene, else hologram) is a one-off build in <dir>/presets/<name>/; explain.json is never rewritten. --style is an alias of --preset.',
  check: 'check <dir|scene.js> [--preset <name>] [--sound on|off] [--voice none|kokoro|elevenlabs] [--voice-id <id>]\n  Build if needed, run the QA gate headless; QA JSON on stdout. Exit 1 on errors, 0 on warnings only.',
  stills: 'stills <dir|scene.js> [--preset <name>] [--at ci:3.5,git:5.2,12.4] [--scene <name>] [--from-mp4 [--out video.mp4]]\n  PNGs named NN-<scene>@<local seconds>.png to <dir>/stills/ (old ones replaced). --at takes <scene>:<seconds of that scene> or global seconds. Default: 2 per scene at 40 % and 85 % of it; --scene <name> gives 4 of that scene. --from-mp4 cuts them from the exported MP4 with ffmpeg into <dir>/stills/mp4/.',
  sheet: 'sheet <dir|scene.js> [--preset <name>] [--cols 3] [--rows 2] [--at ...] [--from-mp4]\n  One contact-sheet PNG (cols x rows frames at 960x540; 3x2 = 2880x1080) to <dir>/sheet.png, rendered in the page without ffmpeg; frames at the settled time of scenes spread over the video (after the last caption or typing finishes) unless --at names them. --from-mp4 cuts it from the exported MP4 with ffmpeg.',
  export: 'export <dir|scene.js> [--out video.mp4] [--bitrate 2] [--force] [--sound on|off] [--voice none|kokoro|elevenlabs] [--voice-id <id>]\n  Run check (refuses on errors unless --force), export <dir>/<slug>.mp4 (a relative --out is inside <dir>), print path, duration, size, time; ffprobe verifies when available.',
  prune: 'prune [<dir> | --all] [--yes]\n  Delete exported MP4s (they re-export from scene.js and the voice cache). <dir> must be an explainer folder (scene.js or explain.json); --all covers every explainer folder under ~/explainers (EXPLAIN_HOME). Only .mp4 files, at most 2 levels deep; symlinks and the voice cache are never touched. Dry run unless --yes.',
  preview: 'preview <dir> [--preset <name>]\n  Open index.html in the default browser.',
  voice: 'voice doctor | voice plan <dir> [--json] [--takes 1-4] | voice kokoro <dir> | voice <dir>\n  Narration (scene `say`). doctor: Kokoro installed/running, the ElevenLabs route, the cache (~/.explain/voice, or EXPLAIN_VOICE_DIR). plan: the lines missing from the cache, with the exact text, voice, model, target MP3 path and estimated credits (--takes sets the takes per line, default 2; --json prints the plan as one JSON object), for an agent to generate with an ElevenLabs MCP (no API key is ever read). kokoro: start the installed Kokoro server, synthesize the missing lines, cache them and stop it (a server already running is used and left alone). voice <dir>: cached or missing per line. Builds never synthesize: they read the cache and name the command when a line is missing.',
  audio: 'audio use <dir> [--sound on|off] [--voice none|kokoro|elevenlabs] [--voice-id <id>] [--voice-model <model>]\n  Save the video\'s sound and voice in explain.json. Both are off by default. Precedence on every build: flag, explain.json, env (EXPLAIN_SOUND, EXPLAIN_VOICE, EXPLAIN_VOICE_ID, EXPLAIN_ELEVENLABS_MODEL), default (sound off, voice none). Kokoro voices: ef_dora (Spanish) and af_heart by default; ElevenLabs needs a voice id from the MCP and uses eleven_flash_v2_5 unless --voice-model says otherwise.',
  preset: 'preset list | new <name> [--from sketch|hologram|poster] | check <name> | use <dir> <name> | promote <name>\n  Presets are the look of a video. list: built-in and user presets (~/.explain/presets, or EXPLAIN_PRESETS). new: copy one into the user folder with a README checklist. check: validate it, build the gallery scene in it, QA must pass. use: save it in the folder\'s explain.json. promote: copy a checked user preset into the skill (maintainers).',
};

const USAGE = `explain: scene.js -> index.html -> MP4

Usage: bun <skill-dir>/cli/index.ts <command> [args]

${Object.values(HELP).map(h => `  ${h}`).join('\n')}

Sound effects and voice-over are optional and off by default: --sound on, --voice kokoro|elevenlabs on any build command, or \`audio use\` / EXPLAIN_SOUND / EXPLAIN_VOICE (see voice and audio above).
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
      case 'prune': return cmdPrune(p);
      case 'preset': return await cmdPreset(p);
      case 'sheet': return await cmdSheet(p);
      case 'voice': return await cmdVoice(p);
      case 'audio': return cmdAudio(p);
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
