#!/usr/bin/env bun
/**
 * MKD (`mkd`) - CLI entry point.
 *
 * Two modes:
 *
 * - DEFAULT (copy mode, non-blocking): read + validate a spec, render the
 *   self-contained deck HTML to `~/.mkd/deck-<name>.html`, open it in the
 *   browser, and EXIT 0 immediately. The user answers at their own pace and
 *   pastes the copied result JSON back into the chat. Nothing is written to
 *   stdout.
 *
 * - `--wait` (blocking): serve the deck over loopback HTTP, await the
 *   browser's `POST /submit`, then write the result backup and print the
 *   result JSON to stdout - the AI parses it the same turn.
 *
 * STDOUT DISCIPLINE (load-bearing): the ONLY thing ever written to
 * process.stdout in the entire tool is the final result JSON, emitted once
 * here in --wait mode. Everything else - banners, paths, URLs, errors - goes
 * to stderr via console.error. NEVER use console.log (it writes to stdout).
 *
 * Exit codes (repo convention): 0 ok | 1 timeout/runtime | 2 spec validation.
 *
 * Bun built-ins only, zero external deps (stays extractable). No install
 * step: run it from the skill directory with `bun <skill-dir>/cli/index.ts`.
 */

import type { Result } from './schema.ts';
import type { ServeHandle } from './server.ts';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { render } from './render.ts';
import { SpecError, validateSpec } from './schema.ts';
import { serve, TimeoutError } from './server.ts';

// All tool output (rendered decks, result backups, persisted images) lands
// under the user's home, NEVER the cwd - so running `mkd` inside any repo
// leaves zero footprint there (no host .gitignore edits needed). Bun's
// `Bun.write` creates this dir.
const MKD_HOME = join(homedir(), '.mkd');

// ============================================================================
// ARG PARSING (self-contained)
// ============================================================================

interface ParsedArgs {
  positional: string[]
  flags: Record<string, string | true>
}

// Flags that take a value; everything else is boolean and never consumes the
// next token (so `mkd --no-open <spec>` keeps <spec> as a positional).
const VALUE_FLAGS = new Set(['port', 'timeout']);

function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (VALUE_FLAGS.has(key) && next !== undefined && !next.startsWith('-')) {
        flags[key] = next;
        i += 2;
      }
      else {
        flags[key] = true;
        i += 1;
      }
    }
    else {
      positional.push(arg);
      i += 1;
    }
  }

  return { positional, flags };
}

function getFlag(flags: ParsedArgs['flags'], name: string): string | undefined {
  const value = flags[name];
  return typeof value === 'string' ? value : undefined;
}

function getBoolFlag(flags: ParsedArgs['flags'], name: string): boolean {
  return flags[name] === true || flags[name] === 'true';
}

// ============================================================================
// HELP
// ============================================================================

const HELP = `mkd - MKD (Make Decision) interactive decision-deck CLI

USAGE
  bun <skill-dir>/cli/index.ts <specPath> [options]

ARGUMENTS
  specPath            Path to a spec JSON file (required)

OPTIONS
  --wait             Blocking mode: serve the deck, await the browser submit,
                     print the result JSON to stdout (default: render a static
                     page, open it, exit immediately - the user copies the JSON)
  --port <n>         --wait only: preferred port (default: 4747, auto-increments)
  --timeout <min>    --wait only: minutes to wait (fractional ok, default: 1440 = 24h)
  --no-open          Do not auto-open the browser (still prints the page path/URL)
  --help             Show this help

OUTPUT
  copy mode:  writes ~/.mkd/deck-<name>.html and exits 0. Nothing on stdout.
  --wait:     on submit, writes ~/.mkd/result-<name>.json and prints the result
              JSON to stdout (the ONLY thing on stdout).
  Banners/paths/errors always go to stderr.

EXIT CODES
  0  ok    1  timeout/runtime    2  spec validation
`;

