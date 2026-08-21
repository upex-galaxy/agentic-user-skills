/**
 * MKD (`mkd`) - Schema + runtime validation.
 *
 * Single source of truth for the data contract between the AI (which writes a
 * spec) and the browser deck UI (which returns a result). Hand-rolled
 * validation, zero external deps - Bun built-ins only so this stays
 * extractable.
 *
 * The spec is a DECK of items; each item is one screen. Four item types:
 *
 * - `decision` - a problem + context balloons + options, where EVERY option
 *   carries a written justification and at most one is `recommended`. The
 *   user picks an option, writes a custom direction, or skips.
 * - `question` - markdown content + a single/multi/toggle control + free text.
 * - `report`   - a report section the user reacts to with free text.
 * - `table`    - an answerable table (one answer per row).
 */

// ============================================================================
// SPEC TYPES (input - the AI writes it)
// ============================================================================

export type ControlType = 'single' | 'multi' | 'toggle';

export interface ControlOption {
  value: string
  label: string
}

export interface Controls {
  type: ControlType
  options?: ControlOption[]
  required?: boolean
}

export interface TextField {
  required?: boolean
  placeholder?: string
}

/** One table row: a stable `id` plus a `cells` value per column (in order). */
export interface TableRow {
  id: string
  cells: string[]
}

/**
 * The table config of a `table` item: each ROW is independently answerable.
 * `rowControls`/`rowText` are applied per row (every row gets the same control
 * + textarea).
 */
export interface ItemTable {
  columns: string[]
  rows: TableRow[]
  rowControls?: Controls
  rowText?: TextField
}

export type Severity = 'high' | 'medium' | 'low';

/** A collapsible context balloon on a decision ("How does X work today?"). */
export interface ContextBalloon {
  title: string
  body: string
}

/**
 * One option of a decision. `justification` is MANDATORY and non-empty - an
 * option without a written value/cost rationale fails validation (exit 2).
 * At most one option per decision may be `recommended`, and its justification
 * must state WHY it is the recommendation.
 */
export interface DecisionOption {
  key: string
  label: string
  justification: string
  recommended?: boolean
}

interface ItemBase {
  id: string
  title: string
  severity?: Severity
  scope?: string
}

export interface DecisionItem extends ItemBase {
  type: 'decision'
  /** Plain-language problem statement (markdown). */
  problem: string
  context?: ContextBalloon[]
  options: DecisionOption[]
  /** Offer a free-form "something else" option. Default true. */
  allowCustom?: boolean
}

export interface QuestionItem extends ItemBase {
  type: 'question'
  content: string
  controls: Controls
  text?: TextField
}

export interface ReportItem extends ItemBase {
  type: 'report'
  content: string
  text?: TextField
}

export interface TableItem extends ItemBase {
  type: 'table'
  /** Optional markdown intro shown above the table. */
  content?: string
  table: ItemTable
}

export type Item = DecisionItem | QuestionItem | ReportItem | TableItem;

export interface IntroStat {
  n: string
  label: string
}

/** The optional intro screen shown before the first item. */
export interface SpecIntro {
  headline?: string
  body?: string
  stats?: IntroStat[]
}

export interface Spec {
  /** Session slug echoed back in the result (and used to key persistence). */
  session: string
  /** Optional pointer to the artifact the deck was derived from. */
  source?: string
  title: string
  intro?: SpecIntro
  /** CTA label for the `--wait` submit button. */
  submitLabel?: string
  items: Item[]
}

// ============================================================================
// NORMALIZED SPEC TYPES (output of validateSpec - downstream depends on this)
// ============================================================================

export interface NormalizedControls {
  type: ControlType
  options?: ControlOption[]
  required: boolean
}

export interface NormalizedTextField {
  required: boolean
  placeholder?: string
}

export interface NormalizedItemTable {
  columns: string[]
  rows: TableRow[]
  rowControls?: NormalizedControls
  rowText: NormalizedTextField
}

