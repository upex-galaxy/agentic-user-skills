// Bundle the engine and a scene into ONE self-contained index.html (works from file://, no network):
// JS inlined, Rough.js inlined, fonts inlined as base64 @font-face, preview UI, export button.
//   bun cli/build.ts <scene.js> --preset <name> --out <dir>
import type { PageAudio } from './audio.ts';
import type { PresetInfo } from './presets.ts';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SKILL_DIR } from './paths.ts';
import { faceFile, findPreset, loadPreset, presetFiles, presetNames } from './presets.ts';

export { SKILL_DIR };
const ENGINE_DIR = join(SKILL_DIR, 'engine');
const VENDOR_DIR = join(SKILL_DIR, 'vendor');

export interface BuildOptions {
  scenePath: string
  preset: string
  outDir: string
  /** Sound and narration the page carries (cli/audio.ts); absent or all off: a silent page, as before. */
  audio?: PageAudio
  /** Hash of the audio settings and clip contents (part of the freshness key). */
  audioHash?: string
}

export interface BuildResult {
  indexHtml: string
  bytes: number
  title: string
  hasExport: boolean
}

interface FontFace { family: string, file: string, weight: string }

function fontCss(p: PresetInfo, faces: FontFace[]): string {
  return faces.map((f) => {
    const b64 = readFileSync(faceFile(p, f.file)).toString('base64');
    return `@font-face{font-family:"${f.family}";src:url(data:font/woff2;base64,${b64}) format("woff2");font-weight:${f.weight};font-style:normal}`;
  }).join('\n');
}

const escapeScript = (js: string) => js.replace(/<\/script/gi, '<\\/script');

// The vendored file is the upstream bundle without a header; the notice travels with every built page.
const ROUGH_NOTICE = '/*! Rough.js 4.6.6 | (c) 2019 Preet Shihn | MIT License | https://github.com/rough-stuff/rough */\n';

/** True when `p` is the skill folder or inside it (symlinks resolved): builds never write there. */
export function insideSkillDir(p: string): boolean {
  const real = (x: string) => {
    let cur = resolve(x);
    const tail: string[] = [];
    while (!existsSync(cur) && dirname(cur) !== cur) {
      tail.unshift(basename(cur));
      cur = dirname(cur);
    }
    return join(realpathSync(cur), ...tail);
  };
  const rel = relative(real(SKILL_DIR), real(p));
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !/^[a-z]:/i.test(rel));
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? filesUnder(p) : /\.test\.ts$/.test(e.name) ? [] : [p];
  }).sort();
}

/**
 * Freshness key of a build: the scene's path and content, the preset name and every file of its folder, and every
 * engine, vendor and build file. A page whose embedded key differs is rebuilt, whatever the mtimes say.
 */
export function buildHash(scenePath: string, preset: string, audioHash = ''): string {
  const h = createHash('sha256');
  const scene = resolve(scenePath);
  h.update(`${scene}\0${preset}\0`);
  // The audio settings and the content of every narration clip: a regenerated clip rebuilds the page.
  if (audioHash) { h.update(`audio\0${audioHash}\0`); }
  for (const f of [scene, fileURLToPath(import.meta.url), ...presetFiles(findPreset(preset)), ...filesUnder(ENGINE_DIR), ...filesUnder(VENDOR_DIR)]) {
    h.update(f);
    h.update('\0');
    h.update(readFileSync(f));
  }
  return h.digest('hex').slice(0, 32);
}

/** The freshness key embedded in a built page, or null. */
export function readBuildHash(indexHtml: string): string | null {
  try { return /<meta name="explain-build" content="([0-9a-f]+)">/.exec(readFileSync(indexHtml, 'utf8').slice(0, 2000))?.[1] ?? null; }
  catch { return null; }
}

/** `export const preset = 'sketch'` (or the older `style`) in a scene file, or undefined. */
export async function scenePreset(scenePath: string): Promise<string | undefined> {
  const mod = await import(pathToFileURL(resolve(scenePath)).href) as { preset?: string, style?: string };
  const name = mod.preset ?? mod.style;
  if (name === undefined) { return undefined; }
  const names = presetNames();
  if (!names.includes(name)) { throw new Error(`${scenePath}: export const preset must be one of ${names.join(', ')}, got "${name}"`); }
  return name;
}

/** The page's audio data as an inert JSON script block (`<` escaped so no payload can close the element). */
export const audioBlock = (audio: PageAudio | undefined) => (audio && (audio.sound || audio.narration)
  ? `<script type="application/json" id="explain-audio">${JSON.stringify(audio).replace(/</g, '\\u003c')}</script>\n`
  : '');

