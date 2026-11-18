// Reference example (any preset, ~68 s, 8 scenes): how a change travels through a GitHub pull request.
// Shows motion-graphics storytelling: kinetic opening, an editor typing the change, a terminal with packets to the cloud,
// a pull request page with a clicking pointer, a CI pipeline, a review conversation, a git graph for the merge and a
// journeyRail that tracks the story. Facts are generic and carry a sourceFooter.
export const title = 'Cómo viaja un cambio en un pull request';
export const preset = 'sketch';

const SRC = 'docs.github.com';
const STEPS = ['Rama', 'Diff', 'PR', 'Checks', 'Revisión', 'Merge'];

/** Counter keys that hold each value until its stage really ends: [[t, n], ...] from pipeline marks.stageEnd. */
function steps(ends, names) {
  return [[1, 0], ...names.flatMap((n, i) => [[ends[n] - 0.05, i], [ends[n], i + 1]])];
}

/** Frame furniture of the story scenes: drifting doodles, section tag, journey rail, heading and the source. */
function frame(s, i, heading) {
  s.parallax({ seed: i + 3 });
  s.sectionTag({ index: i + 2, total: 8, name: STEPS[i], at: 0.1 });
  s.journeyRail({ steps: STEPS, active: i, at: 0.25 });
  s.heading({ text: heading, at: 0.3 });
  s.sourceFooter({ text: SRC, at: 1 });
}