interface NormalizedItemBase {
  id: string
  title: string
  severity?: Severity
  scope?: string
}

export interface NormalizedDecisionItem extends NormalizedItemBase {
  type: 'decision'
  problem: string
  context: ContextBalloon[]
  options: DecisionOption[]
  allowCustom: boolean
}

export interface NormalizedQuestionItem extends NormalizedItemBase {
  type: 'question'
  content: string
  controls: NormalizedControls
  text: NormalizedTextField
}

export interface NormalizedReportItem extends NormalizedItemBase {
  type: 'report'
  content: string
  text: NormalizedTextField
}

export interface NormalizedTableItem extends NormalizedItemBase {
  type: 'table'
  content: string
  table: NormalizedItemTable
}

export type NormalizedItem
  = | NormalizedDecisionItem
    | NormalizedQuestionItem
    | NormalizedReportItem
    | NormalizedTableItem;

export interface NormalizedSpec {
  session: string
  source?: string
  title: string
  intro?: SpecIntro
  submitLabel: string
  items: NormalizedItem[]
}

// ============================================================================
// RESULT TYPES (output - copy-JSON pasted into the chat, or stdout on --wait)
// ============================================================================

export type ItemStatus = 'answered' | 'skipped' | 'pending';

/** One answered table row in the result (present only inside a table item). */
export interface RowResult {
  id: string
  controlAnswer: string | string[] | boolean | null
  text: string
  quotes: string[]
  /**
   * User-pasted images attached to this row (`--wait` mode only). DUAL NATURE
   * by stage: in transit (browser -> server) each entry is a `data:` URL; in
   * the FINAL result (stdout + backup) each entry is an absolute file path
   * under `~/.mkd/`. Present (and non-empty) ONLY when at least one image was
   * attached.
   */
  images?: string[]
}

export interface DecisionResult {
  id: string
  type: 'decision'
  title: string
  status: ItemStatus
  /** The chosen option `key`, the literal `"CUSTOM"`, or null. */
  chosen: string | null
  /** The chosen option's label, `"custom"` for CUSTOM, or null. */
  chosenLabel: string | null
  /** True when the chosen option was the recommended one; null when no pick. */
  wasRecommended: boolean | null
  customText: string
  note: string
}

export interface QuestionResult {
  id: string
  type: 'question'
  title: string
  status: ItemStatus
  controlAnswer: string | string[] | boolean | null
  text: string
  quotes: string[]
  /** Same dual-nature contract as `RowResult.images`. `--wait` mode only. */
  images?: string[]
}

export interface ReportResult {
  id: string
  type: 'report'
  title: string
  status: ItemStatus
  controlAnswer: null
  text: string
  quotes: string[]
  /** Same dual-nature contract as `RowResult.images`. `--wait` mode only. */
  images?: string[]
}

export interface TableResult {
  id: string
  type: 'table'
  title: string
  status: ItemStatus
  /** Quotes captured from the intro content (per-cell quotes live in rows). */
  quotes: string[]
  note: string
  rows: RowResult[]
  /** Same dual-nature contract as `RowResult.images`. `--wait` mode only. */
  images?: string[]
}

export type ResultItem
  = | DecisionResult
    | QuestionResult
    | ReportResult
    | TableResult;

export interface ResultStats {
  total: number
  answered: number
  skipped: number
  /** Decisions where the recommended option was chosen. */
  recFollowed: number
  /** Decisions where a NON-recommended option was chosen. */
  overridden: number
  /** Decisions answered with a custom direction. */
  custom: number
}

export interface Result {
  session: string
  source?: string
  submittedAt: string
  stats: ResultStats
  items: ResultItem[]
}

// ============================================================================
// ERROR
// ============================================================================

/**
 * Thrown by `validateSpec` on any contract violation. `path` names the
 * offending location (e.g. `items[2].id`, `items[0].options[1].justification`)
 * so callers can surface a precise message and choose exit code 2.
 */