const DEFAULT_PORT = 4747;
const DEFAULT_TIMEOUT_MINUTES = 1440;

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const { positional, flags } = parseArgs(process.argv.slice(2));

  if (getBoolFlag(flags, 'help') || getBoolFlag(flags, 'h')) {
    console.error(HELP);
    process.exit(0);
  }

  const specPath = positional[0];
  if (!specPath) {
    console.error('[mkd] error: missing required <specPath> argument.\n');
    console.error(HELP);
    process.exit(2);
  }

  const wait = getBoolFlag(flags, 'wait');
  const port = parsePort(getFlag(flags, 'port'));
  const timeoutMinutes = parseTimeout(getFlag(flags, 'timeout'));
  const noOpen = getBoolFlag(flags, 'no-open');

  // Read + validate the spec.
  let raw: unknown;
  try {
    raw = await Bun.file(specPath).json();
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mkd] error: could not read spec file "${specPath}": ${message}`);
    process.exit(2);
  }

  let spec;
  try {
    spec = validateSpec(raw);
  }
  catch (error) {
    if (error instanceof SpecError) {
      console.error(`[mkd] invalid spec at ${error.path}: ${error.message}`);
      process.exit(2);
    }
    throw error;
  }

  // Short run id for the fallback filenames + logging.
  const id = Date.now().toString(36);
  const name = deriveName(specPath, id);

  if (!wait) {
    await runCopyMode(spec, name, noOpen);
    return;
  }
  await runWaitMode(spec, name, port, timeoutMinutes, noOpen);
}

// ============================================================================
// COPY MODE (default, non-blocking)
// ============================================================================

async function runCopyMode(
  spec: ReturnType<typeof validateSpec>,
  name: string,
  noOpen: boolean,
): Promise<void> {
  const html = render(spec, { mode: 'copy' });
  const pagePath = join(MKD_HOME, `deck-${sanitizeForFilename(name)}.html`);

  try {
    await Bun.write(pagePath, html);
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mkd] error: could not write ${pagePath}: ${message}`);
    process.exit(1);
  }

  if (!noOpen) {
    openBrowser(pagePath);
  }
  console.error(`[mkd] deck written to ${pagePath}${noOpen ? '' : ' (opened in the browser)'}`);
  console.error('[mkd] the user answers at their own pace and pastes the copied result JSON into the chat.');
  process.exit(0);
}

// ============================================================================
// WAIT MODE (--wait, blocking)
// ============================================================================

async function runWaitMode(
  spec: ReturnType<typeof validateSpec>,
  name: string,
  port: number,
  timeoutMinutes: number,
  noOpen: boolean,
): Promise<void> {
  let handle: ServeHandle | null = null;
  let boundUrl = `http://localhost:${port}/`;

  const onSigint = (): void => {
    console.error('\n[mkd] interrupted (SIGINT). Stopping server.');
    handle?.stop();
    process.exit(130);
  };
  process.on('SIGINT', onSigint);

  handle = serve(spec, {
    port,
    timeoutMs: timeoutMinutes * 60000,
    render: (normalized, submitToken) =>
      render(normalized, { mode: 'wait', submitToken }),
    onListening: (info) => {
      boundUrl = info.url;
    },
  });

  if (!noOpen) {
    openBrowser(boundUrl);
  }
  console.error(`[mkd] open this URL to respond: ${boundUrl}`);

  let result;
  try {
    result = await handle.result;
  }
  catch (error) {
    if (error instanceof TimeoutError) {
      console.error(`[mkd] ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
  finally {
    process.off('SIGINT', onSigint);
  }

  // Decode any user-pasted images (data URLs in transit) to `~/.mkd/` files
  // and rewrite each entry in-place to the file path BEFORE either write, so
  // both the backup and the authoritative stdout copy reference paths the AI
  // can Read - never inline base64. Mutates `result`.
  await persistImages(result, name);

  const outPath = join(MKD_HOME, `result-${sanitizeForFilename(name)}.json`);
  try {
    await Bun.write(outPath, `${JSON.stringify(result, null, 2)}\n`);
    console.error(`[mkd] result written to ${outPath}`);
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mkd] warning: could not write ${outPath}: ${message}`);
  }

  // THE single stdout write. Nothing else ever touches stdout.
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}

// ============================================================================
// IMAGE PERSISTENCE (--wait mode)
// ============================================================================

/** `data:image/png;base64,...` -> capture the mime in group 1. */
const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is;

/** Map an image mime to a file extension. Unknown image mimes -> `bin`. */
function extForMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'bin';
  }
}

/** Replace anything outside [A-Za-z0-9._-] with `_`. */
function sanitizeForFilename(value: string): string {
  return value.replace(/[^\w.-]/g, '_');
}

