/**
 * MKD (`mkd`) — client interactivity.
 *
 * Vanilla browser JavaScript, no build step, no framework, no imports. Inlined
 * by render.ts after the `window.__MKD__` spec script. render.ts server-renders
 * the static deck shell (header + one hidden card per item + footer bar); this
 * file builds the interactive parts (deck navigation, decision options,
 * controls, textareas, quote chips, row popovers, JSON panel, submit) at
 * runtime and produces a `Result` that matches cli/schema.ts.
 *
 * Modes (window.__MKD_MODE__):
 * - 'copy': static file:// page. The user copies the result JSON from the
 *   footer and pastes it into the chat. Image paste is disabled (there is no
 *   server to persist the bytes, and base64 in the pasted JSON would flood the
 *   conversation).
 * - 'wait': served over loopback HTTP. A submit button POSTs the result to
 *   /submit with the per-run token; images are allowed (persisted server-side).
 *
 * Answers persist to localStorage (keyed by spec.session) so closing and
 * reopening the page never loses work. Images are NOT persisted (quota).
 *
 * Kept dependency-free so the CLI stays extractable to a standalone package.
 */

(function mkdApp() {
  'use strict';

  // --------------------------------------------------------------------------
  // Spec + mode
  // --------------------------------------------------------------------------

  /** @type {{ session: string, source?: string, title: string, submitLabel: string, items: any[] }} */
  const spec = (window.__MKD__ && typeof window.__MKD__ === 'object')
    ? window.__MKD__
    : { session: '', title: '', submitLabel: 'Send to Claude', items: [] };

  const items = Array.isArray(spec.items) ? spec.items : [];
  const mode = window.__MKD_MODE__ === 'wait' ? 'wait' : 'copy';
  const submitToken = typeof window.__MKD_TOKEN__ === 'string' ? window.__MKD_TOKEN__ : '';

  const EXPAND_OPEN_CLASS = 'is-open';
  const CUSTOM_KEY = 'CUSTOM';

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------

  /**
   * Deck position: -1 = intro, 0..items.length-1 = item cards,
   * items.length = summary.
   */
  let idx = -1;

  /**
   * Per-item UI state, keyed by item id. Shapes by type:
   * - decision: { skipped, chosen, customText, note }
   * - question: { skipped, controlAnswer, text, quotes, images }
   * - report:   { skipped, controlAnswer: null, text, quotes, images }
   * - table:    { skipped, quotes, images, note, rows: { rowId: { controlAnswer, text, quotes, images } } }
   * @type {Record<string, any>}
   */
  const state = Object.create(null);

  for (const item of items) {
    if (!item || typeof item.id !== 'string') {
      continue;
    }
    state[item.id] = initialEntry(item);
  }

  function initialEntry(item) {
    if (item.type === 'decision') {
      return { skipped: false, chosen: null, customText: '', note: '' };
    }
    if (item.type === 'table') {
      const rows = Object.create(null);
      for (const row of item.table.rows) {
        if (!row || typeof row.id !== 'string') {
          continue;
        }
        rows[row.id] = {
          controlAnswer: initialControlAnswer(item.table.rowControls),
          text: '',
          quotes: [],
          images: [],
        };
      }
      return { skipped: false, quotes: [], images: [], note: '', rows };
    }
    // question | report
    return {
      skipped: false,
      controlAnswer: item.type === 'question' ? initialControlAnswer(item.controls) : null,
      text: '',
      quotes: [],
      images: [],
    };
  }

  /** Initial `controlAnswer` for a `controls`-shaped config (or `null`). */
  function initialControlAnswer(controls) {
    if (!controls) {
      return null;
    }
    switch (controls.type) {
      case 'single':
        return null;
      case 'multi':
        return [];
      case 'toggle':
        return false;
      default:
        return null;
    }
  }

  // --------------------------------------------------------------------------
  // Persistence (localStorage, guarded — file:// and private mode may block it)
  // --------------------------------------------------------------------------

  const STATE_KEY = `mkd-state-${spec.session || 'deck'}`;

  function saveState() {
    const snapshot = { idx, items: {} };
    for (const item of items) {
      const entry = state[item.id];
      if (!entry) {
        continue;
      }
      if (item.type === 'decision') {
        snapshot.items[item.id] = {
          skipped: entry.skipped,
          chosen: entry.chosen,
          customText: entry.customText,
          note: entry.note,
        };
      }
      else if (item.type === 'table') {
        const rows = {};
        for (const rowId of Object.keys(entry.rows)) {
          const row = entry.rows[rowId];
          rows[rowId] = { controlAnswer: row.controlAnswer, text: row.text, quotes: row.quotes };
        }
        snapshot.items[item.id] = {
          skipped: entry.skipped,
          quotes: entry.quotes,
          note: entry.note,
          rows,
        };
      }
      else {
        snapshot.items[item.id] = {
          skipped: entry.skipped,
          controlAnswer: entry.controlAnswer,
          text: entry.text,
          quotes: entry.quotes,
        };
      }
    }
    try {
      window.localStorage.setItem(STATE_KEY, JSON.stringify(snapshot));
    }
    catch {
      // Storage blocked — the in-memory state still carries the session.
    }
  }

  /** Merge a persisted snapshot back into the fresh `state` (defensively). */
  function loadState() {
    let snapshot = null;
    try {
      snapshot = JSON.parse(window.localStorage.getItem(STATE_KEY));
    }
    catch {
      return;
    }
    if (!snapshot || typeof snapshot !== 'object') {
      return;
    }
    if (typeof snapshot.idx === 'number' && Number.isFinite(snapshot.idx)) {
      idx = Math.max(-1, Math.min(Math.round(snapshot.idx), items.length));
    }
    const saved = snapshot.items && typeof snapshot.items === 'object' ? snapshot.items : {};
    for (const item of items) {
      const entry = state[item.id];
      const savedEntry = saved[item.id];
      if (!entry || !savedEntry || typeof savedEntry !== 'object') {
        continue;
      }
      entry.skipped = savedEntry.skipped === true;
      if (item.type === 'decision') {
        if (savedEntry.chosen === CUSTOM_KEY || optionByKey(item, savedEntry.chosen)) {
          entry.chosen = savedEntry.chosen;
        }
        entry.customText = typeof savedEntry.customText === 'string' ? savedEntry.customText : '';
        entry.note = typeof savedEntry.note === 'string' ? savedEntry.note : '';
      }
      else if (item.type === 'table') {
        entry.quotes = stringArray(savedEntry.quotes);
        entry.note = typeof savedEntry.note === 'string' ? savedEntry.note : '';
        const savedRows = savedEntry.rows && typeof savedEntry.rows === 'object' ? savedEntry.rows : {};
        for (const rowId of Object.keys(entry.rows)) {
          const savedRow = savedRows[rowId];
          if (!savedRow || typeof savedRow !== 'object') {
            continue;
          }
          entry.rows[rowId].controlAnswer = sanitizeControlAnswer(
            savedRow.controlAnswer,
            item.table.rowControls,
          );
          entry.rows[rowId].text = typeof savedRow.text === 'string' ? savedRow.text : '';
          entry.rows[rowId].quotes = stringArray(savedRow.quotes);
        }
      }
      else {
        entry.controlAnswer = sanitizeControlAnswer(
          savedEntry.controlAnswer,
          item.type === 'question' ? item.controls : null,
        );
        entry.text = typeof savedEntry.text === 'string' ? savedEntry.text : '';
        entry.quotes = stringArray(savedEntry.quotes);
      }
    }
  }

  function stringArray(value) {
    return Array.isArray(value) ? value.filter(v => typeof v === 'string') : [];
  }

  /** Coerce a persisted controlAnswer back to the shape its controls demand. */
  function sanitizeControlAnswer(value, controls) {
    if (!controls) {
      return null;
    }
    switch (controls.type) {
      case 'single':
        return typeof value === 'string' && value.length > 0 ? value : null;
      case 'multi':
        return Array.isArray(value) ? value.filter(v => typeof v === 'string') : [];
      case 'toggle':
        return value === true;
      default:
        return null;
    }
  }

  function optionByKey(item, key) {
    if (typeof key !== 'string' || !Array.isArray(item.options)) {
      return null;
    }
    for (const option of item.options) {
      if (option && option.key === key) {
        return option;
      }
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // Small DOM helpers
  // --------------------------------------------------------------------------

  function el(tag, className, attrs) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (attrs) {
      for (const key of Object.keys(attrs)) {
        const value = attrs[key];
        if (value !== null && value !== undefined) {
          node.setAttribute(key, String(value));
        }
      }
    }
    return node;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function itemSection(id) {
    return document.querySelector(
      `section.mkd-card[data-item-id="${cssAttrEscape(id)}"]`,
    );
  }

  /** Escape a string for safe use inside an `[attr="..."]` selector. */
  function cssAttrEscape(value) {
    return String(value).replace(/["\\]/g, '\\$&');
  }

  // --------------------------------------------------------------------------
  // Cached top-level elements
  // --------------------------------------------------------------------------

  const rail = byId('mkd-rail');
  const introCard = byId('mkd-intro');
  const summaryCard = byId('mkd-summary');
  const statAnswered = byId('mkd-s-answered');
  const statRec = byId('mkd-s-rec');
  const statOver = byId('mkd-s-over');
  const statCustom = byId('mkd-s-custom');
  const statSkipped = byId('mkd-s-skipped');
  const jsonToggle = byId('mkd-json-toggle');
  const jsonPanel = byId('mkd-json-panel');
  const jsonOut = byId('mkd-json-out');
  const copyBtn = byId('mkd-copy');
  const submitBtn = byId('mkd-submit');
  const submitError = byId('mkd-submit-error');
  const quoteBtn = byId('mkd-quote-btn');
  const expand = byId('mkd-expand');
  const expandBackdrop = byId('mkd-expand-backdrop');
  const expandClose = byId('mkd-expand-close');
  const expandTitle = byId('mkd-expand-title');
  const expandRefContent = byId('mkd-expand-ref-content');
  const expandQuotes = byId('mkd-expand-quotes');
  const expandInput = byId('mkd-expand-input');
  const doneEl = byId('mkd-done');
  const themeToggle = byId('mkd-theme-toggle');
  const rowpopLayer = byId('mkd-rowpop-layer');
  const rowpopBackdrop = byId('mkd-rowpop-backdrop');
  const kbd = byId('mkd-kbd');
  const kbdToggle = byId('mkd-kbd-toggle');
  const kbdClose = byId('mkd-kbd-close');
  const kbdBackdrop = byId('mkd-kbd-backdrop');
  const kbdList = byId('mkd-kbd-list');

  /**
   * Inline textareas per state key (item id, or `item::row`) so the expand
   * panel can mirror values two-way.
   * @type {Record<string, HTMLTextAreaElement>}
   */
  const inlineTextareas = Object.create(null);

  /** The state key the floating expand panel is editing, or null when closed. */
  let currentExpandKey = null;

  /**
   * Row answer buttons keyed by `item::row` (so refresh can relabel them) and
   * the per-row popovers keyed the same way.
   */
  const answerButtons = Object.create(null);
  const rowPops = Object.create(null);
  let currentRowPopKey = null;

  // --------------------------------------------------------------------------
  // THEME — system preference by default, explicit toggle choice persists
  // --------------------------------------------------------------------------

  const THEME_STORAGE_KEY = 'mkd-theme';
  let themeMemory = null;

  function readStoredTheme() {
    try {
      const value = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (value === 'light' || value === 'dark') {
        return value;
      }
    }
    catch {
      // localStorage blocked — fall back to the in-memory value.
    }
    return themeMemory;
  }

  function writeStoredTheme(theme) {
    themeMemory = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
    catch {
      // localStorage blocked — the in-memory value still carries the session.
    }
  }

  function systemPrefersDark() {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    catch {
      return false;
    }
  }

  /** The theme currently in effect: explicit choice, else the system's. */
  function effectiveTheme() {
    const stored = readStoredTheme();
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    return systemPrefersDark() ? 'dark' : 'light';
  }

  /**
   * Apply an EXPLICIT theme choice via `data-theme` on <html>. With no stored
   * choice the attribute is absent and the CSS `prefers-color-scheme` block
   * decides — so this is only called with a concrete stored/toggled value.
   */
  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') {
      root.dataset.theme = theme;
    }
    else {
      delete root.dataset.theme;
    }
    syncThemeToggle();
  }

  function syncThemeToggle() {
    if (!themeToggle) {
      return;
    }
    const isLight = effectiveTheme() === 'light';
    // Show the glyph for the theme you'd switch TO.
    themeToggle.textContent = isLight ? '\u263E' : '\u2600';
    themeToggle.setAttribute('aria-pressed', isLight ? 'false' : 'true');
  }

  function toggleTheme() {
    const next = effectiveTheme() === 'light' ? 'dark' : 'light';
    applyTheme(next);
    writeStoredTheme(next);
  }

  // --------------------------------------------------------------------------
  // DECK NAVIGATION
  // --------------------------------------------------------------------------

  function go(target) {
    const clamped = Math.max(-1, Math.min(target, items.length));
    idx = clamped;
    closeRowPop();
    hideQuoteButton();
    render();
    saveState();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function render() {
    // Show exactly one card.
    if (introCard) {
      setCardVisible(introCard, idx === -1);
    }
    for (const item of items) {
      const section = itemSection(item.id);
      if (section) {
        const index = Number(section.getAttribute('data-item-index'));
        setCardVisible(section, index === idx);
      }
    }
    if (summaryCard) {
      const showSummary = idx === items.length;
      if (showSummary) {
        renderSummary();
      }
      setCardVisible(summaryCard, showSummary);
    }
    renderRail();
    refreshAll();
  }

  function setCardVisible(card, visible) {
    if (visible) {
      card.hidden = false;
      card.classList.add('is-current');
    }
    else {
      card.hidden = true;
      card.classList.remove('is-current');
    }
  }

  function renderRail() {
    if (!rail) {
      return;
    }
    rail.textContent = '';

    const home = el('button', `mkd-dot${idx === -1 ? ' is-current' : ''}`, {
      type: 'button',
      title: 'Intro',
    });
    home.textContent = 'i';
    home.addEventListener('click', () => go(-1));
    rail.appendChild(home);

    items.forEach((item, index) => {
      const status = itemStatus(item);
      const dot = el(
        'button',
        `mkd-dot${index === idx ? ' is-current' : ''}${status === 'answered' ? ' is-answered' : status === 'skipped' ? ' is-skipped' : ''}`,
        { type: 'button', title: item.title },
      );
      dot.textContent = String(index + 1);
      dot.addEventListener('click', () => go(index));
      rail.appendChild(dot);
    });

    const end = el('button', `mkd-dot${idx === items.length ? ' is-current' : ''}`, {
      type: 'button',
      title: 'Summary',
    });
    end.textContent = '\u2713';
    end.addEventListener('click', () => go(items.length));
    rail.appendChild(end);
  }

  /** Per-card navigation row: Prev / (Skip) / Next. */
  function buildNav(item, index) {
    const section = itemSection(item.id);
    const nav = section ? section.querySelector('.mkd-card__nav') : null;
    if (!nav) {
      return;
    }
    nav.textContent = '';

    const prev = el('button', 'mkd-btn mkd-btn--ghost', { type: 'button' });
    prev.textContent = '\u2190 Previous';
    prev.addEventListener('click', () => go(index - 1));
    nav.appendChild(prev);

    nav.appendChild(el('span', 'mkd-card__nav-spacer'));

    const skip = el('button', 'mkd-btn', { type: 'button', title: 'Skip for now = decide later, not a rejection' });
    skip.textContent = 'Skip for now';
    skip.addEventListener('click', () => {
      const entry = state[item.id];
      entry.skipped = true;
      if (item.type === 'decision') {
        entry.chosen = null;
      }
      go(index + 1);
    });
    nav.appendChild(skip);

    const next = el('button', 'mkd-btn mkd-btn--primary', {
      'type': 'button',
      'data-nav-next': item.id,
    });
    next.textContent = index === items.length - 1 ? 'Finish \u2192' : 'Next \u2192';
    next.addEventListener('click', () => go(index + 1));
    nav.appendChild(next);
  }

  /** A decision's Next stays disabled until an option (or skip) is picked. */
  function refreshNavButtons() {
    for (const item of items) {
      if (item.type !== 'decision') {
        continue;
      }
      const btn = document.querySelector(
        `[data-nav-next="${cssAttrEscape(item.id)}"]`,
      );
      if (btn) {
        btn.disabled = state[item.id].chosen === null && !state[item.id].skipped;
      }
    }
  }

  function buildIntroNav() {
    const nav = introCard ? introCard.querySelector('[data-intro-nav]') : null;
    if (!nav) {
      return;
    }
    nav.classList.add('mkd-card__nav');
    nav.appendChild(el('span', 'mkd-card__nav-spacer'));
    const start = el('button', 'mkd-btn mkd-btn--primary', { type: 'button' });
    start.textContent = 'Start \u2192';
    start.addEventListener('click', () => go(0));
    nav.appendChild(start);

    // In --wait mode the intro's closing line should point at the submit
    // button rather than copy-paste.
    if (mode === 'wait') {
      const finishLine = byId('mkd-legend-finish');
      if (finishLine) {
        finishLine.textContent = `When you are done, press "${spec.submitLabel}" in the footer to send your answers back.`;
      }
    }
  }

  // --------------------------------------------------------------------------
  // SUMMARY CARD
  // --------------------------------------------------------------------------

  function renderSummary() {
    if (!summaryCard) {
      return;
    }
    const stats = computeStats();
    summaryCard.textContent = '';

    const eyebrow = el('div', 'mkd-card__eyebrow');
    eyebrow.textContent = 'Summary';
    summaryCard.appendChild(eyebrow);

    const title = el('h2', 'mkd-card__title');
    title.textContent = `${stats.answered} of ${items.length} answered`;
    summaryCard.appendChild(title);

    const tiles = el('div', 'mkd-tiles');
    const tileData = [
      { n: stats.recFollowed, label: 'recommendations followed' },
      { n: stats.overridden, label: 'recommendations changed' },
      { n: stats.custom, label: 'custom decisions' },
      { n: stats.skipped, label: 'skipped' },
    ];
    for (const tile of tileData) {
      const box = el('div', 'mkd-tile');
      const n = el('div', 'mkd-tile__n');
      n.textContent = String(tile.n);
      const label = el('div', 'mkd-tile__label');
      label.textContent = tile.label;
      box.appendChild(n);
      box.appendChild(label);
      tiles.appendChild(box);
    }
    summaryCard.appendChild(tiles);

    const rows = el('div', 'mkd-summary-rows');
    items.forEach((item, index) => {
      const row = el('div', 'mkd-summary-row');
      const id = el('b', 'mkd-summary-row__id');
      id.textContent = item.id;
      const rowTitle = el('span', 'mkd-summary-row__title');
      rowTitle.textContent = item.title;
      row.appendChild(id);
      row.appendChild(rowTitle);
      row.appendChild(summaryChip(item));
      row.addEventListener('click', () => go(index));
      rows.appendChild(row);
    });
    summaryCard.appendChild(rows);

    const legend = el('p', 'mkd-legend');
    legend.textContent = mode === 'wait'
      ? `Last step: press "${spec.submitLabel}" in the footer. Skipped items stay as "skipped" — decide later, not a rejection.`
      : 'Last step: press "Copy JSON" in the footer and paste it into the chat. Skipped items stay as "skipped" — decide later, not a rejection.';
    summaryCard.appendChild(legend);

    const nav = el('div', 'mkd-card__nav');
    const back = el('button', 'mkd-btn mkd-btn--ghost', { type: 'button' });
    back.textContent = '\u2190 Back';
    back.addEventListener('click', () => go(items.length - 1));
    nav.appendChild(back);
    nav.appendChild(el('span', 'mkd-card__nav-spacer'));
    const cta = el('button', 'mkd-btn mkd-btn--primary', { type: 'button' });
    if (mode === 'wait') {
      cta.textContent = spec.submitLabel;
      cta.addEventListener('click', () => {
        if (submitBtn) {
          submitBtn.click();
        }
      });
    }
    else {
      cta.textContent = 'Copy JSON';
      cta.addEventListener('click', () => {
        if (copyBtn) {
          copyBtn.click();
        }
      });
    }
    nav.appendChild(cta);
    summaryCard.appendChild(nav);
  }

  /** The summary chip describing an item's outcome. */
  function summaryChip(item) {
    const entry = state[item.id];
    const status = itemStatus(item);
    const chip = el('span', 'mkd-chip');

    if (status === 'skipped') {
      chip.classList.add('mkd-chip--muted');
      chip.textContent = '\u2014 skipped';
      return chip;
    }
    if (status === 'pending') {
      chip.classList.add('mkd-chip--muted');
      chip.textContent = 'pending';
      return chip;
    }
    if (item.type === 'decision') {
      if (entry.chosen === CUSTOM_KEY) {
        chip.classList.add('mkd-chip--custom');
        chip.textContent = '\u270E custom';
        return chip;
      }
      const option = optionByKey(item, entry.chosen);
      chip.classList.add('mkd-chip--pick');
      chip.textContent = option ? `${option.label}${option.recommended ? ' \u2605' : ''}` : String(entry.chosen);
      return chip;
    }
    chip.classList.add('mkd-chip--pick');
    chip.textContent = 'answered';
    return chip;
  }

  // --------------------------------------------------------------------------
  // BUILD: per-type interactive parts
  // --------------------------------------------------------------------------

  function buildItem(item, index) {
    const section = itemSection(item.id);
    if (!section) {
      return;
    }
    const host = section.querySelector('.mkd-card__interactive');
    if (!host) {
      return;
    }

    if (item.type === 'decision') {
      buildDecision(item, host);
    }
    else if (item.type === 'table') {
      buildTable(item, section, host);
    }
    else {
      buildAnswerable(item, host);
    }
    buildNav(item, index);
  }

  // ---- decision ----

  /**
   * The option buttons (incl. the custom one + its textarea) are SERVER-
   * rendered so justifications carry markdown; here we only wire handlers,
   * hydrate persisted values, and add the images/note fields.
   */
  function buildDecision(item, host) {
    const entry = state[item.id];
    const section = itemSection(item.id);
    if (!section) {
      return;
    }

    const buttons = section.querySelectorAll('.mkd-opt[data-opt-key]');
    for (const btn of buttons) {
      const key = btn.getAttribute('data-opt-key');
      btn.addEventListener('click', () => selectOption(item, key));
    }

    const customInput = section.querySelector(
      `.mkd-custom-input[data-custom-for="${cssAttrEscape(item.id)}"]`,
    );
    if (customInput) {
      customInput.value = entry.customText;
      customInput.addEventListener('input', () => {
        entry.customText = customInput.value;
        refreshAll();
        saveState();
      });
    }

    if (mode === 'wait') {
      host.appendChild(buildImagesArea({ key: item.id }));
    }
    host.appendChild(buildNoteField(item));
    syncDecisionUI(item);
  }

  /** Toggle-select an option (clicking the selected one deselects it). */
  function selectOption(item, key) {
    const entry = state[item.id];
    entry.chosen = entry.chosen === key ? null : key;
    if (entry.chosen !== null) {
      entry.skipped = false;
    }
    syncDecisionUI(item);
    refreshAll();
    saveState();
  }

  /** Reflect a decision's chosen state onto its option buttons + custom box. */
  function syncDecisionUI(item) {
    const entry = state[item.id];
    const section = itemSection(item.id);
    if (!section) {
      return;
    }
    const buttons = section.querySelectorAll('.mkd-opt[data-opt-key]');
    for (const btn of buttons) {
      btn.classList.toggle('is-selected', btn.getAttribute('data-opt-key') === entry.chosen);
    }
    const customInput = section.querySelector(
      `.mkd-custom-input[data-custom-for="${cssAttrEscape(item.id)}"]`,
    );
    if (customInput) {
      customInput.classList.toggle('is-visible', entry.chosen === CUSTOM_KEY);
    }
  }

  /** "Note for Claude (optional)" textarea (decision + table items). */
  function buildNoteField(item) {
    const entry = state[item.id];
    const wrap = el('label', 'mkd-note');
    const label = el('span', 'mkd-note__label');
    label.textContent = 'Note for Claude (optional)';
    const input = el('textarea', 'mkd-text__input mkd-text__input--compact', {
      placeholder: 'Nuances, conditions, extra context about your choice\u2026',
      rows: '3',
    });
    input.value = entry.note;
    input.addEventListener('input', () => {
      entry.note = input.value;
      refreshAll();
      saveState();
    });
    wrap.appendChild(label);
    wrap.appendChild(input);
    return wrap;
  }

  // ---- question / report ----

  function buildAnswerable(item, host) {
    const target = itemTarget(item);
    if (item.type === 'question' && item.controls) {
      host.appendChild(buildControls(item.controls, target));
    }
    host.appendChild(buildQuotesArea(target));
    host.appendChild(buildTextarea(item.text, target, () => openExpand(item.id)));
    if (mode === 'wait') {
      host.appendChild(buildImagesArea(target));
    }
    hydrateQuotes(target.key, state[item.id].quotes);
  }

  // ---- table ----

  /**
   * Each row's `.mkd-table__answer` cell gets a single compact button; that
   * row's controls / quote chips / textarea / images live in a popover shown
   * anchored to the button. Also wires the wide-table scroll affordance and
   * the item-level note field.
   */
  function buildTable(item, section, host) {
    const table = item.table;
    for (const row of table.rows) {
      if (!row || typeof row.id !== 'string') {
        continue;
      }
      const cell = section.querySelector(
        `td.mkd-table__answer[data-row-id="${cssAttrEscape(row.id)}"]`,
      );
      if (!cell || !state[item.id] || !state[item.id].rows[row.id]) {
        continue;
      }
      const key = `${item.id}::${row.id}`;
      buildRowPopover(item, row);

      const btn = el('button', 'mkd-table__answer-btn', {
        'type': 'button',
        'data-row-pop-btn': key,
        'aria-haspopup': 'dialog',
      });
      const txt = el('span', 'mkd-table__answer-btn__text');
      txt.textContent = 'Answer';
      const caret = el('span', 'mkd-table__answer-btn__caret');
      caret.textContent = '\u25BE';
      btn.appendChild(txt);
      btn.appendChild(caret);
      btn.addEventListener('click', () => {
        if (currentRowPopKey === key) {
          closeRowPop();
        }
        else {
          openRowPop(key, btn);
        }
      });
      cell.appendChild(btn);

      answerButtons[key] = { btn, textEl: txt, item, rowId: row.id };
      updateAnswerButton(key);
    }
    setupTableScroll(section);
    host.appendChild(buildQuotesArea(itemTarget(item)));
    host.appendChild(buildNoteField(item));
    hydrateQuotes(item.id, state[item.id].quotes);
  }

  /**
   * Build one row's answer popover (head + collapsible row reference +
   * controls + quote chips + textarea with an Expand escape hatch + images +
   * footer) into the popover layer.
   */
  function buildRowPopover(item, row) {
    if (!rowpopLayer) {
      return;
    }
    const key = `${item.id}::${row.id}`;
    const target = rowTarget(item, row.id);

    const pop = el('div', 'mkd-rowpop', {
      'data-row-pop': key,
      'role': 'dialog',
      'aria-modal': 'false',
      'aria-label': `Answer for ${rowTitle(item, row)}`,
    });

    const head = el('div', 'mkd-rowpop__head');
    const title = el('span', 'mkd-rowpop__title');
    title.textContent = rowTitle(item, row);
    const close = el('button', 'mkd-rowpop__close', { 'type': 'button', 'aria-label': 'Close' });
    close.textContent = 'close';
    close.addEventListener('click', () => closeRowPop());
    head.appendChild(title);
    head.appendChild(close);
    pop.appendChild(head);

    const ref = el('details', 'mkd-rowpop__ref');
    const summary = el('summary', 'mkd-rowpop__ref-summary');
    summary.textContent = 'Reference (this row)';
    ref.appendChild(summary);
    ref.appendChild(buildRowReference(item, row));
    pop.appendChild(ref);

    if (item.table.rowControls) {
      pop.appendChild(buildControls(item.table.rowControls, target));
    }
    pop.appendChild(buildQuotesArea(target));
    pop.appendChild(buildTextarea(item.table.rowText, target, () => {
      closeRowPop();
      openExpand(key);
    }));
    if (mode === 'wait') {
      pop.appendChild(buildImagesArea(target));
    }

    const foot = el('div', 'mkd-rowpop__foot');
    const full = el('button', 'mkd-rowpop__full', { 'type': 'button', 'title': 'Open in the full writing panel' });
    full.textContent = '\u2922 Full';
    full.addEventListener('click', () => {
      closeRowPop();
      openExpand(key);
    });
    const done = el('button', 'mkd-rowpop__done', { type: 'button' });
    done.textContent = 'Done';
    done.addEventListener('click', () => closeRowPop());
    foot.appendChild(full);
    foot.appendChild(done);
    pop.appendChild(foot);

    rowpopLayer.appendChild(pop);
    rowPops[key] = pop;
    hydrateQuotes(key, target.entry().quotes);
  }

  /** A `Column: value` list of every cell in the row. */
  function buildRowReference(item, row) {
    const wrap = el('div', 'mkd-rowpop__ref-content');
    const cols = Array.isArray(item.table.columns) ? item.table.columns : [];
    const cells = Array.isArray(row.cells) ? row.cells : [];
    const n = Math.max(cols.length, cells.length);
    for (let i = 0; i < n; i += 1) {
      const line = el('div', 'mkd-rowpop__ref-row');
      const k = el('span', 'mkd-rowpop__ref-key');
      k.textContent = cols[i] != null ? String(cols[i]) : `Col ${i + 1}`;
      const v = el('span', 'mkd-rowpop__ref-val');
      v.textContent = cells[i] != null ? String(cells[i]) : '';
      line.appendChild(k);
      line.appendChild(v);
      wrap.appendChild(line);
    }
    return wrap;
  }

  /** Short human label for a row — its first cell, falling back to the id. */
  function rowTitle(item, row) {
    const cells = Array.isArray(row.cells) ? row.cells : [];
    return cells.length > 0 && String(cells[0]).length > 0 ? String(cells[0]) : row.id;
  }

  function openRowPop(key, btn) {
    const pop = rowPops[key];
    if (!pop) {
      return;
    }
    if (currentRowPopKey && currentRowPopKey !== key) {
      closeRowPop();
    }
    currentRowPopKey = key;
    if (rowpopBackdrop) {
      rowpopBackdrop.hidden = false;
    }
    pop.classList.add('is-open');
    if (btn) {
      btn.classList.add('is-open');
    }
    positionRowPop(pop, btn);
    const focusable = pop.querySelector('input[type="radio"], input[type="checkbox"], .mkd-switch__input, textarea');
    if (focusable) {
      try {
        focusable.focus({ preventScroll: true });
      }
      catch {
        focusable.focus();
      }
    }
  }

  /** Anchor `pop` to `btn`: right-aligned, flipping up / clamping on screen. */
  function positionRowPop(pop, btn) {
    if (!btn) {
      return;
    }
    const r = btn.getBoundingClientRect();
    const pw = pop.offsetWidth || 360;
    const ph = pop.offsetHeight || 320;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const gap = 8;

    let left = r.right - pw;
    left = Math.max(8, Math.min(left, vw - pw - 8));

    let top = r.bottom + gap;
    if (top + ph > vh - 8) {
      const above = r.top - gap - ph;
      top = above >= 8 ? above : Math.max(8, vh - ph - 8);
    }

    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }

  function closeRowPop() {
    if (!currentRowPopKey) {
      return;
    }
    const pop = rowPops[currentRowPopKey];
    if (pop) {
      pop.classList.remove('is-open');
    }
    const reg = answerButtons[currentRowPopKey];
    if (reg && reg.btn) {
      reg.btn.classList.remove('is-open');
    }
    if (rowpopBackdrop) {
      rowpopBackdrop.hidden = true;
    }
    currentRowPopKey = null;
  }

  /** Relabel a row's answer button from its live state. */
  function updateAnswerButton(key) {
    const reg = answerButtons[key];
    if (!reg) {
      return;
    }
    const entry = state[reg.item.id].rows[reg.rowId];
    if (!entry) {
      return;
    }
    const controls = reg.item.table.rowControls;
    const text = reg.item.table.rowText;
    const summary = controlSummary(entry, controls);
    const hasText = entry.text.trim().length > 0;
    const hasImages = Array.isArray(entry.images) && entry.images.length > 0;
    const answered = summary.length > 0 || hasText || hasImages;

    let label = 'Answer';
    if (answered) {
      if (summary && hasText) {
        label = `${summary} \u00B7 note`;
      }
      else if (summary) {
        label = summary;
      }
      else if (hasText) {
        label = 'Note added';
      }
      else {
        label = 'Image added';
      }
    }
    reg.textEl.textContent = (answered ? '\u2713 ' : '') + label;
    reg.btn.classList.toggle('is-answered', answered);
    reg.btn.classList.toggle('is-required', !entrySatisfied(entry, controls, text));
  }

  /** A compact human summary of a control answer. */
  function controlSummary(entry, controls) {
    if (!controls) {
      return '';
    }
    const answer = entry.controlAnswer;
    if (controls.type === 'single') {
      return typeof answer === 'string' && answer.length > 0 ? optionLabel(controls, answer) : '';
    }
    if (controls.type === 'multi') {
      return Array.isArray(answer) && answer.length > 0 ? `${answer.length} selected` : '';
    }
    if (controls.type === 'toggle') {
      return answer === true ? 'on' : '';
    }
    return '';
  }

  /** Resolve an option `value` back to its display `label`. */
  function optionLabel(controls, value) {
    const options = Array.isArray(controls.options) ? controls.options : [];
    for (const opt of options) {
      if (opt && opt.value === value) {
        return opt.label;
      }
    }
    return value;
  }

  /**
   * Wrap a table's `.mkd-table__scroll` in a positioned viewport and add the
   * edge fades + "scroll for more" hint, toggled via `data-scroll`.
   */
  function setupTableScroll(section) {
    const scroll = section.querySelector('.mkd-table__scroll');
    if (!scroll || !scroll.parentNode || scroll.parentNode.classList.contains('mkd-table__viewport')) {
      return;
    }
    const viewport = el('div', 'mkd-table__viewport');
    scroll.parentNode.insertBefore(viewport, scroll);
    viewport.appendChild(scroll);

    viewport.appendChild(el('div', 'mkd-table__fade mkd-table__fade--left'));
    viewport.appendChild(el('div', 'mkd-table__fade mkd-table__fade--right'));
    const hint = el('div', 'mkd-table__hint', {
      title: 'Shift + scroll, or swipe horizontally, to see more columns',
    });
    hint.textContent = '\u21C4 scroll for more';
    viewport.appendChild(hint);

    const update = () => {
      const maxScroll = scroll.scrollWidth - scroll.clientWidth;
      const states = [];
      if (maxScroll > 1) {
        if (scroll.scrollLeft > 1) {
          states.push('more-left');
        }
        if (scroll.scrollLeft < maxScroll - 1) {
          states.push('more-right');
        }
      }
      viewport.setAttribute('data-scroll', states.join(' '));
    };
    scroll.addEventListener('scroll', throttle(update, 60));
    window.addEventListener('resize', throttle(update, 120));
    update();
  }

  // --------------------------------------------------------------------------
  // Targets: where an interactive part reads/writes its answer
  // --------------------------------------------------------------------------

  function itemTarget(item) {
    return {
      key: item.id,
      itemId: item.id,
      entry: () => state[item.id],
    };
  }

  function rowTarget(item, rowId) {
    return {
      key: `${item.id}::${rowId}`,
      itemId: item.id,
      rowId,
      entry: () => state[item.id].rows[rowId],
    };
  }

  // --------------------------------------------------------------------------
  // Shared builders: controls, textarea, quotes area, images area
  // --------------------------------------------------------------------------

  function buildControls(controls, target) {
    const group = el('div', 'mkd-controls', { 'data-control-type': controls.type });

    if (controls.required) {
      const header = el('div', 'mkd-controls__header');
      const hint = el('span', 'mkd-controls__hint');
      hint.textContent = controls.type === 'multi' ? 'Pick one or more' : 'Pick one';
      header.appendChild(hint);
      header.appendChild(requiredMarker());
      group.appendChild(header);
    }

    if (controls.type === 'toggle') {
      group.appendChild(buildToggle(target));
    }
    else if (controls.type === 'multi') {
      buildOptionInputs(controls, group, 'checkbox', target);
    }
    else {
      buildOptionInputs(controls, group, 'radio', target);
    }

    return group;
  }

  function buildOptionInputs(controls, group, inputType, target) {
    const options = Array.isArray(controls.options) ? controls.options : [];
    const current = target.entry().controlAnswer;
    for (const opt of options) {
      const label = el('label', 'mkd-option');
      const input = el('input', null, {
        type: inputType,
        name: `ctrl-${target.key}`,
        value: opt.value,
      });
      // Hydrate from persisted state.
      if (inputType === 'radio' && current === opt.value) {
        input.checked = true;
      }
      if (inputType === 'checkbox' && Array.isArray(current) && current.includes(opt.value)) {
        input.checked = true;
      }
      const span = el('span');
      span.textContent = opt.label;
      label.appendChild(input);
      label.appendChild(span);

      input.addEventListener('change', () => {
        if (inputType === 'radio') {
          target.entry().controlAnswer = input.value;
        }
        else {
          target.entry().controlAnswer = collectChecked(group);
        }
        markUnskipped(target.itemId);
        refreshAll();
        saveState();
      });

      group.appendChild(label);
    }
  }

  function collectChecked(group) {
    const checked = group.querySelectorAll('input[type="checkbox"]:checked');
    const values = [];
    for (const input of checked) {
      values.push(input.value);
    }
    return values;
  }

  function buildToggle(target) {
    const label = el('label', 'mkd-switch');
    const input = el('input', 'mkd-switch__input', { type: 'checkbox' });
    input.checked = target.entry().controlAnswer === true;
    const track = el('span', 'mkd-switch__track');
    const text = el('span', 'mkd-switch__label');
    text.textContent = 'on / off';

    input.addEventListener('change', () => {
      target.entry().controlAnswer = input.checked;
      markUnskipped(target.itemId);
      refreshAll();
      saveState();
    });

    label.appendChild(input);
    label.appendChild(track);
    label.appendChild(text);
    return label;
  }

  /** Any concrete input on an item clears its skipped flag. */
  function markUnskipped(itemId) {
    const entry = state[itemId];
    if (entry) {
      entry.skipped = false;
    }
  }

  function buildQuotesArea(target) {
    return el('div', 'mkd-quotes', { 'data-answer-key': target.key });
  }

  /** Re-render persisted quotes as removable chips (after areas exist). */
  function hydrateQuotes(key, quotes) {
    const area = document.querySelector(
      `.mkd-quotes[data-answer-key="${cssAttrEscape(key)}"]`,
    );
    if (!area || !Array.isArray(quotes)) {
      return;
    }
    area.textContent = '';
    for (const quote of quotes) {
      appendQuoteChip(area, key, quote);
    }
  }

  /**
   * Build a `.mkd-text` label + textarea bound to `target`. `text` is the
   * `{ required, placeholder }` config. `onExpand` opens the full panel.
   */
  function buildTextarea(text, target, onExpand) {
    const config = text || {};
    const label = el('label', 'mkd-text');
    const labelText = el('span', 'mkd-text__label');
    labelText.textContent = 'Your response';
    if (config.required) {
      labelText.appendChild(requiredMarker());
    }

    const field = el('div', 'mkd-text__field');

    const textarea = el('textarea', 'mkd-text__input', {
      'data-answer-key': target.key,
      'rows': '4',
      'placeholder': typeof config.placeholder === 'string' ? config.placeholder : '',
    });
    textarea.value = target.entry().text;
    inlineTextareas[target.key] = textarea;

    textarea.addEventListener('input', () => {
      target.entry().text = textarea.value;
      markUnskipped(target.itemId);
      if (currentExpandKey === target.key && expandInput) {
        expandInput.value = textarea.value;
        autoGrowExpandInput();
      }
      refreshAll();
      saveState();
    });

    // Paste an image from the clipboard -> capture it as an attachment
    // (--wait mode only; a copy-mode page has no server to persist bytes).
    if (mode === 'wait') {
      textarea.addEventListener('paste', event => handleImagePaste(event, target.key));
    }

    field.appendChild(textarea);

    if (onExpand) {
      const expandBtn = el('button', 'mkd-text__expand', {
        'type': 'button',
        'aria-label': 'Expand to write',
        'title': 'Expand to write',
      });
      expandBtn.textContent = 'Expand';
      expandBtn.addEventListener('click', onExpand);
      field.appendChild(expandBtn);
    }

    label.appendChild(labelText);
    label.appendChild(field);
    return label;
  }

  function requiredMarker() {
    const mark = el('span', 'mkd-required', { 'aria-label': 'required' });
    mark.textContent = '*';
    return mark;
  }

  // --------------------------------------------------------------------------
  // HIGHLIGHT-TO-QUOTE
  // --------------------------------------------------------------------------

  /** The state key (item id, or `item::row`) the quote button captures into. */
  let pendingQuoteKey = null;
  let pendingQuoteText = '';

  function hideQuoteButton() {
    pendingQuoteKey = null;
    pendingQuoteText = '';
    if (quoteBtn) {
      quoteBtn.classList.remove('is-visible');
      quoteBtn.hidden = true;
    }
  }

  function handleSelectionChange() {
    if (!quoteBtn) {
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      hideQuoteButton();
      return;
    }

    const text = selection.toString().trim();
    if (text.length === 0) {
      hideQuoteButton();
      return;
    }

    const source = quoteSourceForSelection(selection);
    if (!source) {
      hideQuoteButton();
      return;
    }
    const key = quoteKeyForSource(source);
    if (!key || !entryForKey(key)) {
      hideQuoteButton();
      return;
    }

    pendingQuoteKey = key;
    pendingQuoteText = text;
    positionQuoteButton(selection);
  }

  /**
   * Find the `[data-quote-source]` element containing the selection — a card's
   * `.mkd-card__content` (question/report/table intro) or a table cell.
   */
  function quoteSourceForSelection(selection) {
    const node = selection.anchorNode;
    if (!node) {
      return null;
    }
    const start = node.nodeType === 1 ? node : node.parentElement;
    if (!start) {
      return null;
    }
    const source = start.closest(
      '.mkd-card__content[data-quote-source], td.mkd-table__cell[data-quote-source]',
    );
    if (!source) {
      return null;
    }
    const focus = selection.focusNode;
    if (focus && !source.contains(focus)) {
      return null;
    }
    return source;
  }

  /** Map a quote-source element to the state key that owns it. */
  function quoteKeyForSource(source) {
    if (source.classList.contains('mkd-table__cell')) {
      const tr = source.closest('tr.mkd-table__row');
      const section = source.closest('section.mkd-card');
      const rowId = tr ? tr.getAttribute('data-row-id') : null;
      const itemId = section ? section.getAttribute('data-item-id') : null;
      if (!rowId || !itemId) {
        return null;
      }
      return `${itemId}::${rowId}`;
    }
    const section = source.closest('section.mkd-card');
    return section ? section.getAttribute('data-item-id') : null;
  }

  /** Resolve the live state entry for a key (item id or `item::row`). */
  function entryForKey(key) {
    const separator = key.indexOf('::');
    if (separator === -1) {
      const entry = state[key];
      // Decisions have no quotes/text machinery.
      return entry && Array.isArray(entry.quotes) ? entry : null;
    }
    const itemId = key.slice(0, separator);
    const rowId = key.slice(separator + 2);
    const item = state[itemId];
    if (!item || !item.rows) {
      return null;
    }
    return item.rows[rowId] || null;
  }

  function positionQuoteButton(selection) {
    let rect;
    try {
      rect = selection.getRangeAt(0).getBoundingClientRect();
    }
    catch {
      hideQuoteButton();
      return;
    }
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hideQuoteButton();
      return;
    }

    quoteBtn.hidden = false;
    const btnWidth = quoteBtn.offsetWidth || 0;
    const btnHeight = quoteBtn.offsetHeight || 0;

    let left = rect.left + window.scrollX + (rect.width / 2) - (btnWidth / 2);
    let top = rect.top + window.scrollY - btnHeight - 8;

    const maxLeft = window.scrollX + document.documentElement.clientWidth - btnWidth - 4;
    const minLeft = window.scrollX + 4;
    left = Math.max(minLeft, Math.min(left, maxLeft));
    if (top < window.scrollY + 4) {
      top = rect.bottom + window.scrollY + 8;
    }

    quoteBtn.style.left = `${Math.round(left)}px`;
    quoteBtn.style.top = `${Math.round(top)}px`;

    requestAnimationFrame(() => {
      if (!quoteBtn.hidden) {
        quoteBtn.classList.add('is-visible');
      }
    });
  }

  function captureQuote() {
    if (!pendingQuoteKey || pendingQuoteText.length === 0) {
      return;
    }
    const key = pendingQuoteKey;
    const text = pendingQuoteText;
    const entry = entryForKey(key);
    if (!entry) {
      hideQuoteButton();
      return;
    }

    entry.quotes.push(text);
    const area = document.querySelector(
      `.mkd-quotes[data-answer-key="${cssAttrEscape(key)}"]`,
    );
    if (area) {
      appendQuoteChip(area, key, text);
    }

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
    hideQuoteButton();
    markUnskipped(key.split('::')[0]);
    refreshAll();
    saveState();
  }

  function appendQuoteChip(area, key, text) {
    const chip = el('span', 'mkd-quote-chip');
    chip.appendChild(document.createTextNode(text));
    const remove = el('button', 'mkd-quote-chip__x', {
      'type': 'button',
      'aria-label': 'Remove quote',
    });
    remove.textContent = 'x';
    remove.addEventListener('click', () => {
      const entry = entryForKey(key);
      if (entry) {
        const index = entry.quotes.indexOf(text);
        if (index !== -1) {
          entry.quotes.splice(index, 1);
        }
      }
      if (chip.parentNode) {
        chip.parentNode.removeChild(chip);
      }
      refreshAll();
      saveState();
    });
    chip.appendChild(remove);
    area.appendChild(chip);
  }

  // --------------------------------------------------------------------------
  // PASTE-TO-ATTACH IMAGES (--wait mode only)
  // --------------------------------------------------------------------------

  function buildImagesArea(target) {
    return el('div', 'mkd-images', { 'data-answer-key': target.key });
  }

  function handleImagePaste(event, key) {
    const data = event.clipboardData;
    if (!data) {
      return;
    }
    const files = [];
    if (data.items && data.items.length > 0) {
      for (const item of data.items) {
        if (item.kind === 'file' && typeof item.type === 'string' && item.type.indexOf('image/') === 0) {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }
    }
    if (files.length === 0 && data.files && data.files.length > 0) {
      for (const file of data.files) {
        if (file && typeof file.type === 'string' && file.type.indexOf('image/') === 0) {
          files.push(file);
        }
      }
    }
    if (files.length === 0) {
      return;
    }
    event.preventDefault();
    for (const file of files) {
      readImageFile(file, key);
    }
  }

  function readImageFile(file, key) {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string' || result.indexOf('data:') !== 0) {
        return;
      }
      const entry = imageEntryForKey(key);
      if (!entry) {
        return;
      }
      entry.images.push(result);
      addImageChip(key, result);
      refreshAll();
    };
    reader.readAsDataURL(file);
  }

  /** Images can attach to decisions too (their entry has no quotes array). */
  function imageEntryForKey(key) {
    const separator = key.indexOf('::');
    if (separator === -1) {
      const entry = state[key];
      if (entry && !Array.isArray(entry.images)) {
        entry.images = [];
      }
      return entry || null;
    }
    return entryForKey(key);
  }

  function addImageChip(key, dataUrl) {
    const area = document.querySelector(
      `.mkd-images[data-answer-key="${cssAttrEscape(key)}"]`,
    );
    if (!area) {
      return;
    }
    const chip = el('span', 'mkd-img-chip');
    const img = el('img', 'mkd-img-chip__img', { alt: 'Pasted image', src: dataUrl });
    chip.appendChild(img);
    const remove = el('button', 'mkd-img-chip__x', {
      'type': 'button',
      'aria-label': 'Remove image',
    });
    remove.textContent = 'x';
    remove.addEventListener('click', () => {
      const entry = imageEntryForKey(key);
      if (entry) {
        const index = entry.images.indexOf(dataUrl);
        if (index !== -1) {
          entry.images.splice(index, 1);
        }
      }
      if (chip.parentNode) {
        chip.parentNode.removeChild(chip);
      }
      refreshAll();
    });
    chip.appendChild(remove);
    area.appendChild(chip);
  }

  // --------------------------------------------------------------------------
  // EXPAND-TO-WRITE PANEL
  // --------------------------------------------------------------------------

  function autoGrowExpandInput() {
    if (!expandInput) {
      return;
    }
    expandInput.style.height = 'auto';
    expandInput.style.height = `${expandInput.scrollHeight}px`;
  }

  /** Resolve a `item::row` key to `{ item, row }`, or null for an item key. */
  function rowInfoForKey(key) {
    const separator = key.indexOf('::');
    if (separator === -1) {
      return null;
    }
    const itemId = key.slice(0, separator);
    const rowId = key.slice(separator + 2);
    const item = items.find(i => i && i.id === itemId);
    if (!item || item.type !== 'table') {
      return null;
    }
    const row = item.table.rows.find(r => r && r.id === rowId);
    return row ? { item, row } : null;
  }

  function openExpand(key) {
    const entry = entryForKey(key);
    if (!expand || !entry) {
      return;
    }
    currentExpandKey = key;
    const rowInfo = rowInfoForKey(key);

    if (expandTitle) {
      if (rowInfo) {
        expandTitle.textContent = `Row \u00B7 ${rowTitle(rowInfo.item, rowInfo.row)}`;
      }
      else {
        const item = items.find(i => i && i.id === key);
        expandTitle.textContent = item ? item.title : 'Your response';
      }
    }

    if (expandRefContent) {
      expandRefContent.textContent = '';
      if (rowInfo) {
        expandRefContent.appendChild(buildRowReference(rowInfo.item, rowInfo.row));
      }
      else {
        const section = itemSection(key);
        const source = section ? section.querySelector('.mkd-card__content') : null;
        if (source) {
          const clone = source.cloneNode(true);
          clone.removeAttribute('data-quote-source');
          expandRefContent.appendChild(clone);
        }
      }
    }

    fillExpandQuotes(key);

    if (expandInput) {
      expandInput.value = entry.text;
    }

    // Two-frame dance so the CSS transition actually runs.
    expand.hidden = false;
    expand.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        expand.classList.add(EXPAND_OPEN_CLASS);
      });
    });

    if (expandInput) {
      expandInput.focus();
      autoGrowExpandInput();
    }
  }

  function fillExpandQuotes(key) {
    if (!expandQuotes) {
      return;
    }
    expandQuotes.textContent = '';
    const entry = entryForKey(key);
    if (!entry || entry.quotes.length === 0) {
      return;
    }
    for (const quote of entry.quotes) {
      const chip = el('span', 'mkd-quote-chip');
      chip.appendChild(document.createTextNode(quote));
      expandQuotes.appendChild(chip);
    }
  }

  function closeExpand() {
    if (!expand) {
      return;
    }
    expand.classList.remove(EXPAND_OPEN_CLASS);
    expand.setAttribute('aria-hidden', 'true');
    expand.hidden = true;
    currentExpandKey = null;
  }

  // --------------------------------------------------------------------------
  // STATUS + STATS + VALIDATION
  // --------------------------------------------------------------------------

  function entryHasControlSelection(entry, controls) {
    if (!controls) {
      return false;
    }
    const answer = entry.controlAnswer;
    switch (controls.type) {
      case 'single':
        return typeof answer === 'string' && answer.length > 0;
      case 'multi':
        return Array.isArray(answer) && answer.length > 0;
      case 'toggle':
        return answer === true;
      default:
        return false;
    }
  }

  function entryHasText(entry) {
    return typeof entry.text === 'string' && entry.text.trim().length > 0;
  }

  function entrySatisfied(entry, controls, text) {
    if (controls && controls.required && !entryHasControlSelection(entry, controls)) {
      return false;
    }
    if (text && text.required && !entryHasText(entry)) {
      return false;
    }
    return true;
  }

  /** Does this item carry any concrete answer? */
  function itemHasAnswer(item) {
    const entry = state[item.id];
    if (!entry) {
      return false;
    }
    if (item.type === 'decision') {
      return entry.chosen !== null;
    }
    if (item.type === 'table') {
      for (const row of item.table.rows) {
        const rowEntry = entry.rows[row.id];
        if (!rowEntry) {
          continue;
        }
        if (entryHasText(rowEntry) || entryHasControlSelection(rowEntry, item.table.rowControls)) {
          return true;
        }
      }
      return entry.note.trim().length > 0;
    }
    return entryHasText(entry) || entryHasControlSelection(entry, item.type === 'question' ? item.controls : null);
  }

  /** answered | skipped | pending. An answer wins over a stale skip flag. */
  function itemStatus(item) {
    if (itemHasAnswer(item)) {
      return 'answered';
    }
    return state[item.id] && state[item.id].skipped ? 'skipped' : 'pending';
  }

  /** Required-field gate for --wait submit; a skipped item is exempt. */
  function itemSatisfied(item) {
    const entry = state[item.id];
    if (!entry || entry.skipped) {
      return true;
    }
    if (item.type === 'decision') {
      return true;
    }
    if (item.type === 'table') {
      for (const row of item.table.rows) {
        const rowEntry = entry.rows[row.id];
        if (rowEntry && !entrySatisfied(rowEntry, item.table.rowControls, item.table.rowText)) {
          return false;
        }
      }
      return true;
    }
    return entrySatisfied(
      entry,
      item.type === 'question' ? item.controls : null,
      item.text,
    );
  }

  function computeStats() {
    let answered = 0;
    let skipped = 0;
    let recFollowed = 0;
    let overridden = 0;
    let custom = 0;
    for (const item of items) {
      const status = itemStatus(item);
      if (status === 'skipped') {
        skipped += 1;
        continue;
      }
      if (status !== 'answered') {
        continue;
      }
      answered += 1;
      if (item.type !== 'decision') {
        continue;
      }
      const entry = state[item.id];
      if (entry.chosen === CUSTOM_KEY) {
        custom += 1;
        continue;
      }
      const option = optionByKey(item, entry.chosen);
      if (option && option.recommended) {
        recFollowed += 1;
      }
      else if (option) {
        overridden += 1;
      }
    }
    return { total: items.length, answered, skipped, recFollowed, overridden, custom };
  }

  // --------------------------------------------------------------------------
  // RESULT
  // --------------------------------------------------------------------------

  function buildResult() {
    const resultItems = items.map((item) => {
      const entry = state[item.id] || initialEntry(item);
      const status = itemStatus(item);

      if (item.type === 'decision') {
        const option = entry.chosen && entry.chosen !== CUSTOM_KEY
          ? optionByKey(item, entry.chosen)
          : null;
        return {
          id: item.id,
          type: 'decision',
          title: item.title,
          status,
          chosen: entry.chosen,
          chosenLabel: option ? option.label : (entry.chosen === CUSTOM_KEY ? 'custom' : null),
          wasRecommended: option ? option.recommended === true : null,
          customText: entry.customText || '',
          note: entry.note || '',
        };
      }

      if (item.type === 'table') {
        const rows = item.table.rows.map((row) => {
          const rowEntry = entry.rows[row.id] || { controlAnswer: null, text: '', quotes: [], images: [] };
          const rowResult = {
            id: row.id,
            controlAnswer: rowEntry.controlAnswer,
            text: rowEntry.text,
            quotes: rowEntry.quotes.slice(),
          };
          if (Array.isArray(rowEntry.images) && rowEntry.images.length > 0) {
            rowResult.images = rowEntry.images.slice();
          }
          return rowResult;
        });
        const tableResult = {
          id: item.id,
          type: 'table',
          title: item.title,
          status,
          quotes: entry.quotes.slice(),
          note: entry.note || '',
          rows,
        };
        if (Array.isArray(entry.images) && entry.images.length > 0) {
          tableResult.images = entry.images.slice();
        }
        return tableResult;
      }

      const answerable = {
        id: item.id,
        type: item.type,
        title: item.title,
        status,
        controlAnswer: item.type === 'question' ? entry.controlAnswer : null,
        text: entry.text,
        quotes: entry.quotes.slice(),
      };
      if (Array.isArray(entry.images) && entry.images.length > 0) {
        answerable.images = entry.images.slice();
      }
      return answerable;
    });

    const result = {
      session: spec.session,
      submittedAt: new Date().toISOString(),
      stats: computeStats(),
      items: resultItems,
    };
    if (typeof spec.source === 'string' && spec.source.length > 0) {
      result.source = spec.source;
    }
    return result;
  }

  // --------------------------------------------------------------------------
  // FOOTER: stats, JSON panel, copy, submit
  // --------------------------------------------------------------------------

  function refreshAll() {
    const stats = computeStats();
    if (statAnswered) {
      statAnswered.textContent = String(stats.answered);
    }
    if (statRec) {
      statRec.textContent = String(stats.recFollowed);
    }
    if (statOver) {
      statOver.textContent = String(stats.overridden);
    }
    if (statCustom) {
      statCustom.textContent = String(stats.custom);
    }
    if (statSkipped) {
      statSkipped.textContent = String(stats.skipped);
    }

    if (jsonPanel && !jsonPanel.hidden) {
      refreshJson();
    }

    if (submitBtn) {
      const unsatisfied = items.filter(item => !itemSatisfied(item)).length;
      submitBtn.disabled = unsatisfied > 0 || submitting;
      submitBtn.title = unsatisfied > 0
        ? `${unsatisfied} item(s) with required fields remaining (answer or skip them)`
        : '';
    }

    for (const key of Object.keys(answerButtons)) {
      updateAnswerButton(key);
    }
    refreshNavButtons();
    renderRail();
  }

  function refreshJson() {
    if (jsonOut) {
      jsonOut.textContent = JSON.stringify(buildResult(), null, 2);
    }
  }

  function toggleJsonPanel() {
    if (!jsonPanel || !jsonToggle) {
      return;
    }
    jsonPanel.hidden = !jsonPanel.hidden;
    jsonToggle.textContent = jsonPanel.hidden ? 'View JSON' : 'Hide JSON';
    if (!jsonPanel.hidden) {
      refreshJson();
    }
  }

  async function copyJson() {
    const text = JSON.stringify(buildResult(), null, 2);
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
    catch {
      // Clipboard API blocked — select the JSON panel text for manual copy.
      if (jsonPanel && jsonPanel.hidden) {
        toggleJsonPanel();
      }
      refreshJson();
      try {
        const range = document.createRange();
        range.selectNodeContents(jsonOut);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        copied = document.execCommand('copy');
      }
      catch {
        copied = false;
      }
    }
    if (copyBtn) {
      copyBtn.textContent = copied ? 'Copied! Paste it in the chat' : 'Copy failed \u2014 select the JSON below';
      copyBtn.classList.add('is-copied');
      setTimeout(() => {
        copyBtn.textContent = 'Copy JSON';
        copyBtn.classList.remove('is-copied');
      }, 2400);
    }
  }

  // ---- --wait submit ----

  let submitting = false;

  async function submit() {
    if (mode !== 'wait' || submitting) {
      return;
    }
    if (items.some(item => !itemSatisfied(item))) {
      return;
    }
    submitting = true;
    if (submitError) {
      submitError.hidden = true;
    }
    refreshAll();

    const result = buildResult();
    try {
      const response = await fetch('/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-mkd-token': submitToken },
        body: JSON.stringify(result),
      });
      if (!response.ok) {
        throw new Error(`Submit failed with status ${response.status}`);
      }
      showDone();
    }
    catch (error) {
      submitting = false;
      if (submitError) {
        submitError.textContent = 'Could not submit. Check the terminal is still running and try again.';
        submitError.hidden = false;
      }
      refreshAll();
      console.error('mkd: submit failed', error);
    }
  }

  function showDone() {
    if (doneEl) {
      doneEl.hidden = false;
    }
    closeExpand();
    closeRowPop();
  }

  // --------------------------------------------------------------------------
  // Global wiring
  // --------------------------------------------------------------------------

  function throttle(fn, wait) {
    let last = 0;
    let timer = null;
    return function throttled() {
      const now = Date.now();
      const remaining = wait - (now - last);
      if (remaining <= 0) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        last = now;
        fn();
      }
      else if (!timer) {
        timer = setTimeout(() => {
          last = Date.now();
          timer = null;
          fn();
        }, remaining);
      }
    };
  }

  /** True when the target is a field where keystrokes must not navigate. */
  function isTypingTarget(target) {
    if (!target || !target.tagName) {
      return false;
    }
    const tag = target.tagName;
    return tag === 'TEXTAREA' || tag === 'INPUT' || target.isContentEditable === true;
  }

  function wireGlobals() {
    const onSelection = throttle(handleSelectionChange, 80);
    document.addEventListener('selectionchange', onSelection);

    const onMove = throttle(hideQuoteButton, 100);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);

    if (quoteBtn) {
      // mousedown (not click) so it fires before the selection is torn down.
      quoteBtn.addEventListener('mousedown', (event) => {
        event.preventDefault();
        captureQuote();
      });
    }

    if (jsonToggle) {
      jsonToggle.addEventListener('click', toggleJsonPanel);
    }
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        void copyJson();
      });
    }
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        void submit();
      });
    }
    if (themeToggle) {
      themeToggle.addEventListener('click', toggleTheme);
    }

    if (expandInput) {
      expandInput.addEventListener('input', () => {
        const key = currentExpandKey;
        const entry = key ? entryForKey(key) : null;
        if (!entry) {
          return;
        }
        entry.text = expandInput.value;
        if (key) {
          markUnskipped(key.split('::')[0]);
        }
        const inline = inlineTextareas[key];
        if (inline) {
          inline.value = expandInput.value;
        }
        refreshAll();
        saveState();
        autoGrowExpandInput();
      });

      if (mode === 'wait') {
        expandInput.addEventListener('paste', (event) => {
          const key = currentExpandKey;
          if (!key) {
            return;
          }
          handleImagePaste(event, key);
        });
      }
    }

    if (expandClose) {
      expandClose.addEventListener('click', () => closeExpand());
    }
    if (expandBackdrop) {
      expandBackdrop.addEventListener('click', () => closeExpand());
    }

    if (rowpopBackdrop) {
      rowpopBackdrop.addEventListener('click', () => closeRowPop());
    }
    const repositionRowPop = throttle(() => {
      if (!currentRowPopKey) {
        return;
      }
      const pop = rowPops[currentRowPopKey];
      const reg = answerButtons[currentRowPopKey];
      if (pop && reg) {
        positionRowPop(pop, reg.btn);
      }
    }, 60);
    window.addEventListener('scroll', repositionRowPop, true);
    window.addEventListener('resize', repositionRowPop);

    if (kbdToggle) {
      kbdToggle.addEventListener('click', () => toggleKbd());
    }
    if (kbdClose) {
      kbdClose.addEventListener('click', () => closeKbd());
    }
    if (kbdBackdrop) {
      kbdBackdrop.addEventListener('click', () => closeKbd());
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (currentRowPopKey) {
          closeRowPop();
          return;
        }
        if (kbd && !kbd.hidden) {
          closeKbd();
          return;
        }
        closeExpand();
        return;
      }
      // Cmd/Ctrl+Enter: submit (--wait) or copy the JSON (copy mode).
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        if (mode === 'wait') {
          void submit();
        }
        else {
          void copyJson();
        }
        return;
      }
      // Arrow keys navigate the deck (ignored while typing or in a modal).
      if (isTypingTarget(event.target) || currentRowPopKey || (expand && !expand.hidden)) {
        return;
      }
      if (event.key === 'ArrowRight' && idx < items.length) {
        go(idx + 1);
        return;
      }
      if (event.key === 'ArrowLeft' && idx > -1) {
        go(idx - 1);
        return;
      }
      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        toggleKbd();
      }
    });
  }

  // --------------------------------------------------------------------------
  // Keyboard shortcuts legend (platform-aware)
  // --------------------------------------------------------------------------

  function isMacPlatform() {
    const ua = navigator.userAgentData;
    const platform = (ua && typeof ua.platform === 'string' ? ua.platform : '') || navigator.platform || '';
    return /mac|iphone|ipad|ipod/i.test(platform);
  }

  function buildKbdLegend() {
    if (!kbdList) {
      return;
    }
    const modKey = isMacPlatform() ? '\u2318' : 'Ctrl';
    const rows = [
      { action: 'Previous / next screen', keys: ['\u2190', '\u2192'] },
      { action: mode === 'wait' ? 'Submit answers' : 'Copy the result JSON', keys: [modKey, 'Enter'] },
      { action: 'Close panel / popover / legend', keys: ['Esc'] },
      { action: 'Quote selected text', keys: ['select', 'quote'] },
      { action: 'Toggle this legend', keys: ['?'] },
    ];
    kbdList.textContent = '';
    for (const row of rows) {
      const item = el('li', 'mkd-kbd__item');
      const action = el('span', 'mkd-kbd__action');
      action.textContent = row.action;
      const keys = el('span', 'mkd-kbd__keys');
      row.keys.forEach((k, i) => {
        if (i > 0) {
          const plus = el('span', 'mkd-kbd__plus');
          plus.textContent = '+';
          keys.appendChild(plus);
        }
        const key = el('kbd', 'mkd-kbd__key');
        key.textContent = k;
        keys.appendChild(key);
      });
      item.appendChild(action);
      item.appendChild(keys);
      kbdList.appendChild(item);
    }
  }

  function openKbd() {
    if (kbd) {
      kbd.hidden = false;
      kbd.setAttribute('aria-hidden', 'false');
    }
  }

  function closeKbd() {
    if (kbd) {
      kbd.hidden = true;
      kbd.setAttribute('aria-hidden', 'true');
    }
  }

  function toggleKbd() {
    if (kbd) {
      if (kbd.hidden) {
        openKbd();
      }
      else {
        closeKbd();
      }
    }
  }

  // --------------------------------------------------------------------------
  // Boot
  // --------------------------------------------------------------------------

  function init() {
    // Theme first so there is no flash on an explicit stored choice.
    const stored = readStoredTheme();
    if (stored) {
      applyTheme(stored);
    }
    else {
      syncThemeToggle();
    }

    loadState();

    items.forEach((item, index) => {
      if (state[item.id]) {
        buildItem(item, index);
      }
    });
    buildIntroNav();
    buildKbdLegend();
    wireGlobals();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  }
  else {
    init();
  }
})();
