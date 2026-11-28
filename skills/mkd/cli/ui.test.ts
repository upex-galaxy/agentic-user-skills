/**
 * Tests for single functions of the browser script. `ui/app.js` is one closure
 * served verbatim, so each test lifts the functions it needs out of the source
 * and runs them against stand-ins for the few page objects they touch.
 */

import { describe, expect, it } from 'bun:test';
import APP_JS from './ui/app.js' with { type: 'text' };

/** The named top-level functions of app.js, closed over the given globals. */
function lift(names: string[], globals: Record<string, unknown>): Record<string, (...args: unknown[]) => unknown> {
  const source = names.map((name) => {
    const found = new RegExp(`^ {2}function ${name}\\([\\s\\S]*?^ {2}\\}$`, 'm').exec(APP_JS);
    if (!found) {
      throw new Error(`app.js has no function ${name}`);
    }
    return found[0];
  }).join('\n');
  // The functions only exist as text inside the served script.
  // eslint-disable-next-line no-new-func, ts/no-implied-eval
  const build = new Function(...Object.keys(globals), `${source}\nreturn { ${names.join(', ')} };`) as (...args: unknown[]) => Record<string, (...args: unknown[]) => unknown>;
  return build(...Object.values(globals));
}

describe('a remote picture that fails to load', () => {
  function broken(inShot: boolean, video = false) {
    const log: string[] = [];
    const shot = {
      querySelector: () => (video ? {} : null),
      replaceChildren: (chip: { className: string, textContent: string }) => log.push(`${chip.className}: ${chip.textContent}`),
    };
    const img = {
      closest: (selector: string) => (inShot && selector === '.mkd-opt__shot' ? shot : null),
      remove: () => log.push('removed'),
    };
    const { dropBrokenImage } = lift(['dropBrokenImage'], { el: (_tag: string, className: string) => ({ className, textContent: '' }) });
    dropBrokenImage(img);
    return log;
  }

  it('is removed', () => {
    expect(broken(false)).toEqual(['removed']);
  });

  it('leaves a labelled chip in a large option preview instead of an empty box', () => {
    expect(broken(true)).toEqual(['mkd-opt__chip: Image not available']);
    expect(broken(true, true)).toEqual(['mkd-opt__chip: Video preview not available']);
  });
});

describe('pending items confirmation', () => {
  function ask(answered: number, total: number): string {
    const confirmBody = { textContent: '' };
    const { requestSend } = lift(['requestSend'], {
      isConfirmOpen: () => false,
      submitting: false,
      canSubmit: false,
      items: [],
      computeStats: () => ({ total, answered, skipped: 0 }),
      performSend: () => {},
      spec: {},
      confirmBody,
      confirmDialog: { showModal: () => {} },
    });
    requestSend();
    return confirmBody.textContent.split(' no answer')[0];
  }

  it('agrees the noun with the total and the verb with the pending count', () => {
    expect(ask(1, 2)).toBe('1 of 2 items has');
    expect(ask(0, 2)).toBe('2 of 2 items have');
    expect(ask(0, 1)).toBe('1 of 1 item has');
  });
});

describe('viewer focus', () => {
  function stage() {
    const focused: string[] = [];
    const control = (name: string) => ({
      name,
      disabled: false,
      isConnected: true,
      shown: true,
      getClientRects() {
        return this.shown ? [{}] : [];
      },
      focus() {
        focused.push(this.name);
      },
    });
    const nodes = {
      lbPrev: control('prev'),
      lbNext: control('next'),
      lbZoomIn: control('zoomIn'),
      lbZoomOut: control('zoomOut'),
      lightboxBody: control('stage'),
    };
    const { keepViewerFocus } = lift(['isFocusable', 'keepViewerFocus'], { ...nodes, isLightboxOpen: () => true });
    return { ...nodes, control, focused, keep: keepViewerFocus };
  }

  it('leaves focus alone on a live control', () => {
    const s = stage();
    s.keep(s.lbNext);
    expect(s.focused).toEqual([]);
  });

  it('moves from a disabled arrow or zoom button to its counterpart', () => {
    const s = stage();
    for (const node of [s.lbNext, s.lbPrev, s.lbZoomIn, s.lbZoomOut]) {
      node.disabled = true;
      s.keep(node);
      node.disabled = false;
    }
    expect(s.focused).toEqual(['prev', 'next', 'zoomOut', 'zoomIn']);
  });

  it('falls back to the stage: counterpart dead too, control hidden, or removed', () => {
    const s = stage();
    s.lbZoomIn.disabled = true;
    s.lbZoomOut.disabled = true;
    s.keep(s.lbZoomIn);
    const original = s.control('original');
    original.shown = false;
    s.keep(original);
    const link = s.control('link in a slide');
    link.isConnected = false;
    s.keep(link);
    const choose = s.control('choose');
    choose.disabled = true;
    s.keep(choose);
    expect(s.focused).toEqual(['stage', 'stage', 'stage', 'stage']);
  });

  it('is applied wherever the viewer disables, hides or removes controls', () => {
    for (const name of ['showSlide', 'applyTransform']) {
      const body = new RegExp(`^ {2}function ${name}\\([\\s\\S]*?^ {2}\\}$`, 'm').exec(APP_JS)?.[0] ?? '';
      expect(body).toContain('const held = heldViewerFocus();');
      expect(body).toContain('keepViewerFocus(held);');
    }
  });
});