export default ({ scene }) => ({
  title,
  lang: 'es',
  scenes: [
    // 1. Opening: kinetic title, laptop and cloud with documents already travelling between them.
    scene({
      name: 'portada',
      dur: 6.5,
      transition: { type: 'light-sweep', dur: 0.6 },
      build(s) {
        s.parallax({ seed: 1 });
        s.particles({ mode: 'ambient', count: 22, colors: ['warn', 'accent2'] });
        s.sectionTag({ index: 1, total: 8, name: 'Introducción', at: 0.1 });
        s.kineticText({ rect: { x: 160, y: 130, w: 1600, h: 400 }, lines: ['Cómo viaja un cambio', 'en un *pull request*'], at: 0.3, step: 0.14, mode: 'rise', underline: ['request'] });
        s.icon({ id: 'lap', kind: 'laptop', x: 280, y: 560, size: 200, at: 1.4, label: 'tu rama', idle: 'float' });
        s.icon({ id: 'rem', kind: 'cloud', x: 1410, y: 560, size: 200, at: 1.8, color: 'accent2', label: 'main', idle: 'float' });
        s.packets({ path: ['lap', 'rem'], curve: 'arc', bend: -120, at: 2.4, until: 5.8, every: 0.55, dur: 1.9, shape: 'doc', size: 54, color: 'accent', track: true });
        s.label({ text: 'De la rama al merge, paso a paso', rect: { x: 460, y: 900, w: 1000, h: 90 }, at: 3.2, type: true, color: 'dim' });
        s.camera.zoom(1.05, 0.2, 6, { ease: 'linear' });
      },
    }),

    // 2. Branch and commits: terminal on the left, the branch growing on the right, commits flying to the remote.
    scene({
      name: 'rama',
      dur: 9.5,
      transition: { type: 'slide', dur: 0.6 },
      build(s) {
        frame(s, 0, 'Todo empieza en una rama');
        s.terminal({
          id: 'term',
          rect: { x: 80, y: 256, w: 900, h: 480 },
          title: 'terminal',
          at: 0.3,
          steps: [
            { cmd: 'git checkout -b clave-8', at: 0.9, out: ['Switched to a new branch \'clave-8\''] },
            { cmd: 'git commit -am "Valida clave"', at: 2.8, out: ['[clave-8 3f2a1c9] Valida clave', ' 1 file changed'] },
            { cmd: 'git push origin clave-8', at: 5.2, out: [{ text: ' * [new branch] clave-8', color: 'good' }] },
          ],
        });
        s.gitGraph({
          id: 'g',
          rect: { x: 1040, y: 256, w: 800, h: 250 },
          at: 0.5,
          lanes: [{ name: 'main', color: 'dim' }, { name: 'clave-8', color: 'accent' }],
          commits: [
            { id: 'a', lane: 'main', col: 0, at: 0.7 },
            { id: 'b', lane: 'main', col: 1, at: 0.9, parents: ['a'] },
            { id: 'c', lane: 'main', col: 2, at: 1.1, parents: ['b'] },
            { id: 'd', lane: 'clave-8', col: 3, at: 3.2, parents: ['c'] },
          ],
        });
        s.icon({ id: 'loc', kind: 'laptop', x: 1090, y: 560, size: 170, at: 0.8, label: 'local', idle: 'float' });
        s.icon({ id: 'cld', kind: 'cloud', x: 1600, y: 560, size: 170, at: 1.1, color: 'accent2', label: 'origin/clave-8', labelW: 340, idle: 'float' });
        s.packets({ path: ['loc', 'cld'], curve: 'arc', bend: -90, at: 6.0, count: 4, every: 0.3, dur: 1.2, shape: 'box', size: 32, color: 'accent', track: true });
        s.burst({ target: 'cld', at: 7.3, colors: ['accent2', 'good'] });
        s.caption({ text: 'La rama aísla el trabajo; cada commit guarda un paso.', at: 3.4, typeDur: 1 });
      },
    }),

    // 3. Files and diff: the editor types the change with marks, the diff view lists what changed.
    scene({
      name: 'diff',
      dur: 9,
      transition: { type: 'slide', dur: 0.6 },
      build(s) {
        frame(s, 1, 'Los archivos y el diff');
        s.editor({
          id: 'ed',
          rect: { x: 80, y: 256, w: 960, h: 600 },
          title: 'mi-app',
          file: 'clave.ts',
          sidebar: ['src', '  clave.ts', 'tests', '  test.ts'],
          at: 0.3,
          typeAt: 1.0,
          cps: 34,
          lines: [
            'function validar(clave) {',
            { text: '  if (clave.length < 6) {', mark: '-' },
            { text: '  if (clave.length < 8) {', mark: '+', at: 2.4 },
            '    return "muy corta";',
            '  }',
            '}',
          ],
          highlights: [{ line: 3, at: 4.2, until: 9 }],
        });
        s.diffView({
          id: 'df',
          rect: { x: 1090, y: 256, w: 750, h: 330 },
          file: 'src/auth/clave.ts',
          stat: '+1 -1',
          at: 4.0,
          step: 0.4,
          lines: [
            { op: ' ', text: 'function validar(clave) {' },
            { op: '-', text: '  if (clave.length < 6) {' },
            { op: '+', text: '  if (clave.length < 8) {' },
            { op: ' ', text: '    return "muy corta";' },
          ],
        });
        s.chip({ cx: 1465, cy: 700, text: 'Mínimo: 6 caracteres', color: 'warn', icon: 'lock', at: 5.6, states: [{ at: 6.6, text: 'Mínimo: 8 caracteres', color: 'good', icon: 'check', solid: true }] });
        s.scribble({ target: 'df', kind: 'box', at: 7.0, dur: 0.8, color: 'warn' });
        s.caption({ text: 'El diff marca líneas quitadas y líneas agregadas.', at: 4.8, typeDur: 1 });
        s.camera.focus('ed', 1.0, 0.9, { zoom: 1.2 });
        s.camera.reset(3.9, 0.8);
      },
    }),

    // 4. Open the PR: a browser page, a pointer that clicks the button, title, reason and reviewers.
    scene({
      name: 'abrir-pr',
      dur: 9,
      transition: { type: 'light-sweep', dur: 0.6 },
      build(s) {
        frame(s, 2, 'Se abre el pull request');
        s.prPage({
          id: 'pr',
          rect: { x: 80, y: 256, w: 1180, h: 620 },
          at: 0.3,
          title: 'Valida claves de 8 o más caracteres',
          number: 128,
          from: 'clave-8',
          to: 'main',
          author: 'por Ana',
          stats: { add: 1, del: 1 },
          reviewers: [{ name: 'Leo', initials: 'LE' }],
          checks: [{ name: 'Build', start: 5.4, end: 7.0, ok: true }, { name: 'Pruebas', start: 5.8, end: 8.2, ok: true }],
          button: 'Abrir pull request',
          openAt: 4.2,
        });
        s.cursor({ path: [[2.4, 520, 420], [4.0, 'pr.button']], clicks: [4.2], until: 5 });
        [['doc', 'Título claro', 5.2, 'accent'], ['bolt', 'Por qué del cambio', 5.8, 'accent2'], ['user', 'Revisores asignados', 6.4, 'good']].forEach(([kind, label, at, color], i) => {
          s.icon({ id: `k${i}`, kind, x: 1380, y: 262 + i * 200, size: 120, at, color, label, labelSide: 'right', labelPx: 44, labelW: 400, idle: 'float' });
        });
        s.caption({ text: 'Aquí el cambio queda listo para discutirse.', at: 5.0, typeDur: 1 });
        s.camera.focus('pr', 0.8, 0.8, { zoom: 1.12 });
        s.camera.reset(5.4, 0.8);
      },
    }),

    // 5. CI checks: the pipeline runs, a counter climbs, the stamp lands.
    scene({
      name: 'checks',
      dur: 9.5,
      transition: { type: 'slide', dur: 0.6 },
      build(s) {
        frame(s, 3, 'Los checks corren solos');
        const ci = s.pipeline({
          id: 'ci',
          rect: { x: 80, y: 256, w: 1180, h: 560 },
          title: 'checks #128',
          at: 0.3,
          runAt: 1.0,
          stages: [
            { name: 'Build', jobs: [{ name: 'Compilar', dur: 1.5 }] },
            { name: 'Pruebas', jobs: [{ name: 'Unitarias', dur: 2 }, { name: 'Integración', dur: 2.4 }] },
            { name: 'Lint', jobs: [{ name: 'Estilo', dur: 1.2 }] },
          ],
        });
        s.counter({ rect: { x: 1330, y: 250, w: 500, h: 190 }, keys: steps(ci.marks.stageEnd, ['Build', 'Pruebas', 'Lint']), suffix: ' / 3', label: 'checks en verde', color: 'good', at: 1.0 });
        s.dotGrid({ rect: { x: 1330, y: 470, w: 500, h: 140 }, rows: 4, cols: 10, at: 2.6, dur: 3.8 });
        s.stamp({ cx: 1580, cy: 720, text: 'Todo en verde', at: 7.4, color: 'good' });
        s.particles({ mode: 'confetti', origin: [1580, 720], at: 7.5, count: 60, dur: 2 });
        s.caption({ text: 'Un check requerido en rojo bloquea el merge.', at: 3.5, typeDur: 1 });
      },
    }),

    // 6. Review loop: comment, adjust, approval.
    scene({
      name: 'revision',
      dur: 9,
      transition: { type: 'slide', dur: 0.6 },
      build(s) {
        frame(s, 4, 'Alguien más lo revisa');
        s.icon({ id: 'ana', kind: 'user', x: 100, y: 262, size: 170, at: 0.4, color: 'accent', label: 'Ana, autora', labelPx: 40, idle: 'sway' });
        s.icon({ id: 'leo', kind: 'user', x: 1630, y: 262, size: 170, at: 0.7, color: 'accent2', label: 'Leo, revisor', labelPx: 40, idle: 'sway' });
        s.bubble({ rect: { x: 1000, y: 262, w: 600, h: 120 }, text: 'Y si la clave está vacía?', tail: 'right', at: 1.3, color: 'accent2' });
        s.bubble({ rect: { x: 330, y: 420, w: 600, h: 120 }, text: 'Buen punto, lo ajusto', tail: 'left', at: 3.0, color: 'accent' });
        s.editor({ id: 'fix', rect: { x: 960, y: 560, w: 680, h: 140 }, title: 'clave.ts', lineNumbers: false, lines: ['if (!clave) return;'], at: 3.8, typeAt: 4.2, cps: 30 });
        s.packets({ path: ['leo', 'ana'], curve: 'arc', bend: 80, at: 1.8, until: 5.2, every: 1.2, dur: 1.4, shape: 'doc', size: 40, color: 'accent2' });
        s.bubble({ rect: { x: 1000, y: 735, w: 600, h: 110 }, text: 'Ahora sí', tail: 'right', at: 5.6, color: 'accent2' });
        s.stamp({ cx: 560, cy: 740, text: 'Aprobado', at: 6.4, color: 'good' });
        s.chip({ cx: 560, cy: 590, text: 'Cambios pedidos', color: 'warn', at: 1.4, states: [{ at: 4.8, text: 'Ajustado', color: 'accent' }] });
        s.burst({ target: 'leo', at: 6.5, colors: ['good'] });
        s.caption({ text: 'Se repite hasta que el revisor aprueba.', at: 5.6, typeDur: 1 });
      },
    }),

    // 7. Merge: the three options on the left, the branch joining main on the right.
    scene({
      name: 'merge',
      dur: 9,
      transition: { type: 'light-sweep', dur: 0.6 },
      build(s) {
        frame(s, 5, 'El merge trae el cambio a main');
        s.table({
          id: 'opts',
          rect: { x: 80, y: 256, w: 940, h: 440 },
          columns: ['Opción', 'Qué hace'],
          rows: [
            ['Merge commit', 'Conserva todos los commits'],
            ['Squash and merge', 'Junta todo en un solo commit'],
            ['Rebase and merge', 'Reaplica los commits sobre main'],
          ],
          at: 0.5,
          step: 0.7,
          highlight: { row: 1, at: 4.6 },
        });
        s.gitGraph({
          id: 'mg',
          rect: { x: 1060, y: 256, w: 780, h: 300 },
          at: 0.6,
          lanes: [{ name: 'main', color: 'dim' }, { name: 'clave-8', color: 'accent' }],
          commits: [
            { id: 'a', lane: 'main', col: 0, at: 0.8 },
            { id: 'b', lane: 'main', col: 1, at: 1.0, parents: ['a'] },
            { id: 'c', lane: 'clave-8', col: 2, at: 1.4, parents: ['b'] },
            { id: 'd', lane: 'clave-8', col: 3, at: 2.0, parents: ['c'] },
            { id: 'm', lane: 'main', col: 4, at: 6.0, parents: ['b', 'd'] },
          ],
        });
        s.burst({ target: 'mg.m', at: 6.1 });
        s.chip({ cx: 1450, cy: 640, text: 'Abierto', color: 'good', icon: 'dot', at: 1.0, states: [{ at: 6.2, text: 'Fusionado', color: 'accent2', icon: 'check', solid: true }] });
        s.icon({ id: 'trg', kind: 'rocket', x: 1580, y: 690, size: 130, at: 6.4, color: 'accent', idle: 'bob' });
        s.scribble({ target: 'opts', kind: 'box', at: 4.6, dur: 0.8, color: 'accent' });
        s.caption({ text: 'El equipo elige cuál usar en cada repositorio.', at: 2.6, typeDur: 1 });
      },
    }),

    // 8. Recap: three points, a packet hopping icon to icon, kinetic closing line.
    scene({
      name: 'cierre',
      dur: 8,
      build(s) {
        s.parallax({ seed: 9 });
        s.sectionTag({ index: 8, total: 8, name: 'Resumen', at: 0.1 });
        s.kineticText({ rect: { x: 160, y: 130, w: 1600, h: 220 }, text: 'En resumen: del cambio al *merge*', at: 0.3, step: 0.12, mode: 'slam' });
        const items = [['branch', '1. Rama y commits', 'accent'], ['check', '2. PR con checks y revisión', 'accent2'], ['rocket', '3. Merge a main', 'good']];
        items.forEach(([kind, label, color], i) => {
          s.icon({ id: `r${i}`, kind, x: 100 + i * 580 + 180, y: 420, size: 220, at: 1.0 + i * 0.6, color, idle: 'float' });
          s.label({ text: label, rect: { x: 100 + i * 580, y: 690, w: 580, h: 100 }, at: 1.3 + i * 0.6, type: true, color });
        });
        s.packets({ path: ['r0', 'r1', 'r2'], curve: 'arc', bend: -90, at: 3.2, until: 6.8, every: 0.8, dur: 2.2, shape: 'box', size: 36, color: 'accent', track: true });
        s.burst({ target: 'r2', at: 5.6, colors: ['good', 'accent'] });
        s.particles({ mode: 'confetti', origin: [960, 400], at: 5.8, count: 70, dur: 2 });
      },
    }),
  ],
});