export class SpecError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(message);
    this.name = 'SpecError';
    this.path = path;
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

const CONTROL_TYPES: readonly ControlType[] = ['single', 'multi', 'toggle'];
const ITEM_TYPES = ['decision', 'question', 'report', 'table'] as const;
const SEVERITIES: readonly Severity[] = ['high', 'medium', 'low'];

/** Reserved decision key used by the UI for the free-form custom option. */
export const CUSTOM_KEY = 'CUSTOM';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate + normalize a raw spec (typically `JSON.parse` output).
 *
 * Returns a fully normalized `NormalizedSpec`: `submitLabel` defaulted, every
 * text field concrete, `allowCustom`/`context` defaulted on decisions. Throws
 * `SpecError` (with a `path`) on the first violation.
 */
export function validateSpec(raw: unknown): NormalizedSpec {
  if (!isPlainObject(raw)) {
    throw new SpecError('Spec must be a plain object.', 'spec');
  }

  if (!isNonEmptyString(raw.session)) {
    throw new SpecError('Spec "session" must be a non-empty string.', 'session');
  }

  if (raw.source !== undefined && typeof raw.source !== 'string') {
    throw new SpecError('Spec "source" must be a string when present.', 'source');
  }

  if (!isNonEmptyString(raw.title)) {
    throw new SpecError('Spec "title" must be a non-empty string.', 'title');
  }

  if (raw.submitLabel !== undefined && typeof raw.submitLabel !== 'string') {
    throw new SpecError(
      'Spec "submitLabel" must be a string when present.',
      'submitLabel',
    );
  }

  const intro = normalizeIntro(raw.intro);

  if (!Array.isArray(raw.items)) {
    throw new SpecError('Spec "items" must be an array.', 'items');
  }

  if (raw.items.length === 0) {
    throw new SpecError('Spec "items" must be a non-empty array.', 'items');
  }

  const seenItemIds = new Set<string>();
  const items: NormalizedItem[] = raw.items.map((rawItem, index) =>
    normalizeItem(rawItem, index, seenItemIds),
  );

  const submitLabel = isNonEmptyString(raw.submitLabel)
    ? raw.submitLabel
    : 'Send to Claude';

  const normalized: NormalizedSpec = {
    session: raw.session,
    title: raw.title,
    submitLabel,
    items,
  };

  if (isNonEmptyString(raw.source)) {
    normalized.source = raw.source;
  }
  if (intro) {
    normalized.intro = intro;
  }

  return normalized;
}

function normalizeIntro(rawIntro: unknown): SpecIntro | null {
  if (rawIntro === undefined) {
    return null;
  }
  if (!isPlainObject(rawIntro)) {
    throw new SpecError('Spec "intro" must be a plain object when present.', 'intro');
  }
  const intro: SpecIntro = {};
  if (rawIntro.headline !== undefined) {
    if (typeof rawIntro.headline !== 'string') {
      throw new SpecError('"intro.headline" must be a string when present.', 'intro.headline');
    }
    intro.headline = rawIntro.headline;
  }
  if (rawIntro.body !== undefined) {
    if (typeof rawIntro.body !== 'string') {
      throw new SpecError('"intro.body" must be a string when present.', 'intro.body');
    }
    intro.body = rawIntro.body;
  }
  if (rawIntro.stats !== undefined) {
    if (!Array.isArray(rawIntro.stats)) {
      throw new SpecError('"intro.stats" must be an array when present.', 'intro.stats');
    }
    intro.stats = rawIntro.stats.map((rawStat, index) => {
      const where = `intro.stats[${index}]`;
      if (!isPlainObject(rawStat)) {
        throw new SpecError(`${where} must be an object.`, where);
      }
      const n = typeof rawStat.n === 'number' ? String(rawStat.n) : rawStat.n;
      if (!isNonEmptyString(n)) {
        throw new SpecError(`${where}.n must be a non-empty string or a number.`, `${where}.n`);
      }
      if (!isNonEmptyString(rawStat.label)) {
        throw new SpecError(`${where}.label must be a non-empty string.`, `${where}.label`);
      }
      return { n, label: rawStat.label };
    });
  }
  return intro;
}

