// Gallery (7 short scenes, about 55 s): one scene per family of pieces, so a preset shows its whole look at once.
// `preset check <name>` builds this scene in the preset under test and the QA gate must report 0 errors.
// No `export const preset`: the scene renders in whichever preset builds it.
export const title = 'Galería de piezas';

export default ({ scene }) => ({
  title,
  lang: 'es',
  scenes: [
    scene({
      name: 'iconos',
      dur: 7,
      transition: { type: 'light-sweep', dur: 0.5 },
      build(s) {
        s.sectionTag({ index: 1, total: 7, name: 'Iconos', at: 0.1 });
        s.heading({ text: 'Los actores del sistema' });
        s.row(['laptop', 'server', 'database', 'cloud', 'rocket'].map(id => ({ id, w: 300, h: 360 })), { gap: 60 });
        s.icon({ id: 'laptop', kind: 'laptop', label: 'Tu laptop', at: 0.5 });
        s.icon({ id: 'server', kind: 'server', label: 'Servidor', at: 0.9, color: 'accent' });
        s.icon({ id: 'database', kind: 'database', label: 'Datos', at: 1.3, idle: 'float' });
        s.icon({ id: 'cloud', kind: 'cloud', label: 'Nube', at: 1.7, idle: 'sway' });
        s.icon({ id: 'rocket', kind: 'rocket', label: 'Producción', at: 2.1, color: 'accent2', idle: 'bob' });
        s.enter({ targets: 'laptop', at: 0.2, from: 'left', dur: 0.6 });
        s.caption({ text: 'Cada icono se dibuja y se queda quieto o respira.', at: 3.4 });
      },
    }),
    scene({
      name: 'codigo',
      dur: 9,
      build(s) {
        s.sectionTag({ index: 2, total: 7, name: 'Código', at: 0.1 });
        s.heading({ text: 'Escribimos y probamos' });
        const { x, y, w, h } = s.area;
        s.editor({
          id: 'ed',
          rect: { x, y, w: w * 0.58, h },
          file: 'auth.ts',
          at: 0.4,
          typeAt: 1.2,
          cps: 28,
          lines: [
            'export function login(u: User) {',
            { text: '  const ok = check(u.pass);', mark: '-', at: 3 },
            { text: '  const ok = verify(u.pass);', mark: '+', at: 3 },
            '  return ok;',
            '}',
          ],
          highlights: [{ line: 3, at: 4 }],
        });
        s.terminal({
          id: 'term',
          rect: { x: x + w * 0.6, y, w: w * 0.4, h },
          title: 'terminal',
          at: 0.8,
          typeAt: 2,
          steps: [
            { name: 'test', cmd: 'bun test', out: ['login ok', '1 pass'], wait: 0.4 },
            { name: 'save', cmd: 'git commit', out: ['1 file changed'], wait: 0.4 },
          ],
        });
      },
    }),
    scene({
      name: 'pantallas',
      dur: 11,
      build(s) {
        s.sectionTag({ index: 3, total: 7, name: 'Pantallas', at: 0.1 });
        s.heading({ text: 'De la idea a producción' });
        const { x, y, w, h } = s.area;
        s.browser({ id: 'web', rect: { x: x + 120, y, w: w - 240, h }, url: 'github.com/tienda/web/pull/128', at: 0.3 });
        s.prPage({
          id: 'pr',
          in: 'web.body',
          at: 1.2,
          title: 'Agregar cupón',
          number: 128,
          from: 'feat/cupon',
          to: 'main',
          author: 'Lucía',
          stats: { add: 142, del: 18 },
          button: 'Abrir',
          openAt: 3,
          checks: [{ name: 'pruebas', start: 3.8, end: 5.6 }, { name: 'build', start: 4.4, end: 6.2 }],
          reviewers: [{ name: 'Marta', approveAt: 6.8 }],
          mergeAt: 9,
        });
        const at = (id, kx, ky) => {
          const r = s.reg.get(id);
          return [r.x + r.w * kx, r.y + r.h * ky];
        };
        s.cursor({ path: [[1.6, x + w - 500, y + 100], [2.7, ...at('pr.button', 0.8, 0.6)], [3.4, ...at('pr.button', 0.8, 0.6)], [8.4, ...at('pr.merge', 0.85, 0.6)], [10.2, x + w - 400, y + h - 80]], clicks: [3, 9], until: 10.6 });
      },
    }),
    scene({
      name: 'numeros',
      dur: 8,
      build(s) {
        s.sectionTag({ index: 4, total: 7, name: 'Números', at: 0.1 });
        s.heading({ text: 'Medimos lo que importa' });
        s.counter({ id: 'users', rect: { x: 100, y: 260, w: 560, h: 260 }, to: 12480, at: 0.6, dur: 2, label: 'usuarios activos', color: 'accent' });
        s.progress({ id: 'load', rect: { x: 100, y: 640, w: 560, h: 110 }, label: 'Migración', at: 1.4, dur: 3, color: 'accent2' });
        s.chart({ id: 'trend', rect: { x: 760, y: 250, w: 1060, h: 620 }, type: 'area', data: [42, 45, 40, 38, 22, 14, 9, 6], labels: ['L', 'M', 'X', 'J', 'V', 'S', 'D', 'L'], title: 'Errores por día', at: 1, dur: 2.4, mark: { i: 4, text: 'arreglo' } });
        s.reveal({ targets: 'trend', at: 0.8, dur: 0.9, shape: 'wipe', dir: 'left' });
      },
    }),
    scene({
      name: 'anotar',
      dur: 9,
      build(s) {
        s.sectionTag({ index: 5, total: 7, name: 'Anotaciones', at: 0.1 });
        s.kineticText({ id: 'big', text: 'Una revisión *clara*|en tres pasos', rect: { x: 160, y: 150, w: 1600, h: 320 }, mode: 'slam', step: 0.2, at: 0.3, underline: ['clara'] });
        s.node({ id: 'fn', text: 'validar()', rect: { x: 200, y: 590, w: 420, h: 140 }, at: 1.8 });
        s.node({ id: 'db', text: 'guardar()', rect: { x: 760, y: 590, w: 420, h: 140 }, at: 2.2 });
        s.edge({ from: 'fn', to: 'db', at: 2.8 });
        s.callout({ id: 'note', target: 'db', text: 'Falta revisar el stock', side: 'right', w: 520, at: 3.6, color: 'warn' });
        s.chip({ id: 'state', cx: 410, cy: 520, text: 'en cola', color: 'warn', icon: 'dot', at: 4, states: [{ at: 6, text: 'listo', color: 'good', icon: 'check', solid: true }] });
        s.stamp({ id: 'verdict', text: 'REVISAR', cx: 1560, cy: 830, at: 5.2, color: 'warn' });
      },
    }),
    scene({
      name: 'paquetes',
      dur: 9,
      build(s) {
        s.sectionTag({ index: 6, total: 7, name: 'Movimiento', at: 0.1 });
        s.journeyRail({ steps: ['Enviar', 'Procesar', 'Guardar'], active: 1 });
        s.icon({ id: 'a', kind: 'laptop', rect: { x: 160, y: 380, w: 280, h: 340 }, label: 'Cliente', at: 0.4 });
        s.icon({ id: 'b', kind: 'server', rect: { x: 820, y: 300, w: 280, h: 340 }, label: 'Servidor', at: 0.6 });
        s.icon({ id: 'c', kind: 'database', rect: { x: 1480, y: 440, w: 280, h: 340 }, label: 'Base', at: 0.8 });
        s.packets({ id: 'up', path: ['a', 'b'], curve: 'arc', bend: -110, shape: 'doc', at: 1.6, until: 2.8, every: 0.6, dur: 1.4, color: 'accent', ping: true });
        s.packets({ id: 'down', path: ['b', 'c'], curve: 's', shape: 'package', at: 3.8, until: 4.8, every: 0.5, dur: 1.4, color: 'accent2', ping: true });
        s.burst({ origin: 'c', at: 5.8 });
        s.camera.focus('b', 6.4, 0.9).reset(8, 0.6);
      },
    }),
    scene({
      name: 'sistemas',
      dur: 11,
      build(s) {
        s.sectionTag({ index: 7, total: 7, name: 'Sistemas', at: 0.1 });
        s.heading({ text: 'Pipeline y ramas' });
        const { x, y, w, h } = s.area;
        s.pipeline({
          id: 'ci',
          rect: { x, y, w: w * 0.5, h },
          at: 0.4,
          runAt: 1,
          stages: [
            { name: 'Build', jobs: [{ name: 'Compilar', dur: 1.4 }] },
            { name: 'Test', jobs: [{ name: 'Unitarias', dur: 1.6 }, { name: 'E2E', dur: 2, ok: false }] },
          ],
        });
        s.gitGraph({
          id: 'g',
          rect: { x: x + w * 0.52, y, w: w * 0.48, h },
          at: 0.8,
          lanes: [{ name: 'main', color: 'accent' }, { name: 'feat', color: 'accent2' }],
          commits: [
            { id: 'c1', lane: 'main', col: 0, at: 1.4, label: 'inicio' },
            { id: 'f1', lane: 'feat', col: 1, at: 2.4, parents: ['c1'], label: 'botón' },
            { id: 'm', lane: 'main', col: 2, at: 3.8, parents: ['c1', 'f1'], label: 'fusión', tag: 'v1' },
          ],
        });
      },
    }),
  ],
});
