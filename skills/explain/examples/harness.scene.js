// Reference example (hologram, ~66 s, 8 scenes): how an agent like Claude Code works. The content comes only from
// the official page https://code.claude.com/docs/en/how-claude-code-works.
// Shows: a state machine as the agentic loop, a mind map of tool categories, a timeline, an anatomy of the context
// window with camera moves that focus one part at a time (then pull back), a flow, a table and a recap.
export const title = 'Cómo funciona un agente como Claude Code';

const SRC = 'code.claude.com/docs/en/how-claude-code-works';
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
        s.titleCard({ id: 'hero', title: 'Cómo funciona un agente como Claude Code', subtitle: 'El bucle, las herramientas y el contexto', at: 0.4, h: 480 });
      },
    }),
    scene({
      name: 'bucle',
      dur: 9.5,
      build(s) {
        s.sectionTag({ index: 2, total: TOTAL, name: 'El bucle', at: 0.1 });
        s.heading({ text: 'Un bucle de tres fases' });
        s.stateMachine({
          layout: 'row',
          states: [{ id: 'gather', text: 'Reunir contexto' }, { id: 'act', text: 'Actuar' }, { id: 'verify', text: 'Verificar resultados' }],
          transitions: [['gather', 'act', 'decide'], ['act', 'verify', 'comprueba'], ['verify', 'gather', 'repite']],
          path: ['gather', 'act', 'verify', 'gather', 'act', 'verify'],
          pathAt: 3.4,
          pathStep: 1.0,
          at: 0.6,
        });
        s.caption({ text: 'Puedes interrumpir y redirigir en cualquier punto.', at: 7.2, until: 9.2 });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'herramientas',
      dur: 9,
      build(s) {
        s.sectionTag({ index: 3, total: TOTAL, name: 'Herramientas', at: 0.1 });
        s.heading({ text: 'Las herramientas le dan acción' });
        s.mindMap({
          id: 'tools',
          hub: 'Herramientas',
          branches: [
            { text: 'Archivos', children: ['Leer y editar'] },
            { text: 'Búsqueda', children: ['Por patrón'] },
            { text: 'Ejecución', children: ['Comandos y pruebas'] },
            { text: 'Web', children: ['Documentación'] },
            { text: 'Código', children: ['Errores de tipos'] },
          ],
          at: 0.5,
          step: 0.8,
        });
        s.caption({ text: 'Sin herramientas, Claude solo puede responder con texto.', at: 5.6, until: 8.6 });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'ejemplo',
      dur: 10.5,
      build(s) {
        s.sectionTag({ index: 4, total: TOTAL, name: 'Un ejemplo', at: 0.1 });
        s.heading({ text: 'Ejemplo: arreglar pruebas que fallan' });
        s.timeline({
          id: 'pasos',
          milestones: [
            { label: 'Corre las pruebas', date: 'Paso 1' },
            { label: 'Lee el error', date: 'Paso 2' },
            { label: 'Busca archivos', date: 'Paso 3' },
            { label: 'Lee el código', date: 'Paso 4' },
            { label: 'Edita', date: 'Paso 5' },
            { label: 'Corre otra vez', date: 'Paso 6' },
          ],
          at: 0.6,
          dur: 5.6,
        });
        s.caption({ text: 'Cada resultado decide el paso siguiente.', at: 7.4, until: 10.0 });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'contexto',
      dur: 14,
      build(s) {
        s.sectionTag({ index: 5, total: TOTAL, name: 'El contexto', at: 0.1 });
        s.heading({ text: 'Qué llena la ventana de contexto' });
        const bands = ['Conversación', 'Archivos leídos', 'Salidas de comandos', 'CLAUDE.md', 'Memoria automática', 'Skills cargadas', 'Instrucciones del sistema'];
        const colors = ['accent', 'accent2', 'warn', 'good', 'accent', 'accent2', 'dim'];
        s.anatomy({
          id: 'ctx',
          aspect: 1.4,
          parts: [
            { id: 'window', shape: 'round', x: 0, y: 0, w: 1, h: 1, color: 'dim' },
            ...bands.map((text, i) => ({ id: `b${i}`, text, shape: 'round', x: 0.05, y: 0.04 + i * 0.1365, w: 0.9, h: 0.11, color: colors[i] })),
          ],
          labels: [
            { part: 'b3', text: 'Reglas fijas del proyecto', side: 'right' },
            { part: 'b4', text: 'Hasta 200 líneas al iniciar', side: 'left' },
            { part: 'b5', text: 'Se cargan a demanda', side: 'right' },
          ],
          at: 0.5,
          step: 0.8,
        });
        s.camera.focus('ctx.b1', 6, 0.9, { zoom: 2 });
        s.camera.reset(8.5, 0.8);
        s.camera.focus('ctx.b5', 9.5, 0.9, { zoom: 2 });
        s.camera.reset(12, 0.8);
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'lleno',
      dur: 9,
      build(s) {
        s.sectionTag({ index: 6, total: TOTAL, name: 'Contexto lleno', at: 0.1 });
        s.heading({ text: 'Cuando el contexto se llena' });
        s.flow({
          id: 'compacta',
          layout: 'snake',
          cols: 2,
          steps: [{ text: 'Se acerca al límite', color: 'warn' }, { text: 'Compacta en un resumen', color: 'accent' }, { text: 'Se pueden perder detalles', color: 'accent2' }, { text: 'Las reglas van en CLAUDE.md', color: 'good' }],
          at: 0.6,
          per: 0.9,
        });
        s.caption({ text: 'Con /context ves qué ocupa espacio.', at: 6.8, until: 8.6 });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'permisos',
      dur: 9,
      transition: { type: 'light-sweep', dur: 0.6 },
      build(s) {
        s.sectionTag({ index: 7, total: TOTAL, name: 'Seguridad', at: 0.1 });
        s.heading({ text: 'Deshacer cambios y controlar permisos' });
        s.table({
          id: 'modos',
          columns: ['Modo', 'Qué hace'],
          rows: [
            ['Auto', 'Un clasificador bloquea lo riesgoso'],
            ['Manual', 'Pregunta antes de editar o ejecutar'],
            ['Accept edits', 'Edita archivos sin preguntar'],
            ['Plan', 'Propone un plan sin editar'],
          ],
          at: 0.6,
          step: 0.6,
          highlight: { row: 3, at: 5.2 },
        });
        s.caption({ text: 'Esc dos veces vuelve a un estado anterior.', at: 6.2, until: 8.6 });
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
        s.node({ id: 'r1', text: '1. Un bucle: reunir, actuar, verificar', at: 0.6, color: 'accent', px: 52 });
        s.node({ id: 'r2', text: '2. Las herramientas dan acción', at: 1.4, color: 'accent2', px: 52 });
        s.node({ id: 'r3', text: '3. El contexto se llena: cuídalo', at: 2.2, color: 'good', px: 52 });
      },
    }),
  ],
});
