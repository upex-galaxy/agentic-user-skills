// "Cómo llega tu código desde tu laptop hasta producción": 10 scenes, about 86 s. Port of the Fable sketch run to the
// merged engine. Preset-agnostic: only pieces and style tokens, no raw drawing and no hex colors. On-screen text is Spanish.
export const title = 'Cómo llega tu código a producción';
export const preset = 'sketch';

const STEPS = ['Código', 'Commit', 'Pull request', 'CI', 'Review', 'Build', 'Deploy', 'Usuarios'];

/** Frame furniture shared by the story scenes: parallax doodles, section tag, heading and the journey rail. */
function frame(s, i, heading) {
  s.parallax({ seed: i + 2, count: 22 });
  s.sectionTag({ index: i + 1, total: STEPS.length, name: STEPS[i], at: 0.1 });
  s.heading({ text: heading, at: 0.3 });
  s.journeyRail({ steps: STEPS, active: i, at: 0.2 });
}
const cap = (s, text, at, y = 884, w = 1500) => s.caption({ text, at, rect: { x: (1920 - w) / 2, y, w, h: 84 } });

export default ({ scene, path }) => ({
  title,
  lang: 'es',
  scenes: [
    // 0. Title: kinetic words, the two ends of the trip and documents already travelling between them.
    scene({
      name: 'titulo',
      dur: 6.5,
      transition: { type: 'zoom-through', dur: 0.7, origin: [395, 700] },
      build(s) {
        s.parallax({ seed: 1, count: 34 });
        s.particles({ mode: 'ambient', rect: { x: 100, y: 100, w: 1720, h: 880 }, count: 24, colors: ['warn', 'accent2'], at: 0.2, until: 6.2 });
        s.kineticText({ id: 'tt', rect: { x: 160, y: 110, w: 1600, h: 320 }, text: 'Cómo llega tu código|hasta *producción*', underline: ['producción'], at: 0.3, step: 0.13, px: 160 });
        s.icon({ id: 'laptop', kind: 'laptop', x: 270, y: 570, size: 250, at: 1.5, label: 'tu laptop', idle: 'float' });
        s.icon({ id: 'prod', kind: 'cloud', x: 1400, y: 570, size: 250, at: 1.9, color: 'accent2', label: 'producción', idle: 'float' });
        const A = [540, 690];
        const B = [1390, 690];
        const pts = path.linkPts(A, B, 'arc', -90);
        s.packets({ path: [A, B], curve: 'arc', bend: -90, at: 2.6, until: 6.0, every: 0.55, dur: 2.4, shape: 'doc', size: 54, color: 'accent' });
        [['gear', 0.25, 2.5, 'ink'], ['check', 0.5, 2.8, 'good'], ['package', 0.75, 3.1, 'ink']].forEach(([kind, k, at, color]) => {
          const p = path.pointAt(pts, k);
          s.icon({ kind, x: p.x - 50, y: p.y - 135, size: 100, at, color, idle: 'bob', spin: 1.5 });
        });
        s.label({ text: 'El viaje de un cambio, paso a paso', rect: { x: 360, y: 925, w: 1200, h: 90 }, at: 3.4, type: true, color: 'dim' });
        s.animate({ targets: ['laptop', 'prod'], y: [[0, 30], [2.6, 0]] });
        s.camera.zoom(1.05, 0.2, 6, { ease: 'linear' });
      },
    }),

    // 1. Editor: the change is typed, marked as added, and the local preview reacts.
    scene({
      name: 'codigo',
      dur: 9,
      transition: { type: 'slide', dur: 0.6 },
      build(s) {
        frame(s, 0, 'Todo empieza en tu editor');
        s.editor({
          id: 'ed',
          rect: { x: 100, y: 256, w: 1060, h: 520 },
          file: 'carrito.js',
          at: 0.3,
          typeAt: 1.0,
          cps: 42,
          lines: ['// carrito.js', 'export function total(items) {', '  let suma = 0;', '  for (const it of items) {', '    suma += it.precio * it.cantidad;', '  }', { text: '  return descuento(suma, 10);', mark: '+' }, '}'],
          highlights: [{ line: 7, at: 4.9 }],
        });
        s.browser({ id: 'prev', rect: { x: 1220, y: 256, w: 600, h: 480 }, url: 'localhost:3000', at: 4.6 });
        s.appScreen({
          id: 'cart',
          in: 'prev.body',
          at: 5.2,
          title: 'Tu carrito',
          rows: [{ label: 'Café x2', value: '$80' }],
          total: { label: 'Total', from: 120, to: 108, prefix: '$', at: 6.4, dur: 0.8 },
          feature: { label: 'Descuento 10%', at: 6.0, badge: '-$12' },
        });
        s.callout({ target: 'ed', text: 'tu cambio', side: 'bottom', dist: 30, w: 300, h: 80, at: 5.0 });
        s.burst({ origin: [1740, 640], at: 6.9, radius: 110 });
        s.label({ text: 'Lo pruebas en tu máquina', rect: { x: 1220, y: 760, w: 600, h: 90 }, at: 6.6, type: true, color: 'accent2' });
        s.camera.focus('ed', 1.0, 1.0, { zoom: 1.32 });
        s.camera.reset(4.2, 0.9);
      },
    }),

    // 2. Commit and push: terminal on the left, the branch growing on the right, boxes flying to the remote.
    scene({
      name: 'commit',
      dur: 9.5,
      transition: { type: 'drop', dur: 0.6 },
      build(s) {
        frame(s, 1, 'Guardas una foto del cambio y la subes');
        s.terminal({
          id: 'term',
          rect: { x: 100, y: 256, w: 880, h: 500 },
          at: 0.3,
          steps: [
            { cmd: 'git checkout -b descuento', at: 0.9, out: ['Switched to a new branch \'descuento\''] },
            { cmd: 'git commit -am "Aplica descuento"', at: 2.7, out: ['[descuento 3f2a1c9] Aplica descuento', ' 1 file changed, 2 insertions(+)'] },
            { cmd: 'git push origin descuento', at: 5.2, out: [{ text: ' * [new branch]  descuento -> descuento', color: 'good' }] },
          ],
        });
        s.gitGraph({
          id: 'g',
          rect: { x: 1040, y: 270, w: 780, h: 230 },
          at: 0.5,
          cols: 4,
          lanes: [{ name: 'main' }, { name: 'descuento', color: 'accent' }],
          commits: [
            { id: 'a', lane: 'main', col: 0, at: 0.6 },
            { id: 'b', lane: 'main', col: 1, at: 0.8, parents: ['a'] },
            { id: 'c', lane: 'main', col: 2, at: 1.0, parents: ['b'] },
            { id: 'd', lane: 'descuento', col: 3, at: 4.6, parents: ['c'] },
          ],
        });
        s.burst({ target: 'g.d', at: 4.7 });
        s.icon({ id: 'local', kind: 'laptop', x: 1080, y: 585, size: 170, at: 0.7, label: 'local' });
        s.icon({ id: 'remote', kind: 'cloud', x: 1610, y: 585, size: 170, at: 1.0, color: 'accent2', label: 'remoto' });
        s.packets({ path: ['local', 'remote'], curve: 'arc', bend: -150, at: 6.5, count: 4, every: 0.25, dur: 1.2, shape: 'box', size: 32, color: 'accent' });
        s.burst({ target: 'remote', at: 7.9, radius: 150, colors: ['accent2'] });
        s.chip({ cx: 1430, cy: 545, text: 'origin/descuento', mono: true, color: 'accent', at: 8.0, px: Math.round(s.style.defaults.labelPx * 0.75) });
        cap(s, 'Commit: una foto con nombre. Push: la copia viaja al remoto.', 7.2, 835);
        s.camera.focus({ x: 800, y: 250, w: 1000, h: 460 }, 3.9, 0.8, { zoom: 1.2 });
        s.camera.reset(5.4, 0.8);
      },
    }),

    // 3. Pull request: a browser page, a cursor that clicks, the page reacts.
    scene({
      name: 'pull-request',
      dur: 9.5,
      transition: { type: 'iris', dur: 0.7, origin: [1100, 560] },
      build(s) {
        frame(s, 2, 'Propones el cambio al equipo');
        s.prPage({
          id: 'pr',
          rect: { x: 100, y: 256, w: 1240, h: 610 },
          at: 0.3,
          title: 'Aplica descuento al total',
          number: 128,
          from: 'descuento',
          to: 'main',
          author: 'Ana',
          stats: { add: 14, del: 3 },
          labels: ['carrito.js', 'tests'],
          button: 'Crear pull request',
          openAt: 3.6,
          checks: [{ name: 'CI en cola', start: 4.6, end: 9.2 }, { name: 'Pruebas', start: 5.0, end: 9.3 }],
          reviewers: [{ name: 'Review pendiente', approveAt: 9.4 }],
        });
        s.cursor({ path: [[2.3, 720, 600], [3.4, 'pr.button']], clicks: [3.6], until: 4.6 });
        [['doc', 'Qué cambia', 5.3, 'ink'], ['user', 'Quién revisa', 5.7, 'accent2'], ['shield', 'Pruebas ok?', 6.1, 'ink']].forEach(([kind, label, at, color], i) => {
          s.icon({ kind, x: 1480, y: 270 + i * 190, size: 110, at, color, label, labelPx: 44, labelSide: 'left', idle: 'float' });
        });
        cap(s, 'Un pull request pide sumar tu rama a main, a la vista de todos.', 6.4);
        const bt = s.reg.get('pr.button');
        s.camera.focus({ x: bt.x - 260, y: bt.y - 200, w: bt.w + 520, h: bt.h + 300 }, 2.6, 0.8, { zoom: 1.4 });
        s.camera.reset(4.1, 0.8);
      },
    }),

    // 4. CI: jobs run, tests fill a grid, the counter climbs, a stamp lands.
    scene({
      name: 'ci',
      dur: 10.5,
      transition: { type: 'push-zoom', dur: 0.6 },
      build(s) {
        frame(s, 3, 'Las máquinas lo prueban solas');
        s.pipeline({
          id: 'ci',
          rect: { x: 100, y: 256, w: 1000, h: 340 },
          title: 'pipeline #128',
          at: 0.3,
          runAt: 1.0,
          timeScale: 22,
          stages: [
            { name: 'Preparar', jobs: [{ name: 'Instalar', start: 1.0, dur: 1.1, secs: 22 }, { name: 'Lint', start: 2.1, dur: 1.1, secs: 14 }] },
            { name: 'Probar', jobs: [{ name: 'Tests', start: 3.2, dur: 3.0, secs: 96 }] },
            { name: 'Empaquetar', jobs: [{ name: 'Build', start: 6.2, dur: 1.3, secs: 41 }] },
          ],
        });
        s.counter({ rect: { x: 1180, y: 250, w: 620, h: 170 }, keys: [[3.2, 0], [6.2, 128]], suffix: ' / 128', label: 'tests en verde', color: 'good', at: 2.8 });
        s.dotGrid({ rect: { x: 1190, y: 440, w: 600, h: 330 }, rows: 8, cols: 16, at: 3.2, dur: 3.0 });
        s.stamp({ cx: 600, cy: 695, text: 'CI en verde', at: 7.8, color: 'good' });
        s.particles({ mode: 'confetti', origin: [960, 520], at: 7.95, count: 70, dur: 2.2 });
        cap(s, 'Si una prueba falla, el cambio no avanza.', 8.3, 800, 1100);
      },
    }),

    // 5. Review and merge: a conversation, a fix, an approval, and the branch joins main.
    scene({
      name: 'review',
      dur: 10,
      transition: { type: 'zoom-through', dur: 0.7, origin: [1670, 692] },
      build(s) {
        frame(s, 4, 'Otra persona lo revisa');
        s.icon({ id: 'ana', kind: 'user', x: 140, y: 290, size: 170, at: 0.4, color: 'accent', label: 'Ana, autora', idle: 'sway' });
        s.icon({ id: 'leo', kind: 'user', x: 1610, y: 290, size: 170, at: 0.7, color: 'accent2', label: 'Leo, revisor', idle: 'sway' });
        s.bubble({ rect: { x: 990, y: 262, w: 570, h: 110 }, text: 'Y si el carrito está vacío?', tail: 'right', at: 1.2, color: 'accent2' });
        s.bubble({ rect: { x: 360, y: 396, w: 560, h: 110 }, text: 'Buen punto: agrego ese caso', tail: 'left', at: 2.8, color: 'accent' });
        s.editor({ id: 'fix', rect: { x: 950, y: 440, w: 610, h: 150 }, file: 'carrito.js', lineNumbers: false, lines: [{ text: 'if (!items.length) return 0;', mark: '+' }], at: 3.8, typeAt: 4.3, cps: 40 });
        s.stamp({ cx: 700, cy: 312, text: 'Aprobado', at: 5.6, rot: -0.1 });
        s.gitGraph({
          id: 'mg',
          rect: { x: 200, y: 620, w: 1520, h: 240 },
          at: 0.5,
          cols: 6,
          lanes: [{ name: 'main' }, { name: 'descuento', color: 'accent' }],
          commits: [
            { id: 'a', lane: 'main', col: 0, at: 0.6 },
            { id: 'b', lane: 'main', col: 1, at: 0.75, parents: ['a'] },
            { id: 'c', lane: 'main', col: 2, at: 0.9, parents: ['b'] },
            { id: 'd', lane: 'descuento', col: 3, at: 1.2, parents: ['c'] },
            { id: 'e', lane: 'descuento', col: 4, at: 5.0, parents: ['d'] },
            { id: 'm', lane: 'main', col: 5, at: 7.0, parents: ['c', 'e'] },
          ],
        });
        s.burst({ target: 'mg.m', at: 7.1 });
        s.chip({ cx: 455, cy: 562, text: 'Abierto', color: 'good', at: 1.4, states: [{ at: 7.2, text: 'Fusionado', color: 'accent2', solid: true }] });
        cap(s, 'Aprobado y en verde: tu rama se fusiona con main.', 7.4, 870, 1300);
        s.camera.zoom(1.06, 6.2, 0.8);
        s.camera.reset(8.4, 0.7);
      },
    }),

    // 6. Build: sources flow into the gears, an artifact comes out, built from layers.
    scene({
      name: 'build',
      dur: 9,
      transition: { type: 'slide', dur: 0.6 },
      build(s) {
        frame(s, 5, 'El build lo empaqueta');
        const docs = [['código', 'accent'], ['dependencias', 'accent2'], ['configuración', 'ink']].map(([label, color], i) => s.icon({ id: `src${i}`, kind: 'doc', x: 150, y: 262 + i * 196, size: 124, at: 0.4 + i * 0.2, color, label, labelPx: 38, labelSide: 'right' }));
        s.icon({ id: 'g1', kind: 'gear', x: 600, y: 360, size: 270, at: 0.9, spin: 1.6, color: 'warn' });
        s.icon({ id: 'g2', kind: 'gear', x: 890, y: 290, size: 170, at: 1.1, spin: -2.5 });
        docs.forEach((d, i) => s.packets({ path: [`src${i}`, 'g1'], curve: 's', at: 1.5 + i * 0.2, until: 5.0, every: 0.6, dur: 1.1, shape: 'doc', size: 44, color: ['accent', 'accent2', 'ink'][i] }));
        s.progress({ rect: { x: 600, y: 700, w: 620, h: 110 }, label: 'Compilando y empaquetando', at: 1.3, dur: 3.8 });
        s.icon({ id: 'pkg', kind: 'package', x: 1340, y: 300, size: 220, at: 3.3, label: 'artefacto', labelSide: 'top', labelPx: 50, idle: 'float' });
        s.packets({ path: ['g1', 'pkg'], curve: 'arc', bend: -120, at: 2.9, until: 5.0, every: 0.5, dur: 1.0, shape: 'box', size: 30, color: 'warn' });
        s.layers({ rect: { x: 1250, y: 670, w: 400, h: 190 }, layers: [{ text: 'Sistema base', color: 'dim' }, { text: 'Dependencias', color: 'accent2' }, { text: 'Tu código', color: 'accent' }], at: 4.2, step: 0.5 });
        s.chip({ cx: 1730, cy: 359, text: 'v2.4.0', mono: true, color: 'accent', at: 5.8 });
        s.burst({ target: 'pkg', at: 5.8, radius: 200 });
        cap(s, 'Lo mismo que se probó es lo que se despliega.', 6.1, 884, 1200);
        s.camera.focus('g1', 1.6, 0.8, { zoom: 1.3 });
        s.camera.reset(3.0, 0.8);
      },
    }),

    // 7. Deploy: traffic keeps flowing while the servers switch version one by one.
    scene({
      name: 'deploy',
      dur: 11,
      transition: { type: 'light-sweep', dur: 0.6 },
      build(s) {
        frame(s, 6, 'Deploy gradual: sin apagar nada');
        const U = [3.0, 5.0, 7.0];
        [0, 1, 2].forEach(i => s.icon({ id: `u${i}`, kind: 'user', x: 120, y: 290 + i * 180, size: 120, at: 0.4 + i * 0.15, color: 'accent2', idle: 'bob' }));
        s.node({ id: 'lb', rect: { x: 480, y: 440, w: 300, h: 150 }, text: 'Balanceador', color: 'accent2', at: 0.8 });
        [0, 1, 2].forEach((i) => {
          const y = 256 + i * 200;
          s.icon({ id: `s${i}`, kind: 'server', x: 1120, y, size: 170, at: 0.9 + i * 0.15 });
          s.packets({ path: [`u${i}`, 'lb'], curve: 'arc', bend: (i - 1) * 60, at: 1.4 + i * 0.2, until: 10, every: 0.7, dur: 0.9, size: 9, color: 'accent2' });
          s.packets({ path: ['lb', `s${i}`], curve: 'arc', bend: (i - 1) * 60, at: 1.8 + i * 0.15, until: U[i] - 0.4, every: 0.5, dur: 0.9, size: 9, color: 'accent' });
          s.packets({ path: ['lb', `s${i}`], curve: 'arc', bend: (i - 1) * 60, at: U[i] + 1.7, until: 10, every: 0.5, dur: 0.9, size: 9, color: 'good', track: false });
          s.chip({ cx: 1380, cy: y + 85, text: 'v1', color: 'dim', at: 1.2 + i * 0.15, states: [{ at: U[i] + 1.3, text: 'v2', color: 'good', solid: true }] });
          s.chip({ cx: 1558, cy: y + 85, text: 'prueba', icon: 'spinner', color: 'warn', at: U[i], states: [{ at: U[i] + 1.1, text: 'ok', icon: 'check', color: 'good', solid: true }] });
          s.burst({ target: `s${i}`, at: U[i] + 1.5, radius: 150, count: 10, colors: ['good'] });
        });
        s.counter({ rect: { x: 1696, y: 400, w: 180, h: 200 }, keys: [[3, 0], [4.3, 0], [4.7, 33], [6.3, 33], [6.7, 67], [8.3, 67], [8.7, 100]], suffix: '%', label: 'tráfico en v2', color: 'good', at: 2.6 });
        cap(s, 'Un servidor a la vez. Si algo falla, se vuelve a la versión anterior.', 8.8, 880, 1560);
      },
    }),

    // 8. Users: the change on a phone, people reacting, and the team still watching the numbers.
    scene({
      name: 'usuarios',
      dur: 8.5,
      transition: { type: 'push-zoom', dur: 0.6 },
      build(s) {
        frame(s, 7, 'Ya está en manos de tus usuarios');
        s.phone({ id: 'ph', rect: { x: 200, y: 254, w: 300, h: 580 }, at: 0.4, tilt: -3 });
        s.appScreen({
          id: 'app',
          in: 'ph.screen',
          at: 1.0,
          title: 'Tu carrito',
          rows: [{ label: 'Café x2', value: '$80' }],
          total: { label: 'Total', from: 120, to: 108, prefix: '$', at: 2.5, dur: 0.8 },
          feature: { label: 'Descuento', at: 2.2, badge: '-$12' },
          cta: 'Pagar',
        });
        [0, 1, 2, 3].forEach(i => s.icon({ kind: 'user', x: 660 + i * 190, y: 290, size: 130, at: 3.3 + i * 0.18, color: i % 2 ? 'accent2' : 'accent', idle: 'bob' }));
        s.particles({ mode: 'hearts', rect: { x: 680, y: 280, w: 680, h: 60 }, at: 3.9, count: 12, dur: 2.6, colors: ['accent', 'bad'] });
        s.icon({ kind: 'check', x: 1560, y: 290, size: 130, at: 5.8, color: 'good', label: 'todo estable', labelPx: 44, idle: 'pulse' });
        s.chart({ rect: { x: 640, y: 540, w: 560, h: 320 }, type: 'area', title: 'Pedidos', data: [3, 4, 4, 6, 7, 9, 12], at: 3.6, colors: ['accent2'] });
        s.chart({ rect: { x: 1260, y: 540, w: 540, h: 320 }, type: 'bars', title: 'Errores', data: [2, 2, 1, 1], labels: ['lun', 'mar', 'mié', 'hoy'], colors: ['dim', 'dim', 'dim', 'good'], yMax: 8, at: 4.3, step: 0.3 });
        cap(s, 'Y el equipo sigue mirando: errores, tiempos y uso.', 5.6, 884, 1200);
        s.camera.focus('ph', 1.2, 0.9, { zoom: 1.3 });
        s.camera.reset(3.2, 0.8);
      },
    }),

    // 9. Recap: the whole trip in one row, a packet hops icon to icon while the camera follows, then the closing line.
    scene({
      name: 'resumen',
      dur: 8,
      build(s) {
        s.parallax({ seed: 11, count: 30 });
        s.sectionTag({ text: 'Resumen', at: 0.1 });
        const kinds = ['laptop', 'branch', 'doc', 'gear', 'user', 'package', 'server', 'heart'];
        const xs = kinds.map((_, i) => 120 + i * 221);
        const y = 500;
        kinds.forEach((kind, i) => s.icon({ id: `r${i}`, kind, x: xs[i], y, size: 130, at: 0.3 + i * 0.14, color: i === 7 ? 'accent' : 'ink', label: STEPS[i], labelPx: 40, spin: 1.5 }));
        const T0 = 1.7;
        const hop = xs.map(x => [x + 65, y - 10]);
        const TD = 3.6;
        s.packets({ path: hop, curve: 'arc', bend: -70, at: T0, dur: TD, ease: 'linear', shape: 'box', size: 34, color: 'accent' });
        kinds.forEach((_, i) => i && s.burst({ target: `r${i}`, at: T0 + (TD * i) / 7, radius: 118, count: 10, dur: 0.5 }));
        s.kineticText({ rect: { x: 160, y: 150, w: 1600, h: 250 }, text: 'De tu laptop a *producción*', underline: ['producción'], at: 5.5, mode: 'slam', step: 0.13, px: 150 });
        s.particles({ mode: 'confetti', origin: [960, 330], at: 6.2, count: 80, dur: 1.8 });
        s.label({ text: 'en pasos pequeños, con red de seguridad', rect: { x: 260, y: 790, w: 1400, h: 110 }, at: 6.5, type: true, color: 'accent2' });
        s.camera.focus({ x: xs[0], y: y - 40, w: 130, h: 200 }, 0.9, 0.8, { zoom: 1.6 });
        s.camera.pan(xs[7] + 65, y + 60, T0, TD, { ease: 'linear' });
        s.camera.reset(5.3, 0.8);
      },
    }),
  ],
});