interface NormalizedItemBaseFields {
  id: string
  title: string
  severity?: Severity
  scope?: string
}

function normalizeItem(
  rawItem: unknown,
  index: number,
  seenItemIds: Set<string>,
): NormalizedItem {
  const where = `items[${index}]`;

  if (!isPlainObject(rawItem)) {
    throw new SpecError(`${where} must be a plain object.`, where);
  }

  if (!isNonEmptyString(rawItem.id)) {
    throw new SpecError(`${where}.id must be a non-empty string.`, `${where}.id`);
  }
  const id = rawItem.id;

  if (seenItemIds.has(id)) {
    throw new SpecError(
      `${where}.id "${id}" is duplicated; every item id must be unique.`,
      `${where}.id`,
    );
  }
  seenItemIds.add(id);

  const type = rawItem.type;
  if (typeof type !== 'string' || !(ITEM_TYPES as readonly string[]).includes(type)) {
    throw new SpecError(
      `${where}.type (id "${id}") must be one of: decision, question, report, table.`,
      `${where}.type`,
    );
  }

  if (!isNonEmptyString(rawItem.title)) {
    throw new SpecError(
      `${where}.title (id "${id}") must be a non-empty string.`,
      `${where}.title`,
    );
  }

  const base: NormalizedItemBaseFields = { id, title: rawItem.title };

  if (rawItem.severity !== undefined) {
    if (
      typeof rawItem.severity !== 'string'
      || !SEVERITIES.includes(rawItem.severity as Severity)
    ) {
      throw new SpecError(
        `${where}.severity (id "${id}") must be one of: high, medium, low.`,
        `${where}.severity`,
      );
    }
    base.severity = rawItem.severity as Severity;
  }

  if (rawItem.scope !== undefined) {
    if (!isNonEmptyString(rawItem.scope)) {
      throw new SpecError(
        `${where}.scope (id "${id}") must be a non-empty string when present.`,
        `${where}.scope`,
      );
    }
    base.scope = rawItem.scope;
  }

  switch (type) {
    case 'decision':
      return normalizeDecision(rawItem, base, where);
    case 'question':
      return normalizeQuestion(rawItem, base, where);
    case 'report':
      return normalizeReport(rawItem, base, where);
    default:
      return normalizeTableItem(rawItem, base, where);
  }
}

