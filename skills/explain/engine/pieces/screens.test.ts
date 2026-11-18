/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import { createEngine } from '../core.js';
import { runQA } from '../qa.js';
import { installRoughStub, makeStubCtx } from '../stub-ctx.ts';
import { hologram, sketch } from '../test-presets.ts';
import { basePieces } from './base.js';
import { pieces, tokenize } from './screens.js';

const build = (style: any, fn: (s: any) => void, dur = 12) => {
  const stub = makeStubCtx(0.55);
  if (style === sketch) { installRoughStub(stub.log); }
  const engine = createEngine({ canvas: stub.canvas, style, pieces: { ...basePieces, ...pieces }, spec: { scenes: [{ name: 't', dur, build: fn }] } });
  return { engine, stub };
};

/** Strings drawn by one render at t. */
const drawn = (h: { engine: any, stub: any }, t: number): string[] => {
  h.stub.log.length = 0;
  h.engine.render(t);
  return h.stub.log.filter((e: any[]) => e[0] === 'fillText').map((e: any[]) => String(e[1]));
};
const recs = (h: { engine: any }, t: number) => h.engine.sample(t)[0].records;
const AREA = { x: 80, y: 244, w: 1760, h: 636 };

describe('tokenize', () => {
  test('splits a line into syntax tokens and joins back to the line', () => {
    const line = 'const total = sum(items, 42); // done';
    const runs = tokenize(line);
    expect(runs.map((r: any) => r.text).join('')).toBe(line);
    const by = (text: string) => runs.find((r: any) => r.text.startsWith(text))?.color;
    expect(by('const')).toBe('keyword');
    expect(by('sum')).toBe('fn');
    expect(by('42')).toBe('number');
    expect(by('// done')).toBe('comment');
    expect(runs.every((r: any) => ['comment', 'string', 'keyword', 'number', 'type', 'fn', 'plain'].includes(r.color))).toBe(true);
  });

  test('strings, types, shell comments and unterminated strings', () => {
    expect(tokenize('name: "Ada"').find((r: any) => r.text.startsWith('"'))?.color).toBe('string');
    expect(tokenize('new User(id)').map((r: any) => r.color)).toEqual(['keyword', 'type', 'plain']);
    expect(tokenize('# note here')[0].color).toBe('comment');
    expect(tokenize('say "open').map((r: any) => r.text).join('')).toBe('say "open');
    expect(tokenize('')).toEqual([]);
    expect(tokenize('  indented')[0].text.startsWith('  ')).toBe(true);
  });
});

