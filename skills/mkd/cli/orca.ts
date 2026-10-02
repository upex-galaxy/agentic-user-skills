/**
 * MKD (`mkd`) - Orca integration.
 *
 * When the deck runs inside Orca (a multi-agent IDE), the default flow is
 * serve-and-wait with the deck opened in a browser tab BOUND to the current
 * worktree: the page sits next to the terminal that produced it and the
 * submit returns the Result JSON to the agent with no copy step. Outside
 * Orca nothing here runs and the CLI behaves exactly as before.
 *
 * Everything is best-effort and silent on failure: detection that errors
 * means "not detected"; a tab that fails to open or to load is closed and the
 * caller falls back to the system browser.
 *
 * Every process spawn goes through an injectable `Runner` so the decision
 * logic is unit-testable without Orca installed (see `orca.test.ts`).
 *
 * Bun built-ins only, zero external deps (stays extractable).
 */

// ============================================================================
// PROCESS RUNNER (injectable)
// ============================================================================

export interface RunOutput {
  /** Exit code, or null when the process could not be spawned / timed out. */
  code: number | null
  stdout: string
}

export type Runner = (cmd: string[], timeoutMs: number) => Promise<RunOutput>;

/**
 * Default runner: stdin closed (an interactive prompt can never hang us),
 * stderr discarded, killed after `timeoutMs`. Never throws.
 */
export const defaultRunner: Runner = async (cmd, timeoutMs) => {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(cmd, { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' });
  }
  catch {
    return { code: null, stdout: '' };
  }
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);
  try {
    const [stdout, code] = await Promise.all([
      new Response(proc.stdout as ReadableStream).text(),
      proc.exited,
    ]);
    return { code: timedOut ? null : code, stdout };
  }
  catch {
    return { code: null, stdout: '' };
  }
  finally {
    clearTimeout(timer);
  }
};

const STATUS_TIMEOUT_MS = 4000;
const TAB_TIMEOUT_MS = 8000;

// ============================================================================
// EXECUTABLE + DETECTION
// ============================================================================

type Env = Record<string, string | undefined>;

/**
 * Resolve the Orca CLI the same way Orca's own `orca-cli` skill does:
 * `ORCA_CLI_COMMAND` (managed WSL sessions) -> `orca-dev` in an Orca dev
 * checkout -> `orca-ide` on Linux outside a managed terminal (bare `orca`
 * there is normally the GNOME screen reader, which would start speaking) ->
 * `orca`.
 */
export function resolveOrcaCommand(env: Env, platform: string): string[] {
  const override = env.ORCA_CLI_COMMAND?.trim();
  if (override) {
    return override.split(/\s+/);
  }
  if (env.ORCA_DEV_REPO_ROOT) {
    return ['orca-dev'];
  }
  if (platform === 'linux' && !env.ORCA_TERMINAL_HANDLE) {
    return ['orca-ide'];
  }
  return ['orca'];
}

export interface OrcaDetection {
  detected: boolean
  /** How it was detected (for the stderr banner). */
  via: 'terminal-env' | 'status' | null
  cmd: string[]
}

/**
 * Orca is present when this process runs in an Orca-managed terminal
 * (`ORCA_TERMINAL_HANDLE` set), or when `orca status --json` reports a
 * reachable runtime. Any failure (binary missing, timeout, bad JSON) means
 * "not detected" - silently.
 */
export async function detectOrca(
  env: Env,
  platform: string,
  run: Runner = defaultRunner,
): Promise<OrcaDetection> {
  const cmd = resolveOrcaCommand(env, platform);
  if (env.ORCA_TERMINAL_HANDLE) {
    return { detected: true, via: 'terminal-env', cmd };
  }
  const out = await run([...cmd, 'status', '--json'], STATUS_TIMEOUT_MS);
  if (out.code !== 0) {
    return { detected: false, via: null, cmd };
  }
  const json = parseJson(out.stdout);
  const reachable = get(json, ['result', 'runtime', 'reachable']) === true;
  return { detected: reachable, via: reachable ? 'status' : null, cmd };
}

// ============================================================================
// WORKTREE SELECTOR
// ============================================================================

/**
 * Selector for the CURRENT checkout: `path:<git toplevel of cwd>`, or
 * `path:<cwd>` outside a git repo (an Orca folder context). Measured on Orca
 * 1.4.190: `path:` and `id:<repo-id>::<path>` both bind the tab; a path Orca
 * does not manage fails with `selector_not_found`, which the caller treats as
 * "fall back to the system browser".
 */
export async function worktreeSelector(cwd: string, run: Runner = defaultRunner): Promise<string> {
  const out = await run(['git', '-C', cwd, 'rev-parse', '--show-toplevel'], STATUS_TIMEOUT_MS);
  const top = out.code === 0 ? out.stdout.trim() : '';
  return `path:${top || cwd}`;
}

// ============================================================================
// STABLE PORT
// ============================================================================