function normalizeDecision(
  raw: Record<string, unknown>,
  base: NormalizedItemBaseFields,
  where: string,
): NormalizedDecisionItem {
  const id = base.id;

  if (!isNonEmptyString(raw.problem)) {
    throw new SpecError(
      `${where}.problem (id "${id}") must be a non-empty string.`,
      `${where}.problem`,
    );
  }

  const context: ContextBalloon[] = [];
  if (raw.context !== undefined) {
    if (!Array.isArray(raw.context)) {
      throw new SpecError(
        `${where}.context (id "${id}") must be an array when present.`,
        `${where}.context`,
      );
    }
    for (let i = 0; i < raw.context.length; i += 1) {
      const rawBalloon: unknown = raw.context[i];
      const balloonWhere = `${where}.context[${i}]`;
      if (!isPlainObject(rawBalloon)) {
        throw new SpecError(`${balloonWhere} (id "${id}") must be an object.`, balloonWhere);
      }
      if (!isNonEmptyString(rawBalloon.title)) {
        throw new SpecError(
          `${balloonWhere}.title (id "${id}") must be a non-empty string.`,
          `${balloonWhere}.title`,
        );
      }
      if (!isNonEmptyString(rawBalloon.body)) {
        throw new SpecError(
          `${balloonWhere}.body (id "${id}") must be a non-empty string.`,
          `${balloonWhere}.body`,
        );
      }
      context.push({ title: rawBalloon.title, body: rawBalloon.body });
    }
  }

  if (!Array.isArray(raw.options) || raw.options.length < 2) {
    throw new SpecError(
      `${where}.options (id "${id}") must be an array of at least 2 options - one option is not a decision.`,
      `${where}.options`,
    );
  }

  const seenKeys = new Set<string>();
  let recommendedCount = 0;
  const options: DecisionOption[] = raw.options.map((rawOption, i) => {
    const optionWhere = `${where}.options[${i}]`;
    if (!isPlainObject(rawOption)) {
      throw new SpecError(`${optionWhere} (id "${id}") must be an object.`, optionWhere);
    }
    if (!isNonEmptyString(rawOption.key)) {
      throw new SpecError(
        `${optionWhere}.key (id "${id}") must be a non-empty string.`,
        `${optionWhere}.key`,
      );
    }
    if (rawOption.key === CUSTOM_KEY) {
      throw new SpecError(
        `${optionWhere}.key (id "${id}") must not be the reserved key "${CUSTOM_KEY}".`,
        `${optionWhere}.key`,
      );
    }
    if (seenKeys.has(rawOption.key)) {
      throw new SpecError(
        `${optionWhere}.key "${rawOption.key}" (id "${id}") is duplicated; option keys must be unique within a decision.`,
        `${optionWhere}.key`,
      );
    }
    seenKeys.add(rawOption.key);

    if (!isNonEmptyString(rawOption.label)) {
      throw new SpecError(
        `${optionWhere}.label (id "${id}") must be a non-empty string.`,
        `${optionWhere}.label`,
      );
    }

    // THE hard rule: an option without a written justification is invalid.
    if (!isNonEmptyString(rawOption.justification)) {
      throw new SpecError(
        `${optionWhere}.justification (id "${id}") must be a non-empty string - every option must carry its written value/cost rationale.`,
        `${optionWhere}.justification`,
      );
    }

    if (rawOption.recommended !== undefined && typeof rawOption.recommended !== 'boolean') {
      throw new SpecError(
        `${optionWhere}.recommended (id "${id}") must be a boolean when present.`,
        `${optionWhere}.recommended`,
      );
    }
    const recommended = rawOption.recommended === true;
    if (recommended) {
      recommendedCount += 1;
      if (recommendedCount > 1) {
        throw new SpecError(
          `${optionWhere}.recommended (id "${id}"): at most ONE option per decision may be recommended.`,
          `${optionWhere}.recommended`,
        );
      }
    }

    const option: DecisionOption = {
      key: rawOption.key,
      label: rawOption.label,
      justification: rawOption.justification,
    };
    if (recommended) {
      option.recommended = true;
    }
    return option;
  });

  if (raw.allowCustom !== undefined && typeof raw.allowCustom !== 'boolean') {
    throw new SpecError(
      `${where}.allowCustom (id "${id}") must be a boolean when present.`,
      `${where}.allowCustom`,
    );
  }

  return {
    ...base,
    type: 'decision',
    problem: raw.problem,
    context,
    options,
    allowCustom: raw.allowCustom !== false,
  };
}

function normalizeQuestion(
  raw: Record<string, unknown>,
  base: NormalizedItemBaseFields,
  where: string,
): NormalizedQuestionItem {
  const id = base.id;

  if (typeof raw.content !== 'string') {
    throw new SpecError(
      `${where}.content (id "${id}") must be a string.`,
      `${where}.content`,
    );
  }

  if (raw.controls === undefined) {
    throw new SpecError(
      `${where}.controls (id "${id}") is required on a question item (use type "report" for content without controls).`,
      `${where}.controls`,
    );
  }

  return {
    ...base,
    type: 'question',
    content: raw.content,
    controls: normalizeControls(raw.controls, `${where}.controls`, id),
    text: normalizeText(raw.text, `${where}.text`, id),
  };
}