/**
 * Walk every item + every table item's rows[]; for each `images` array,
 * decode any `data:` URL entry to bytes, write it to
 * `~/.mkd/<name>-img-<itemId>[-<rowId>]-<n>.<ext>`, and replace the entry
 * with that absolute path. Entries that are already plain paths pass through
 * untouched. A failed decode/write logs a stderr warning and drops the entry
 * (never throws - must not break the handshake). Mutates `result` in place.
 */
export async function persistImages(result: Result, name: string): Promise<void> {
  const safeName = sanitizeForFilename(name);

  for (const item of result.items) {
    if ('images' in item && Array.isArray(item.images)) {
      item.images = await persistImageList(item.images, safeName, item.id, null);
    }
    if (item.type === 'table' && Array.isArray(item.rows)) {
      for (const row of item.rows) {
        if (Array.isArray(row.images)) {
          row.images = await persistImageList(row.images, safeName, item.id, row.id);
        }
      }
    }
  }
}

/**
 * Persist one `images` array, returning a new array where every decoded data
 * URL is replaced by its written `~/.mkd/` path. Non-data-URL entries pass
 * through; entries that fail to decode/write are dropped with a stderr
 * warning.
 */
async function persistImageList(
  images: string[],
  safeName: string,
  itemId: string,
  rowId: string | null,
): Promise<string[]> {
  const out: string[] = [];
  let n = 0;
  for (const entry of images) {
    const match = DATA_URL_RE.exec(entry);
    if (!match) {
      // Already a plain path (or non-data string) - pass through unchanged.
      out.push(entry);
      continue;
    }
    n += 1;
    const mime = match[1];
    const b64 = match[2];
    const ext = extForMime(mime);
    const safeItem = sanitizeForFilename(itemId);
    const rowPart = rowId !== null ? `-${sanitizeForFilename(rowId)}` : '';
    const path = join(MKD_HOME, `${safeName}-img-${safeItem}${rowPart}-${n}.${ext}`);
    try {
      const bytes = Buffer.from(b64, 'base64');
      await Bun.write(path, bytes);
      out.push(path);
      console.error(`[mkd] image written to ${path}`);
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[mkd] warning: could not write image ${path}: ${message} (dropped)`);
    }
  }
  return out;
}

// ============================================================================
// HELPERS
// ============================================================================

function parsePort(raw: string | undefined): number {
  if (raw === undefined) {
    return DEFAULT_PORT;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0 || value > 65535) {
    console.error(`[mkd] error: invalid --port "${raw}".`);
    process.exit(2);
  }
  return value;
}

function parseTimeout(raw: string | undefined): number {
  if (raw === undefined) {
    return DEFAULT_TIMEOUT_MINUTES;
  }
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`[mkd] error: invalid --timeout "${raw}" (minutes, fractional allowed).`);
    process.exit(2);
  }
  return value;
}

/**
 * Derive the deck/result name. A spec named `spec-NAME.json` yields `NAME`
 * (so `~/.mkd/spec-audit.json` -> `~/.mkd/deck-audit.html` +
 * `~/.mkd/result-audit.json`). Otherwise fall back to the short epoch id.
 */
function deriveName(specPath: string, id: string): string {
  const base = specPath.split(/[/\\]/).pop() ?? specPath;
  const match = /^spec-(.+)\.json$/.exec(base);
  return match ? match[1] : id;
}

/** Open a URL or a local file path in the default browser, cross-platform. */
function openBrowser(target: string): void {
  let cmd: string[];
  switch (process.platform) {
    case 'darwin':
      cmd = ['open', target];
      break;
    case 'win32':
      cmd = ['cmd', '/c', 'start', '', target];
      break;
    default:
      cmd = ['xdg-open', target];
      break;
  }
  try {
    Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore' });
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mkd] could not auto-open browser (${message}). Open ${target} manually.`);
  }
}

// ============================================================================
// RUN
// ============================================================================

// Only auto-run when invoked directly as the CLI entry point. Importing this
// module (e.g. to unit-test persistImages) must NOT kick off the server.
if (import.meta.main) {
  main().catch((error: unknown) => {
    if (error instanceof Error) {
      console.error(`[mkd] ${error.message}`);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
    }
    else {
      console.error(`[mkd] ${String(error)}`);
    }
    process.exit(1);
  });
}