for (const style of [hologram, sketch]) {
  describe(`screens (${style.name})`, () => {
    test('editor: typing progress at fixed t, complete exactly at end', () => {
      let it: any;
      const h = build(style, (s: any) => {
        it = s.editor({ id: 'ed', rect: AREA, file: 'sum.ts', lines: ['const a = 1;', 'return a;'], at: 0, typeAt: 1, cps: 10 });
      });
      // 12 + 9 chars at 10 cps, 0.12 s between lines: line 1 ends at 2.2, line 2 starts 2.32 and ends at 3.22.
      expect(it.end).toBeCloseTo(3.22, 5);
      const mid = drawn(h, 1.6);
      expect(mid).toContain('const ');
      expect(mid.join('')).not.toContain('a = ');
      expect(drawn(h, 0.5)).not.toContain('const ');
      const done = drawn(h, it.end);
      expect(done).toEqual(expect.arrayContaining(['const ', 'a = ', '1', ';', 'return ', 'a;']));
      expect(drawn(h, it.end + 1)).toEqual(expect.arrayContaining(['const ', 'a = ', '1', ';', 'return ', 'a;']));
    });

    test('editor: lines registered, every string in texts(), QA text per line', () => {
      let it: any;
      let reg: any;
      const h = build(style, (s: any) => {
        reg = s.reg;
        it = s.editor({
          id: 'ed',
          rect: AREA,
          file: 'auth.ts',
          title: 'Editor',
          sidebar: ['src', '  auth.ts', '  db.ts'],
          lines: ['function login(user) {', { text: '  return old(user);', mark: '-', at: 2 }, { text: '  return check(user);', mark: '+', at: 2.5 }, '}'],
          edits: [{ line: 4, to: '} // ok', at: 6 }],
          highlights: [{ line: 3, at: 4, until: 8 }],
          at: 0,
        });
      });
      for (const n of [1, 2, 3, 4]) { expect(reg.has(`ed.l${n}`)).toBe(true); }
      expect(reg.has('ed.l5')).toBe(false);
      const texts = it.texts();
      for (const str of ['auth.ts', 'Editor', 'src', 'db.ts', 'function login(user) {', '  return old(user);', '  return check(user);', '} // ok']) { expect(texts).toContain(str); }
      const late = recs(h, 5).find((r: any) => r.id === 'ed');
      expect(late.container).toBe(true);
      expect(late.texts.map((x: any) => x.text)).toContain('  return check(user);');
      expect(late.texts.every((x: any) => !x.overflow)).toBe(true);
      // The edit replaces the line text for QA once it starts.
      expect(recs(h, 5).find((r: any) => r.id === 'ed').texts.map((x: any) => x.text)).toContain('}');
      expect(recs(h, 7).find((r: any) => r.id === 'ed').texts.map((x: any) => x.text)).toContain('} // ok');
      expect(recs(h, 7).find((r: any) => r.id === 'ed').texts.map((x: any) => x.text)).not.toContain('}');
      // '-' lines are existing code: shown before the typing starts.
      expect(recs(h, 1.5).find((r: any) => r.id === 'ed').texts.map((x: any) => x.text)).toContain('  return old(user);');
      // end covers the edit (6 + 0.4 erase + retype).
      expect(it.end).toBeGreaterThan(6.4);
    });

    test('terminal: scroll reports only the visible lines, marks by name and index', () => {
      let it: any;
      const h = build(style, (s: any) => {
        it = s.terminal({
          id: 'tm',
          rect: { x: 80, y: 244, w: 1000, h: 420 },
          title: 'zsh',
          steps: [
            { name: 'status', cmd: 'git status', out: ['On branch main', 'nothing to commit'] },
            { name: 'log', cmd: 'git log --oneline', out: ['a1b2c3 first', 'd4e5f6 second', 'g7h8i9 third', 'j0k1l2 fourth', 'm3n4o5 fifth', 'p6q7r8 sixth'], wait: 0.5, pause: 1 },
          ],
        });
      }, 20);
      expect(it.marks.status).toBeCloseTo(it.marks[0], 9);
      expect(it.marks.log).toBeCloseTo(it.marks[1], 9);
      expect(it.marks.log).toBeGreaterThan(it.marks.status);
      expect(it.end).toBeCloseTo(it.marks.log, 9);
      const texts = it.texts();
      for (const str of ['zsh', 'git status', 'a1b2c3 first', 'p6q7r8 sixth']) { expect(texts).toContain(str); }
      const early = recs(h, 3.0).find((r: any) => r.id === 'tm').texts.map((x: any) => x.text);
      expect(early).toContain('git status');
      expect(early).toContain('On branch main');
      const late = recs(h, it.end + 1).find((r: any) => r.id === 'tm').texts.map((x: any) => x.text);
      expect(late).toContain('p6q7r8 sixth');
      expect(late).not.toContain('git status');
      expect(late).not.toContain('On branch main');
      expect(late).toContain('zsh');
      expect(recs(h, it.end + 1).find((r: any) => r.id === 'tm').texts.every((x: any) => !x.overflow)).toBe(true);
    });

    test('terminal: the command types out and the output follows', () => {
      let it: any;
      const h = build(style, (s: any) => {
        it = s.terminal({ id: 'tm', rect: { x: 80, y: 244, w: 1000, h: 420 }, typeAt: 1, cps: 10, steps: [{ cmd: 'ls -la', out: ['total 4'], wait: 0.5 }] });
      });
      expect(drawn(h, 1.3).join('|')).not.toContain('ls -la');
      expect(drawn(h, 1.3)).toContain('ls ');
      expect(drawn(h, 1.7)).toContain('ls -la');
      expect(drawn(h, 1.9)).not.toContain('total 4');
      expect(drawn(h, it.end + 0.5)).toContain('total 4');
    });

    test('diffView: ops tint rows, rows registered, strings in texts()', () => {
      let it: any;
      let reg: any;
      const h = build(style, (s: any) => {
        reg = s.reg;
        it = s.diffView({
          id: 'df',
          rect: AREA,
          file: 'src/auth.ts',
          stat: '+2 -1',
          step: 0.2,
          at: 0,
          lines: [{ op: ' ', text: 'function login(user) {' }, { op: '-', text: '  return old(user);' }, { op: '+', text: '  return check(user);' }, { op: '+', text: '  // audit' }, { op: ' ', text: '}' }],
        });
      });
      for (const n of [1, 2, 3, 4, 5]) { expect(reg.has(`df.l${n}`)).toBe(true); }
      for (const str of ['src/auth.ts', '+2 -1', '  return old(user);', '  // audit']) { expect(it.texts()).toContain(str); }
      expect(it.end).toBeCloseTo(0.5 + 4 * 0.2 + 0.4, 9);
      // Added and removed rows draw their sign; context rows do not.
      const signs = drawn(h, it.end + 0.5).filter(x => x === '+' || x === '-');
      expect(signs.sort()).toEqual(['+', '+', '-']);
      // Rows slide in one by one: at 0.9 only the first rows exist.
      const early = recs(h, 0.9).find((r: any) => r.id === 'df').texts.map((x: any) => x.text);
      expect(early).toContain('function login(user) {');
      expect(early).not.toContain('}');
    });

    test('ellipsis keeps a too-long line inside the rect', () => {
      const long = `const message = "${'x'.repeat(120)}";`;
      const h = build(style, (s: any) => {
        s.editor({ id: 'ed', rect: { x: 80, y: 244, w: 700, h: 300 }, lines: [long], at: 0, typeAt: 0.5, cps: 200 });
        s.diffView({ id: 'df', rect: { x: 900, y: 244, w: 700, h: 300 }, lines: [{ op: '+', text: long }], at: 0 });
      });
      for (const id of ['ed', 'df']) {
        const r = recs(h, 5).find((x: any) => x.id === id);
        expect(r.texts.every((x: any) => !x.overflow)).toBe(true);
        expect(r.texts.some((x: any) => x.text.endsWith('…'))).toBe(true);
      }
    });

    test('hosted in a container, all three pass QA', () => {
      const h = build(style, (s: any) => {
        s.editor({ id: 'ed', rect: { x: 80, y: 244, w: 860, h: 636 }, file: 'app.ts', title: 'Editor', sidebar: ['app.ts', 'util.ts'], lines: ['import x from "x";', 'export const a = 1;'], at: 0.2, edits: [{ line: 2, to: 'export const a = 2;', at: 5 }], highlights: [{ line: 1, at: 3 }], cursorLine: 2 });
        s.terminal({ id: 'tm', rect: { x: 980, y: 244, w: 860, h: 300 }, steps: [{ cmd: 'bun test', out: ['2 pass'] }], at: 0.2 });
        s.diffView({ id: 'df', rect: { x: 980, y: 580, w: 860, h: 300 }, file: 'app.ts', lines: [{ op: '-', text: 'a = 1' }, { op: '+', text: 'a = 2' }], at: 0.4 });
      });
      const res = runQA(h.engine, [0.3, 1, 2, 4, 6, 8, 11], { determinism: false });
      expect(res.errors ?? res.issues ?? []).toEqual([]);
      expect(res.ok).toBe(true);
    });
  });
}
