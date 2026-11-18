/**
 * MKD (`mkd`) - build-time media resolution.
 *
 * `validateSpec` (schema.ts) checks the shape of every `media` entry and stays
 * pure. This module does the parts that touch files, processes and the
 * network, once, before any render:
 *
 * - local images, posters and SVGs are inlined as `data:` URIs (every mode is
 *   self-contained; https URLs stay URLs);
 * - SVG markup is sanitized (no script, event handlers, foreignObject or
 *   external references) and rendered as an image, never inline;
 * - local videos are transcoded with ffmpeg (WebM VP9, 480p max, ~700 kbps,
 *   no audio, 24 fps cap) and cached under `~/.mkd/media/` by content hash;
 *   without ffmpeg the file is inlined as is, with a warning;
 * - link cards missing a title/description/image read the page's Open Graph
 *   tags at build time (5 s timeout, size cap, no cookies) and fall back to a
 *   plain titled link.
 *
 * Every dependency (process runner, `which`, fetch, budgets, home dir) is
 * injectable so the tests run without ffmpeg, network or real large files.
 * Bun built-ins only.
 */

import type { LinkMedia, MediaEntry, NormalizedSpec, SvgMedia, VideoMedia } from './schema.ts';

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, isAbsolute, join, resolve } from 'node:path';
import { SpecError } from './schema.ts';

export class MediaError extends SpecError {}

const MB = 1024 * 1024;

export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

export interface MediaDeps {
  /** Absolute path of a binary on PATH, or null. */
  which: (cmd: string) => string | null
  /** Run a process; stdout/stderr are captured, never inherited. */
  run: (argv: string[]) => Promise<RunResult>
  fetch: (input: string, init?: RequestInit) => Promise<Response>
  ogTimeoutMs: number
  ogMaxBytes: number
  /** Per-video budget after transcoding, in bytes. */
  videoBudget: number
  /** Videos at or under this size that are already WebM skip transcoding. */
  smallWebm: number
  home: string
  warn: (message: string) => void
}

export const defaultDeps: MediaDeps = {
  which: cmd => Bun.which(cmd),
  run: async (argv) => {
    const proc = Bun.spawn(argv, { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { code, stdout, stderr };
  },
  fetch: async (input, init) => fetch(input, init),
  ogTimeoutMs: 5000,
  ogMaxBytes: 512 * 1024,
  videoBudget: 6 * MB,
  smallWebm: 1.5 * MB,
  home: homedir(),
  warn: message => console.error(`[mkd] ${message}`),
};

/** One inlined payload, for the size summary and the budget messages. */
export interface MediaWeight {
  path: string
  kind: string
  bytes: number
}

export interface MediaReport {
  weights: MediaWeight[]
  inlinedBytes: number
}

// ============================================================================
// SMALL HELPERS
// ============================================================================

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

const VIDEO_MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

function isRemoteOrData(src: string): boolean {
  return /^(?:https:|data:)/i.test(src);
}

function dataUri(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

function formatMb(bytes: number): string {
  return `${(bytes / MB).toFixed(2)} MB`;
}

function readLocal(src: string, specDir: string, path: string): { abs: string, bytes: Uint8Array } {
  const abs = isAbsolute(src) ? src : resolve(specDir, src);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    throw new MediaError(`${path}: file not found: ${abs}`, path);
  }
  return { abs, bytes: new Uint8Array(readFileSync(abs)) };
}

/** Width/height from a PNG, GIF, JPEG or WebP header; null when unknown. */
export function imageSize(b: Uint8Array): { width: number, height: number } | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (b.length > 4 && b[0] === 0xFF && b[1] === 0xD8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xFF) {
        i += 1;
        continue;
      }
      const marker = b[i + 1];
      const len = view.getUint16(i + 2);
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        return { width: view.getUint16(i + 7), height: view.getUint16(i + 5) };
      }
      i += 2 + len;
    }
    return null;
  }
  if (b.length > 30 && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') {
    const chunk = String.fromCharCode(...b.slice(12, 16));
    if (chunk === 'VP8X') {
      return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    }
    if (chunk === 'VP8 ') {
      return { width: view.getUint16(26, true) & 0x3FFF, height: view.getUint16(28, true) & 0x3FFF };
    }
    if (chunk === 'VP8L') {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3FFF) + 1, height: ((bits >> 14) & 0x3FFF) + 1 };
    }
  }
  return null;
}

