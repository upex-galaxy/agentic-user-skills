/**
 * MKD (`mkd`) - Server + blocking handshake (`--wait` mode only).
 *
 * Single Bun process. Serves the deck as an HTML page (`GET /`), then `await`s
 * a `POST /submit` from the browser. Resolves the promise with the submitted
 * `Result`. All logging goes to stderr (`console.error`) - stdout is reserved
 * exclusively for the final result JSON, emitted once by `index.ts`.
 *
 * Bun built-ins only, zero external deps (stays extractable).
 */

import type {
  DecisionResult,
  ItemStatus,
  NormalizedControls,
  NormalizedItem,
  NormalizedSpec,
  QuestionResult,
  ReportResult,
  Result,
  ResultItem,
  RowResult,
  TableResult,
} from './schema.ts';

import { CUSTOM_KEY } from './schema.ts';

// ============================================================================
// ERROR
// ============================================================================

/**
 * Rejected by the serve handle when no `POST /submit` arrives within
 * `timeoutMs`. Named so `index.ts` can branch on it and exit 1.
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

// ============================================================================
// OPTIONS / HANDLE
// ============================================================================

export interface ServeOptions {
  port: number
  timeoutMs: number
  render: (spec: NormalizedSpec, submitToken: string) => string
  /** Called once the server is bound, with the actually-bound URL + port. */
  onListening?: (info: { url: string, port: number }) => void
}

/**
 * Returned by `serve` so the caller (a SIGINT handler) can tear the server
 * down before the promise has settled.
 */
export interface ServeHandle {
  result: Promise<Result>
  stop: () => void
}

const MAX_PORT_ATTEMPTS = 20;

// ============================================================================
// BODY SHAPING
// ============================================================================

/**
 * Shape an arbitrary JSON body (the browser sends a full Result-shaped
 * object) into a concrete `Result`, walking the SPEC (not the payload) so a
 * forged or buggy client can neither invent items nor mistype them. Statuses
 * and stats are recomputed here - the client's copy is advisory, except for
 * the explicit `skipped` signal (which has no content to derive it from).
 * Defensive: never throws on a malformed field, just falls back to a safe
 * default, so a slightly-off payload still resolves the handshake.
 */
function shapeResult(body: unknown, spec: NormalizedSpec): Result {
  const obj = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const raw of rawItems) {
    if (typeof raw === 'object' && raw !== null) {
      const record = raw as Record<string, unknown>;
      if (typeof record.id === 'string') {
        byId.set(record.id, record);
      }
    }
  }

  const items: ResultItem[] = spec.items.map(item =>
    shapeResultItem(item, byId.get(item.id) ?? {}),
  );

  const submittedAt
    = typeof obj.submittedAt === 'string' && obj.submittedAt.length > 0
      ? obj.submittedAt
      : new Date().toISOString();

  const result: Result = {
    session: spec.session,
    submittedAt,
    stats: computeStats(spec, items),
    items,
  };
  if (typeof spec.source === 'string' && spec.source.length > 0) {
    result.source = spec.source;
  }
  return result;
}

function shapeResultItem(item: NormalizedItem, raw: Record<string, unknown>): ResultItem {
  switch (item.type) {
    case 'decision':
      return shapeDecision(item, raw);
    case 'table':
      return shapeTable(item, raw);
    case 'question':
      return shapeAnswerable(item, raw);
    default:
      return { ...shapeAnswerable(item, raw), type: 'report', controlAnswer: null };
  }
}

function shapeDecision(
  item: NormalizedItem & { type: 'decision' },
  raw: Record<string, unknown>,
): DecisionResult {
  // Accept only a real option key or the reserved CUSTOM key.
  let chosen: string | null = null;
  if (typeof raw.chosen === 'string') {
    if (raw.chosen === CUSTOM_KEY || item.options.some(option => option.key === raw.chosen)) {
      chosen = raw.chosen;
    }
  }
  const option = chosen !== null && chosen !== CUSTOM_KEY
    ? item.options.find(candidate => candidate.key === chosen) ?? null
    : null;

  const customText = typeof raw.customText === 'string' ? raw.customText : '';
  const note = typeof raw.note === 'string' ? raw.note : '';
  const status: ItemStatus = chosen !== null
    ? 'answered'
    : (raw.status === 'skipped' ? 'skipped' : 'pending');

  return {
    id: item.id,
    type: 'decision',
    title: item.title,
    status,
    chosen,
    chosenLabel: option ? option.label : (chosen === CUSTOM_KEY ? 'custom' : null),
    wasRecommended: option ? option.recommended === true : null,
    customText,
    note,
  };
}