function normalizeReport(
  raw: Record<string, unknown>,
  base: NormalizedItemBaseFields,
  where: string,
): NormalizedReportItem {
  const id = base.id;

  if (!isNonEmptyString(raw.content)) {
    throw new SpecError(
      `${where}.content (id "${id}") must be a non-empty string on a report item.`,
      `${where}.content`,
    );
  }

  return {
    ...base,
    type: 'report',
    content: raw.content,
    text: normalizeText(raw.text, `${where}.text`, id),
  };
}

function normalizeTableItem(
  raw: Record<string, unknown>,
  base: NormalizedItemBaseFields,
  where: string,
): NormalizedTableItem {
  const id = base.id;

  if (raw.content !== undefined && typeof raw.content !== 'string') {
    throw new SpecError(
      `${where}.content (id "${id}") must be a string when present.`,
      `${where}.content`,
    );
  }

  if (!isPlainObject(raw.table)) {
    throw new SpecError(
      `${where}.table (id "${id}") must be a plain object.`,
      `${where}.table`,
    );
  }

  const tableWhere = `${where}.table`;
  const columns = normalizeColumns(raw.table.columns, tableWhere, id);
  const rows = normalizeRows(raw.table.rows, columns.length, tableWhere, id);

  const table: NormalizedItemTable = {
    columns,
    rows,
    rowText: normalizeText(raw.table.rowText, `${tableWhere}.rowText`, id),
  };

  if (raw.table.rowControls !== undefined) {
    table.rowControls = normalizeControls(
      raw.table.rowControls,
      `${tableWhere}.rowControls`,
      id,
    );
  }

  return {
    ...base,
    type: 'table',
    content: typeof raw.content === 'string' ? raw.content : '',
    table,
  };
}

function normalizeColumns(
  rawColumns: unknown,
  tableWhere: string,
  id: string,
): string[] {
  const where = `${tableWhere}.columns`;

  if (!Array.isArray(rawColumns) || rawColumns.length === 0) {
    throw new SpecError(
      `${where} (item "${id}") must be a non-empty array.`,
      where,
    );
  }

  return rawColumns.map((column, columnIndex) => {
    if (!isNonEmptyString(column)) {
      throw new SpecError(
        `${where}[${columnIndex}] (item "${id}") must be a non-empty string.`,
        `${where}[${columnIndex}]`,
      );
    }
    return column;
  });
}

function normalizeRows(
  rawRows: unknown,
  columnCount: number,
  tableWhere: string,
  id: string,
): TableRow[] {
  const where = `${tableWhere}.rows`;

  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throw new SpecError(
      `${where} (item "${id}") must be a non-empty array.`,
      where,
    );
  }

  const seenRowIds = new Set<string>();
  return rawRows.map((rawRow, rowIndex) => {
    const rowWhere = `${where}[${rowIndex}]`;

    if (!isPlainObject(rawRow)) {
      throw new SpecError(
        `${rowWhere} (item "${id}") must be an object.`,
        rowWhere,
      );
    }

    if (!isNonEmptyString(rawRow.id)) {
      throw new SpecError(
        `${rowWhere}.id (item "${id}") must be a non-empty string.`,
        `${rowWhere}.id`,
      );
    }

    if (seenRowIds.has(rawRow.id)) {
      throw new SpecError(
        `${rowWhere}.id "${rawRow.id}" (item "${id}") is duplicated; row ids must be unique within the item.`,
        `${rowWhere}.id`,
      );
    }
    seenRowIds.add(rawRow.id);

    if (!Array.isArray(rawRow.cells)) {
      throw new SpecError(
        `${rowWhere}.cells (item "${id}") must be an array.`,
        `${rowWhere}.cells`,
      );
    }

    if (rawRow.cells.length !== columnCount) {
      throw new SpecError(
        `${rowWhere}.cells (item "${id}") must have ${columnCount} cells to match columns.length.`,
        `${rowWhere}.cells`,
      );
    }

    const cells = rawRow.cells.map((cell, cellIndex) => {
      if (typeof cell !== 'string') {
        throw new SpecError(
          `${rowWhere}.cells[${cellIndex}] (item "${id}") must be a string.`,
          `${rowWhere}.cells[${cellIndex}]`,
        );
      }
      return cell;
    });

    return { id: rawRow.id, cells };
  });
}