/** Aspect hint from an SVG's width/height or viewBox. */
function svgSize(markup: string): { width: number, height: number } | null {
  const tag = /<svg\b[^>]*>/i.exec(markup)?.[0] ?? '';
  const viewBox = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
  if (viewBox) {
    return { width: Math.round(Number(viewBox[1])), height: Math.round(Number(viewBox[2])) };
  }
  const w = /\bwidth\s*=\s*["']([\d.]+)(?:px)?["']/i.exec(tag);
  const h = /\bheight\s*=\s*["']([\d.]+)(?:px)?["']/i.exec(tag);
  return w && h ? { width: Math.round(Number(w[1])), height: Math.round(Number(h[1])) } : null;
}

// ============================================================================
// SVG SANITIZING
// ============================================================================

/** References an SVG may keep: in-document fragments and raster data images. */
const SAFE_REF = /^\s*(?:#|data:image\/(?:png|jpeg|gif|webp);)/i;

/**
 * Sanitize SVG markup: drop script, foreignObject, frames, links and
 * href-targeting animations; strip event handlers, external references and
 * remote `url(...)`/`@import` in styles; drop the XML prolog, DOCTYPE
 * (entities) and comments. The page renders the result as an <img>, which
 * runs nothing anyway: this is defense in depth.
 */
export async function sanitizeSvg(markup: string): Promise<string> {
  const start = markup.search(/<svg[\s>]/i);
  if (start === -1) {
    throw new Error('no <svg> element');
  }
  const prepared = markup
    .slice(start)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_m, attrs: string, css: string) =>
      `<style${attrs}>${css.replace(/@import[^;]*;?/gi, '').replace(/url\((?!\s*['"]?#)[^)]*\)/gi, 'none')}</style>`);

  const rewriter = new HTMLRewriter()
    .on('script, foreignObject, foreignobject, iframe, object, embed, audio, video, set, animate, handler, listener', {
      element(el) {
        el.remove();
      },
    })
    .on('a', {
      element(el) {
        el.removeAndKeepContent();
      },
    })
    .on('*', {
      element(el) {
        const drop: string[] = [];
        for (const [name, value] of el.attributes) {
          const lower = name.toLowerCase();
          if (lower.startsWith('on')) {
            drop.push(name);
          }
          else if ((lower === 'href' || lower === 'xlink:href' || lower === 'src') && !SAFE_REF.test(value)) {
            drop.push(name);
          }
          else if (lower === 'style' && /url\(\s*(?!['"]?#)|@import|expression\(/i.test(value)) {
            drop.push(name);
          }
        }
        for (const name of drop) {
          el.removeAttribute(name);
        }
      },
    });
  return (await rewriter.transform(new Response(prepared)).text()).trim();
}

// ============================================================================
// LINK PREVIEWS (Open Graph at build time)
// ============================================================================

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface LinkPreview {
  title?: string
  description?: string
  image?: string
}

/** Parse <meta property/name=... content=...> and <title> out of an HTML head. */
export function parsePreview(html: string, baseUrl: string): LinkPreview {
  const meta: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    if (key && content && meta[key] === undefined) {
      meta[key] = decodeEntities(content[1] ?? content[2] ?? '');
    }
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const preview: LinkPreview = {};
  const title = meta['og:title'] || meta['twitter:title'] || (titleTag ? decodeEntities(titleTag) : '');
  const description = meta['og:description'] || meta['twitter:description'] || meta.description || '';
  const image = meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || '';
  if (title) {
    preview.title = title.slice(0, 200);
  }
  if (description) {
    preview.description = description.slice(0, 300);
  }
  if (image) {
    try {
      const abs = new URL(image, baseUrl);
      if (abs.protocol === 'https:') {
        preview.image = abs.href;
      }
    }
    catch {
      // An unusable og:image is simply left out.
    }
  }
  return preview;
}

/** Fetch a page head (no cookies, size-capped, time-boxed) and read its preview. */
export async function fetchLinkPreview(url: string, deps: MediaDeps): Promise<LinkPreview> {
  const response = await deps.fetch(url, {
    redirect: 'follow',
    credentials: 'omit',
    signal: AbortSignal.timeout(deps.ogTimeoutMs),
    headers: { 'accept': 'text/html,application/xhtml+xml', 'user-agent': 'Mozilla/5.0 (compatible; mkd-linkcard/1.0)' },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const type = response.headers.get('content-type') ?? '';
  if (!/html/i.test(type)) {
    throw new Error(`not an HTML page (${type || 'no content-type'})`);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('empty body');
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < deps.ogMaxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) {
      break;
    }
    chunks.push(value);
    size += value.length;
    if (/<\/head>/i.test(new TextDecoder().decode(value))) {
      break;
    }
  }
  await reader.cancel().catch(() => {});
  const html = new TextDecoder().decode(Buffer.concat(chunks).subarray(0, deps.ogMaxBytes));
  return parsePreview(html, response.url || url);
}

// ============================================================================
// VIDEO
// ============================================================================

interface ProbedVideo {
  width?: number
  height?: number
  fps?: number
}

async function probe(file: string, ffprobe: string | null, deps: MediaDeps): Promise<ProbedVideo> {
  if (!ffprobe) {
    return {};
  }
  const out = await deps.run([ffprobe, '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'json', file]);
  if (out.code !== 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(out.stdout) as { streams?: { width?: number, height?: number, r_frame_rate?: string }[] };
    const stream = parsed.streams?.[0] ?? {};
    const [num, den] = String(stream.r_frame_rate ?? '0/1').split('/').map(Number);
    return { width: stream.width, height: stream.height, fps: den ? num / den : undefined };
  }
  catch {
    return {};
  }
}

async function resolveVideo(entry: VideoMedia, specDir: string, path: string, deps: MediaDeps, report: MediaReport): Promise<VideoMedia> {
  const out: VideoMedia = { ...entry };
  if (/^https:/i.test(entry.src)) {
    out.mime = VIDEO_MIME[extname(new URL(entry.src).pathname).toLowerCase()] ?? 'video/mp4';
  }
  else if (!/^data:/i.test(entry.src)) {
    const { abs, bytes } = readLocal(entry.src, specDir, `${path}.src`);
    const ext = extname(abs).toLowerCase();
    const ffmpeg = deps.which('ffmpeg');
    const ffprobe = deps.which('ffprobe');
    let video = bytes;
    let mime = VIDEO_MIME[ext] ?? 'video/mp4';
    let poster: Uint8Array | null = null;

    if (!ffmpeg) {
      deps.warn(`${path}: ffmpeg not found, so ${abs} is inlined as is (install ffmpeg to shrink videos to WebM 480p).`);
    }
    else if (ext === '.webm' && bytes.length <= deps.smallWebm) {
      deps.warn(`${path}: ${abs} is already a small WebM (${formatMb(bytes.length)}), inlined as is.`);
    }
    else {
      const cacheDir = join(deps.home, '.mkd', 'media');
      mkdirSync(cacheDir, { recursive: true });
      const key = createHash('sha256').update(bytes).update('vp9-480p-700k-24fps-noaudio-v1').digest('hex').slice(0, 32);
      const target = join(cacheDir, `${key}.webm`);
      const posterFile = join(cacheDir, `${key}.jpg`);
      if (!existsSync(target)) {
        const src = await probe(abs, ffprobe, deps);
        const filters = ['scale=-2:\'min(480,ih)\''];
        if (!src.fps || src.fps > 24) {
          filters.push('fps=24');
        }
        const result = await deps.run([ffmpeg, '-y', '-v', 'error', '-i', abs, '-an', '-vf', filters.join(','), '-c:v', 'libvpx-vp9', '-b:v', '700k', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', target]);
        if (result.code !== 0 || !existsSync(target)) {
          throw new MediaError(`${path}: ffmpeg could not transcode ${abs}: ${result.stderr.trim().split('\n').pop() ?? 'unknown error'}`, `${path}.src`);
        }
        await deps.run([ffmpeg, '-y', '-v', 'error', '-i', target, '-frames:v', '1', '-q:v', '6', posterFile]);
      }
      video = new Uint8Array(readFileSync(target));
      mime = 'video/webm';
      if (existsSync(posterFile)) {
        poster = new Uint8Array(readFileSync(posterFile));
      }
      const dims = await probe(target, ffprobe, deps);
      if (dims.width && dims.height) {
        out.width = dims.width;
        out.height = dims.height;
      }
    }

    if (video.length > deps.videoBudget) {
      throw new MediaError(
        `${path}: video ${abs} is ${formatMb(video.length)} after processing; the per-video budget is ${formatMb(deps.videoBudget)}. Trim it, or host it and use an https URL.`,
        `${path}.src`,
      );
    }
    out.src = dataUri(video, mime);
    out.mime = mime;
    report.weights.push({ path: `${path}.src`, kind: 'video', bytes: out.src.length });
    if (!entry.poster && poster) {
      out.poster = dataUri(poster, 'image/jpeg');
      report.weights.push({ path: `${path}.poster`, kind: 'poster', bytes: out.poster.length });
    }
  }
  else {
    out.mime = /^data:([^;,]+)/i.exec(entry.src)?.[1] ?? 'video/mp4';
  }

  if (entry.poster && !isRemoteOrData(entry.poster)) {
    const { abs, bytes } = readLocal(entry.poster, specDir, `${path}.poster`);
    out.poster = dataUri(bytes, IMAGE_MIME[extname(abs).toLowerCase()] ?? 'image/png');
    report.weights.push({ path: `${path}.poster`, kind: 'poster', bytes: out.poster.length });
  }
  return out;
}

// ============================================================================
// RESOLUTION
// ============================================================================

async function resolveEntry(entry: MediaEntry, specDir: string, path: string, deps: MediaDeps, report: MediaReport): Promise<MediaEntry> {
  switch (entry.type) {
    case 'image': {
      if (isRemoteOrData(entry.src)) {
        return entry;
      }
      const { abs, bytes } = readLocal(entry.src, specDir, `${path}.src`);
      const ext = extname(abs).toLowerCase();
      const mime = IMAGE_MIME[ext];
      if (!mime) {
        throw new MediaError(`${path}.src: unsupported image type "${ext}" (use png, jpg, gif, webp, avif or svg).`, `${path}.src`);
      }
      let payload = bytes;
      let size = imageSize(bytes);
      if (ext === '.svg') {
        const clean = await sanitizeSvg(new TextDecoder().decode(bytes));
        payload = new TextEncoder().encode(clean);
        size = svgSize(clean);
      }
      if (payload.length > 2 * MB) {
        deps.warn(`${path}: image ${abs} is ${formatMb(payload.length)}; consider a smaller or compressed version.`);
      }
      const src = dataUri(payload, mime);
      report.weights.push({ path: `${path}.src`, kind: 'image', bytes: src.length });
      return { ...entry, src, ...(size || {}) };
    }
    case 'svg': {
      const svg: SvgMedia = entry;
      let markup: string;
      if (svg.svg !== undefined) {
        markup = svg.svg;
      }
      else if (svg.src && /^data:/i.test(svg.src)) {
        return entry;
      }
      else if (svg.src && /^https:/i.test(svg.src)) {
        throw new MediaError(`${path}.src: an svg must be a local file or inline markup (remote SVGs cannot be sanitized at build time).`, `${path}.src`);
      }
      else {
        markup = new TextDecoder().decode(readLocal(svg.src as string, specDir, `${path}.src`).bytes);
      }
      let clean: string;
      try {
        clean = await sanitizeSvg(markup);
      }
      catch {
        throw new MediaError(`${path}: no <svg> element found.`, path);
      }
      const src = dataUri(new TextEncoder().encode(clean), 'image/svg+xml');
      report.weights.push({ path, kind: 'svg', bytes: src.length });
      const out: SvgMedia = { type: 'svg', alt: svg.alt, src };
      if (svg.caption) {
        out.caption = svg.caption;
      }
      const size = svgSize(clean);
      return size ? { ...out, ...size } : out;
    }
    case 'video':
      return resolveVideo(entry, specDir, path, deps, report);
    case 'link': {
      const link: LinkMedia = { ...entry };
      if (!link.title || !link.description || !link.image) {
        try {
          const preview = await fetchLinkPreview(link.url, deps);
          link.title ||= preview.title;
          link.description ||= preview.description;
          link.image ||= preview.image;
        }
        catch (error) {
          deps.warn(`${path}: could not read a preview of ${link.url} (${error instanceof Error ? error.message : String(error)}); showing a plain titled link.`);
        }
      }
      if (!link.title) {
        link.title = new URL(link.url).hostname.replace(/^www\./, '');
      }
      if (link.image && !isRemoteOrData(link.image)) {
        const { abs, bytes } = readLocal(link.image, specDir, `${path}.image`);
        link.image = dataUri(bytes, IMAGE_MIME[extname(abs).toLowerCase()] ?? 'image/png');
        report.weights.push({ path: `${path}.image`, kind: 'image', bytes: link.image.length });
      }
      return link;
    }
    default:
      return entry;
  }
}

async function resolveList(list: MediaEntry[] | undefined, specDir: string, path: string, deps: MediaDeps, report: MediaReport): Promise<MediaEntry[] | undefined> {
  if (!list) {
    return undefined;
  }
  const out: MediaEntry[] = [];
  for (let i = 0; i < list.length; i += 1) {
    out.push(await resolveEntry(list[i], specDir, `${path}[${i}]`, deps, report));
  }
  return out;
}

/** True when any intro, item or option carries media. */
export function hasMedia(spec: NormalizedSpec): boolean {
  return Boolean(spec.intro?.media) || spec.items.some(item =>
    Boolean(item.media) || (item.type === 'decision' && item.options.some(option => Boolean(option.media))));
}

/**
 * Resolve every media entry of a validated spec. Returns a new spec (the
 * input is not mutated) plus the weight of everything inlined.
 */
export async function resolveMedia(
  spec: NormalizedSpec,
  specDir: string,
  overrides: Partial<MediaDeps> = {},
): Promise<{ spec: NormalizedSpec, report: MediaReport }> {
  const deps: MediaDeps = { ...defaultDeps, ...overrides };
  const report: MediaReport = { weights: [], inlinedBytes: 0 };
  const out: NormalizedSpec = structuredClone(spec);

  if (out.intro?.media) {
    out.intro.media = await resolveList(out.intro.media, specDir, 'intro.media', deps, report);
  }
  for (let i = 0; i < out.items.length; i += 1) {
    const item = out.items[i];
    if (item.media) {
      item.media = await resolveList(item.media, specDir, `items[${i}].media`, deps, report);
    }
    if (item.type === 'decision') {
      for (let j = 0; j < item.options.length; j += 1) {
        const option = item.options[j];
        if (option.media) {
          option.media = await resolveList(option.media, specDir, `items[${i}].options[${j}].media`, deps, report);
        }
      }
    }
  }
  report.inlinedBytes = report.weights.reduce((sum, w) => sum + w.bytes, 0);
  return { spec: out, report };
}

export const PAGE_WARN_BYTES = 8 * MB;
export const PAGE_MAX_ARTIFACT_BYTES = 14 * MB;

/**
 * Check a rendered page against the budgets: warn above 8 MB in any mode,
 * refuse above 14 MB in artifact mode (the Artifact page limit is 16 MB),
 * naming the heaviest media so the author knows what to shrink or host.
 */
export function checkPageBudget(pageBytes: number, mode: 'copy' | 'wait' | 'artifact', report: MediaReport, warn: (m: string) => void = defaultDeps.warn): void {
  const heaviest = [...report.weights]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 3)
    .map(w => `${w.path} (${w.kind}, ${formatMb(w.bytes)})`)
    .join(', ');
  if (mode === 'artifact' && pageBytes > PAGE_MAX_ARTIFACT_BYTES) {
    throw new MediaError(
      `page is ${formatMb(pageBytes)}, over the ${formatMb(PAGE_MAX_ARTIFACT_BYTES)} artifact budget (limit 16 MB). Shrink or host these at https URLs: ${heaviest || 'n/a'}.`,
      'media',
    );
  }
  if (pageBytes > PAGE_WARN_BYTES) {
    warn(`page is ${formatMb(pageBytes)} (over ${formatMb(PAGE_WARN_BYTES)}); heaviest media: ${heaviest || 'n/a'}.`);
  }
}

export { formatMb };
