// Reference example (hologram, ~65 s, 8 scenes): the architecture of the /explain skill itself.
// Shows: architecture (layers), mindMap, codeBlock with a pointer, sequence (CLI, server, Chrome, page),
// stateMachine with a moving active state, a table, and a three-point recap. Facts come from the skill's own files.
export const title = 'Cómo funciona la skill /explain por dentro';

const SRC = 'archivos de la skill explain (cli/ y engine/)';
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
        s.titleCard({ id: 'hero', title: 'Cómo funciona la skill /explain por dentro', subtitle: 'De un scene.js a un MP4, sin instalar nada', at: 0.4, h: 480 });
      },
    }),
    scene({
      name: 'arquitectura',
      dur: 11,
      build(s) {
        s.sectionTag({ index: 2, total: TOTAL, name: 'Arquitectura', at: 0.1 });
        s.architecture({
          zones: [
            { id: 'author', title: 'Autoría', nodes: [{ id: 'scene', text: 'scene.js' }, { id: 'pieces', text: 'Piezas' }] },
            { id: 'core', title: 'Motor', nodes: [{ id: 'engine', text: 'Engine' }, { id: 'styles', text: 'Estilos' }] },
            { id: 'out', title: 'Salida', nodes: [{ id: 'qa', text: 'QA gate' }, { id: 'chrome', text: 'Chrome headless' }, { id: 'mp4', text: 'MP4' }] },
          ],
          links: [['scene', 'engine', 'describe'], ['pieces', 'engine', 'dibujan'], ['styles', 'engine', 'pintan'], ['engine', 'qa', 'revisa'], ['engine', 'chrome', 'renderiza'], ['chrome', 'mp4', 'H.264']],
          at: 0.6,
        });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'motor',
      dur: 8.5,
      build(s) {
        s.sectionTag({ index: 3, total: TOTAL, name: 'El motor', at: 0.1 });
        s.heading({ text: 'El motor dibuja por tiempo' });
        s.mindMap({
          id: 'motor',
          hub: 'Engine',
          branches: [
            { text: 'Escenas', children: ['Tiempo local'] },
            { text: 'Transiciones', children: ['crossfade', 'light-sweep'] },
            { text: 'Cámara', children: ['Zoom', 'Foco'] },
            { text: 'Reloj virtual', children: ['Cuadro repetible'] },
          ],
          at: 0.5,
          step: 0.9,
        });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'piezas',
      dur: 9,
      build(s) {
        s.sectionTag({ index: 4, total: TOTAL, name: 'Piezas', at: 0.1 });
        s.heading({ text: 'La escena es código con piezas' });
        s.codeBlock({
          id: 'code',
          title: 'scene.js',
          lines: [
            's.node({ id: \'dev\', text: \'Cambio\', at: 1 });',
            's.node({ id: \'ci\', text: \'Pruebas\', at: 1.6 });',
            's.edge({ from: \'dev\', to: \'ci\', at: 2.2 });',
            's.pulse({ target: \'ci\', at: 3 });',
            's.caption({ text: \'Listo\', at: 4 });',
          ],
          px: 46,
          at: 0.5,
          typeDur: 2.6,
          highlights: [{ lines: [3], at: 3.8 }, { lines: [4], at: 5.6 }],
          pointer: { line: 3, text: 'Las conexiones usan ids', at: 4.0 },
        });
        s.caption({ text: 'Cada pieza se llama como s.nombre y se coloca sola.', at: 6.4, until: 8.6 });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'exportar',
      dur: 11,
      build(s) {
        s.sectionTag({ index: 5, total: TOTAL, name: 'Exportar', at: 0.1 });
        s.heading({ text: 'Quién habla con quién al exportar' });
        s.sequence({
          actors: ['CLI', 'Servidor', 'Chrome', 'Página'],
          messages: [
            { from: 'CLI', to: 'Servidor', text: 'Levanta el servidor local' },
            { from: 'CLI', to: 'Chrome', text: 'Abre la página' },
            { from: 'Chrome', to: 'Página', text: 'Ejecuta la escena' },
            { from: 'Página', to: 'Servidor', text: 'Envía el MP4', kind: 'async' },
            { from: 'Servidor', to: 'CLI', text: 'Guarda el archivo', kind: 'return' },
          ],
          activation: true,
          at: 0.6,
          step: 1.3,
        });
        s.caption({ text: 'La página codifica H.264 con WebCodecs.', at: 8.0, until: 10.6 });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'ciclo',
      dur: 11,
      transition: { type: 'light-sweep', dur: 0.6 },
      build(s) {
        s.sectionTag({ index: 6, total: TOTAL, name: 'Ciclo de vida', at: 0.1 });
        s.heading({ text: 'Un video pasa por cuatro estados' });
        s.stateMachine({
          states: [{ id: 'draft', text: 'Borrador' }, { id: 'built', text: 'Construido' }, { id: 'checked', text: 'Revisado' }, { id: 'exported', text: 'Exportado' }],
          transitions: [['draft', 'built', 'build'], ['built', 'checked', 'check'], ['checked', 'exported', 'export'], ['built', 'draft', 'errores de QA']],
          path: ['draft', 'built', 'checked', 'exported'],
          pathAt: 4.6,
          pathStep: 1.6,
          at: 0.6,
        });
        s.caption({ text: 'Con errores de QA, el export se niega.', at: 8.8, until: 10.6 });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'qa',
      dur: 8.5,
      build(s) {
        s.sectionTag({ index: 7, total: TOTAL, name: 'QA gate', at: 0.1 });
        s.heading({ text: 'El QA frena lo que se ve mal' });
        s.table({
          id: 'qa',
          columns: ['Qué revisa', 'Resultado'],
          rows: [
            ['Elementos fuera del cuadro', 'Error'],
            ['Textos que se pisan o no caben', 'Error'],
            ['Signos de apertura en pantalla', 'Error'],
            ['Resultado distinto entre corridas', 'Error'],
            ['Una mitad vacía toda la escena', 'Aviso'],
          ],
          at: 0.6,
          step: 0.5,
          rowH: 90,
          highlight: { row: 4, at: 5.2 },
        });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'cierre',
      dur: 6,
      build(s) {
        s.sectionTag({ index: 8, total: TOTAL, name: 'Resumen', at: 0.1 });
        s.heading({ text: 'En resumen' });
        s.stack([{ id: 'r1', w: 1400, h: 170 }, { id: 'r2', w: 1400, h: 170 }, { id: 'r3', w: 1400, h: 170 }], { gap: 50 });
        s.node({ id: 'r1', text: '1. scene.js describe el video', at: 0.6, color: 'accent', px: 56 });
        s.node({ id: 'r2', text: '2. El QA revisa cada cuadro', at: 1.4, color: 'accent2', px: 56 });
        s.node({ id: 'r3', text: '3. Chrome headless lo exporta a MP4', at: 2.2, color: 'good', px: 56 });
      },
    }),
  ],
});
