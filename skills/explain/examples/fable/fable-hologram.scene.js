// How code travels from a laptop to production. 12 scenes, about 89 s. Preset-agnostic: only pieces and color tokens.
// On-screen text is Spanish; never an opening question or exclamation mark.
export const preset = 'hologram';
export const title = 'Cómo llega tu código desde tu laptop hasta producción';

const STEPS = ['Editor', 'Commit', 'Push', 'Pull request', 'CI', 'Revisión', 'Merge', 'Build', 'Deploy', 'Usuarios'];
const BRANCH = 'feature/modo-oscuro';
const NEW_LINE = '      <ModoOscuro activo={tema.oscuro} />';

export default ({ scene }) => {
  const base = (s, i, heading) => {
    s.parallax({ seed: 11 + i });
    s.journeyRail({ steps: STEPS, active: i });
    s.heading({ text: heading });
  };
  return {
    title,
    lang: 'es',
    scenes: [
      scene({
        name: 'portada',
        dur: 5.5,
        transition: { type: 'zoom-through', origin: 'lap', dur: 0.7 },
        build(s) {
          s.parallax({ seed: 3 });
          s.kineticText({ id: 'hero', lines: ['De tu laptop', 'a producción'], rect: { x: 260, y: 150, w: 1400, h: 380 }, px: 160, at: 0.2, step: 0.14, emphasis: { laptop: 'accent', producción: 'good' } });
          s.label({ id: 'sub', text: 'El viaje de un cambio de código, paso a paso', rect: { x: 260, y: 530, w: 1400, h: 100 }, type: true, typeAt: 1.4, color: 'dim', px: 46 });
          s.icon({ id: 'lap', kind: 'laptop', rect: { x: 250, y: 680, w: 240, h: 290 }, label: 'Tu laptop', at: 0.9, idle: 'float' });
          s.icon({ id: 'prod', kind: 'cloud', rect: { x: 1430, y: 680, w: 240, h: 290 }, label: 'Producción', color: 'good', at: 1.2, idle: 'float' });
          s.packets({ path: [{ id: 'lap', anchor: 'right' }, { id: 'prod', anchor: 'left' }], curve: 'arc', bend: -150, at: 2.0, until: 4.8, every: 0.28, dur: 1.5, colors: ['accent', 'accent2', 'good', 'warn'] });
          s.chip({ cx: 640, cy: 704, text: 'commit', mono: true, at: 2.5, color: 'accent' });
          s.chip({ cx: 960, cy: 704, text: 'pull request', mono: true, at: 2.9, color: 'accent2' });
          s.chip({ cx: 1280, cy: 704, text: 'deploy', mono: true, at: 3.3, color: 'good' });
        },
      }),

      scene({
        name: 'editor',
        dur: 8.5,
        transition: { type: 'slide', dur: 0.6 },
        build(s) {
          base(s, 0, 'Todo empieza en tu editor');
          s.editor({
            id: 'ed',
            rect: { x: 100, y: 250, w: 1160, h: 620 },
            title: 'mi-app',
            file: 'Ajustes.tsx',
            tree: ['mi-app/', '  src/', '    Ajustes.tsx*', '    Tema.ts', '  tests/', '  package.json'],
            lines: ['export function Ajustes() {', '  const tema = usarTema();', '  return (', '    <Panel titulo="Ajustes">', '      <Idioma />', '      <Notificaciones />', '', '    </Panel>', '  );', '}'],
            at: 0.2,
            typeAt: 0.8,
            cps: 80,
            edits: [{ line: 7, to: NEW_LINE, at: 3.5 }],
            cursorLine: 7,
          });
          s.camera.focus('ed.l7', 2.8, 0.8, { zoom: 1.45 });
          s.camera.reset(5.5, 0.7);
          s.callout({ target: 'ed.l7', anchor: 'right', rect: { x: 1320, y: 440, w: 500, h: 150 }, text: 'Una línea nueva: el modo oscuro', at: 6.2, color: 'good' });
          s.chip({ x: 1320, y: 290, text: 'cambios sin guardar en git', at: 6.7, color: 'warn', px: 28 });
          s.icon({ id: 'solo', kind: 'laptop', rect: { x: 1430, y: 640, w: 280, h: 230 }, at: 6.5, color: 'dim', idle: 'float' });
          s.caption({ text: 'El cambio todavía vive solo en tu laptop.', at: 6.6 });
        },
      }),

      scene({
        name: 'commit',
        dur: 8,
        transition: { type: 'light-sweep', dur: 0.6 },
        build(s) {
          base(s, 1, 'Un commit guarda el cambio');
          s.splitScreen({ area: { x: 90, y: 250, w: 1740, h: 480 }, ratio: 0.45, gap: 0, at: 0.3 });
          s.terminal({
            id: 'term',
            rect: { x: 90, y: 250, w: 760, h: 480 },
            title: 'mi-app',
            at: 0.2,
            steps: [
              { cmd: `git checkout -b ${BRANCH}`, at: 0.6, out: ['Switched to a new branch'] },
              { cmd: 'git add .', at: 2.2 },
              { cmd: 'git commit -m "feat: modo oscuro"', at: 3.0, out: [{ text: `[${BRANCH} 3f9a2c1]`, color: 'accent2' }, '2 files changed, 14 insertions(+)'] },
            ],
          });
          s.gitGraph({
            id: 'g',
            rect: { x: 880, y: 250, w: 950, h: 480 },
            at: 0.4,
            cols: 3.8,
            lanes: [{ name: 'main', color: 'accent' }, { name: BRANCH, color: 'accent2' }],
            commits: [
              { id: 'm1', lane: 'main', col: 0, at: 0.7 },
              { id: 'm2', lane: 'main', col: 1, at: 1.0, parents: ['m1'] },
              { id: 'f1', lane: BRANCH, col: 2.4, at: 5.0, parents: ['m2'], tag: 'HEAD' },
            ],
          });
          s.packets({ path: [[920, 520], 'g.f1'], curve: 's', at: 4.4, dur: 0.65, size: 10, color: 'accent2', track: false });
          s.burst({ origin: 'g.f1', at: 5.0, colors: ['accent2', 'accent', 'ink'], radius: 150 });
          s.node({ id: 'what', rect: { x: 460, y: 760, w: 1000, h: 110 }, text: 'Commit = foto del cambio + autor + mensaje', at: 5.7, color: 'accent2' });
          s.caption({ text: 'Sigue en tu máquina: falta compartirlo.', at: 6.3 });
        },
      }),

      scene({
        name: 'push',
        dur: 7,
        transition: { type: 'zoom-through', origin: 'remote', dur: 0.7 },
        build(s) {
          base(s, 2, 'El push lo sube al remoto');
          s.icon({ id: 'lap', kind: 'laptop', rect: { x: 150, y: 330, w: 380, h: 420 }, label: 'Tu laptop', labelPx: 34, at: 0.3 });
          s.icon({ id: 'remote', kind: 'server', rect: { x: 1390, y: 330, w: 380, h: 420 }, label: 'Repositorio remoto', labelPx: 34, color: 'accent2', at: 0.5 });
          s.terminal({
            id: 'term',
            rect: { x: 610, y: 610, w: 700, h: 260 },
            at: 0.5,
            steps: [{ cmd: `git push origin ${BRANCH}`, at: 0.9, out: ['Enumerating objects: 9, done.', 'Writing objects: 100% (5/5)', { text: `* [new branch] ${BRANCH}`, color: 'good' }], outStep: 0.7 }],
          });
          s.progress({ id: 'up', rect: { x: 660, y: 250, w: 600, h: 120 }, label: 'Subiendo objetos', at: 2.4, dur: 2.5 });
          s.packets({ path: [{ id: 'lap', anchor: 'right' }, { id: 'remote', anchor: 'left' }], curve: 'arc', bend: -120, at: 2.4, until: 4.7, every: 0.2, dur: 1.2, shape: 'box', colors: ['accent', 'accent2', 'good'] });
          s.chip({ cx: 1580, cy: 290, text: BRANCH, mono: true, at: 5.0, color: 'good' });
          s.pulse({ target: 'remote', at: 5.0, times: 1, dur: 0.9, color: 'good' });
          s.caption({ text: 'Ahora tu rama existe también en el servidor.', at: 5.1 });
        },
      }),

      scene({
        name: 'pull-request',
        dur: 9,
        transition: { type: 'slide', dir: 'up', dur: 0.6 },
        build(s) {
          base(s, 3, 'Abres un pull request');
          s.browser({ id: 'br', rect: { x: 100, y: 250, w: 1220, h: 630 }, url: 'git.ejemplo.dev/mi-app/pull/128', at: 0.2 });
          s.prPage({
            id: 'pr',
            in: 'br.body',
            at: 0.7,
            title: 'feat: modo oscuro en Ajustes',
            number: 128,
            from: BRANCH,
            to: 'main',
            checks: [{ name: 'lint', start: 3.6, end: 4.2 }, { name: 'pruebas', start: 3.6, end: 4.8 }, { name: 'build', start: 4.0, end: 4.9 }],
            reviewers: [{ name: 'Ana', initials: 'AN', approveAt: 6.0 }, { name: 'Luis', initials: 'LU', approveAt: 6.4 }],
            stats: { add: 14, del: 3 },
          });
          s.node({ id: 'n1', rect: { x: 1370, y: 260, w: 450, h: 160 }, text: 'Propones llevar tu rama a main', at: 2.0, color: 'accent', z: 6 });
          s.node({ id: 'n2', rect: { x: 1370, y: 450, w: 450, h: 160 }, text: 'Los checks corren solos', at: 3.6, color: 'warn', z: 6 });
          s.node({ id: 'n3', rect: { x: 1370, y: 640, w: 450, h: 160 }, text: 'Alguien del equipo revisa', at: 5.2, color: 'accent2', z: 6 });
          s.spotlight({ target: 'pr.checks', at: 3.6, until: 4.9, color: 'warn' });
          s.spotlight({ target: 'pr.reviewers', at: 5.2, until: 6.5, color: 'accent2' });
          s.cursor({ path: [[1.2, 1250, 860], [2.2, 760, 300], [3.5, 760, 300], [4.2, 520, 520], [5.1, 520, 520], [5.8, 1100, 480], [8, 1100, 480]], clicks: [2.3], until: 7.4 });
          s.caption({ text: 'Nada entra a main sin pasar por aquí.', at: 6.8 });
        },
      }),

      scene({
        name: 'ci',
        dur: 9.5,
        transition: { type: 'glitch', dur: 0.5 },
        build(s) {
          base(s, 4, 'El CI lo pone a prueba');
          s.pipeline({
            id: 'ci',
            rect: { x: 90, y: 250, w: 1100, h: 400 },
            at: 0.3,
            stages: [
              { name: 'Lint', jobs: [{ id: 'lint', name: 'eslint', start: 0.9, dur: 1.2, secs: 12 }] },
              { name: 'Pruebas', jobs: [{ id: 'unit', name: 'unitarias', start: 2.2, dur: 2.2, secs: 48 }, { id: 'e2e', name: 'e2e', start: 2.2, dur: 2.9, secs: 95 }] },
              { name: 'Build', jobs: [{ id: 'build', name: 'compilar', start: 5.3, dur: 1.4, secs: 31 }] },
            ],
          });
          s.terminal({
            id: 'log',
            rect: { x: 90, y: 670, w: 1100, h: 200 },
            title: 'registro del job',
            at: 0.5,
            steps: [{ cmd: 'npm test', at: 2.2, typeDur: 0.3, out: [{ text: 'PASS tests/Ajustes.test.tsx', color: 'good' }, { text: 'PASS tests/Tema.test.ts', color: 'good' }, { text: 'PASS tests/ModoOscuro.test.tsx', color: 'good' }, { text: 'PASS e2e/ajustes.spec.ts', color: 'good' }, 'Tests: 248 passed, 248 total'], outStep: 0.5 }],
          });
          s.counter({ id: 'tests', rect: { x: 1250, y: 250, w: 570, h: 150 }, to: 248, at: 2.3, dur: 2.8, color: 'good', label: 'pruebas en verde', ease: k => k });
          s.gauge({ id: 'cov', rect: { x: 1250, y: 410, w: 260, h: 290 }, to: 0.92, at: 3.0, dur: 2, color: 'accent', label: 'Cobertura' });
          s.chart({ id: 'secs', rect: { x: 1530, y: 410, w: 290, h: 290 }, type: 'bars', data: [12, 48, 95, 31], labels: ['lint', 'unit', 'e2e', 'build'], colors: ['accent', 'accent2', 'accent2', 'warn'], title: 'Seg.', at: 3.2, dur: 2.2 });
          s.stamp({ rect: { x: 1340, y: 735, w: 450, h: 100 }, text: 'TODO EN VERDE', at: 7.0, color: 'good' });
          s.caption({ text: 'Si un check falla, el merge queda bloqueado.', at: 7.4 });
        },
      }),

      scene({
        name: 'revision',
        dur: 8.5,
        transition: { type: 'light-sweep', dur: 0.6 },
        build(s) {
          base(s, 5, 'Otra persona revisa el código');
          s.diffView({
            id: 'df',
            rect: { x: 90, y: 260, w: 1010, h: 380 },
            file: 'src/Ajustes.tsx',
            at: 0.3,
            lines: [{ op: ' ', text: '    <Panel titulo="Ajustes">' }, { op: ' ', text: '      <Idioma />' }, { op: ' ', text: '      <Notificaciones />' }, { op: '+', text: NEW_LINE }, { op: ' ', text: '    </Panel>' }],
          });
          s.packets({ path: [{ id: 'df.l4', anchor: 'right' }, [1160, 330]], curve: 's', at: 1.4, dur: 0.5, color: 'accent2' });
          s.bubble({ id: 'b1', rect: { x: 1150, y: 260, w: 680, h: 150 }, initials: 'AN', text: 'Falta una prueba para el modo oscuro. La agregas?', at: 1.7 });
          s.bubble({ id: 'b2', rect: { x: 1150, y: 440, w: 680, h: 120 }, initials: 'TÚ', side: 'right', text: 'Listo, ya está en el PR.', at: 3.9, color: 'accent' });
          s.chip({ x: 90, y: 670, text: '+ tests/ModoOscuro.test.tsx', mono: true, at: 4.7, color: 'good', px: 28 });
          s.chip({ x: 90, y: 750, text: 'CI vuelve a correr', at: 5.1, color: 'warn', px: 28, states: [{ at: 6.0, text: 'CI en verde', color: 'good' }] });
          s.stamp({ id: 'ok', rect: { x: 1250, y: 620, w: 480, h: 140 }, text: 'APROBADO', at: 6.0, color: 'good' });
          s.burst({ origin: 'ok', at: 6.22, colors: ['good', 'ink', 'accent'], radius: 260, shape: 'spark' });
          s.caption({ text: 'La revisión atrapa lo que las pruebas no ven.', at: 6.5 });
        },
      }),

      scene({
        name: 'merge',
        dur: 7.5,
        transition: { type: 'zoom-through', origin: 'g.mg', dur: 0.7 },
        build(s) {
          base(s, 6, 'El merge lo integra a main');
          s.gitGraph({
            id: 'g',
            rect: { x: 90, y: 270, w: 1150, h: 500 },
            at: 0.3,
            cols: 5.6,
            lanes: [{ name: 'main', color: 'accent' }, { name: BRANCH, color: 'accent2' }],
            commits: [
              { id: 'm1', lane: 'main', col: 0, at: 0.5 },
              { id: 'm2', lane: 'main', col: 1, at: 0.7, parents: ['m1'] },
              { id: 'f1', lane: BRANCH, col: 2, at: 0.9, parents: ['m2'] },
              { id: 'f2', lane: BRANCH, col: 3.5, at: 1.1, parents: ['f1'] },
              { id: 'mg', lane: 'main', col: 4.6, at: 3.9, parents: ['m2', 'f2'], color: 'good', tag: 'main' },
            ],
          });
          s.chip({ id: 'state', x: 1300, y: 270, text: 'PR #128 abierto', color: 'good', at: 1.2, px: 34, states: [{ at: 4.0, text: 'PR #128 fusionado', color: 'accent2' }] });
          ['CI en verde', 'Revisión aprobada', 'Sin conflictos'].forEach((text, i) => s.chip({ x: 1300, y: 370 + i * 66, text, color: 'good', at: 1.6 + i * 0.3, px: 28 }));
          s.node({ id: 'btn', rect: { x: 1300, y: 590, w: 500, h: 110 }, text: 'Fusionar pull request', at: 2.3, color: 'good', px: 38 });
          s.cursor({ path: [[2.4, 1760, 900], [3.3, 1560, 650]], clicks: [3.45], until: 4.4 });
          s.pulse({ target: 'btn', at: 3.45, times: 1, dur: 0.7, color: 'good' });
          s.burst({ origin: 'g.mg', at: 3.95, colors: ['good', 'accent', 'accent2'], radius: 240 });
          s.caption({ text: 'main siempre debe quedar listo para desplegar.', at: 4.9 });
        },
      }),

      scene({
        name: 'build',
        dur: 8,
        transition: { type: 'slide', dur: 0.6 },
        build(s) {
          base(s, 7, 'El build empaqueta la aplicación');
          const m = s.machine({
            id: 'mc',
            rect: { x: 140, y: 250, w: 1640, h: 500 },
            at: 0.4,
            feedStep: 1.3,
            processDur: 1.6,
            inputs: [{ kind: 'doc', label: 'Código de main' }, { kind: 'doc', color: 'accent2' }, { kind: 'doc' }],
            machine: { kind: 'gear', label: 'Build' },
            output: { kind: 'package', label: 'Artefacto v2', color: 'good' },
          });
          const { processStart: workAt, processEnd: outAt } = m.marks;
          ['instalar dependencias', 'compilar', 'optimizar', 'empaquetar'].forEach((text, i) => s.chip({ cx: 330 + i * 420, cy: 824, text, at: workAt + i * 0.4, color: 'warn', px: 28, states: [{ at: workAt + 0.35 + i * 0.4, text, color: 'good' }] }));
          s.burst({ origin: 'mc.out', at: outAt + 0.7, colors: ['good', 'ink', 'accent'], radius: 200 });
          s.caption({ text: 'El mismo artefacto viaja a todos los entornos.', at: outAt + 0.9 });
        },
      }),

      scene({
        name: 'deploy',
        dur: 9,
        transition: { type: 'iris', origin: [1220, 440], dur: 0.7 },
        build(s) {
          base(s, 8, 'El deploy lo lleva a los servidores');
          s.icon({ id: 'pkg', kind: 'package', rect: { x: 110, y: 290, w: 320, h: 360 }, label: 'Artefacto v2', labelPx: 32, color: 'good', at: 0.3, idle: 'float' });
          s.fleet({ id: 'fleet', rect: { x: 640, y: 270, w: 1180, h: 340 }, count: 4, at: 0.6, startAt: 2.2, step: 1.0 });
          [1, 2, 3, 4].forEach((n, i) => {
            const [cx, cy] = s.reg.anchor(`fleet.s${n}`, 'bottom');
            s.packets({ path: [{ id: 'pkg', anchor: 'right' }, [520, 465], [520, 670], [cx, 670], [cx, cy + 6]], at: 1.4 + i * 1.0, until: 1.8 + i * 1.0, every: 0.2, dur: 0.85, color: 'good', size: 8 });
          });
          s.progress({ id: 'roll', rect: { x: 640, y: 720, w: 1180, h: 130 }, label: 'Actualización gradual, sin cortar el servicio', at: 2.05, dur: 4.0, segments: 4, linear: true });
          s.chip({ x: 110, y: 750, text: 'health check OK', at: 6.3, color: 'good', px: 28 });
          s.caption({ text: 'Si algo sale mal, se vuelve a la versión anterior.', at: 6.4 });
        },
      }),

      scene({
        name: 'usuarios',
        dur: 8,
        transition: { type: 'light-sweep', dur: 0.6 },
        build(s) {
          base(s, 9, 'Y llega a tus usuarios');
          s.phone({ id: 'ph', rect: { x: 100, y: 245, w: 340, h: 630 }, at: 0.2 });
          s.appScreen({ id: 'app1', in: 'ph.screen', title: 'Ajustes', at: 0.6, rows: [{ label: 'Idioma', on: true }, { label: 'Avisos', on: true }], feature: { label: 'Oscuro', at: 2.0, badge: 'nuevo' } });
          s.browser({ id: 'web', rect: { x: 520, y: 250, w: 720, h: 430 }, url: 'mi-app.ejemplo.dev/ajustes', at: 0.4 });
          s.appScreen({ id: 'app2', in: 'web.body', title: 'Ajustes', at: 0.9, rows: [{ label: 'Idioma', on: true }, { label: 'Notificaciones', on: true }], feature: { label: 'Modo oscuro', at: 2.5, badge: 'nuevo' } });
          s.burst({ origin: 'app1.feature', at: 2.1, radius: 130, count: 16, colors: ['good', 'warn'] });
          s.burst({ origin: 'app2.feature', at: 2.6, radius: 130, count: 16, colors: ['good', 'warn'] });
          [0, 1, 2].forEach((i) => {
            s.icon({ id: `u${i}`, kind: 'user', rect: { x: 580 + i * 220, y: 720, w: 160, h: 150 }, at: 3.0 + i * 0.2, color: 'accent2', idle: 'float' });
            s.packets({ path: [[880, 690], [660 + i * 220, 730]], at: 3.6 + i * 0.2, until: 6.6, every: 0.6, dur: 0.6, color: 'good', track: false, size: 6 });
          });
          s.chart({ id: 'adopt', rect: { x: 1290, y: 240, w: 540, h: 380 }, type: 'area', data: [0, 3, 9, 20, 38, 58, 76, 90, 97, 100], labels: ['v2'], title: 'Tráfico en v2', color: 'good', at: 2.8, dur: 2.4, mark: { i: 9, text: '100 %' } });
          s.counter({ id: 'pct', rect: { x: 1300, y: 650, w: 520, h: 210 }, to: 100, suffix: ' %', at: 3.2, dur: 2.4, color: 'good', label: 'de los usuarios ya lo tiene', ease: k => k });
          s.caption({ text: 'El mismo cambio, verificado en cada paso.', at: 5.5 });
        },
      }),

      scene({
        name: 'cierre',
        dur: 6.5,
        build(s) {
          s.parallax({ seed: 99 });
          s.kineticText({ id: 'end', text: 'Cada cambio recorre el mismo camino', rect: { x: 160, y: 130, w: 1600, h: 180 }, px: 92, at: 0.2, step: 0.1, mode: 'slam', emphasis: { camino: 'accent' } });
          const stops = [['laptop', 'Editor y commit', 'accent'], ['branch', 'Pull request', 'accent2'], ['shield', 'CI y revisión', 'warn'], ['package', 'Build', 'accent'], ['rocket', 'Deploy', 'accent2'], ['user', 'Usuarios', 'good']];
          stops.forEach(([name, label, color], i) => s.icon({ id: `st${i}`, kind: name, rect: { x: 100 + i * 292, y: 400, w: 260, h: 250 }, label, labelPx: 28, color, at: 0.9 + i * 0.3 }));
          s.packets({ path: stops.map((_, i) => [230 + i * 292, 500]), at: 2.2, until: 5.4, every: 0.45, dur: 2.6, colors: ['accent', 'accent2', 'good', 'warn'], z: -1, ease: 'linear' });
          s.label({ id: 'moral', text: 'Automatizado, revisado y reversible.', rect: { x: 360, y: 760, w: 1200, h: 90 }, type: true, typeAt: 3.4, px: 48, color: 'ink' });
          s.burst({ origin: 'st5', at: 4.9, radius: 220, colors: ['good', 'accent', 'ink'] });
        },
      }),
    ],
  };
};