function normalizeControls(
  rawControls: unknown,
  where: string,
  id: string,
): NormalizedControls {
  if (!isPlainObject(rawControls)) {
    throw new SpecError(
      `${where} (item "${id}") must be a plain object when present.`,
      where,
    );
  }

  const { type } = rawControls;
  if (typeof type !== 'string' || !CONTROL_TYPES.includes(type as ControlType)) {
    throw new SpecError(
      `${where}.type (item "${id}") must be one of: single, multi, toggle.`,
      `${where}.type`,
    );
  }

  const controlType = type as ControlType;

  if (rawControls.required !== undefined && typeof rawControls.required !== 'boolean') {
    throw new SpecError(
      `${where}.required (item "${id}") must be a boolean when present.`,
      `${where}.required`,
    );
  }
  const required = rawControls.required === true;

  if (controlType === 'toggle') {
    if (rawControls.options !== undefined) {
      throw new SpecError(
        `${where}.options (item "${id}") must be absent for type "toggle".`,
        `${where}.options`,
      );
    }
    return { type: controlType, required };
  }

  // single | multi -> require a non-empty options[] with unique non-empty values.
  const options = normalizeOptions(rawControls.options, `${where}.options`, id);
  return { type: controlType, options, required };
}

function normalizeOptions(
  rawOptions: unknown,
  where: string,
  id: string,
): ControlOption[] {
  if (!Array.isArray(rawOptions) || rawOptions.length === 0) {
    throw new SpecError(
      `${where} (item "${id}") must be a non-empty array for single/multi controls.`,
      where,
    );
  }

  const seenValues = new Set<string>();
  const options: ControlOption[] = rawOptions.map((rawOption, optionIndex) => {
    const optionWhere = `${where}[${optionIndex}]`;

    if (!isPlainObject(rawOption)) {
      throw new SpecError(
        `${optionWhere} (item "${id}") must be an object.`,
        optionWhere,
      );
    }

    if (!isNonEmptyString(rawOption.value)) {
      throw new SpecError(
        `${optionWhere}.value (item "${id}") must be a non-empty string.`,
        `${optionWhere}.value`,
      );
    }

    if (!isNonEmptyString(rawOption.label)) {
      throw new SpecError(
        `${optionWhere}.label (item "${id}") must be a non-empty string.`,
        `${optionWhere}.label`,
      );
    }

    if (seenValues.has(rawOption.value)) {
      throw new SpecError(
        `${optionWhere}.value "${rawOption.value}" (item "${id}") is duplicated; option values must be unique within an item.`,
        `${optionWhere}.value`,
      );
    }
    seenValues.add(rawOption.value);

    return { value: rawOption.value, label: rawOption.label };
  });

  return options;
}

function normalizeText(
  rawText: unknown,
  where: string,
  id: string,
): NormalizedTextField {
  if (rawText === undefined) {
    return { required: false };
  }

  if (!isPlainObject(rawText)) {
    throw new SpecError(
      `${where} (item "${id}") must be a plain object when present.`,
      where,
    );
  }

  if (rawText.required !== undefined && typeof rawText.required !== 'boolean') {
    throw new SpecError(
      `${where}.required (item "${id}") must be a boolean when present.`,
      `${where}.required`,
    );
  }

  if (rawText.placeholder !== undefined && typeof rawText.placeholder !== 'string') {
    throw new SpecError(
      `${where}.placeholder (item "${id}") must be a string when present.`,
      `${where}.placeholder`,
    );
  }

  const text: NormalizedTextField = { required: rawText.required === true };
  if (typeof rawText.placeholder === 'string') {
    text.placeholder = rawText.placeholder;
  }

  return text;
}
