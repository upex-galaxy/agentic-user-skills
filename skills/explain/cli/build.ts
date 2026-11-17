// Bundle the engine and a scene into ONE self-contained index.html (works from file://, no network):
// JS inlined, Rough.js inlined, fonts inlined as base64 @font-face, preview UI, export button.
//   bun cli/build.ts <scene.js> --style sketch|hologram --out <dir>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE_DIR = join(SKILL_DIR, 'engine');
const VENDOR_DIR = join(SKILL_DIR, 'vendor');

export const STYLES = ['sketch', 'hologram'] as const;
export type StyleName = typeof STYLES[number];

export interface BuildOptions {
  scenePath: string
  style: StyleName
  outDir: string
}

export interface BuildResult {
  indexHtml: string
  bytes: number
  title: string
  hasExport: boolean
}

interface FontFace { family: string, file: string, weight: string }

function fontCss(faces: FontFace[]): string {
  return faces.map((f) => {
    const b64 = readFileSync(join(VENDOR_DIR, f.file)).toString('base64');
    return `@font-face{font-family:"${f.family}";src:url(data:font/woff2;base64,${b64}) format("woff2");font-weight:${f.weight};font-style:normal}`;
  }).join('\n');
}

const escapeScript = (js: string) => js.replace(/<\/script/gi, '<\\/script');

function pageHtml(title: string, css: string, rough: string, bundle: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
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
<div id="bar"><button id="play" type="button">Pausa</button><input id="scrub" type="range" min="0" max="1" value="0" step="any"><span id="time">0:00</span><button id="export" type="button">Exportar MP4</button></div>
<script>${escapeScript(rough)}</script>
<script type="module">${escapeScript(bundle)}</script>
</body></html>
`;
}

/** Build the single-file page for `scenePath` in the given style and write outDir/index.html. */
export async function buildPage({ scenePath, style, outDir }: BuildOptions): Promise<BuildResult> {
  if (!STYLES.includes(style)) { throw new Error(`Unknown style "${style}" (use ${STYLES.join(' or ')})`); }
  const scene = resolve(scenePath);
  if (!existsSync(scene)) { throw new Error(`Scene file not found: ${scene}`); }

  const styleFile = join(ENGINE_DIR, 'styles', `${style}.js`);
  const styleMod = (await import(pathToFileURL(styleFile).href) as { default: { faces: FontFace[] } }).default;
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
    `import style from ${JSON.stringify(styleFile)};`,
    `boot({ makeScene, style, loadExport: ${loadExport} });`,
  ].join('\n');

  const built = await Bun.build({ entrypoints: [entry], files: { [entry]: source }, target: 'browser', format: 'esm', minify: false });
  if (!built.success) { throw new Error(`Bundle failed:\n${built.logs.map(l => String(l)).join('\n')}`); }
  const bundle = await built.outputs[0].text();

  const html = pageHtml(title, fontCss(styleMod.faces), readFileSync(join(VENDOR_DIR, 'rough.min.js'), 'utf8'), bundle);
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
  const scenePath = args.find(a => !a.startsWith('--') && a !== flag('--style') && a !== flag('--out'));
  const style = (flag('--style') ?? 'hologram') as StyleName;
  const outDir = flag('--out');
  if (!scenePath || !outDir) {
    console.error('usage: bun cli/build.ts <scene.js> --style sketch|hologram --out <dir under your home>');
    process.exit(2);
  }
  if (!resolve(outDir).startsWith(homedir())) {
    console.error(`Refusing to write outside your home directory: ${resolve(outDir)}`);
    process.exit(2);
  }
  const r = await buildPage({ scenePath, style, outDir });
  console.log(JSON.stringify({ indexHtml: r.indexHtml, bytes: r.bytes, title: r.title, hasExport: r.hasExport }));
}