function shapeTable(
  item: NormalizedItem & { type: 'table' },
  raw: Record<string, unknown>,
): TableResult {
  const rawRows = Array.isArray(raw.rows) ? raw.rows : [];
  const rowsById = new Map<string, Record<string, unknown>>();
  for (const rawRow of rawRows) {
    if (typeof rawRow === 'object' && rawRow !== null) {
      const record = rawRow as Record<string, unknown>;
      if (typeof record.id === 'string') {
        rowsById.set(record.id, record);
      }
    }
  }

  const rows: RowResult[] = item.table.rows.map((row) => {
    const rawRow = rowsById.get(row.id) ?? {};
    const shaped = shapeAnswer(rawRow, item.table.rowControls);
    return { id: row.id, ...shaped };
  });

  const note = typeof raw.note === 'string' ? raw.note : '';
  const quotes = stringArray(raw.quotes);
  const answered = rows.some(row => hasAnswer(row)) || note.trim().length > 0;
  const status: ItemStatus = answered
    ? 'answered'
    : (raw.status === 'skipped' ? 'skipped' : 'pending');

  const result: TableResult = {
    id: item.id,
    type: 'table',
    title: item.title,
    status,
    quotes,
    note,
    rows,
  };
  const images = stringArray(raw.images);
  if (images.length > 0) {
    result.images = images;
  }
  return result;
}

function shapeAnswerable(
  item: NormalizedItem & { type: 'question' },
  raw: Record<string, unknown>,
): QuestionResult;
function shapeAnswerable(
  item: NormalizedItem & { type: 'report' },
  raw: Record<string, unknown>,
): ReportResult;
function shapeAnswerable(
  item: (NormalizedItem & { type: 'question' }) | (NormalizedItem & { type: 'report' }),
  raw: Record<string, unknown>,
): QuestionResult | ReportResult {
  const controls = item.type === 'question' ? item.controls : undefined;
  const shaped = shapeAnswer(raw, controls);
  const status: ItemStatus = hasAnswer(shaped)
    ? 'answered'
    : (raw.status === 'skipped' ? 'skipped' : 'pending');

  const base = {
    id: item.id,
    title: item.title,
    status,
    text: shaped.text,
    quotes: shaped.quotes,
  };
  const result: QuestionResult | ReportResult = item.type === 'question'
    ? { ...base, type: 'question', controlAnswer: shaped.controlAnswer }
    : { ...base, type: 'report', controlAnswer: null };
  if (shaped.images) {
    result.images = shaped.images;
  }
  return result;
}

/**
 * Shape the answer triple (controlAnswer/text/quotes) shared by answerable
 * items + table rows, plus a pass-through `images` array when present +
 * non-empty (else the key is omitted). Images arrive as `data:` URLs here;
 * index.ts later persists them to `~/.mkd/` files and rewrites the entries to
 * paths - this helper only preserves the raw strings (no disk IO here).
 */
