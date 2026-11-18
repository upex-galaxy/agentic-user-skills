// Preset discovery. Built-in presets live in <skill>/presets/<name>/preset.js; user presets in $EXPLAIN_PRESETS or
// ~/.explain/presets/<name>/preset.js. A user preset may not reuse a built-in name. Bun and node: built-ins only.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SKILL_DIR } from './paths.ts';

export interface PresetInfo {
  name: string
  dir: string
  file: string
  builtin: boolean
}

export interface ResolvedPreset {
  name: string
  description: string
  faces: { family: string, file: string, weight: string }[]
  export: { bitrate: number }
  warnings: string[]
}

export const BUILTIN_DIR = join(SKILL_DIR, 'presets');
export const userPresetsDir = () => process.env.EXPLAIN_PRESETS ? resolve(process.env.EXPLAIN_PRESETS) : join(homedir(), '.explain', 'presets');

const NAME = /^[a-z][a-z0-9-]{0,39}$/;

function scan(dir: string, builtin: boolean): PresetInfo[] {
  if (!existsSync(dir)) { return []; }
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(join(dir, e.name, 'preset.js')))
    .map(e => ({ name: e.name, dir: join(dir, e.name), file: join(dir, e.name, 'preset.js'), builtin }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every preset, built-in first. Throws when a user preset reuses a built-in name. */
export function listPresets(): PresetInfo[] {
  const builtins = scan(BUILTIN_DIR, true);
  const user = scan(userPresetsDir(), false);
  const clash = user.filter(u => builtins.some(b => b.name === u.name));
  if (clash.length) { throw new Error(`user preset${clash.length > 1 ? 's' : ''} ${clash.map(c => `"${c.name}" (${c.dir})`).join(', ')} reuse${clash.length > 1 ? '' : 's'} a built-in name: rename the folder`); }
  return [...builtins, ...user];
}

export const presetNames = () => listPresets().map(p => p.name);

/** The preset of that name, or an error listing the available ones. */
export function findPreset(name: string): PresetInfo {
  const all = listPresets();
  const hit = all.find(p => p.name === name);
  if (!hit) { throw new Error(`unknown preset "${name}" (available: ${all.map(p => p.name).join(', ')})`); }
  return hit;
}

/** Every file of a preset folder (for the build hash), sorted. */
export function presetFiles(p: PresetInfo): string[] {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const f = join(dir, e.name);
    return e.isDirectory() ? walk(f) : [f];
  });
  return walk(p.dir).sort();
}

/** Import a preset and resolve it through the engine's definePreset (validation and defaults). */
export async function loadPreset(p: PresetInfo): Promise<ResolvedPreset> {
  const mod = await import(`${pathToFileURL(p.file).href}?v=${statSync(p.file).mtimeMs}`) as { default: unknown };
  const { definePreset } = await import(pathToFileURL(join(SKILL_DIR, 'engine', 'preset.js')).href) as { definePreset: (f: unknown) => ResolvedPreset };
  const resolved = definePreset(mod.default);
  if (resolved.name !== p.name) { throw new Error(`preset ${p.file} declares name "${resolved.name}" but its folder is "${p.name}": they must match`); }
  return resolved;
}

/** Absolute path of a font face file: `vendor:<path>` is the skill's vendor folder, anything else the preset folder. */
export function faceFile(p: PresetInfo, file: string): string {
  return file.startsWith('vendor:') ? join(SKILL_DIR, 'vendor', file.slice(7)) : join(p.dir, file);
}

const README = (name: string, from: string) => `# Preset \`${name}\`

Copied from \`${from}\`. A preset changes only the look: palette, fonts, stroke and fill renderers, textures, transition
flavor. Motion, layout and pieces stay the same, so every scene renders in it.

Checklist:

1. Edit \`preset.js\`: \`name\` must stay \`${name}\` (the folder name). Keep it a factory with no imports.
2. Palette: \`bg, ink, dim, accent, accent2, good, warn, bad, panel\`; optional \`onPanel\`, \`onAccent\`, \`syntax\`.
   Text contrast of ink on bg, onPanel on panel and onAccent on accent should be at least 4.5:1.
3. Fonts: \`faces\` entries are relative to this folder (\`fonts/x.woff2\`) or \`vendor:fonts/...\` for the skill's shared
   fonts. Bundle only fonts whose license allows it (OFL) and keep the license file next to them.
4. Renderers: \`background, shape, line, poly, text, highlight\` are required; \`overlay, fill, dot\` and
   \`transitions: { sweep, glitch, flash, ring, edge }\` are optional. Set alpha only through \`api.alpha(a)\`.
5. Sound (optional): \`sound: { gain, voices: { <kind>: partial params }, space }\` flavors the sound effects; omit it for the
   engine defaults. Data only, see the header of the skill's \`engine/audio.js\` for kinds and params.
6. Run \`bun <skill-dir>/cli/index.ts preset check ${name}\` until it passes, and look at the sheet it prints.
7. Use it: \`build <dir> --preset ${name}\` (one-off) or \`preset use <dir> ${name}\` (saves it in explain.json).
`;

/** Copy a preset into the user presets folder under a new name. Returns the new folder. */
export function newPreset(name: string, from = 'hologram'): string {
  if (!NAME.test(name)) { throw new Error(`preset name "${name}" must be lowercase letters, digits and dashes, starting with a letter`); }
  const src = findPreset(from);
  if (listPresets().some(p => p.name === name)) { throw new Error(`a preset named "${name}" already exists`); }
  const dest = join(userPresetsDir(), name);
  mkdirSync(userPresetsDir(), { recursive: true });
  cpSync(src.dir, dest, { recursive: true });
  const file = join(dest, 'preset.js');
  const before = readFileSync(file, 'utf8');
  const after = before.replace(new RegExp(`name: (['"])${from}\\1`), `name: '${name}'`);
  if (after === before) { throw new Error(`could not find name: '${from}' in ${file}; set it to '${name}' by hand`); }
  writeFileSync(file, after);
  writeFileSync(join(dest, 'README.md'), README(name, from));
  return dest;
}

/** Copy a user preset into the skill's built-in presets (maintainers; the caller runs `preset check` first). */
export function promotePreset(name: string): string {
  const p = findPreset(name);
  if (p.builtin) { throw new Error(`"${name}" is already a built-in preset`); }
  const dest = join(BUILTIN_DIR, name);
  cpSync(p.dir, dest, { recursive: true });
  // The user copy would now clash with the built-in name: park it outside the presets folder.
  const parked = join(homedir(), '.explain', 'presets-promoted', `${name}-${Date.now()}`);
  mkdirSync(dirname(parked), { recursive: true });
  renameSync(p.dir, parked);
  return dest;
}
