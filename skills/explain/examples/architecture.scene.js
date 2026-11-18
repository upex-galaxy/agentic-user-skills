// Reference example (poster preset, ~78 s, 9 scenes): the architecture of the /explain skill itself.
// Shows: kinetic title, architecture layers with packets, a clock + counter driven by time, an editor typing a tiny
// scene.js next to its live result, icons and packets for the export conversation (CLI, server, Chrome, page),
// a stateMachine with a flipping status chip, a QA scene (callout, chips that flip, stamp), the same object in three
// looks (sketch, hologram, poster), a journeyRail and a three-point recap. Facts come from the skill's own files.
export const preset = 'poster';
export const title = 'Cómo funciona la skill /explain por dentro';

const SRC = 'archivos de la skill explain (cli/ y engine/)';
const STEPS = ['Capas', 'Motor', 'Piezas', 'Exportar', 'Ciclo', 'QA', 'Looks'];
const CODE = [
  's.node({ id: \'dev\', text: \'Cambio\', at: 1 });',
  's.node({ id: \'ci\', text: \'Pruebas\', at: 1.6 });',
  's.edge({ from: \'dev\', to: \'ci\', at: 2.2 });',
  's.pulse({ target: \'ci\', at: 3 });',
  's.caption({ text: \'Listo\', at: 4 });',
];