function shapeAnswer(
  obj: Record<string, unknown>,
  controls: NormalizedControls | undefined,
): {
  controlAnswer: RowResult['controlAnswer']
  text: string
  quotes: string[]
  images?: string[]
} {
  let controlAnswer: RowResult['controlAnswer'] = null;
  const ca = obj.controlAnswer;
  if (controls) {
    switch (controls.type) {
      case 'single':
        controlAnswer = typeof ca === 'string' && ca.length > 0 ? ca : null;
        break;
      case 'multi':
        controlAnswer = Array.isArray(ca)
          ? ca.filter((value): value is string => typeof value === 'string')
          : [];
        break;
      case 'toggle':
        controlAnswer = ca === true;
        break;
    }
  }

  const text = typeof obj.text === 'string' ? obj.text : '';
  const quotes = stringArray(obj.quotes);

  const shaped: {
    controlAnswer: RowResult['controlAnswer']
    text: string
    quotes: string[]
    images?: string[]
  } = { controlAnswer, text, quotes };

  // Pass images through (data URLs) only when present + non-empty. Dropping
  // unknown fields silently is the exact class of bug that once bit rows[] -
  // so attach explicitly here.
  const images = stringArray(obj.images);
  if (images.length > 0) {
    shaped.images = images;
  }

  return shaped;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/** Does an answer triple carry any concrete answer? (text or control value). */
function hasAnswer(a: { controlAnswer: RowResult['controlAnswer'], text: string }): boolean {
  if (a.text.trim().length > 0) {
    return true;
  }
  const ca = a.controlAnswer;
  if (ca === null) {
    return false;
  }
  if (Array.isArray(ca)) {
    return ca.length > 0;
  }
  if (typeof ca === 'boolean') {
    // toggle: only ON counts as answered (matches app.js).
    return ca;
  }
  return true;
}

/** Authoritative stats, recomputed from the shaped items. */
function computeStats(spec: NormalizedSpec, items: ResultItem[]): Result['stats'] {
  let answered = 0;
  let skipped = 0;
  let recFollowed = 0;
  let overridden = 0;
  let custom = 0;
  for (const item of items) {
    if (item.status === 'skipped') {
      skipped += 1;
      continue;
    }
    if (item.status !== 'answered') {
      continue;
    }
    answered += 1;
    if (item.type !== 'decision') {
      continue;
    }
    if (item.chosen === CUSTOM_KEY) {
      custom += 1;
    }
    else if (item.wasRecommended === true) {
      recFollowed += 1;
    }
    else if (item.chosen !== null) {
      overridden += 1;
    }
  }
  return { total: spec.items.length, answered, skipped, recFollowed, overridden, custom };
}

// ============================================================================
// SERVE + AWAIT
// ============================================================================

/**
 * Start an HTTP server for `spec`, then resolve once the browser POSTs the
 * result. Auto-increments past a busy port (up to ~20 attempts). Rejects with
 * `TimeoutError` if no submit lands within `opts.timeoutMs`. The server is
 * always stopped when the promise settles.
 */
export function serve(spec: NormalizedSpec, opts: ServeOptions): ServeHandle {
  // Per-run secret: the served page carries it, the browser echoes it back on
  // /submit (x-mkd-token header). Blocks cross-origin / forged submissions
  // from poisoning the human-in-the-loop signal the AI treats as
  // authoritative.
  const submitToken = crypto.randomUUID();
  const html = opts.render(spec, submitToken);

  let server: ReturnType<typeof Bun.serve> | null = null;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  let resolveResult!: (value: Result) => void;
  let rejectResult!: (reason: Error) => void;
  const result = new Promise<Result>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  function cleanup(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (server) {
      // server.stop() returns a Promise in Bun; we do not need to await it.
      void server.stop(true);
      server = null;
    }
  }

  function finish(action: () => void): void {
    if (settled) {
      return;
    }
    settled = true;
    cleanup();
    action();
  }

  // Bind a port, auto-incrementing past EADDRINUSE.
  let boundPort = opts.port;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    const candidate = opts.port + attempt;
    try {
      server = Bun.serve({
        port: candidate,
        // Loopback only: the page + /submit must not be reachable from the LAN.
        hostname: '127.0.0.1',
        fetch: handleRequest,
      });
      boundPort = candidate;
      lastError = null;
      break;
    }
    catch (error) {
      lastError = error;
      if (isAddrInUse(error)) {
        console.error(`[mkd] port ${candidate} busy, trying ${candidate + 1}...`);
        continue;
      }
      // Non-port error: stop trying.
      break;
    }
  }

  if (!server) {
    const message
      = lastError instanceof Error ? lastError.message : String(lastError);
    finish(() =>
      rejectResult(
        new Error(
          `Failed to bind a port starting at ${opts.port} after ${MAX_PORT_ATTEMPTS} attempts: ${message}`,
        ),
      ),
    );
    return { result, stop: () => finish(() => {}) };
  }

  const url = `http://localhost:${boundPort}/`;
  console.error(`[mkd] waiting for input at ${url}`);
  opts.onListening?.({ url, port: boundPort });

  timer = setTimeout(() => {
    finish(() =>
      rejectResult(
        new TimeoutError(
          `No submission received within ${Math.round(opts.timeoutMs / 1000)}s. Aborting.`,
        ),
      ),
    );
  }, opts.timeoutMs);
  // Do not let the timeout keep the event loop alive on its own.
  if (typeof timer === 'object' && timer && 'unref' in timer) {
    (timer as { unref: () => void }).unref();
  }

  async function handleRequest(request: Request): Promise<Response> {
    const { method } = request;
    const path = new URL(request.url).pathname;

    if (method === 'GET' && path === '/') {
      return new Response(html, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    if (method === 'POST' && path === '/submit') {
      // CSRF / forgery gate: only the page we served knows submitToken. A
      // custom header also forces a CORS preflight, blocking cross-origin
      // simple POSTs.
      if (request.headers.get('x-mkd-token') !== submitToken) {
        console.error('[mkd] rejected /submit: missing or invalid token');
        return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
      }
      let body: unknown;
      try {
        body = await request.json();
      }
      catch {
        console.error('[mkd] received a /submit with an unparseable JSON body');
        return Response.json(
          { ok: false, error: 'invalid JSON body' },
          { status: 400 },
        );
      }
      const shaped = shapeResult(body, spec);
      // Defer resolve + teardown so THIS 200 response flushes to the browser
      // first; resolving inline races the in-flight response and the browser
      // shows a false "submit failed".
      setTimeout(() => finish(() => resolveResult(shaped)), 50);
      return Response.json({ ok: true });
    }

    return new Response('Not found', { status: 404 });
  }

  return {
    result,
    stop: () => finish(() => {}),
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function isAddrInUse(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const e = error as { code?: unknown, message?: unknown };
  if (e.code === 'EADDRINUSE') {
    return true;
  }
  return typeof e.message === 'string' && e.message.includes('EADDRINUSE');
}
