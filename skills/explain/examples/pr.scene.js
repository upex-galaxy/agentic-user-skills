// Reference example (sketch, ~58 s, 8 scenes): how a change travels through a GitHub pull request.
// Shows the usual recipe: titleCard opening, one idea per scene with a sectionTag, folderTree + codeBlock side by side,
// a flow for CI checks, a table for the merge options, a short recap. Facts are generic and carry a sourceFooter.
export const title = 'Cómo viaja un cambio en un pull request';
export const style = 'sketch'; // used when neither --style nor explain.json picks one

const SRC = 'docs.github.com';
const TOTAL = 8;

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'portada',
      dur: 5.5,
      transition: { type: 'light-sweep', dur: 0.6 },
      build(s) {
        s.sectionTag({ index: 1, total: TOTAL, name: 'Introducción', at: 0.1 });
        s.titleCard({ id: 'hero', title: 'Cómo viaja un cambio en un pull request', subtitle: 'De la rama al merge, paso a paso', at: 0.4, h: 460 });
      },
    }),
    scene({
      name: 'rama',
      dur: 8,
      build(s) {
        s.sectionTag({ index: 2, total: TOTAL, name: 'Rama y commits', at: 0.1 });
        s.heading({ text: 'Todo empieza en una rama' });
        s.row([{ id: 'main', w: 440, h: 380 }, { id: 'branch', w: 440, h: 380 }, { id: 'commits', w: 440, h: 380 }], { gap: 160 });
        s.node({ id: 'main', text: 'Rama main', at: 0.8, color: 'dim' });
        s.node({ id: 'branch', text: 'Rama nueva del cambio', at: 1.6, color: 'accent' });
        s.node({ id: 'commits', text: 'Commits con mensaje', at: 2.4, color: 'accent2' });
        s.edge({ from: 'main', to: 'branch', at: 1.2, color: 'ink' });
        s.edge({ from: 'branch', to: 'commits', at: 2.0, color: 'ink' });
        s.travelDot({ path: ['main', 'branch', 'commits'], at: 3.2, dur: 2.0 });
        s.label({ id: 'cap', text: 'La rama aísla el trabajo; cada commit guarda un paso.', place: { to: 'branch', side: 'bottom', gap: 110 }, w: 1500, h: 90, type: true, typeAt: 3.4, color: 'dim' });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'diff',
      dur: 9.5,
      build(s) {
        s.sectionTag({ index: 3, total: TOTAL, name: 'Qué cambió', at: 0.1 });
        s.heading({ text: 'Los archivos y el diff' });
        s.folderTree({
          id: 'files',
          area: { x: 80, y: 244, w: 700, h: 636 },
          root: 'mi-app',
          data: { 'src': { auth: { 'clave.ts': null, 'sesion.ts': null } }, 'tests': { 'clave.test.ts': null }, 'README.md': null },
          at: 0.7,
          step: 0.3,
          highlight: ['mi-app/src/auth/clave.ts', 'mi-app/tests/clave.test.ts'],
          hlAt: 3.6,
          hlStep: 1.8,
        });
        s.codeBlock({
          id: 'diff',
          title: 'clave.ts',
          area: { x: 820, y: 244, w: 1020, h: 636 },
          lines: [
            '  function validar(clave) {',
            '-   if (clave.length < 6) {',
            '+   if (clave.length < 8) {',
            '      return "muy corta";',
            '    }',
            '  }',
          ],
          at: 1.2,
          typeDur: 2.2,
          highlights: [{ lines: [2, 3], at: 4.2 }],
        });
        s.caption({ text: 'El diff marca líneas quitadas y líneas agregadas.', at: 5.6, until: 9.2 });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'abrir-pr',
      dur: 8,
      build(s) {
        s.sectionTag({ index: 4, total: TOTAL, name: 'El pull request', at: 0.1 });
        s.heading({ text: 'Se abre el pull request' });
        s.row([{ id: 'title', w: 440, h: 380 }, { id: 'desc', w: 440, h: 380 }, { id: 'rev', w: 440, h: 380 }], { gap: 130 });
        s.group({ id: 'pr', children: ['title', 'desc', 'rev'], title: 'Pull request', at: 0.6, pad: 44 });
        s.node({ id: 'title', text: 'Título claro', at: 1.2, color: 'accent' });
        s.node({ id: 'desc', text: 'Por qué del cambio', at: 1.9, color: 'accent2' });
        s.node({ id: 'rev', text: 'Revisores asignados', at: 2.6, color: 'good' });
        s.pulse({ target: 'desc', at: 4.2, times: 2, dur: 1.2 });
        s.label({ id: 'cap', text: 'Aquí el cambio queda listo para discutirse.', place: { to: 'pr', side: 'bottom', gap: 80 }, w: 1500, h: 90, type: true, typeAt: 3.6, color: 'dim' });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'checks',
      dur: 9,
      build(s) {
        s.sectionTag({ index: 5, total: TOTAL, name: 'Checks de CI', at: 0.1 });
        s.heading({ text: 'Los checks corren solos' });
        s.flow({
          id: 'ci',
          steps: [{ text: 'Build', color: 'accent' }, { text: 'Pruebas', color: 'accent2' }, { text: 'Lint', color: 'warn' }, { text: 'Todo en verde', color: 'good' }],
          at: 0.6,
          per: 0.9,
          px: 62,
          dwell: 0.35,
        });
        s.caption({ text: 'Un check requerido en rojo bloquea el merge.', at: 5.8, until: 8.6 });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'revision',
      dur: 8,
      build(s) {
        s.sectionTag({ index: 6, total: TOTAL, name: 'Revisión', at: 0.1 });
        s.heading({ text: 'Alguien más lo revisa' });
        s.row([{ id: 'comment', w: 440, h: 380 }, { id: 'fix', w: 440, h: 380 }, { id: 'approve', w: 440, h: 380 }], { gap: 160 });
        s.node({ id: 'comment', text: 'El revisor comenta', at: 0.8, color: 'accent2' });
        s.node({ id: 'fix', text: 'El autor ajusta', at: 1.6, color: 'accent' });
        s.node({ id: 'approve', text: 'Aprobación', at: 2.4, color: 'good' });
        s.edge({ from: 'comment', to: 'fix', at: 1.2, color: 'ink' });
        s.edge({ from: 'fix', to: 'approve', at: 2.0, color: 'ink' });
        s.highlight({ target: 'approve', style: 'underline', at: 4.4, until: 6.6 });
        s.label({ id: 'cap', text: 'Se repite hasta que el revisor aprueba.', place: { to: 'fix', side: 'bottom', gap: 110 }, w: 1400, h: 90, type: true, typeAt: 3.2, color: 'dim' });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'merge',
      dur: 9,
      transition: { type: 'light-sweep', dur: 0.6 },
      build(s) {
        s.sectionTag({ index: 7, total: TOTAL, name: 'Merge', at: 0.1 });
        s.heading({ text: 'El merge trae el cambio a main' });
        s.table({
          id: 'opts',
          columns: ['Opción', 'Qué hace'],
          rows: [
            ['Merge commit', 'Conserva todos los commits'],
            ['Squash and merge', 'Junta todo en un solo commit'],
            ['Rebase and merge', 'Reaplica los commits sobre main'],
          ],
          at: 0.6,
          step: 0.7,
          highlight: { row: 1, at: 5.2 },
        });
        s.caption({ text: 'El equipo elige cuál usar en cada repositorio.', at: 6.0, until: 8.6 });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'cierre',
      dur: 6.5,
      build(s) {
        s.sectionTag({ index: 8, total: TOTAL, name: 'Resumen', at: 0.1 });
        s.heading({ text: 'En resumen' });
        s.stack([{ id: 'r1', w: 1400, h: 170 }, { id: 'r2', w: 1400, h: 170 }, { id: 'r3', w: 1400, h: 170 }], { gap: 50 });
        s.node({ id: 'r1', text: '1. Rama y commits', at: 0.6, color: 'accent', px: 64 });
        s.node({ id: 'r2', text: '2. PR con checks y revisión', at: 1.4, color: 'accent2', px: 64 });
        s.node({ id: 'r3', text: '3. Merge a main', at: 2.2, color: 'good', px: 64 });
      },
    }),
  ],
});
