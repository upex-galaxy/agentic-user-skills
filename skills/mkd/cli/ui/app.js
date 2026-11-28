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
 * - 'artifact': published as a claude.ai Artifact. The submit button writes
 *   the result to the artifact's `db` capability (`window.__MKD_RESULT_DOC__`)
 *   and posts a "Send to Agent" comment through the `comments` capability,
 *   which wakes the Claude Code session watching the artifact. Image paste is
 *   disabled (no server to persist the bytes); Copy JSON stays the fallback.
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
    : { session: '', title: '', submitLabel: 'Send to Agent', items: [] };

  const items = Array.isArray(spec.items) ? spec.items : [];
  const mode = window.__MKD_MODE__ === 'wait' || window.__MKD_MODE__ === 'artifact'
    ? window.__MKD_MODE__
    : 'copy';
  const submitToken = typeof window.__MKD_TOKEN__ === 'string' ? window.__MKD_TOKEN__ : '';
  const resultDoc = typeof window.__MKD_RESULT_DOC__ === 'string' ? window.__MKD_RESULT_DOC__ : '';
  /** wait + artifact: a submit button sends the result; copy mode copies it. */
  const canSubmit = mode !== 'copy';
  /** Only wait mode has a server to persist pasted image bytes. */
  const canPasteImages = mode === 'wait';

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
  const appRoot = byId('mkd-app');
  const progressBar = byId('mkd-progress');
  const countDone = byId('mkd-count-done');
  const countPending = byId('mkd-count-pending');
  const jumpBtn = byId('mkd-jump');
  const confirmDialog = byId('mkd-confirm');
  const confirmBody = byId('mkd-confirm-body');
  const confirmSend = byId('mkd-confirm-send');
  const hideRecToggle = byId('mkd-hide-rec');
  const shuffleBtn = byId('mkd-shuffle');
  const autoAdvanceToggle = byId('mkd-auto-advance');
  const barEl = byId('mkd-bar');
  const moreBtn = byId('mkd-more');
  const prevBtn = byId('mkd-prev');
  const skipBtn = byId('mkd-skip');
  const nextBtn = byId('mkd-next');
  const unshuffleBtn = byId('mkd-unshuffle');
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
  const ICON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  const ICON_MOON = `${ICON_SVG}<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"/></svg>`;
  const ICON_SUN = `${ICON_SVG}<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>`;
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

  function effectiveTheme() {
    const stored = readStoredTheme();
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    return 'dark';
  }

  /**
   * Apply an EXPLICIT theme choice via `data-theme` on <html>. With no stored
   * choice the attribute is absent and the dark default tokens apply, so this
   * is only called with a concrete stored/toggled value.
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
    if (typeof renderVisibleDiagrams === 'function' && document.querySelector('.mkd-diagram')) {
      void renderVisibleDiagrams();
    }
  }

  function syncThemeToggle() {
    if (!themeToggle) {
      return;
    }
    const isLight = effectiveTheme() === 'light';
    // Show the icon for the theme you'd switch TO.
    themeToggle.innerHTML = isLight ? ICON_MOON : ICON_SUN;
    themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
  }

  function toggleTheme() {
    const next = effectiveTheme() === 'light' ? 'dark' : 'light';
    writeStoredTheme(next);
    applyTheme(next);
  }

  // --------------------------------------------------------------------------
  // DISPLAY OPTIONS — hide recommended, shuffle options (display only: the
  // Result is built from `state` and the spec, never from the DOM order or
  // what is visible)
  // --------------------------------------------------------------------------

  const VIEW_HIDE_REC_KEY = 'mkd-view-hide-rec';
  const SHUFFLE_ORDER_KEY = `mkd-shuffle-${spec.session || 'deck'}`;
  const SHUFFLE_ACTIVE_KEY = `${SHUFFLE_ORDER_KEY}-on`;
  const viewMemory = Object.create(null);

  function readFlag(key) {
    try {
      const value = window.localStorage.getItem(key);
      if (value === '1' || value === '0') {
        return value === '1';
      }
    }
    catch {
      // localStorage blocked — fall back to the in-memory value.
    }
    return viewMemory[key] === true;
  }

  function writeFlag(key, on) {
    viewMemory[key] = on;
    try {
      window.localStorage.setItem(key, on ? '1' : '0');
    }
    catch {
      // localStorage blocked — the in-memory value still carries the session.
    }
  }

  function applyHideRec(on) {
    if (appRoot) {
      if (on) {
        appRoot.setAttribute('data-hide-rec', '');
      }
      else {
        appRoot.removeAttribute('data-hide-rec');
      }
    }
    if (hideRecToggle) {
      hideRecToggle.checked = on;
    }
  }

  function same(a, b) {
    return a.every((key, i) => key === b[i]);
  }

  /**
   * Fisher-Yates, re-rolled until the order differs from the author's AND from
   * the previous shuffle, so every press visibly acts. Two options have only
   * one non-author order, so there the previous-order rule cannot apply (it
   * would loop forever): they stay swapped.
   */
  function shuffledKeys(keys, previous) {
    if (keys.length < 2) {
      return keys.slice();
    }
    if (keys.length === 2) {
      return [keys[1], keys[0]];
    }
    let out = keys.slice();
    do {
      out = keys.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
    } while (same(out, keys) || (previous && same(out, previous)));
    return out;
  }

  /** One permutation per decision while shuffled; null in the author's order. */
  let shuffleOrder = null;

  /** A saved permutation from an earlier view of this deck, or null when none is valid. */
  function loadShuffleOrder() {
    let saved = null;
    try {
      saved = JSON.parse(window.localStorage.getItem(SHUFFLE_ORDER_KEY));
    }
    catch {
      saved = null;
    }
    if (!saved || typeof saved !== 'object') {
      return null;
    }
    const order = Object.create(null);
    for (const item of items) {
      if (item.type !== 'decision') {
        continue;
      }
      const keys = item.options.map(option => option.key);
      const prior = Array.isArray(saved[item.id]) ? saved[item.id] : null;
      const valid = prior
        && prior.length === keys.length
        && keys.every(key => prior.includes(key));
      if (!valid) {
        return null;
      }
      order[item.id] = prior.slice();
    }
    return order;
  }

  /** Every press rolls a fresh permutation per decision, kept across reloads. */
  function reshuffle() {
    const previous = shuffleOrder || lastShuffle;
    const order = Object.create(null);
    for (const item of items) {
      if (item.type === 'decision') {
        order[item.id] = shuffledKeys(
          item.options.map(option => option.key),
          previous ? previous[item.id] : null,
        );
      }
    }
    shuffleOrder = order;
    try {
      window.localStorage.setItem(SHUFFLE_ORDER_KEY, JSON.stringify(order));
    }
    catch {
      // Storage blocked — the in-memory order still holds for this view.
    }
    lastShuffle = order;
    applyShuffle(true);
    writeFlag(SHUFFLE_ACTIVE_KEY, true);
  }

  /** The last shuffle, remembered so the next press never repeats it. */
  let lastShuffle = null;

  function restoreAuthorOrder() {
    applyShuffle(false);
    writeFlag(SHUFFLE_ACTIVE_KEY, false);
    if (shuffleBtn) {
      shuffleBtn.focus();
    }
  }

  /**
   * Reorder the option NODES (not CSS `order`) so tab and reading order follow.
   * On: the shuffled order, and the visible letter follows the POSITION
   * (A, B, C ...) so it never leaks the original order. Off: the author's
   * order and keys. `data-opt-key` always keeps the spec key the Result is
   * built from.
   */
  function applyShuffle(on) {
    if (on && !shuffleOrder) {
      return;
    }
    if (!on) {
      shuffleOrder = null;
    }
    for (const item of items) {
      if (item.type !== 'decision') {
        continue;
      }
      const section = itemSection(item.id);
      const list = section ? section.querySelector('.mkd-opts') : null;
      if (!list) {
        continue;
      }
      const anchor = list.querySelector(`.mkd-opt[data-opt-key="${CUSTOM_KEY}"]`);
      const keys = on ? shuffleOrder[item.id] : item.options.map(option => option.key);
      keys.forEach((key, position) => {
        const btn = list.querySelector(`.mkd-opt[data-opt-key="${cssAttrEscape(key)}"]`);
        if (btn) {
          list.insertBefore(btn, anchor);
          const letter = btn.querySelector('.mkd-opt__key');
          if (letter) {
            letter.textContent = on ? positionLetter(position) : key;
          }
        }
      });
    }
    if (unshuffleBtn) {
      unshuffleBtn.hidden = !on;
    }
    const view = shuffleBtn ? shuffleBtn.closest('.mkd-view') : null;
    if (view) {
      view.classList.toggle('is-shuffled', on);
    }
  }

  function positionLetter(position) {
    return position < 26 ? String.fromCharCode(65 + position) : String(position + 1);
  }


  // --------------------------------------------------------------------------
  // MEDIA — carousels, lightbox, option media, Mermaid diagrams (display only:
  // nothing here touches `state` or the Result)
  // --------------------------------------------------------------------------

  const lightbox = byId('mkd-lightbox');
  const lightboxBody = byId('mkd-lightbox-body');
  const lightboxClose = byId('mkd-lightbox-close');
  const reducedMotion = (() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)');
    }
    catch {
      return { matches: false };
    }
  })();

  function isLightboxOpen() {
    return Boolean(lightbox && lightbox.open);
  }

  /** Native scroll-snap track + buttons, markers, counter and polite status. */
  function initCarousel(root) {
    if (!root || root.dataset.ready === '1') {
      return;
    }
    root.dataset.ready = '1';
    const track = root.querySelector('.mkd-carousel__track');
    const slides = track ? [...track.children] : [];
    const dots = [...root.querySelectorAll('.mkd-carousel__dot')];
    const prev = root.querySelector('.mkd-carousel__btn--prev');
    const next = root.querySelector('.mkd-carousel__btn--next');
    const count = root.querySelector('.mkd-carousel__count');
    const status = root.querySelector('.mkd-carousel__status');
    if (!track || slides.length === 0) {
      return;
    }
    let current = 0;
    let settled = 0;
    let pending = null;

    function nearest() {
      const center = track.scrollLeft + track.clientWidth / 2;
      let best = 0;
      let bestDistance = Infinity;
      slides.forEach((slide, i) => {
        const distance = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - center);
        if (distance < bestDistance) {
          best = i;
          bestDistance = distance;
        }
      });
      return best;
    }

    function mark(index) {
      current = index;
      dots.forEach((dot, i) => {
        if (i === index) {
          dot.setAttribute('aria-current', 'true');
        }
        else {
          dot.removeAttribute('aria-current');
        }
      });
      if (count) {
        count.textContent = `${index + 1}/${slides.length}`;
      }
    }

    function scrollToSlide(index) {
      const target = Math.max(0, Math.min(index, slides.length - 1));
      pending = target;
      mark(target);
      const slide = slides[target];
      track.scrollTo({
        left: slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2,
        behavior: reducedMotion.matches ? 'auto' : 'smooth',
      });
    }

    function settle() {
      pending = null;
      const index = nearest();
      mark(index);
      if (prev) {
        prev.disabled = index === 0;
      }
      if (next) {
        next.disabled = index === slides.length - 1;
      }
      // Keep focus on a live control when the one pressed becomes disabled.
      if (document.activeElement === prev && prev.disabled && next) {
        next.focus();
      }
      else if (document.activeElement === next && next.disabled && prev) {
        prev.focus();
      }
      if (index !== settled && status) {
        status.textContent = `Slide ${index + 1} of ${slides.length}`;
      }
      settled = index;
      for (const video of track.querySelectorAll('video')) {
        if (!slides[index].contains(video)) {
          video.pause();
        }
      }
      renderVisibleDiagrams();
    }

    let frame = 0;
    track.addEventListener('scroll', () => {
      if (pending !== null || frame) {
        return;
      }
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const index = nearest();
        if (index !== current) {
          mark(index);
        }
      });
    }, { passive: true });

    if ('onscrollend' in window) {
      track.addEventListener('scrollend', settle);
    }
    else {
      let timer = 0;
      track.addEventListener('scroll', () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(settle, 120);
      }, { passive: true });
    }

    if (prev) {
      prev.addEventListener('click', () => scrollToSlide((pending ?? current) - 1));
    }
    if (next) {
      next.addEventListener('click', () => scrollToSlide((pending ?? current) + 1));
    }
    dots.forEach((dot, i) => dot.addEventListener('click', () => scrollToSlide(i)));

    // Left/right move slides while focus is inside the carousel (never a
    // nested video's own keys), and never reach deck navigation.
    root.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }
      if (event.target && event.target.closest && event.target.closest('video, iframe')) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      scrollToSlide((pending ?? current) + (event.key === 'ArrowRight' ? 1 : -1));
    });
    root.carouselGoTo = (index) => {
      const slide = slides[index];
      if (slide) {
        track.scrollLeft = slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2;
        mark(index);
        settle();
      }
    };
  }

  // ---- Media pool: one copy of each repeated data URI (render.ts poolDataUris) ----

  const mediaPool = (() => {
    const node = byId('mkd-media-pool');
    if (!node) {
      return {};
    }
    try {
      const parsed = JSON.parse(node.textContent || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    }
    catch {
      return {};
    }
  })();

  /** Fill pooled `<img data-mkd-src>` sources under `root` (templates included). */
  function hydratePool(root) {
    if (!root || !root.querySelectorAll) {
      return;
    }
    for (const img of root.querySelectorAll('img[data-mkd-src]')) {
      const value = mediaPool[img.getAttribute('data-mkd-src')];
      if (value && !img.getAttribute('src')) {
        img.setAttribute('src', value);
      }
    }
    for (const template of root.querySelectorAll('template')) {
      hydratePool(template.content);
    }
  }

  /** The lightbox-only high-resolution source of an image, if any. */
  function fullSourceOf(img) {
    if (!img) {
      return '';
    }
    const key = img.getAttribute('data-mkd-full');
    if (key && mediaPool[key]) {
      return mediaPool[key];
    }
    return img.getAttribute('data-full') || '';
  }

  // ---- The viewer: one slide at a time, fit to the viewport, zoom and pan ----

  const lbTag = byId('mkd-lightbox-tag');
  const lbCount = byId('mkd-lightbox-count');
  const lbCaption = byId('mkd-lightbox-caption');
  const lbPrev = byId('mkd-lightbox-prev');
  const lbNext = byId('mkd-lightbox-next');
  const lbZoomIn = byId('mkd-lightbox-zoomin');
  const lbZoomOut = byId('mkd-lightbox-zoomout');
  const lbActual = byId('mkd-lightbox-actual');
  const lbOriginal = byId('mkd-lightbox-original');
  const lbPick = byId('mkd-lightbox-pick');

  const viewer = {
    slides: [],
    index: 0,
    card: null,
    img: null,
    // Zoom state of the current image: scale and the image's top-left
    // corner in stage pixels.
    scale: 1,
    fit: 1,
    x: 0,
    y: 0,
    pointers: new Map(),
    pinch: null,
    drag: null,
  };

  /**
   * One figure as a viewer slide. Images (and SVG figures) zoom; every other
   * kind (video, embed, link, diagram, missing image) is shown as a clone.
   */
  function slideFromFigure(fig, extra) {
    const captionNode = fig.querySelector('.mkd-media__caption');
    const caption = captionNode ? captionNode.textContent : '';
    const img = fig.querySelector('img.mkd-media__img');
    if (img && img.getAttribute('src')) {
      return Object.assign({ kind: 'image', src: img.getAttribute('src'), full: fullSourceOf(img), alt: img.getAttribute('alt') || '', caption }, extra);
    }
    return Object.assign({ kind: 'node', node: cloneFigure(fig), caption }, extra);
  }

  /** A clean copy of a figure for the viewer (a rendered diagram keeps its SVG). */
  function cloneFigure(fig) {
    const copy = fig.cloneNode(true);
    for (const zoom of copy.querySelectorAll('[data-lightbox]')) {
      if (zoom.classList.contains('mkd-media__zoom')) {
        zoom.replaceWith(...zoom.querySelectorAll('img'));
      }
      else {
        zoom.remove();
      }
    }
    for (const caption of copy.querySelectorAll('.mkd-media__caption')) {
      caption.remove();
    }
    for (const diagram of copy.querySelectorAll('.mkd-diagram')) {
      delete diagram.dataset.renderedTheme;
    }
    if (copy.classList.contains('mkd-diagram')) {
      delete copy.dataset.renderedTheme;
    }
    return copy;
  }

  /** Every option's media of a decision card, in screen order (follows Shuffle). */
  function optionSlides(card) {
    const slides = [];
    for (const opt of card.querySelectorAll('.mkd-opt[data-opt-key]')) {
      const template = opt.querySelector('template.mkd-opt__full');
      if (!template) {
        continue;
      }
      const key = opt.getAttribute('data-opt-key');
      const letter = ((opt.querySelector('.mkd-opt__key') || {}).textContent || '').trim();
      const label = ((opt.querySelector('.mkd-opt__label') || {}).textContent || '').trim();
      const parts = [...template.content.querySelectorAll('.mkd-opt__full-slide')];
      parts.forEach((part, i) => {
        const fig = part.firstElementChild;
        if (!fig) {
          return;
        }
        const node = part.cloneNode(true);
        hydratePool(node);
        const tag = `${letter} · ${label}${parts.length > 1 ? ` (${i + 1}/${parts.length})` : ''}`;
        slides.push(slideFromFigure(node.firstElementChild, { tag, optKey: key, optIndex: i }));
      });
    }
    return slides;
  }

  /** The figures of one media block (a single figure or a carousel's slides). */
  function blockSlides(block) {
    const figs = [...block.querySelectorAll('.mkd-carousel__slide > figure, .mkd-carousel__slide > .mkd-linkcard')];
    const list = figs.length > 0 ? figs : [...block.children].filter(node => node.matches('figure, .mkd-linkcard'));
    return list.map(fig => ({ fig, slide: fig.matches('figure') ? slideFromFigure(fig, {}) : { kind: 'node', node: fig.cloneNode(true), caption: '' } }));
  }

  function openViewer(slides, start, label, card) {
    if (!lightbox || !lightboxBody || typeof lightbox.showModal !== 'function' || slides.length === 0) {
      return;
    }
    viewer.slides = slides;
    viewer.card = card || null;
    lightbox.setAttribute('aria-label', label);
    lightbox.classList.toggle('is-single', slides.length === 1);
    if (!lightbox.open) {
      lightbox.showModal();
    }
    showSlide(Math.max(0, Math.min(start, slides.length - 1)));
    lightboxBody.focus({ preventScroll: true });
  }

  /** Option media from the "View option media" button, the V key or a preview click. */
  function openOptionMedia(card, optKey, optIndex) {
    if (!card) {
      return;
    }
    const slides = optionSlides(card);
    let start = 0;
    if (optKey) {
      const found = slides.findIndex(slide => slide.optKey === optKey && (optIndex === undefined || slide.optIndex === optIndex));
      start = found >= 0 ? found : 0;
    }
    openViewer(slides, start, 'Option media', card);
  }

  /** V: the current card's media, starting at the chosen option when it has some. */
  function openCurrentMedia() {
    const card = document.querySelector('.mkd-card.is-current');
    if (!card) {
      return false;
    }
    if (card.querySelector('template.mkd-opt__full')) {
      const chosen = card.querySelector('.mkd-opt.is-selected[data-opt-key]');
      openOptionMedia(card, chosen && chosen.querySelector('template.mkd-opt__full') ? chosen.getAttribute('data-opt-key') : null);
      return true;
    }
    const block = card.querySelector('.mkd-card__media');
    if (block) {
      openViewer(blockSlides(block).map(entry => entry.slide), 0, 'Media', card);
      return true;
    }
    return false;
  }

  /** The viewer element that holds focus right now, if any. */
  function heldViewerFocus() {
    const active = document.activeElement;
    return active && lightbox.contains(active) ? active : null;
  }

  function isFocusable(node) {
    return Boolean(node && node.isConnected && !node.disabled && node.getClientRects().length > 0);
  }

  /**
   * The viewer's keys are heard on the dialog, so focus must stay inside it.
   * When `held` (focused before an update) went dead (disabled, hidden or
   * removed with its slide), focus moves to its counterpart (previous and
   * next, zoom in and zoom out), else to the stage.
   */
  function keepViewerFocus(held) {
    if (!held || !isLightboxOpen() || isFocusable(held)) {
      return;
    }
    const pair = [[lbPrev, lbNext], [lbZoomIn, lbZoomOut]].find(nodes => nodes.includes(held));
    const other = pair ? pair.find(node => node !== held) : null;
    (isFocusable(other) ? other : lightboxBody).focus({ preventScroll: true });
  }

  function showSlide(index) {
    const slide = viewer.slides[index];
    if (!slide) {
      return;
    }
    const held = heldViewerFocus();
    viewer.index = index;
    viewer.img = null;
    lightboxBody.textContent = '';
    const n = viewer.slides.length;
    if (lbCount) {
      lbCount.textContent = n > 1 ? `${index + 1} / ${n}` : '';
    }
    if (lbTag) {
      lbTag.textContent = slide.tag || '';
    }
    if (lbCaption) {
      lbCaption.textContent = slide.caption || (slide.kind === 'image' ? slide.alt : '');
    }
    if (lbPrev) {
      lbPrev.disabled = index === 0;
    }
    if (lbNext) {
      lbNext.disabled = index === n - 1;
    }
    syncPick();
    const original = slide.kind === 'image' ? [slide.full, slide.src].find(value => /^https:/i.test(value || '')) : '';
    if (lbOriginal) {
      lbOriginal.hidden = !original;
      lbOriginal.href = original || '#';
    }
    lightbox.classList.toggle('is-image', slide.kind === 'image');
    if (slide.kind !== 'image') {
      const wrap = el('div', 'mkd-lightbox__node');
      wrap.appendChild(slide.node.cloneNode(true));
      lightboxBody.appendChild(wrap);
      setZoomTools(false);
      keepViewerFocus(held);
      renderVisibleDiagrams();
      return;
    }
    const img = el('img', 'mkd-lightbox__img', { alt: slide.alt, draggable: 'false' });
    viewer.img = img;
    setZoomTools(true);
    img.addEventListener('load', () => {
      if (viewer.img === img) {
        fitImage();
      }
    }, { once: true });
    img.src = slide.src;
    lightboxBody.appendChild(img);
    if (img.complete && img.naturalWidth) {
      fitImage();
    }
    keepViewerFocus(held);
    // A higher-resolution `full` source replaces the card picture once it
    // has loaded, keeping the current zoom. An https one in an artifact page
    // is never loaded (the viewer blocks remote images): "Original" links it.
    const full = slide.full;
    const remoteBlocked = window.__MKD_MODE__ === 'artifact' && /^https?:/i.test(full || '');
    if (full && full !== slide.src && !remoteBlocked) {
      const hi = new Image();
      hi.addEventListener('load', () => {
        if (viewer.img !== img) {
          return;
        }
        const w = img.naturalWidth;
        const atFit = Math.abs(viewer.scale - viewer.fit) < 1e-3;
        img.src = full;
        const ratio = w ? w / hi.naturalWidth : 1;
        viewer.fit = fitScale();
        if (atFit) {
          viewer.scale = viewer.fit;
          centerImage();
        }
        else {
          viewer.scale *= ratio;
        }
        applyTransform();
      }, { once: true });
      hi.src = full;
    }
  }

  function syncPick() {
    if (!lbPick) {
      return;
    }
    const slide = viewer.slides[viewer.index];
    const btn = slide && slide.optKey && viewer.card
      ? viewer.card.querySelector(`.mkd-opt[data-opt-key="${cssAttrEscape(slide.optKey)}"]`)
      : null;
    if (!btn) {
      lbPick.hidden = true;
      return;
    }
    const letter = ((btn.querySelector('.mkd-opt__key') || {}).textContent || '').trim();
    const chosen = btn.classList.contains('is-selected');
    lbPick.hidden = false;
    lbPick.disabled = chosen;
    lbPick.textContent = chosen ? `Option ${letter} chosen` : `Choose option ${letter} (Enter)`;
  }

  function pickFromViewer() {
    const slide = viewer.slides[viewer.index];
    if (!slide || !slide.optKey || !viewer.card || (lbPick && lbPick.disabled)) {
      return;
    }
    const btn = viewer.card.querySelector(`.mkd-opt[data-opt-key="${cssAttrEscape(slide.optKey)}"]`);
    closeLightbox();
    if (btn) {
      btn.click();
      btn.focus({ preventScroll: true });
    }
  }

  function setZoomTools(on) {
    for (const tool of [lbZoomIn, lbZoomOut, lbActual]) {
      if (tool) {
        tool.disabled = !on;
      }
    }
  }

  function stageSize() {
    return { w: lightboxBody.clientWidth, h: lightboxBody.clientHeight };
  }

  /** Scale that fits the whole picture in the stage (upscales small ones to fill it). */
  function fitScale() {
    const img = viewer.img;
    if (!img || !img.naturalWidth) {
      return 1;
    }
    const { w, h } = stageSize();
    return Math.min(w / img.naturalWidth, h / img.naturalHeight, 4);
  }

  function centerImage() {
    const img = viewer.img;
    const { w, h } = stageSize();
    viewer.x = (w - img.naturalWidth * viewer.scale) / 2;
    viewer.y = (h - img.naturalHeight * viewer.scale) / 2;
  }

  function fitImage() {
    viewer.fit = fitScale();
    viewer.scale = viewer.fit;
    centerImage();
    applyTransform();
  }

  /** Keep a zoomed picture covering the stage; a smaller one stays centered. */
  function clampPan() {
    const img = viewer.img;
    const { w, h } = stageSize();
    const iw = img.naturalWidth * viewer.scale;
    const ih = img.naturalHeight * viewer.scale;
    viewer.x = iw <= w ? (w - iw) / 2 : Math.min(0, Math.max(w - iw, viewer.x));
    viewer.y = ih <= h ? (h - ih) / 2 : Math.min(0, Math.max(h - ih, viewer.y));
  }

  function applyTransform() {
    const img = viewer.img;
    if (!img || !img.naturalWidth) {
      return;
    }
    clampPan();
    img.style.width = `${img.naturalWidth}px`;
    img.style.height = `${img.naturalHeight}px`;
    img.style.transform = `translate(${viewer.x}px, ${viewer.y}px) scale(${viewer.scale})`;
    const zoomed = viewer.scale > viewer.fit + 1e-3;
    lightbox.classList.toggle('is-zoomed', zoomed);
    if (lbActual) {
      const actual = Math.abs(viewer.scale - 1) < 1e-3;
      lbActual.textContent = actual ? 'Fit' : '1:1';
      lbActual.setAttribute('aria-label', actual ? 'Fit to screen' : 'Actual size (1:1)');
    }
    const held = heldViewerFocus();
    if (lbZoomOut) {
      lbZoomOut.disabled = viewer.scale <= minScale() + 1e-3;
    }
    if (lbZoomIn) {
      lbZoomIn.disabled = viewer.scale >= maxScale() - 1e-3;
    }
    keepViewerFocus(held);
  }

  /** Never smaller than the fit size, except to show a big picture at 1:1. */
  function minScale() {
    return Math.min(viewer.fit, 1);
  }

  function maxScale() {
    return Math.max(8, viewer.fit * 4);
  }

  /** Zoom to `next` keeping the stage point (cx, cy) still. */
  function zoomTo(next, cx, cy) {
    const img = viewer.img;
    if (!img || !img.naturalWidth) {
      return;
    }
    const { w, h } = stageSize();
    const px = cx === undefined ? w / 2 : cx;
    const py = cy === undefined ? h / 2 : cy;
    const target = Math.max(minScale(), Math.min(next, maxScale()));
    const ratio = target / viewer.scale;
    viewer.x = px - (px - viewer.x) * ratio;
    viewer.y = py - (py - viewer.y) * ratio;
    viewer.scale = target;
    applyTransform();
  }

  function toggleActual(cx, cy) {
    if (!viewer.img) {
      return;
    }
    if (Math.abs(viewer.scale - 1) < 1e-3) {
      fitImage();
    }
    else {
      zoomTo(1, cx, cy);
    }
  }

  function stagePoint(event) {
    const box = lightboxBody.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  function wireViewer() {
    if (!lightbox || !lightboxBody) {
      return;
    }
    lightboxBody.addEventListener('wheel', (event) => {
      if (!viewer.img) {
        return;
      }
      event.preventDefault();
      const p = stagePoint(event);
      // Trackpad pinch arrives as ctrl+wheel with small deltas.
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0018));
      zoomTo(viewer.scale * factor, p.x, p.y);
    }, { passive: false });

    lightboxBody.addEventListener('dblclick', (event) => {
      if (!viewer.img) {
        return;
      }
      const p = stagePoint(event);
      toggleActual(p.x, p.y);
    });

    lightboxBody.addEventListener('pointerdown', (event) => {
      if (!viewer.img || (event.pointerType === 'mouse' && event.button !== 0)) {
        return;
      }
      lightboxBody.setPointerCapture(event.pointerId);
      viewer.pointers.set(event.pointerId, stagePoint(event));
      if (viewer.pointers.size === 2) {
        const [a, b] = [...viewer.pointers.values()];
        viewer.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: viewer.scale };
        viewer.drag = null;
      }
      else if (viewer.pointers.size === 1) {
        const p = stagePoint(event);
        viewer.drag = { x: p.x, y: p.y, ox: viewer.x, oy: viewer.y, moved: false, t: event.timeStamp };
      }
    });

    lightboxBody.addEventListener('pointermove', (event) => {
      if (!viewer.pointers.has(event.pointerId)) {
        return;
      }
      viewer.pointers.set(event.pointerId, stagePoint(event));
      if (viewer.pinch && viewer.pointers.size >= 2) {
        const [a, b] = [...viewer.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (viewer.pinch.dist > 0) {
          zoomTo(viewer.pinch.scale * (dist / viewer.pinch.dist), (a.x + b.x) / 2, (a.y + b.y) / 2);
        }
        return;
      }
      const drag = viewer.drag;
      if (!drag) {
        return;
      }
      const p = stagePoint(event);
      if (Math.abs(p.x - drag.x) + Math.abs(p.y - drag.y) > 4) {
        drag.moved = true;
      }
      if (viewer.scale > viewer.fit + 1e-3) {
        viewer.x = drag.ox + (p.x - drag.x);
        viewer.y = drag.oy + (p.y - drag.y);
        applyTransform();
      }
    });

    const release = (event) => {
      if (!viewer.pointers.has(event.pointerId)) {
        return;
      }
      viewer.pointers.delete(event.pointerId);
      const drag = viewer.drag;
      if (viewer.pointers.size < 2) {
        viewer.pinch = null;
      }
      if (viewer.pointers.size === 0) {
        viewer.drag = null;
        // A horizontal swipe on a picture at fit size moves between slides.
        if (drag && drag.moved && viewer.scale <= viewer.fit + 1e-3 && event.type === 'pointerup') {
          const p = stagePoint(event);
          const dx = p.x - drag.x;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(p.y - drag.y)) {
            stepViewer(dx < 0 ? 1 : -1);
          }
        }
      }
    };
    lightboxBody.addEventListener('pointerup', release);
    lightboxBody.addEventListener('pointercancel', release);

    if (lbPrev) {
      lbPrev.addEventListener('click', () => stepViewer(-1));
    }
    if (lbNext) {
      lbNext.addEventListener('click', () => stepViewer(1));
    }
    if (lbZoomIn) {
      lbZoomIn.addEventListener('click', () => zoomTo(viewer.scale * 1.5));
    }
    if (lbZoomOut) {
      lbZoomOut.addEventListener('click', () => zoomTo(viewer.scale / 1.5));
    }
    if (lbActual) {
      lbActual.addEventListener('click', () => toggleActual());
    }
    if (lbPick) {
      lbPick.addEventListener('click', pickFromViewer);
    }

    lightbox.addEventListener('keydown', (event) => {
      // Nothing typed in the viewer reaches the deck keys (Enter would pick
      // here and then advance the deck once the dialog has closed).
      event.stopPropagation();
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const onControl = event.target && event.target.closest && event.target.closest('button, a, video, iframe, input, textarea');
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        if (event.target && event.target.closest && event.target.closest('video')) {
          return;
        }
        event.preventDefault();
        stepViewer(event.key === 'ArrowRight' ? 1 : -1);
      }
      else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomTo(viewer.scale * 1.5);
      }
      else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        zoomTo(viewer.scale / 1.5);
      }
      else if (event.key === '0') {
        event.preventDefault();
        if (viewer.img) {
          fitImage();
        }
      }
      else if (event.key === 'z' || event.key === 'Z') {
        event.preventDefault();
        toggleActual();
      }
      else if (event.key === 'Enter' && !onControl && lbPick && !lbPick.hidden) {
        event.preventDefault();
        pickFromViewer();
      }
    });

    window.addEventListener('resize', () => {
      if (isLightboxOpen() && viewer.img) {
        const atFit = Math.abs(viewer.scale - viewer.fit) < 1e-3;
        viewer.fit = fitScale();
        if (atFit) {
          viewer.scale = viewer.fit;
          centerImage();
        }
        applyTransform();
      }
    });
  }

  function stepViewer(delta) {
    const next = viewer.index + delta;
    if (next >= 0 && next < viewer.slides.length) {
      showSlide(next);
    }
  }

  function closeLightbox() {
    if (lightbox && lightbox.open) {
      lightbox.close();
    }
  }

  /**
   * Leaving a card stops its media: videos pause, embeds unload (a hidden
   * YouTube frame keeps playing sound) and come back when the card returns.
   */
  function syncCardMedia() {
    const currentCard = document.querySelector('.mkd-card.is-current');
    for (const video of document.querySelectorAll('.mkd-stage video')) {
      if (!currentCard || !currentCard.contains(video)) {
        video.pause();
      }
    }
    for (const frame of document.querySelectorAll('.mkd-stage .mkd-embed__frame')) {
      const inCurrent = currentCard && currentCard.contains(frame);
      if (!frame.dataset.src) {
        frame.dataset.src = frame.getAttribute('src') || '';
      }
      const want = inCurrent ? frame.dataset.src : 'about:blank';
      if (frame.getAttribute('src') !== want) {
        frame.setAttribute('src', want);
      }
    }
    renderVisibleDiagrams();
  }

  // ---- Mermaid: lazy CDN load, strict security, theme-aware, never breaks ----

  const mermaidConfig = window.__MKD_MERMAID__ && typeof window.__MKD_MERMAID__ === 'object' ? window.__MKD_MERMAID__ : null;
  let mermaidPromise = null;
  let mermaidSeq = 0;

  function loadMermaid() {
    if (mermaidPromise) {
      return mermaidPromise;
    }
    mermaidPromise = new Promise((resolve, reject) => {
      if (!mermaidConfig) {
        reject(new Error('no mermaid config'));
        return;
      }
      if (window.mermaid) {
        resolve(window.mermaid);
        return;
      }
      const script = document.createElement('script');
      script.crossOrigin = 'anonymous';
      if (mermaidConfig.integrity) {
        script.integrity = mermaidConfig.integrity;
      }
      const timer = window.setTimeout(() => reject(new Error('timeout')), 15000);
      script.onload = () => {
        window.clearTimeout(timer);
        if (window.mermaid) {
          resolve(window.mermaid);
        }
        else {
          reject(new Error('mermaid global missing'));
        }
      };
      script.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('load failed'));
      };
      script.src = mermaidConfig.src;
      document.head.appendChild(script);
    });
    return mermaidPromise;
  }

  function diagramFallback(fig, message) {
    fig.classList.remove('is-rendered');
    fig.classList.add('is-failed');
    const notice = fig.querySelector('.mkd-diagram__notice');
    if (notice) {
      notice.textContent = message;
      notice.hidden = false;
    }
  }

  function isShown(node) {
    return node.getClientRects().length > 0;
  }

  async function renderVisibleDiagrams() {
    const figs = [...document.querySelectorAll('.mkd-diagram')].filter(isShown);
    const theme = effectiveTheme();
    const todo = figs.filter(fig => fig.dataset.renderedTheme !== theme && !fig.classList.contains('is-failed'));
    if (todo.length === 0) {
      return;
    }
    let mermaid;
    try {
      mermaid = await loadMermaid();
    }
    catch {
      for (const fig of todo) {
        diagramFallback(fig, 'The diagram renderer could not load (offline?). Showing the diagram source instead.');
      }
      return;
    }
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: theme === 'dark' ? 'dark' : 'neutral' });
    for (const fig of todo) {
      const code = (fig.querySelector('.mkd-diagram__src code') || {}).textContent || '';
      const canvas = fig.querySelector('.mkd-diagram__canvas');
      const id = `mkd-mermaid-${mermaidSeq += 1}`;
      try {
        const out = await mermaid.render(id, code);
        canvas.innerHTML = out.svg;
        fig.dataset.renderedTheme = theme;
        fig.classList.add('is-rendered');
      }
      catch {
        const stray = document.getElementById(`d${id}`) || document.getElementById(id);
        if (stray && !fig.contains(stray)) {
          stray.remove();
        }
        diagramFallback(fig, 'This diagram has a syntax error. Showing its source instead.');
      }
    }
  }

  function dropBrokenImage(img) {
    const card = img.closest('.mkd-linkcard');
    if (card) {
      card.classList.remove('has-image');
    }
    // A large option preview without its picture collapses to a stray line:
    // name what is missing. The box still opens the viewer.
    const shot = img.closest('.mkd-opt__shot');
    if (shot) {
      const chip = el('span', 'mkd-opt__chip');
      chip.textContent = shot.querySelector('.mkd-opt__play') ? 'Video preview not available' : 'Image not available';
      shot.replaceChildren(chip);
      return;
    }
    img.remove();
  }

  function wireMedia() {
    for (const carousel of document.querySelectorAll('.mkd-stage .mkd-carousel')) {
      initCarousel(carousel);
    }
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!target || !target.closest) {
        return;
      }
      const zoom = target.closest('[data-lightbox]');
      if (zoom && !lightbox.contains(zoom)) {
        const fig = zoom.closest('figure');
        const block = fig ? fig.closest('.mkd-card__media') : null;
        if (fig && block) {
          // Every figure of the block, so the arrows move through them.
          const entries = blockSlides(block);
          const start = Math.max(0, entries.findIndex(entry => entry.fig === fig));
          openViewer(entries.map(entry => entry.slide), start, fig.classList.contains('mkd-diagram') ? 'Diagram' : 'Media', fig.closest('.mkd-card'));
        }
        else if (fig) {
          openViewer([slideFromFigure(fig, {})], 0, 'Media', fig.closest('.mkd-card'));
        }
        return;
      }
      const optMedia = target.closest('[data-opt-media]');
      if (optMedia) {
        openOptionMedia(optMedia.closest('.mkd-card'));
      }
    });
    // A pointer click on an option's preview opens the viewer instead of
    // picking the option (capture phase: the option button never sees it).
    document.addEventListener('click', (event) => {
      const target = event.target;
      const shot = target && target.closest ? target.closest('.mkd-opt [data-opt-zoom]') : null;
      if (!shot) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const opt = shot.closest('.mkd-opt[data-opt-key]');
      openOptionMedia(shot.closest('.mkd-card'), opt.getAttribute('data-opt-key'), Number(shot.getAttribute('data-opt-zoom')));
    }, true);
    hydratePool(document);
    wireViewer();
    // A remote image the page cannot reach (offline, or a CSP that blocks it)
    // disappears instead of leaving a broken icon.
    document.addEventListener('error', (event) => {
      const img = event.target;
      if (img && img.tagName === 'IMG' && img.hasAttribute('data-remote')) {
        dropBrokenImage(img);
      }
    }, true);
    if (lightbox) {
      lightbox.addEventListener('close', () => {
        // Removing the content stops any video or embed playing inside it.
        lightboxBody.textContent = '';
        viewer.img = null;
        viewer.slides = [];
        viewer.pointers.clear();
        lightbox.classList.remove('is-zoomed', 'is-image');
      });
      // Close on a click OUTSIDE the panel: the dialog element is also the
      // target for its own padding, so test the pointer against its box.
      lightbox.addEventListener('click', (event) => {
        if (event.target !== lightbox) {
          return;
        }
        const box = lightbox.getBoundingClientRect();
        const outside = event.clientX < box.left || event.clientX > box.right
          || event.clientY < box.top || event.clientY > box.bottom;
        if (outside) {
          closeLightbox();
        }
      });
    }
    if (lightboxClose) {
      lightboxClose.addEventListener('click', closeLightbox);
    }
    try {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        if (!readStoredTheme()) {
          renderVisibleDiagrams();
        }
      });
    }
    catch {
      // Old browsers without MediaQueryList events: the toggle still re-renders.
    }
  }

  // --------------------------------------------------------------------------
  // DECK NAVIGATION
  // --------------------------------------------------------------------------

  /**
   * `fromKeyboard`: keyboard-driven moves skip the card entrance animation
   * (a keystroke repeated many times must feel instant).
   */
  function go(target, fromKeyboard) {
    const clamped = Math.max(-1, Math.min(target, items.length));
    cancelAutoAdvance();
    closeMore();
    if (appRoot) {
      if (fromKeyboard) {
        appRoot.setAttribute('data-nav', 'key');
      }
      else {
        appRoot.removeAttribute('data-nav');
      }
    }
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
    measureClamps();
    syncCardMedia();
  }

  /**
   * Compact decisions clamp each justification; when any of them actually
   * overflows on the current card, offer one "Show full justifications" switch
   * (a button cannot live inside the option button itself).
   */
  function measureClamps() {
    const card = document.querySelector('.mkd-card.is-current');
    const list = card ? card.querySelector('.mkd-opts.is-dense') : null;
    if (!list) {
      return;
    }
    let toggle = card.querySelector('.mkd-opts__expand');
    if (!toggle) {
      toggle = el('button', 'mkd-opts__expand', { 'type': 'button', 'aria-expanded': 'false' });
      toggle.textContent = 'Show full justifications';
      toggle.addEventListener('click', () => {
        const open = list.classList.toggle('is-expanded');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.textContent = open ? 'Shorten justifications' : 'Show full justifications';
      });
      list.parentNode.insertBefore(toggle, list);
    }
    if (list.classList.contains('is-expanded')) {
      toggle.hidden = false;
      return;
    }
    const clipped = [...list.querySelectorAll('.mkd-opt__just')]
      .some(just => just.scrollHeight > just.clientHeight + 1);
    toggle.hidden = !clipped;
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

  // --------------------------------------------------------------------------
  // ACTION BAR — Previous / Skip / Next live in the sticky footer, always in
  // reach; the per-card duplicates are gone.
  // --------------------------------------------------------------------------

  function skipCurrent(fromKeyboard) {
    const item = items[idx];
    if (!item) {
      return;
    }
    const entry = state[item.id];
    entry.skipped = true;
    if (item.type === 'decision') {
      entry.chosen = null;
      syncDecisionUI(item);
    }
    go(idx + 1, fromKeyboard);
  }

  /** A decision cannot move on until it has an option (or is skipped). */
  function nextBlocked() {
    const item = items[idx];
    return Boolean(item && item.type === 'decision' && state[item.id].chosen === null && !state[item.id].skipped);
  }

  function goNext(fromKeyboard) {
    if (idx === items.length) {
      requestSend();
      return;
    }
    if (nextBlocked()) {
      return;
    }
    go(idx + 1, fromKeyboard);
  }

  function renderBarNav() {
    if (!nextBtn || !prevBtn || !skipBtn) {
      return;
    }
    const onIntro = idx === -1;
    const onSummary = idx === items.length;
    prevBtn.hidden = onIntro;
    skipBtn.hidden = onIntro || onSummary;
    const blocked = nextBlocked();
    nextBtn.disabled = blocked || (onSummary && submitting);
    let label = 'Next \u2192';
    if (onIntro) {
      label = 'Start \u2192';
    }
    else if (onSummary) {
      label = canSubmit ? spec.submitLabel : 'Copy JSON';
    }
    else if (idx === items.length - 1) {
      label = 'Finish \u2192';
    }
    nextBtn.textContent = label;
    // Idle until the current item has an answer, then the primary call to action.
    const item = items[idx];
    const ready = onIntro || onSummary || (item && itemStatus(item) === 'answered');
    nextBtn.classList.toggle('is-idle', !ready);
  }

  function buildIntroNav() {
    // In --wait / artifact mode the intro's closing line should point at the
    // submit button rather than copy-paste.
    if (canSubmit) {
      const finishLine = byId('mkd-legend-finish');
      if (finishLine) {
        finishLine.textContent = `When you are done, press "${spec.submitLabel}" on the last screen to send your answers back.`;
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
      { n: stats.recFollowed, label: 'recommendations followed', rec: true },
      { n: stats.overridden, label: 'recommendations changed', rec: true },
      { n: stats.custom, label: 'custom decisions' },
      { n: stats.skipped, label: 'skipped' },
    ];
    for (const tile of tileData) {
      const box = el('div', tile.rec ? 'mkd-tile mkd-tile--rec' : 'mkd-tile');
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
    legend.textContent = canSubmit
      ? `Last step: press "${spec.submitLabel}" below. Skipped items stay as "skipped": decide later, not a rejection.`
      : 'Last step: press "Copy JSON" below and paste it into the chat. Skipped items stay as "skipped": decide later, not a rejection.';
    summaryCard.appendChild(legend);
  }

  /** The summary chip describing an item's outcome. */
  function summaryChip(item) {
    const entry = state[item.id];
    const status = itemStatus(item);
    const chip = el('span', 'mkd-chip');

    if (status === 'skipped') {
      chip.classList.add('mkd-chip--muted');
      chip.textContent = 'skipped';
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
      chip.textContent = option ? option.label : String(entry.chosen);
      if (option && option.recommended) {
        const star = el('span', 'mkd-rec-star', { 'aria-label': 'recommended' });
        star.textContent = ' \u2605';
        chip.appendChild(star);
      }
      return chip;
    }
    chip.classList.add('mkd-chip--pick');
    chip.textContent = 'answered';
    return chip;
  }

  // --------------------------------------------------------------------------
  // BUILD: per-type interactive parts
  // --------------------------------------------------------------------------

  function buildItem(item) {
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
      customInput.addEventListener('focus', cancelAutoAdvance);
      customInput.addEventListener('input', () => {
        entry.customText = customInput.value;
        refreshAll();
        saveState();
      });
    }

    if (canPasteImages) {
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
    cancelAutoAdvance();
    if (autoAdvance && entry.chosen !== null && entry.chosen !== CUSTOM_KEY) {
      scheduleAutoAdvance();
    }
  }

  // ---- auto-advance (optional, off by default) ----

  const AUTO_ADVANCE_KEY = 'mkd-view-auto-advance';
  const AUTO_ADVANCE_MS = 900;
  let autoAdvance = false;
  let autoTimer = null;

  /** The pending move shows as a fill sweeping across Next; any edit cancels it. */
  function scheduleAutoAdvance() {
    const from = idx;
    if (nextBtn) {
      nextBtn.style.setProperty('--mkd-auto-ms', `${AUTO_ADVANCE_MS}ms`);
      nextBtn.classList.add('is-advancing');
    }
    autoTimer = window.setTimeout(() => {
      autoTimer = null;
      if (nextBtn) {
        nextBtn.classList.remove('is-advancing');
      }
      if (idx === from && !nextBlocked()) {
        go(idx + 1);
      }
    }, AUTO_ADVANCE_MS);
  }

  function cancelAutoAdvance() {
    if (autoTimer !== null) {
      window.clearTimeout(autoTimer);
      autoTimer = null;
    }
    if (nextBtn) {
      nextBtn.classList.remove('is-advancing');
    }
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
    input.addEventListener('focus', cancelAutoAdvance);
    input.addEventListener('input', () => {
      cancelAutoAdvance();
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
    if (canPasteImages) {
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
    if (canPasteImages) {
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
    if (canPasteImages) {
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

  /** Native auto-grow where supported; the scrollHeight path is the fallback. */
  const nativeFieldSizing = typeof CSS !== 'undefined'
    && typeof CSS.supports === 'function'
    && CSS.supports('field-sizing', 'content');

  function autoGrowExpandInput() {
    if (!expandInput || nativeFieldSizing) {
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
    const done = stats.answered + stats.skipped;
    const pending = stats.total - done;
    if (progressBar) {
      progressBar.value = done;
    }
    if (countDone) {
      countDone.textContent = String(done);
    }
    if (countPending) {
      countPending.textContent = `${pending} pending`;
      countPending.classList.toggle('is-zero', pending === 0);
    }
    if (jumpBtn) {
      jumpBtn.hidden = pending === 0 || firstPendingIndex() === idx;
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
    renderBarNav();
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
      copyBtn.textContent = copied ? 'Copied! Paste it in the chat' : 'Copy failed: select the JSON below';
      copyBtn.classList.add('is-copied');
      setTimeout(() => {
        copyBtn.textContent = 'Copy JSON';
        copyBtn.classList.remove('is-copied');
      }, 2400);
    }
  }

  // ---- pending items + send confirmation ----

  function firstPendingIndex() {
    return items.findIndex(item => itemStatus(item) === 'pending');
  }

  function isConfirmOpen() {
    return Boolean(confirmDialog && confirmDialog.open);
  }

  /** The real send action: submit (wait/artifact) or copy the JSON (copy mode). */
  function performSend() {
    if (canSubmit) {
      void submit();
    }
    else {
      void copyJson();
    }
  }

  /**
   * Every path to Send (footer button, summary CTA, Cmd/Ctrl+Enter) lands
   * here: with items still pending, ask first in a modal dialog.
   */
  function requestSend() {
    if (isConfirmOpen() || submitting) {
      return;
    }
    if (canSubmit && items.some(item => !itemSatisfied(item))) {
      return;
    }
    const stats = computeStats();
    const pending = stats.total - stats.answered - stats.skipped;
    if (pending === 0) {
      performSend();
      return;
    }
    const noun = pending === 1 ? 'item has' : 'items have';
    const action = canSubmit ? `"${spec.submitLabel}"` : '"Copy JSON"';
    const message = `${pending} of ${stats.total} ${noun} no answer yet. They will go back as "pending". Use ${action} anyway, or review them first?`;
    if (!confirmDialog || typeof confirmDialog.showModal !== 'function') {
      if (window.confirm(message)) {
        performSend();
      }
      return;
    }
    if (confirmBody) {
      confirmBody.textContent = message;
    }
    confirmDialog.returnValue = '';
    confirmDialog.showModal();
  }

  /**
   * "Send anyway" sends inside the click itself: copy mode writes to the
   * clipboard, and WebKit only allows that within the user gesture, which a
   * later `close` event no longer carries.
   */
  function onConfirmSend(event) {
    event.preventDefault();
    confirmDialog.returnValue = '';
    confirmDialog.close();
    performSend();
  }

  function onConfirmClose() {
    const choice = confirmDialog.returnValue;
    confirmDialog.returnValue = '';
    if (choice === 'review') {
      const target = firstPendingIndex();
      if (target >= 0) {
        go(target);
      }
    }
  }

  // ---- --wait / artifact submit ----

  let submitting = false;

  async function submit() {
    if (!canSubmit || submitting) {
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
      if (mode === 'artifact') {
        const notified = await sendToArtifact(result);
        showDone(notified
          ? 'Sent. Claude has your answers and is picking them up.'
          : 'Saved, but Claude was not notified. Tell Claude in the chat that the deck is answered.', notified);
        return;
      }
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
        submitError.textContent = mode === 'artifact'
          ? artifactErrorMessage(error)
          : 'Could not submit. Check the terminal is still running and try again.';
        submitError.hidden = false;
      }
      refreshAll();
      console.error('mkd: submit failed', error);
    }
  }

  /** Thrown when this view cannot run the artifact `db` capability. */
  const NO_DB = 'mkd:no-db';

  /**
   * Artifact mode: store the result in the artifact's database, then post a
   * "Send to Agent" comment so the Claude Code session watching the
   * artifact wakes up and reads it. Resolves whether Claude was notified;
   * rejects only when the answers could NOT be saved. The notice is
   * best-effort: once the db write lands the answers are safe, and Claude
   * can still be told in the chat.
   */
  async function sendToArtifact(result) {
    const runtime = window.claude;
    const db = runtime && typeof runtime.use === 'function' ? await runtime.use('db') : null;
    if (!db || !resultDoc) {
      throw new Error(NO_DB);
    }
    await db.doc(resultDoc).set({
      session: spec.session || '',
      submittedAt: result.submittedAt,
      result: JSON.stringify(result),
    });

    try {
      const comments = await runtime.use('comments');
      if (!comments || (await comments.canSendToClaude()) !== 'available') {
        return false;
      }
      const s = result.stats;
      const anchor = await comments.anchorFor(submitBtn || document.body);
      await comments.sendToClaude({
        anchor,
        text: `Deck answered: ${s.answered} answered, ${s.skipped} skipped of ${s.total}. Result JSON is in the db document ${resultDoc} (field "result").`,
      });
      return true;
    }
    catch (error) {
      console.warn('mkd: could not notify Claude', error);
      return false;
    }
  }

  /** User-facing reason an artifact submit failed (answers NOT saved). */
  function artifactErrorMessage(error) {
    if (error instanceof Error && error.message === NO_DB) {
      return 'Sending is not available in this view. Press "Copy JSON" and paste it into the chat.';
    }
    const code = error && typeof error.code === 'string' ? error.code : '';
    if (code === 'not_granted' || code === 'revoked' || code === 'capability_disabled' || code === 'capability_removed') {
      return 'Saving is not available in this view. Press "Copy JSON" and paste it into the chat.';
    }
    return `Could not save your answers${code ? ` (${code})` : ''}. Try again, or press "Copy JSON" and paste it into the chat.`;
  }

  /**
   * Artifact mode only: the wake-up can be declined unattended, so the page
   * tells the user the one word that makes Claude read the saved answers.
   * Inline styles on purpose: the shared CSS is hash-pinned for copy/wait.
   */
  function showWakeHint() {
    if (!doneEl || doneEl.querySelector('.mkd-done__hint')) {
      return;
    }
    const message = doneEl.textContent;
    doneEl.textContent = '';
    const line = document.createElement('div');
    line.textContent = message;
    const hint = document.createElement('p');
    hint.className = 'mkd-done__hint';
    hint.style.cssText = 'margin:0.75rem 0 0;font-size:0.95rem;font-weight:400;opacity:0.8;max-width:34rem';
    hint.textContent = 'If Claude does not answer within a minute, type "listo" in the chat: your answers are saved.';
    doneEl.style.flexDirection = 'column';
    doneEl.append(line, hint);
  }

  function showDone(message, wakeHint) {
    if (doneEl) {
      if (message) {
        doneEl.textContent = message;
      }
      if (mode === 'artifact' && wakeHint) {
        showWakeHint();
      }
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

  function isInteractiveTarget(target) {
    return Boolean(target && target.closest && target.closest('button, a[href], summary, select, label'));
  }

  /**
   * Digits pick the option at that SCREEN position on the current card (the
   * custom option is the last slot), so they follow a shuffle. Questions map
   * digits onto their choice inputs the same way.
   */
  function pickByPosition(n) {
    const card = document.querySelector('.mkd-card.is-current');
    if (!card || idx < 0 || idx >= items.length) {
      return false;
    }
    const item = items[idx];
    if (item.type === 'decision') {
      const slot = card.querySelectorAll('.mkd-opt[data-opt-key]')[n - 1];
      if (!slot) {
        return false;
      }
      selectOption(item, slot.getAttribute('data-opt-key'));
      return true;
    }
    if (item.type === 'question') {
      const input = card.querySelectorAll('.mkd-controls input[type="radio"], .mkd-controls input[type="checkbox"]')[n - 1];
      if (!input) {
        return false;
      }
      input.click();
      return true;
    }
    return false;
  }

  /** True when the target is a field where keystrokes must not navigate. */
  function isTypingTarget(target) {
    if (!target || !target.tagName) {
      return false;
    }
    const tag = target.tagName;
    if (tag === 'INPUT') {
      return !/^(checkbox|radio|button|submit|reset|range|color|file)$/i.test(target.type || '');
    }
    return tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
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
        if (canSubmit) {
          void copyJson();
        }
        else {
          requestSend();
        }
      });
    }
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        requestSend();
      });
    }
    if (confirmDialog) {
      confirmDialog.addEventListener('close', onConfirmClose);
    }
    if (confirmSend) {
      confirmSend.addEventListener('click', onConfirmSend);
    }
    if (jumpBtn) {
      jumpBtn.addEventListener('click', () => {
        const target = firstPendingIndex();
        if (target >= 0) {
          go(target);
        }
      });
    }
    if (hideRecToggle) {
      hideRecToggle.addEventListener('change', () => {
        applyHideRec(hideRecToggle.checked);
        writeFlag(VIEW_HIDE_REC_KEY, hideRecToggle.checked);
        if (idx === items.length) {
          renderSummary();
        }
      });
    }
    if (shuffleBtn) {
      shuffleBtn.addEventListener('click', reshuffle);
    }
    if (unshuffleBtn) {
      unshuffleBtn.addEventListener('click', restoreAuthorOrder);
    }
    if (themeToggle) {
      themeToggle.addEventListener('click', toggleTheme);
    }
    if (prevBtn) {
      prevBtn.addEventListener('click', () => go(idx - 1));
    }
    if (skipBtn) {
      skipBtn.addEventListener('click', () => skipCurrent(false));
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => goNext(false));
    }
    if (autoAdvanceToggle) {
      autoAdvanceToggle.addEventListener('change', () => {
        autoAdvance = autoAdvanceToggle.checked;
        writeFlag(AUTO_ADVANCE_KEY, autoAdvance);
        if (!autoAdvance) {
          cancelAutoAdvance();
        }
      });
    }
    if (moreBtn) {
      moreBtn.addEventListener('click', () => {
        if (barEl && barEl.classList.contains('is-more-open')) {
          closeMore();
        }
        else {
          openMore();
        }
      });
      document.addEventListener('click', (event) => {
        if (barEl && barEl.classList.contains('is-more-open') && !barEl.contains(event.target)) {
          closeMore();
        }
      });
    }
    watchOnScreenKeyboard();

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

      if (canPasteImages) {
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
      // The native modals handle their own keys (Esc, Tab, Enter on a button).
      if (isConfirmOpen() || isLightboxOpen()) {
        return;
      }
      // A focused carousel owns its arrow keys (handled on the carousel).
      if (event.target && event.target.closest && event.target.closest('.mkd-carousel')) {
        return;
      }
      if (event.key === 'Escape') {
        cancelAutoAdvance();
        if (barEl && barEl.classList.contains('is-more-open')) {
          closeMore();
          if (moreBtn) {
            moreBtn.focus();
          }
          return;
        }
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
        requestSend();
        return;
      }
      // Deck keys: never while typing, inside a popover/panel, or with a modifier.
      if (isTypingTarget(event.target) || currentRowPopKey || (expand && !expand.hidden)) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key === 'ArrowRight' && idx < items.length) {
        goNext(true);
        return;
      }
      // Enter on a focused control keeps its native meaning (press that control),
      // except on the option already chosen: there it means "next", not "unpick".
      const onChosen = event.target && event.target.classList
        && event.target.classList.contains('mkd-opt') && event.target.classList.contains('is-selected');
      if (event.key === 'Enter' && (onChosen || !isInteractiveTarget(event.target)) && idx < items.length) {
        event.preventDefault();
        goNext(true);
        return;
      }
      if (event.key === 'ArrowLeft' && idx > -1) {
        go(idx - 1, true);
        return;
      }
      if ((event.key === 's' || event.key === 'S') && idx >= 0 && idx < items.length) {
        event.preventDefault();
        skipCurrent(true);
        return;
      }
      if ((event.key === 'v' || event.key === 'V') && openCurrentMedia()) {
        event.preventDefault();
        return;
      }
      if (/^[1-9]$/.test(event.key) && pickByPosition(Number(event.key))) {
        event.preventDefault();
        return;
      }
      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        toggleKbd();
      }
    });
  }

  // ---- mobile overflow ("More actions") + on-screen keyboard ----

  function openMore() {
    if (barEl && moreBtn) {
      barEl.classList.add('is-more-open');
      moreBtn.setAttribute('aria-expanded', 'true');
    }
  }

  function closeMore() {
    if (barEl && moreBtn) {
      barEl.classList.remove('is-more-open');
      moreBtn.setAttribute('aria-expanded', 'false');
    }
  }

  /**
   * While the on-screen keyboard is up (visual viewport much shorter than the
   * layout viewport, with a field focused) the fixed bar would float over the
   * text being typed, so it steps aside instead of jumping around.
   */
  function watchOnScreenKeyboard() {
    const vv = window.visualViewport;
    if (!vv || !appRoot) {
      return;
    }
    const check = () => {
      const typing = isTypingTarget(document.activeElement);
      const open = typing && vv.height < window.innerHeight * 0.8;
      appRoot.classList.toggle('is-kb-open', open);
    };
    vv.addEventListener('resize', check);
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', () => window.setTimeout(check, 0));
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
      { action: 'Pick option by position (A = 1)', keys: ['1', '\u2026', '6'] },
      { action: 'Next screen', keys: ['Enter'] },
      { action: 'Previous / next screen', keys: ['\u2190', '\u2192'] },
      { action: 'Skip for now', keys: ['S'] },
      { action: 'View media full screen (then \u2190 \u2192, + -, Z = 1:1, Enter = choose, Esc)', keys: ['V'] },
      { action: canSubmit ? 'Submit answers' : 'Copy the result JSON', keys: [modKey, 'Enter'] },
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

    items.forEach((item) => {
      if (state[item.id]) {
        buildItem(item);
      }
    });
    applyHideRec(readFlag(VIEW_HIDE_REC_KEY));
    autoAdvance = readFlag(AUTO_ADVANCE_KEY);
    if (autoAdvanceToggle) {
      autoAdvanceToggle.checked = autoAdvance;
    }
    lastShuffle = loadShuffleOrder();
    if (lastShuffle && readFlag(SHUFFLE_ACTIVE_KEY)) {
      shuffleOrder = lastShuffle;
      applyShuffle(true);
    }
    buildIntroNav();
    buildKbdLegend();
    wireGlobals();
    wireMedia();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  }
  else {
    init();
  }
})();
