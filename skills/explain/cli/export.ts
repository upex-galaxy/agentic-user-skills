import type { ChromeHandle } from './chrome.ts';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { findChrome, isHeadlessShell } from './chrome.ts';
import { withErrorProbe } from './headless.ts';
import { BadRequest, runSession } from './session.ts';

export interface ExportResult {
  file: string
  bytes: number
  seconds: number
  chrome: string
}

const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_BITRATE = 2e6; // matches engine/export.js
const MB = 1024 * 1024;
const STILL_LIMIT = 32 * MB;

/** Body cap for the MP4 upload: 4x the expected size, at least 64 MB, at most 1 GiB. */
export function exportLimit(duration: number, bitrate = DEFAULT_BITRATE): number {
  return Math.min(1024 * MB, Math.max(64 * MB, Math.ceil((4 * duration * bitrate) / 8)));
}

/**
 * File for a still at `t` seconds inside `outDir`, or a BadRequest. `t` must be a finite number >= 0; the name is
 * built from the parsed number, so nothing the page sends can reach the path.
 */
export function stillFile(outDir: string, t: string | null): string {
  const n = t === null || t.trim() === '' ? Number.NaN : Number(t);
  if (!Number.isFinite(n) || n < 0) { throw new BadRequest(`bad still time: ${JSON.stringify(t)}`); }
  const dir = resolve(outDir);
  const file = join(dir, `still-${Math.round(n * 1000) / 1000}.png`);
  if (dirname(file) !== dir) { throw new BadRequest('bad still path'); }
  return file;
}

/** Remove the PNGs an earlier `stills` run left, so the folder holds only this run's frames. */
export function clearStills(outDir: string): void {
  for (const f of readdirSync(outDir)) {
    if (/^still-.*\.png$/.test(f)) { rmSync(join(outDir, f), { force: true }); }
  }
}

export async function exportVideo(opts: { html: string, out: string, duration: number, fps?: number, bitrate?: number, timeoutMs?: number, launch?: (url: string) => ChromeHandle }): Promise<ExportResult> {
  if (!opts.launch) {
    const binary = findChrome();
    if (binary && isHeadlessShell(binary)) {
      throw new Error(`Refusing to export with the Playwright headless shell (${binary}): it encodes full-range video (yuvj420p), which players show with washed-out colors. Install Google Chrome, run \`bunx playwright install chromium\` for a full browser, or set EXPLAIN_CHROME to one. check and stills work with the shell.`);
    }
  }
  const start = performance.now();
  let bytes = 0;
  const query: Record<string, string> = { export: '1' };
  if (opts.bitrate) { query.bitrate = String(Math.round(opts.bitrate)); }
  const session = await runSession({
    html: withErrorProbe(opts.html),
    query,
    label: 'Export',
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    limits: { __export: exportLimit(opts.duration, opts.bitrate) },
    launch: opts.launch,
    onPost: (name, _url, body) => {
      if (name !== '__export') { return false; }
      mkdirSync(dirname(opts.out), { recursive: true });
      writeFileSync(opts.out, new Uint8Array(body));
      bytes = body.byteLength;
      return true;
    },
  });
  return { file: opts.out, bytes, seconds: (performance.now() - start) / 1000, chrome: session.chrome };
}

export async function stills(opts: { html: string, outDir: string, times: number[], timeoutMs?: number, launch?: (url: string) => ChromeHandle }): Promise<{ files: string[], seconds: number, chrome: string }> {
  const start = performance.now();
  const files: string[] = [];
  mkdirSync(opts.outDir, { recursive: true });
  clearStills(opts.outDir);
  const session = await runSession({
    html: withErrorProbe(opts.html),
    query: { still: opts.times.join(',') },
    label: 'Stills',
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    limits: { __still: STILL_LIMIT, __done: 1024 },
    launch: opts.launch,
    onPost: (name, url, body) => {
      if (name === '__done') { return true; }
      if (name !== '__still') { return false; }
      const file = stillFile(opts.outDir, url.searchParams.get('t'));
      writeFileSync(file, new Uint8Array(body));
      files.push(file);
      return false;
    },
  });
  return { files, seconds: (performance.now() - start) / 1000, chrome: session.chrome };
}

/** Frames cut from the exported MP4 with ffmpeg (encoder artefacts included) into `outDir`, replacing older ones. */
export async function stillsFromMp4(opts: { mp4: string, outDir: string, times: number[] }): Promise<{ files: string[], seconds: number }> {
  const ffmpeg = Bun.which('ffmpeg');
  if (!ffmpeg) { throw new Error('--from-mp4 needs ffmpeg on PATH'); }
  const start = performance.now();
  mkdirSync(opts.outDir, { recursive: true });
  clearStills(opts.outDir);
  const files: string[] = [];
  for (const t of opts.times) {
    const file = stillFile(opts.outDir, String(t));
    const proc = Bun.spawn([ffmpeg, '-v', 'error', '-y', '-ss', String(t), '-i', opts.mp4, '-frames:v', '1', file], { stdout: 'ignore', stderr: 'pipe' });
    const [code, err] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
    if (code !== 0 || !existsSync(file)) { throw new Error(`ffmpeg wrote no frame at t=${t}: ${err.trim().split('\n').slice(-3).join(' ') || 'past the end of the video?'}`); }
    files.push(file);
  }
  return { files, seconds: (performance.now() - start) / 1000 };
}
