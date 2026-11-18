// Screens demo (3 scenes, 28 s): an editor that types a change with marks, a highlight and a live edit; a terminal that
// runs git commands and scrolls; a diff view of the same change.
export const title = 'Pantallas de código: editor, terminal y diff';

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'editor',
      dur: 11,
      build(s) {
        s.sectionTag({ index: 1, total: 3, name: 'Pantallas', at: 0.1 });
        s.label({ id: 'heading', text: 'Escribimos el arreglo', rect: { x: 160, y: 120, w: 1600, h: 110 }, px: 90, font: 'display', at: 0.2 });
        s.editor({
          id: 'ed',
          rect: s.area,
          title: 'Editor',
          file: 'auth.ts',
          sidebar: ['src', '  auth.ts', '  session.ts', 'tests'],
          at: 0.4,
          typeAt: 1.6,
          cps: 30,
          lines: [
            'export function login(user: User) {',
            { text: '  const ok = check(user.pass);', mark: '-', at: 3.6 },
            { text: '  const ok = verify(user.pass, 12);', mark: '+', at: 3.6 },
            '  if (!ok) { throw new Error("bad pass"); }',
            '  return openSession(user.id); // 30 min',
            '}',
          ],
          highlights: [{ line: 3, at: 4.2, until: 10.2 }],
          edits: [{ line: 5, to: '  return openSession(user.id); // 60 min', at: 7.2 }],
          cursorLine: 6,
        });
      },
    }),
    scene({
      name: 'terminal',
      dur: 9,
      build(s) {
        s.sectionTag({ index: 2, total: 3, name: 'Pantallas', at: 0.1 });
        s.label({ id: 'heading', text: 'Probamos y guardamos', rect: { x: 160, y: 120, w: 1600, h: 110 }, px: 90, font: 'display', at: 0.2 });
        s.terminal({
          id: 'term',
          rect: s.area,
          title: 'zsh - proyecto',
          at: 0.4,
          typeAt: 1.2,
          cps: 26,
          steps: [
            { name: 'status', cmd: 'git status -s', out: [' M src/auth.ts', '?? tests/auth.test.ts'] },
            { name: 'test', cmd: 'bun test', out: ['auth.test.ts', '  login ok', '  login fails', '2 pass, 0 fail'], wait: 0.5, pause: 0.7 },
            { name: 'commit', cmd: 'git commit -am "fix: stronger login"', out: ['[main 4f2a9c1] fix: stronger login', ' 2 files changed'], wait: 0.4 },
          ],
        });
      },
    }),
    scene({
      name: 'diff',
      dur: 8,
      build(s) {
        s.sectionTag({ index: 3, total: 3, name: 'Pantallas', at: 0.1 });
        s.label({ id: 'heading', text: 'Qué cambió', rect: { x: 160, y: 120, w: 1600, h: 110 }, px: 90, font: 'display', at: 0.2 });
        s.diffView({
          id: 'diff',
          rect: s.area,
          file: 'src/auth.ts',
          stat: '+2 -2',
          at: 0.4,
          step: 0.35,
          lines: [
            { op: ' ', text: 'export function login(user: User) {' },
            { op: '-', text: '  const ok = check(user.pass);' },
            { op: '+', text: '  const ok = verify(user.pass, 12);' },
            { op: ' ', text: '  if (!ok) { throw new Error("bad pass"); }' },
            { op: '-', text: '  return openSession(user.id); // 30 min' },
            { op: '+', text: '  return openSession(user.id); // 60 min' },
            { op: ' ', text: '}' },
          ],
        });
      },
    }),
  ],
});
