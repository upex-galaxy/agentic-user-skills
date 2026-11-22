// prune: find (and delete) exported MP4s inside explainer folders. The MP4 is transient: it re-exports from
// scene.js and the voice cache. Only `.mp4` files, at most 2 levels below an explainer folder, are ever touched.
import { existsSync, lstatSync, readdirSync, unlinkSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

/** An explainer folder holds a scene.js or an explain.json. */
export const isExplainerDir = (dir: string): boolean => existsSync(join(dir, 'scene.js')) || existsSync(join(dir, 'explain.json'));

export interface PruneFile { file: string, bytes: number }

/** The MP4s of one explainer folder: the folder itself and one level of subfolders; symlinks are skipped, the voice cache is excluded. */
export function findMp4s(dir: string, voiceCache: string): PruneFile[] {
  const cache = resolve(voiceCache);
  const out: PruneFile[] = [];
  const walk = (d: string, depth: number): void => {
    if (resolve(d) === cache || resolve(d).startsWith(cache + sep)) { return; }
    let names: string[];
    try { names = readdirSync(d); }
    catch { return; }
    for (const name of names.sort()) {
      const p = join(d, name);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) { continue; }
      if (st.isDirectory()) { if (depth < 2) { walk(p, depth + 1); } }
      else if (st.isFile() && name.toLowerCase().endsWith('.mp4')) { out.push({ file: p, bytes: st.size }); }
    }
  };
  walk(dir, 1);
  return out;
}

/** The explainer folders directly under a root. */
export function explainerDirsUnder(root: string): string[] {
  if (!existsSync(root)) { return []; }
  return readdirSync(root).sort().map(n => join(root, n)).filter((p) => {
    const st = lstatSync(p);
    return !st.isSymbolicLink() && st.isDirectory() && isExplainerDir(p);
  });
}

export const deleteFile = (f: string): void => unlinkSync(f);