/** First port of the stable range (also the historical `--wait` default). */
export const PORT_BASE = 4747;
/** Range width: decks land on 4747-4946 (auto-increment may go ~20 past it). */
export const PORT_SPAN = 200;

/**
 * A stable port per deck, so a half-answered deck reopens on the SAME origin
 * and its localStorage answers come back. FNV-1a over the key, folded into
 * [PORT_BASE, PORT_BASE + PORT_SPAN).
 */
export function derivePort(key: string): number {
  let hash = 0x811C9DC5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return PORT_BASE + (hash % PORT_SPAN);
}

// ============================================================================
// MODE RESOLUTION
// ============================================================================

export type Opener = 'orca' | 'system' | 'none';

export interface ModeChoice {
  mode: 'copy' | 'wait'
  opener: Opener
}

/**
 * - `--copy`: copy mode, system browser (forces the old flow inside Orca).
 * - `--wait`: wait mode; opens in Orca when detected, else system browser.
 * - neither: Orca detected -> wait mode in an Orca tab; else copy mode.
 * - `--no-open` keeps its meaning in every mode: open nothing.
 */
export function resolveMode(
  flags: { wait: boolean, copy: boolean, noOpen: boolean },
  orcaDetected: boolean,
): ModeChoice {
  const mode = flags.copy ? 'copy' : (flags.wait || orcaDetected ? 'wait' : 'copy');
  let opener: Opener;
  if (flags.noOpen) {
    opener = 'none';
  }
  else if (mode === 'wait' && orcaDetected) {
    opener = 'orca';
  }
  else {
    opener = 'system';
  }
  return { mode, opener };
}

// ============================================================================
// TABS
// ============================================================================

export type TabOpen
  = | { ok: true, pageId: string }
    | { ok: false, reason: string };

export interface OpenTabOptions {
  cmd: string[]
  url: string
  selector: string
  run?: Runner
  /** Injected for tests; resolves after `ms`. */
  sleep?: (ms: number) => Promise<void>
  /** How many `tab list` polls before giving up on a verdict. */
  polls?: number
  pollIntervalMs?: number
}

/**
 * `orca tab create --url <url> --worktree <selector>`, then confirm with
 * `orca tab list` that the tab exists and its `loadError` is null. A tab that
 * opened is not a page that worked: on a load error or a missing tab, the
 * created tab is closed again so the deck never lives in two origins.
 */
export async function openOrcaTab(opts: OpenTabOptions): Promise<TabOpen> {
  const run = opts.run ?? defaultRunner;
  const sleep = opts.sleep ?? (async (ms: number) => Bun.sleep(ms));
  const polls = opts.polls ?? 4;
  const interval = opts.pollIntervalMs ?? 500;

  const created = await run(
    [...opts.cmd, 'tab', 'create', '--url', opts.url, '--worktree', opts.selector, '--json'],
    TAB_TIMEOUT_MS,
  );
  const createdJson = parseJson(created.stdout);
  const pageId = get(createdJson, ['result', 'browserPageId']);
  if (created.code !== 0 || typeof pageId !== 'string') {
    const code = get(createdJson, ['error', 'code']);
    return { ok: false, reason: `tab create failed (${typeof code === 'string' ? code : `exit ${created.code}`})` };
  }

  let lastReason = 'tab not listed';
  for (let attempt = 0; attempt < polls; attempt++) {
    await sleep(interval);
    const listed = await run(
      [...opts.cmd, 'tab', 'list', '--worktree', opts.selector, '--json'],
      TAB_TIMEOUT_MS,
    );
    const tabs = get(parseJson(listed.stdout), ['result', 'tabs']);
    const tab: unknown = Array.isArray(tabs)
      ? (tabs as unknown[]).find(entry => get(entry, ['browserPageId']) === pageId)
      : undefined;
    if (tab === undefined) {
      lastReason = 'tab not listed';
      continue;
    }
    const loadError = get(tab, ['loadError']);
    if (loadError === null || loadError === undefined) {
      return { ok: true, pageId };
    }
    const description = get(loadError, ['description']);
    lastReason = `tab load error (${typeof description === 'string' ? description : 'unknown'})`;
    break;
  }

  await closeOrcaTab({ cmd: opts.cmd, pageId, selector: opts.selector, run });
  return { ok: false, reason: lastReason };
}

/** `orca tab close --page <id>`. Resolves true when Orca confirms it. */
export async function closeOrcaTab(opts: {
  cmd: string[]
  pageId: string
  selector: string
  run?: Runner
}): Promise<boolean> {
  const run = opts.run ?? defaultRunner;
  const out = await run(
    [...opts.cmd, 'tab', 'close', '--page', opts.pageId, '--worktree', opts.selector, '--json'],
    TAB_TIMEOUT_MS,
  );
  return out.code === 0 && get(parseJson(out.stdout), ['result', 'closed']) === true;
}

// ============================================================================
// HELPERS
// ============================================================================

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  }
  catch {
    return null;
  }
}

function get(value: unknown, path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