export default ({ scene }) => {
  const base = (s, i, heading) => {
    s.parallax({ seed: 21 + i });
    s.journeyRail({ steps: STEPS, active: i });
    s.heading({ text: heading });
  };
  return {
    title,
    lang: 'es',
    scenes: [
      scene({
        name: 'portada',
        dur: 6.5,
        transition: { type: 'zoom-through', origin: 'gear', dur: 0.7 },
        build(s) {
          s.parallax({ seed: 3, count: 26 });
          s.kineticText({ id: 'hero', text: 'Cómo funciona|la skill */explain*|por dentro', rect: { x: 160, y: 110, w: 1600, h: 480 }, px: 150, at: 0.2, step: 0.16, mode: 'slam' });
          s.label({ id: 'sub', text: 'De un scene.js a un MP4, sin instalar nada', rect: { x: 260, y: 610, w: 1400, h: 90 }, type: true, typeAt: 1.6, color: 'dim', px: 46 });
          s.icon({ id: 'doc', kind: 'doc', rect: { x: 330, y: 740, w: 230, h: 270 }, label: 'scene.js', at: 1.0, idle: 'float' });
          s.icon({ id: 'gear', kind: 'gear', rect: { x: 845, y: 740, w: 230, h: 270 }, label: 'Motor', color: 'accent2', at: 1.3, spin: 0.9 });
          s.icon({ id: 'mp4', kind: 'package', rect: { x: 1360, y: 740, w: 230, h: 270 }, label: 'MP4', color: 'good', at: 1.6, idle: 'float' });
          s.packets({ path: ['doc', 'gear', 'mp4'], at: 2.4, until: 5.6, every: 0.4, dur: 1.4, shape: 'doc', size: 44, colors: ['accent', 'accent2', 'good'], track: false });
        },
      }),

      scene({
        name: 'arquitectura',
        dur: 11,
        build(s) {
          base(s, 0, 'Tres capas: autoría, motor y salida');
          s.architecture({
            zones: [
              { id: 'author', title: 'Autoría', nodes: [{ id: 'scene', text: 'scene.js' }, { id: 'pieces', text: 'Piezas' }] },
              { id: 'core', title: 'Motor', nodes: [{ id: 'engine', text: 'Engine' }, { id: 'styles', text: 'Estilos' }] },
              { id: 'out', title: 'Salida', nodes: [{ id: 'qa', text: 'QA gate' }, { id: 'chrome', text: 'Chrome headless' }, { id: 'mp4', text: 'MP4' }] },
            ],
            links: [['scene', 'engine', 'describe'], ['pieces', 'engine', 'dibujan'], ['styles', 'engine', 'pintan'], ['engine', 'qa', 'revisa'], ['engine', 'chrome', 'renderiza'], ['chrome', 'mp4', 'H.264']],
            at: 0.5,
          });
          s.packets({ path: ['scene', 'engine', 'chrome', 'mp4'], at: 5.4, until: 9.6, every: 0.5, dur: 2.2, shape: 'doc', size: 40, colors: ['accent', 'accent2', 'good'], track: false });
          s.spotlight({ target: 'engine', at: 5.0, until: 6.8, color: 'accent' });
          s.pulse({ target: 'mp4', at: 8.6, times: 2, dur: 0.8, color: 'good' });
          s.caption({ text: 'Un scene.js entra por la izquierda y sale un MP4.', at: 6.6, until: 10.6, typeDur: 1 });
          s.sourceFooter({ text: SRC, at: 1 });
        },
      }),

      scene({
        name: 'motor',
        dur: 10,
        transition: { type: 'light-sweep', dur: 0.6 },
        build(s) {
          base(s, 1, 'El motor dibuja por tiempo');
          s.icon({ id: 'clk', kind: 'clock', rect: { x: 150, y: 250, w: 250, h: 270 }, label: 'Reloj virtual', color: 'accent2', at: 0.3, spin: 0.4 });
          s.counter({ id: 'tt', rect: { x: 440, y: 250, w: 340, h: 270 }, keys: [[0.8, 0], [4.8, 4], [6.4, 2], [9, 2]], decimals: 1, suffix: ' s', label: 'tiempo local', color: 'accent', at: 0.8 });
          s.browser({ id: 'br', rect: { x: 840, y: 250, w: 990, h: 440 }, url: 'escena · cuadro en t', at: 0.4 });
          const body = s.reg.get('br.body');
          s.icon({ id: 'rk', kind: 'rocket', rect: { x: body.x + 40, y: body.y + 30, w: 180, h: body.h - 60 }, at: 0.9, color: 'good' });
          s.animate({ targets: 'rk', x: [[0.8, 0], [4.8, body.w - 300], [6.4, (body.w - 300) / 2], [9, (body.w - 300) / 2]], ease: 'inOut' });
          ['Escenas', 'Transiciones', 'Cámara', 'Cuadro repetible'].forEach((text, i) => {
            s.chip({ cx: 270 + i * 470, cy: 790, text, at: 2.6 + i * 0.8, color: ['accent', 'accent2', 'warn', 'good'][i], px: 40, solid: i === 3 });
          });
          s.chip({ x: 150, y: 560, text: 'mismo t, mismo cuadro', at: 6.6, color: 'good', px: 36, icon: 'check' });
          s.caption({ text: 'Cada cuadro se dibuja en función del tiempo.', at: 5.6, typeDur: 1 });
          s.sourceFooter({ text: SRC, at: 1 });
        },
      }),

      scene({
        name: 'piezas',
        dur: 10.5,
        build(s) {
          base(s, 2, 'La escena es código con piezas');
          s.editor({
            id: 'ed',
            rect: { x: 90, y: 250, w: 1010, h: 560 },
            file: 'scene.js',
            title: 'mi-video',
            lines: CODE,
            at: 0.2,
            typeAt: 0.7,
            cps: 60,
            highlights: [{ line: 3, at: 4.6, until: 7.2 }],
            cursorLine: 5,
          });
          s.node({ id: 'dev', rect: { x: 1330, y: 440, w: 420, h: 120 }, text: 'Cambio', at: 1.5, color: 'accent' });
          s.node({ id: 'ci', rect: { x: 1330, y: 660, w: 420, h: 120 }, text: 'Pruebas', at: 2.25, color: 'accent2' });
          s.edge({ from: 'dev', to: 'ci', at: 2.95 });
          s.pulse({ target: 'ci', at: 3.5, times: 2, dur: 0.8, color: 'good' });
          s.callout({ target: 'ed.l3', text: 'Las conexiones usan ids', rect: { x: 1190, y: 255, w: 630, h: 130 }, bend: 0, at: 4.6, color: 'warn' });
          s.caption({ text: 'Listo', at: 4.2, until: 5.6 });
          s.caption({ text: 'Cada pieza se llama como s.nombre y se coloca sola.', at: 6.0, typeDur: 1 });
          s.sourceFooter({ text: SRC, at: 1 });
        },
      }),

      scene({
        name: 'exportar',
        dur: 11.5,
        transition: { type: 'zoom-through', origin: 'chrome', dur: 0.7 },
        build(s) {
          base(s, 3, 'Quién habla con quién al exportar');
          const row = [['cli', 'laptop', 'CLI', 'accent', 100], ['srv', 'server', 'Servidor', 'accent2', 560], ['chrome', 'globe', 'Chrome', 'warn', 1020], ['page', 'doc', 'Página', 'good', 1480]];
          row.forEach(([id, kind, label, color, x], i) => s.icon({ id, kind, rect: { x, y: 340, w: 320, h: 300 }, label, labelPx: 40, color, at: 0.3 + i * 0.25, idle: 'float' }));
          const go = (path, at, color, o = {}) => s.packets({ path, at, count: 3, every: 0.25, dur: 1.0, color, track: false, size: 24, ...o });
          go(['cli', 'srv'], 1.4, 'accent', { curve: 'arc', bend: -70 });
          go(['cli', 'chrome'], 3.0, 'warn', { curve: 'arc', bend: -200 });
          go(['chrome', 'page'], 4.6, 'good', { curve: 'arc', bend: -70 });
          go(['page', 'srv'], 6.6, 'good', { curve: 'arc', bend: -200, shape: 'package', size: 52 });
          go(['srv', 'cli'], 8.2, 'accent2', { curve: 'arc', bend: 70, shape: 'package', size: 52 });
          s.chip({
            cx: 700,
            cy: 770,
            text: '1 · La CLI levanta el servidor local',
            at: 1.4,
            color: 'accent',
            px: 44,
            states: [
              { at: 3.0, text: '2 · La CLI abre la página en Chrome', color: 'warn' },
              { at: 4.6, text: '3 · Chrome ejecuta la escena', color: 'good' },
              { at: 6.6, text: '4 · La página envía el MP4', color: 'good', icon: 'package' },
              { at: 8.2, text: '5 · El servidor guarda el archivo', color: 'accent2', icon: 'check' },
            ],
          });
          s.counter({ id: 'frames', rect: { x: 1380, y: 690, w: 460, h: 170 }, from: 0, to: 90, at: 4.6, dur: 2.4, ease: 'linear', label: 'cuadros codificados', color: 'good' });
          s.burst({ origin: 'cli', at: 9.3, colors: ['accent2', 'good', 'ink'], radius: 200 });
          s.caption({ text: 'La página codifica H.264 con WebCodecs.', at: 7.4, until: 11, typeDur: 1 });
          s.sourceFooter({ text: SRC, at: 1 });
        },
      }),

      scene({
        name: 'ciclo',
        dur: 12,
        transition: { type: 'light-sweep', dur: 0.6 },
        build(s) {
          base(s, 4, 'Un video pasa por cuatro estados');
          s.stateMachine({
            states: [{ id: 'draft', text: 'Borrador' }, { id: 'built', text: 'Construido' }, { id: 'checked', text: 'Revisado' }, { id: 'exported', text: 'Exportado' }],
            transitions: [['draft', 'built', 'build'], ['built', 'checked', 'check'], ['checked', 'exported', 'export'], ['built', 'draft', 'errores de QA']],
            path: ['draft', 'built', 'checked', 'exported'],
            pathAt: 3.0,
            pathStep: 1.5,
            layout: 'row',
            area: { x: 80, y: 250, w: 1760, h: 400 },
            at: 0.5,
          });
          s.icon({ id: 'vid', kind: 'doc', rect: { x: 180, y: 680, w: 420, h: 170 }, label: 'Tu video', labelSide: 'right', labelPx: 44, at: 0.6, idle: 'float' });
          s.chip({
            id: 'st',
            cx: 960,
            cy: 765,
            text: 'Borrador',
            at: 2.6,
            color: 'dim',
            px: 40,
            states: [
              { at: 4.5, text: 'Construido', color: 'accent' },
              { at: 6.0, text: 'Revisado', color: 'accent2', icon: 'check' },
              { at: 7.5, text: 'Exportado', color: 'good', solid: true, icon: 'check' },
              { at: 8.9, text: 'Con errores de QA', color: 'bad', icon: 'cross' },
            ],
          });
          s.stamp({ rect: { x: 1340, y: 710, w: 460, h: 110 }, text: 'EXPORT NEGADO', at: 9.0, color: 'bad' });
          s.caption({ text: 'Antes de exportar se corre el QA.', at: 8.6, typeDur: 1 });
          s.sourceFooter({ text: SRC, at: 1 });
        },
      }),

      scene({
        name: 'qa',
        dur: 11,
        build(s) {
          base(s, 5, 'El QA frena lo que se ve mal');
          s.browser({ id: 'cuadro', rect: { x: 90, y: 250, w: 980, h: 540 }, url: 'tu-escena · un cuadro', at: 0.3 });
          const body = s.reg.get('cuadro.body');
          const at = (x, y, w, h) => ({ x: body.x + x, y: body.y + y, w, h });
          s.node({ id: 'ta', in: 'cuadro.body', rect: at(50, 50, 520, 150), text: 'Título', at: 0.9, color: 'accent', overlapWith: ['tb'] });
          s.node({ id: 'tb', in: 'cuadro.body', rect: at(380, 110, 480, 150), text: 'Gráfico', at: 1.2, color: 'accent2', overlapWith: ['ta'], z: 2 });
          const rules = ['Elementos fuera del cuadro', 'Textos que se pisan o no caben', 'Signos de apertura en pantalla', 'Resultado distinto entre corridas', 'Una mitad vacía toda la escena'];
          rules.forEach((text, i) => {
            const y = 262 + i * 96;
            const bad = i === 1;
            s.chip({
              x: 1130,
              y,
              text,
              at: 1.0 + i * 0.3,
              color: 'dim',
              px: 30,
              icon: 'spinner',
              states: [
                bad ? { at: 3.6, color: 'bad', icon: 'cross' } : { at: 2.2 + i * 0.35, color: 'good', icon: 'check' },
                ...(bad ? [{ at: 7.4, color: 'good', icon: 'check' }] : []),
              ],
            });
            s.chip({ x: 1700, y, text: i === 4 ? 'solo avisa' : 'bloquea', at: 1.3 + i * 0.3, color: i === 4 ? 'warn' : 'bad', px: 30, solid: true });
          });
          s.callout({ target: 'tb', text: 'Dos textos se pisan', side: 'bottom', dist: 60, at: 3.7, until: 5.7, color: 'bad' });
          s.animate({ targets: 'tb', x: [[6.0, 0], [7.0, 60]], y: [[6.0, 0], [7.0, 170]], ease: 'inOut' });
          s.stamp({ rect: { x: 1280, y: 760, w: 480, h: 130 }, text: 'QA OK', at: 7.9, color: 'good' });
          s.burst({ origin: [1520, 825], at: 8.1, colors: ['good', 'ink', 'accent'], radius: 220 });
          s.sourceFooter({ text: SRC, at: 1 });
        },
      }),

      scene({
        name: 'looks',
        dur: 9.5,
        transition: { type: 'light-sweep', dur: 0.6 },
        build(s) {
          base(s, 6, 'El look es un preset; el movimiento no cambia');
          const looks = [['sketch', 'trazo a mano', 'accent'], ['hologram', 'neón sobre oscuro', 'accent2'], ['poster', 'color plano', 'good']];
          looks.forEach(([name, note, color], i) => {
            const x = 90 + i * 600;
            s.node({ id: `h${i}`, rect: { x, y: 260, w: 540, h: 100 }, text: name, at: 0.4 + i * 0.3, color, px: 50, font: 'display' });
            s.icon({ id: `r${i}`, kind: 'rocket', rect: { x: x + 120, y: 470, w: 300, h: 260 }, at: 0.9 + i * 0.3, color });
            s.chip({ cx: x + 270, cy: 790, text: note, at: 1.5 + i * 0.3, color, px: 38 });
            s.animate({ targets: `r${i}`, y: [[2.0, 0], [2.6, -70], [3.2, 0], [3.8, -70], [4.4, 0], [5.0, -70], [5.6, 0], [6.2, -70], [6.8, 0], [7.4, -70], [8.0, 0], [8.6, -70], [9.2, 0]], ease: 'inOut' });
          });
          s.caption({ text: 'Cambia la paleta, las fuentes y el trazo.', at: 4.4, typeDur: 1 });
          s.sourceFooter({ text: SRC, at: 1 });
        },
      }),

      scene({
        name: 'cierre',
        dur: 7.5,
        build(s) {
          s.parallax({ seed: 99, count: 26 });
          s.kineticText({ id: 'end', text: 'En *resumen*', rect: { x: 160, y: 80, w: 1600, h: 190 }, px: 130, at: 0.2, mode: 'slam' });
          const rows = [['doc', 'scene.js describe el video', 'accent'], ['shield', 'El QA revisa cada cuadro', 'accent2'], ['package', 'Chrome headless lo exporta a MP4', 'good']];
          rows.forEach(([kind, text, color], i) => {
            const y = 300 + i * 220;
            s.icon({ id: `i${i}`, kind, rect: { x: 150, y, w: 200, h: 190 }, at: 0.8 + i * 0.7, color, idle: 'float' });
            s.node({ id: `n${i}`, rect: { x: 410, y: y + 15, w: 1350, h: 160 }, text: `${i + 1}. ${text}`, at: 0.9 + i * 0.7, color, px: 58 });
          });
          s.burst({ origin: 'n2', at: 3.2, colors: ['good', 'accent', 'ink'], radius: 260 });
        },
      }),
    ],
  };
};
