// Como llega tu codigo desde tu laptop hasta produccion. 9 scenes, about 85 s. Port of the Fable "third" (poster) run.
// Preset-agnostic: colors are tokens, every element is a piece. Built for `poster`, also clean in sketch and hologram.
export const title = 'De tu laptop a producción';
export const preset = 'poster';

const STOPS = ['Código', 'Git', 'PR', 'CI', 'Merge', 'Build', 'Deploy', 'Usuarios'];
const ROWS = [{ label: 'Café x2', value: '$ 10' }, { label: 'Taza x3', value: '$ 5' }];

/** Furniture shared by scenes 2 to 9: depth layer, section tag, journey rail and heading. */
function frame(s, index, heading) {
  s.parallax({ seed: 20 + index });
  s.sectionTag({ index: index + 2, total: 9, name: STOPS[index], at: 0.1 });
  s.journeyRail({ steps: STOPS, active: index });
  s.heading({ text: heading });
}

/** Icon placed by its center. */
const icon = (s, o) => s.icon({ ...o, x: o.cx - o.size / 2, y: o.cy - o.size / 2, cx: undefined, cy: undefined });

export default ({ scene }) => ({
  title,
  lang: 'es',
  scenes: [
    scene({
      name: 'titulo',
      dur: 6.5,
      transition: { type: 'zoom-through', dur: 0.7, origin: [260, 790] },
      build(s) {
        s.parallax({ count: 10 });
        s.particles({ mode: 'ambient', count: 34, until: 6.2 });
        s.kineticText({ id: 'title', text: 'De tu *laptop*|a *producción*', rect: { x: 160, y: 110, w: 1600, h: 400 }, px: 160, at: 0.3, step: 0.17, mode: 'slam', underline: ['producción'] });
        s.label({ text: 'El viaje de un cambio de código, paso a paso', rect: { x: 260, y: 530, w: 1400, h: 110 }, color: 'dim', type: true, at: 1.5, px: 50 });
        s.packets({ path: [[260, 790], [1660, 790]], at: 3.1, until: 5.6, every: 0.5, dur: 3, shape: 'box', size: 26, color: 'warn', trackAt: 1.8 });
        const stops = [['laptop', 'Tu laptop', 'accent'], ['branch', 'Repositorio', 'accent2'], ['shield', 'CI', 'accent'], ['package', 'Build', 'accent2'], ['cloud', 'Producción', 'good']];
        stops.forEach(([kind, label, color], i) => icon(s, { id: `j${i}`, kind, cx: 260 + i * 350, cy: 790, size: 150, label, color, at: 1.9 + i * 0.25, idle: 'float' }));
      },
    }),

    scene({
      name: 'editor',
      dur: 9.5,
      transition: { type: 'slide', dir: 'left', dur: 0.6 },
      build(s) {
        frame(s, 0, 'Todo empieza en tu editor');
        s.editor({
          id: 'ed',
          rect: { x: 90, y: 250, w: 1130, h: 600 },
          file: 'carrito.js',
          sidebar: ['src/', 'carrito.js', 'carrito.test.js', 'package.json'],
          lines: [
            { text: 'export function total(items) {', typed: false },
            { text: '  let suma = 0;', typed: false },
            { text: '  for (const it of items) {', typed: false },
            { text: '    suma += it.precio;', mark: '-' },
            { text: '    suma += it.precio * it.cantidad;', mark: '+' },
            { text: '  }', typed: false },
            { text: '  return suma;', typed: false },
            { text: '}', typed: false },
          ],
          at: 0.5,
          typeAt: 2.9,
          cps: 14,
        });
        icon(s, { id: 'lap', kind: 'laptop', cx: 1540, cy: 380, size: 230, label: 'Tu laptop', at: 0.8, idle: 'float' });
        s.chip({ text: 'Cambio guardado', icon: 'check', color: 'good', cx: 1540, cy: 690, at: 5.5 });
        s.chip({ text: 'Pruebas locales', icon: 'spinner', color: 'warn', cx: 1540, cy: 780, at: 6.0, states: [{ at: 7.1, text: 'Pruebas locales: OK', icon: 'check', color: 'good' }] });
        s.camera.focus('ed.l5', 2.0, 0.9, { zoom: 1.55 });
        s.camera.reset(4.7, 0.7);
        s.caption({ text: 'Escribes el cambio y lo pruebas en tu máquina.', at: 5.6 });
      },
    }),

    scene({
      name: 'git',
      dur: 10.5,
      transition: { type: 'zoom-through', dur: 0.7, origin: [1590, 760] },
      build(s) {
        frame(s, 1, 'Commit y push: sale de tu laptop');
        const term = s.terminal({
          id: 'term',
          rect: { x: 90, y: 250, w: 900, h: 340 },
          title: 'terminal',
          steps: [
            { name: 'branch', cmd: 'git checkout -b fix/total', out: 'Switched to a new branch \'fix/total\'' },
            { name: 'commit', cmd: 'git commit -am "fix: total por cantidad"', out: '[fix/total 3f2a9c1] 1 file changed' },
            { name: 'push', cmd: 'git push origin fix/total', out: [{ text: 'fix/total -> origin/fix/total', color: 'good' }] },
          ],
          at: 0.4,
          typeAt: 1.0,
        });
        const { branch, commit, push } = term.marks;
        s.gitGraph({
          id: 'git',
          rect: { x: 1050, y: 262, w: 790, h: 340 },
          lanes: [{ name: 'main', color: 'accent2' }, { name: 'fix/total', color: 'accent' }],
          commits: [
            { id: 'm1', lane: 'main', col: 0, at: 0.9 },
            { id: 'm2', lane: 'main', col: 1, at: 1.1, parents: ['m1'] },
            { id: 'b1', lane: 'fix/total', col: 2, at: commit, parents: ['m2'] },
          ],
          at: 0.6,
        });
        icon(s, { id: 'lap', kind: 'laptop', cx: 330, cy: 700, size: 150, label: 'Tu laptop', at: 0.7 });
        icon(s, { id: 'remote', kind: 'cloud', cx: 1590, cy: 690, size: 170, label: 'Repositorio remoto', color: 'accent2', at: 0.9, idle: 'float' });
        s.packets({ path: ['lap', 'remote'], curve: 'arc', bend: -110, at: push - 0.2, until: push + 0.6, every: 0.16, dur: 1.1, shape: 'box', size: 30, ping: true, trackAt: branch });
        s.caption({ text: 'El commit guarda el cambio. El push lo sube al remoto.', at: 6.6 });
      },
    }),

    scene({
      name: 'pr',
      dur: 10,
      transition: { type: 'light-sweep', dur: 0.7 },
      build(s) {
        frame(s, 2, 'Abres un pull request');
        s.browser({ id: 'web', rect: { x: 90, y: 246, w: 1240, h: 620 }, url: 'git.ejemplo.com/tienda/pull/42', at: 0.4 });
        s.prPage({
          id: 'pr',
          in: 'web.body',
          title: 'fix: total por cantidad',
          number: 42,
          from: 'fix/total',
          to: 'main',
          author: 'Tú',
          stats: { add: 1, del: 1 },
          reviewers: [{ name: 'Ana' }, { name: 'Luis' }],
          checks: [{ name: 'Pruebas automáticas', start: 5.8, end: 9 }],
          button: 'Crear pull request',
          openAt: 4.6,
          labels: { draft: 'Borrador', open: 'Abierto', merged: 'Fusionado', reviewers: 'Revisores', checks: 'Verificaciones' },
          at: 1.0,
        });
        s.callout({ target: 'pr.button', text: 'Propones unir tu rama a main', rect: { x: 1380, y: 640, w: 450, h: 110 }, at: 2.3, until: 4.2 });
        s.chip({ text: 'Borrador', icon: 'dot', color: 'dim', cx: 1580, cy: 330, px: 34, at: 1.6, states: [{ at: 4.6, text: 'Abierto', icon: 'check', color: 'good', solid: true }] });
        s.chip({ text: 'Pruebas en curso', icon: 'spinner', color: 'warn', cx: 1580, cy: 430, px: 34, at: 6.0, states: [{ at: 8.6, text: 'Pruebas en verde', icon: 'check', color: 'good' }] });
        icon(s, { id: 'rev', kind: 'eye', cx: 1580, cy: 600, size: 150, label: 'Revisión', color: 'accent2', at: 6.6, idle: 'pulse' });
        s.camera.focus('pr.checks', 3.2, 0.8, { zoom: 1.4 });
        s.camera.reset(5.1, 0.7);
        s.cursor({ path: [[2.9, 1000, 560], [4.2, 'pr.button'], [5.4, 'pr.button'], [6.3, 760, 960]], clicks: [4.5], until: 6.0 });
        s.burst({ target: 'pr.status', at: 4.65, count: 28 });
        s.caption({ text: 'Un pull request propone unir tu rama a la rama principal.', at: 5.6 });
      },
    }),

    scene({
      name: 'ci',
      dur: 11,
      transition: { type: 'slide', dir: 'left', dur: 0.6 },
      build(s) {
        frame(s, 3, 'La integración continua lo verifica');
        s.splitScreen({ id: 'sp', area: { x: 80, y: 244, w: 1760, h: 400 }, ratio: 0.6, slant: 60, left: { color: 'accent', label: 'Pipeline' }, right: { color: 'accent2', label: 'Registro' }, at: 0.3 });
        const ci = s.pipeline({
          id: 'ci',
          in: 'sp.left',
          gap: 40,
          stages: [
            { name: 'Lint', jobs: [{ name: 'eslint', dur: 1.2 }] },
            { name: 'Pruebas', jobs: [{ name: 'unitarias', dur: 2.2 }, { name: 'integración', dur: 2.8 }] },
            { name: 'Build', jobs: [{ name: 'compilar', dur: 1.4 }] },
          ],
          at: 0.6,
          runAt: 1.5,
        });
        const { Lint: lintEnd, Pruebas: testEnd, Build: doneAt } = ci.marks.stageEnd;
        s.terminal({
          id: 'log',
          rect: { x: 1210, y: 300, w: 620, h: 330 },
          title: 'ci.log',
          steps: [
            { cmd: 'npm run lint', at: 1.5, out: [{ text: 'sin errores', color: 'good' }], wait: 0.7 },
            { cmd: 'npm test', at: lintEnd + 0.4, out: ['total() suma por cantidad', 'carrito vacío devuelve 0', { text: '128 pruebas, 0 fallos', color: 'good' }], wait: 0.6, outStep: 0.8 },
            { cmd: 'npm run build', at: testEnd + 0.4, out: [{ text: 'build listo', color: 'good' }], wait: 1.2 },
          ],
          at: 0.8,
        });
        // Live indicators under the pipeline: counter, dot grid of tests, gauge and progress, all on the run clock.
        s.counter({ rect: { x: 110, y: 660, w: 310, h: 112 }, to: 128, label: 'pruebas aprobadas', at: lintEnd + 0.4, dur: testEnd - lintEnd - 0.4, ease: 'linear', color: 'good' });
        s.dotGrid({ rect: { x: 450, y: 670, w: 550, h: 100 }, rows: 3, cols: 16, at: lintEnd + 0.4, dur: testEnd - lintEnd - 0.4, color: 'good' });
        s.progress({ rect: { x: 110, y: 778, w: 890, h: 108 }, label: 'Avance del pipeline', at: 1.5, dur: doneAt - 1.5, linear: true, pct: false });
        s.gauge({ rect: { x: 1060, y: 655, w: 230, h: 210 }, to: 0.92, at: lintEnd + 0.4, dur: testEnd - lintEnd, label: 'cobertura', color: 'accent' });
        s.chip({ text: 'CI en verde', icon: 'check', color: 'good', solid: true, cx: 1580, cy: 760, px: 40, at: doneAt + 0.2 });
        s.burst({ origin: [1580, 760], at: doneAt + 0.3, count: 40, radius: 260 });
        s.packets({ path: [[1060, 330], [1210, 330]], shape: 'dot', at: 1.5, until: 8, every: 0.7, dur: 0.8, color: 'warn', track: false });
        s.caption({ text: 'Cada push dispara lint, pruebas y build automáticos.', at: 8.4 });
      },
    }),

    scene({
      name: 'merge',
      dur: 10.5,
      transition: { type: 'iris', dur: 0.7, origin: [1790, 635] },
      build(s) {
        frame(s, 4, 'Revisión y merge');
        s.diffView({
          id: 'diff',
          rect: { x: 90, y: 262, w: 900, h: 290 },
          file: 'src/carrito.js',
          stat: '+1 -1',
          lines: [
            { op: ' ', text: '  for (const it of items) {' },
            { op: '-', text: '    suma += it.precio;' },
            { op: '+', text: '    suma += it.precio * it.cantidad;' },
            { op: ' ', text: '  }' },
          ],
          at: 0.5,
        });
        icon(s, { id: 'ana', kind: 'user', cx: 150, cy: 775, size: 100, label: 'Ana', color: 'accent2', at: 1.9 });
        s.bubble({ rect: { x: 260, y: 735, w: 640, h: 100 }, text: 'Se ve bien. Gracias por el test!', tail: 'left', at: 2.3 });
        s.stamp({ text: 'APROBADO', cx: 540, cy: 645, at: 3.7, px: 48 });
        s.chip({ text: 'CI en verde', icon: 'check', color: 'good', cx: 1440, cy: 290, at: 1.0 });
        s.chip({ text: 'Revisión pendiente', icon: 'spinner', color: 'warn', cx: 1440, cy: 370, at: 1.2, states: [{ at: 3.9, text: '1 aprobación', icon: 'check', color: 'good' }] });
        s.chip({ id: 'mergeBtn', text: 'Merge pull request', color: 'accent', solid: true, cx: 1440, cy: 470, px: 34, at: 4.5, states: [{ at: 5.6, text: 'Fusionado', icon: 'check', color: 'accent2', solid: true }] });
        s.cursor({ path: [[4.7, 1740, 640], [5.4, 'mergeBtn'], [6.1, 'mergeBtn']], clicks: [5.5], until: 6.1 });
        s.gitGraph({
          id: 'git',
          rect: { x: 1020, y: 510, w: 860, h: 360 },
          lanes: [{ name: 'main', color: 'accent2' }, { name: 'fix/total', color: 'accent' }],
          commits: [
            { id: 'm1', lane: 'main', col: 0, at: 0.9 },
            { id: 'm2', lane: 'main', col: 1, at: 1.05, parents: ['m1'] },
            { id: 'b1', lane: 'fix/total', col: 2, at: 1.2, parents: ['m2'] },
            { id: 'm3', lane: 'main', col: 3, at: 6.1, parents: ['m2', 'b1'] },
          ],
          at: 0.7,
        });
        s.burst({ target: 'git.m3', at: 6.15, count: 30, radius: 260 });
        s.caption({ text: 'Con CI en verde y una aprobación, la rama se une a main.', at: 6.7 });
      },
    }),

    scene({
      name: 'build',
      dur: 9.5,
      transition: { type: 'zoom-through', dur: 0.7, origin: [1703, 560] },
      build(s) {
        frame(s, 5, 'El build empaqueta la aplicación');
        const fab = s.machine({
          id: 'fab',
          rect: { x: 120, y: 276, w: 1680, h: 480 },
          inputs: [{ kind: 'doc', label: 'código' }, { kind: 'package', label: 'dependencias', color: 'accent2' }, { kind: 'gear', label: 'config', color: 'warn' }],
          output: { kind: 'container', label: 'tienda:1.4.2', color: 'good' },
          machine: { label: 'Build' },
          at: 0.5,
        });
        const { processStart, processEnd } = fab.marks;
        s.progress({ rect: { x: 420, y: 760, w: 760, h: 120 }, label: 'Compilando y empaquetando', at: processStart, dur: processEnd - processStart, linear: true, color: 'warn' });
        s.counter({ rect: { x: 120, y: 770, w: 260, h: 110 }, to: 214, label: 'módulos', at: processStart, dur: processEnd - processStart, ease: 'linear', color: 'warn' });
        s.chip({ text: 'Artefacto versionado', icon: 'check', color: 'good', cx: 1530, cy: 820, at: fab.end + 0.1 });
        s.burst({ target: 'fab.out', at: fab.end, count: 26, radius: 240 });
        s.caption({ text: 'El código se compila y se empaqueta en un artefacto versionado.', at: 5.2 });
      },
    }),

    scene({
      name: 'deploy',
      dur: 11,
      transition: { type: 'light-sweep', dur: 0.7 },
      build(s) {
        frame(s, 6, 'El deploy activa la nueva versión');
        icon(s, { id: 'art', kind: 'container', cx: 240, cy: 500, size: 210, label: 'tienda:1.4.2', color: 'good', at: 0.4, idle: 'float' });
        s.enter({ targets: 'art', from: 'left', at: 0.4, dur: 0.7 });
        const fl = s.fleet({ id: 'fl', rect: { x: 470, y: 262, w: 820, h: 590 }, count: 3, from: 'v1', to: 'v2', lb: 'Balanceador de carga', at: 0.6, startAt: 2.4, step: 1.7 });
        [1, 2, 3].forEach(n => s.packets({ path: ['art', `fl.s${n}`], curve: 'arc', bend: -60 - n * 20, at: fl.marks[`flip${n}`] - 1.1, dur: 0.7, every: 0.12, until: fl.marks[`flip${n}`] - 0.8, shape: 'box', size: 26, color: 'good', track: false }));
        s.chart({ rect: { x: 1340, y: 262, w: 500, h: 330 }, type: 'line', data: [2, 3, 2, 2, 3, 2, 2, 3, 2, 2, 3, 2], colors: ['bad'], yMax: 20, title: 'Errores por minuto', labels: ['-11', '', '', '', '', '', '', '', '-3', '', '', 'ya'], mark: { i: 3, text: 'deploy', color: 'warn' }, at: 1.2, dur: 6.4 });
        s.counter({ rect: { x: 1370, y: 650, w: 440, h: 110 }, to: 3, suffix: ' / 3', label: 'instancias en la versión nueva', at: 2.25, dur: 5.1, ease: 'linear', color: 'good' });
        s.progress({ rect: { x: 1370, y: 770, w: 440, h: 110 }, label: 'Tráfico nuevo', at: 2.4, dur: 5.2, segments: 3, color: 'good' });
        s.stamp({ text: 'SIN CORTES', cx: 250, cy: 790, at: fl.end + 0.2, px: 52 });
        s.caption({ text: 'Se actualiza una instancia a la vez, sin cortar el servicio.', at: 8.0 });
        s.sourceFooter({ text: 'Kubernetes docs, Performing a Rolling Update' });
      },
    }),

    scene({
      name: 'usuarios',
      dur: 11.5,
      build(s) {
        frame(s, 7, 'Y llega a tus usuarios');
        s.phone({ id: 'ph', rect: { x: 110, y: 250, w: 330, h: 630 }, at: 0.5 });
        s.appScreen({ id: 'app1', in: 'ph.screen', title: 'Tienda', rows: ROWS, total: { label: 'Total', from: '$ 15', to: '$ 35', at: 3.2 }, cta: 'Pagar', banner: { text: 'Nueva versión', at: 2.4 }, at: 1.0 });
        s.browser({ id: 'web', rect: { x: 500, y: 250, w: 800, h: 460 }, url: 'tienda.ejemplo.com/carrito', at: 0.2 });
        s.appScreen({ id: 'app2', in: 'web.body', title: 'Tienda', rows: ROWS, total: { label: 'Total', from: '$ 15', to: '$ 35', at: 3.5 }, banner: { text: 'Nueva versión', at: 2.7 }, at: 1.2 });
        s.reveal({ targets: ['web'], shape: 'iris', at: 0.7, dur: 0.9 });
        for (let i = 0; i < 6; i++) { icon(s, { id: `u${i}`, kind: 'user', cx: 1480 + (i % 3) * 150, cy: 340 + Math.floor(i / 3) * 190, size: 120, color: i % 2 ? 'accent' : 'accent2', at: 3.9 + i * 0.14 }); }
        s.particles({ mode: 'confetti', at: 4.5, dur: 3.4, count: 110 });
        s.flow({ id: 'recap', steps: ['Commit', 'PR', 'CI', 'Merge', 'Build', 'Deploy'], area: { x: 500, y: 730, w: 1340, h: 150 }, at: 5.4, step: 0.18 });
        s.caption({ text: 'De tu laptop a producción: cada paso verifica al anterior.', at: 7.2 });
      },
    }),
  ],
});