/** A page above this size gets a warning: the claude.ai Artifact limit is 16 MB. */
export const PAGE_WARN_BYTES = 12 * 1024 * 1024;

function pageHtml(title: string, hash: string, css: string, rough: string, bundle: string, audio = ''): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="explain-build" content="${hash}"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title.replace(/[<&]/g, '')}</title>
<style>
${css}
html,body{margin:0;height:100%;background:#0b0b0d;color:#c9c9d1;font:14px system-ui,sans-serif}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px}
canvas{display:block;width:min(100vw,calc((100vh - 56px) * 16 / 9));aspect-ratio:16/9;background:#000}
#bar{display:flex;align-items:center;gap:10px;width:min(100vw,calc((100vh - 56px) * 16 / 9));padding:0 8px;box-sizing:border-box}
#bar input{flex:1}
#bar button{font:inherit;padding:6px 12px;border:1px solid #3a3a44;border-radius:6px;background:#17171c;color:inherit;cursor:pointer}
#bar button:disabled{opacity:.5;cursor:wait}
#time{min-width:84px;text-align:right;font-variant-numeric:tabular-nums}
body.still{display:block}
body.still canvas{width:100vw;height:100vh;aspect-ratio:auto}
body.still #bar{display:none}
</style></head>
<body><canvas id="c" width="1920" height="1080"></canvas>
<div id="bar"><button id="play" type="button">Pause</button><input id="scrub" type="range" min="0" max="1" value="0" step="any"><span id="time">0:00</span><button id="export" type="button">Export MP4</button></div>
${audio}<script>${escapeScript(rough)}</script>
<script type="module">${escapeScript(bundle)}</script>
</body></html>
`;
}

/** Build the single-file page for `scenePath` in the given preset and write outDir/index.html. */
export async function buildPage({ scenePath, preset, outDir, audio, audioHash = '' }: BuildOptions): Promise<BuildResult> {
  const info = findPreset(preset);
  const resolved = await loadPreset(info);
  const scene = resolve(scenePath);
  if (!existsSync(scene)) { throw new Error(`Scene file not found: ${scene}`); }
  if (insideSkillDir(outDir)) { throw new Error(`Refusing to write build output inside the skill folder: ${resolve(outDir)}`); }

  const sceneMod = await import(pathToFileURL(scene).href) as { title?: string };
  const title = sceneMod.title ?? basename(scene).replace(/\.scene\.js$|\.js$/, '');

  const exportFile = join(ENGINE_DIR, 'export.js');
  const hasExport = existsSync(exportFile);
  const loadExport = hasExport
    ? `() => import(${JSON.stringify(exportFile)})`
    : '() => Promise.reject(new Error(\'engine/export.js is not available in this build\'))';

  const entry = join(ENGINE_DIR, '__entry.js');
  const source = [
    `import ${JSON.stringify(join(ENGINE_DIR, 'clock-boot.js'))};`,
    `import { boot } from ${JSON.stringify(join(ENGINE_DIR, 'player.js'))};`,
    `import makeScene from ${JSON.stringify(scene)};`,
    `import preset from ${JSON.stringify(info.file)};`,
    `boot({ makeScene, preset, loadExport: ${loadExport} });`,
  ].join('\n');

  const built = await Bun.build({ entrypoints: [entry], files: { [entry]: source }, target: 'browser', format: 'esm', minify: false });
  if (!built.success) { throw new Error(`Bundle failed:\n${built.logs.map(l => String(l)).join('\n')}`); }
  const bundle = await built.outputs[0].text();

  const html = pageHtml(title, buildHash(scene, preset, audioHash), fontCss(info, resolved.faces), ROUGH_NOTICE + readFileSync(join(VENDOR_DIR, 'rough.min.js'), 'utf8'), bundle, audioBlock(audio));
  mkdirSync(outDir, { recursive: true });
  const indexHtml = join(resolve(outDir), 'index.html');
  writeFileSync(indexHtml, html);
  return { indexHtml, bytes: Buffer.byteLength(html), title, hasExport };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const scenePath = args.find(a => !a.startsWith('--') && a !== flag('--preset') && a !== flag('--out'));
  const preset = flag('--preset') ?? 'hologram';
  const outDir = flag('--out');
  if (!scenePath || !outDir) {
    console.error('usage: bun cli/build.ts <scene.js> --preset <name> --out <dir under your home>');
    process.exit(2);
  }
  if (!resolve(outDir).startsWith(homedir())) {
    console.error(`Refusing to write outside your home directory: ${resolve(outDir)}`);
    process.exit(2);
  }
  const r = await buildPage({ scenePath, preset, outDir });
  console.log(JSON.stringify({ indexHtml: r.indexHtml, bytes: r.bytes, title: r.title, hasExport: r.hasExport }));
}
