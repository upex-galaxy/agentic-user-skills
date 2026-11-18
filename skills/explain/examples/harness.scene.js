// Reference example (hologram, ~75 s, 8 scenes): how an agent like Claude Code works. The content comes only from the
// official page https://code.claude.com/docs/en/how-claude-code-works.
// Shows: kinetic intro, the agentic loop as a state machine with a user interrupting, tool categories as icons with
// packets and chips, a terminal and an editor fixing a failing test with step chips, the context window as layers that
// fill with a gauge, compaction as layers that squeeze, permission modes with a cursor approving, and a recap.
export const title = 'Cómo funciona un agente como Claude Code';
export const preset = 'hologram';

const SRC = 'code.claude.com/docs/en/how-claude-code-works';
const STEPS = ['Bucle', 'Herramientas', 'Ejemplo', 'Contexto', 'Lleno', 'Permisos'];
const TOTAL = 8;

/** Furniture of the middle scenes: section tag, journey rail, heading and source footer. */
function furniture(s, scene, name, heading) {
  s.sectionTag({ index: scene, total: TOTAL, name, at: 0.1 });
  s.journeyRail({ steps: STEPS, active: scene - 2 });
  s.heading({ text: heading });
  s.sourceFooter({ text: SRC, at: 1 });
}

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'portada',
      dur: 6.5,
      transition: { type: 'light-sweep', dur: 0.6 },
      build(s) {
        s.sectionTag({ index: 1, total: TOTAL, name: 'Introducción', at: 0.1 });
        s.parallax({ kind: 'rings', count: 6 });
        s.kineticText({ id: 'hero', text: 'Cómo funciona un *agente*|como Claude Code', rect: { x: 160, y: 200, w: 1600, h: 400 }, mode: 'slam', step: 0.2, at: 0.4, px: 170, underline: ['agente'] });
        s.kineticText({ id: 'sub', text: 'El bucle, las *herramientas* y el contexto', rect: { x: 260, y: 640, w: 1400, h: 120 }, mode: 'rise', at: 2.4, px: 80, color: 'dim' });
        const kinds = [['gear', 'Bucle'], ['doc', 'Archivos'], ['globe', 'Web'], ['bolt', 'Acciones']];
        kinds.forEach(([kind, label], i) => {
          s.icon({ id: `i-${kind}`, kind, rect: { x: 360 + i * 330, y: 790, w: 240, h: 200 }, label, at: 3.2 + i * 0.25, idle: 'float' });
        });
        s.particles({ mode: 'ambient', at: 0.5, until: 6, count: 14, seed: 3 });
      },
    }),
    scene({
      name: 'bucle',
      dur: 10.5,
      build(s) {
        furniture(s, 2, 'El bucle', 'Un bucle de tres fases');
        s.stateMachine({
          id: 'loop',
          area: { x: 80, y: 250, w: 1180, h: 630 },
          states: [{ id: 'gather', text: 'Reunir contexto' }, { id: 'act', text: 'Actuar' }, { id: 'verify', text: 'Verificar resultados' }],
          transitions: [['gather', 'act', 'decide'], ['act', 'verify', 'comprueba'], ['verify', 'gather', 'repite']],
          path: ['gather', 'act', 'verify', 'gather', 'act', 'verify'],
          pathAt: 3.4,
          pathStep: 0.9,
          at: 0.6,
        });
        s.icon({ id: 'you', kind: 'user', rect: { x: 1440, y: 330, w: 320, h: 400 }, label: 'Tú', at: 5.6 });
        s.packets({ id: 'interrupt', path: ['you', 'act'], curve: 'arc', bend: -90, shape: 'bolt', at: 6.8, until: 8, every: 0.6, dur: 1.2, color: 'warn', ping: true });
        s.caption({ text: 'Puedes interrumpir y redirigir en cualquier punto.', at: 8.2, until: 10.2 });
      },
    }),
    scene({
      name: 'herramientas',
      dur: 10,
      build(s) {
        furniture(s, 3, 'Herramientas', 'Las herramientas le dan acción');
        s.icon({ id: 'brain', kind: 'bolt', rect: { x: 100, y: 310, w: 360, h: 400 }, label: 'Claude', at: 0.4, idle: 'pulse', color: 'accent' });
        const tools = [
          ['files', 'doc', 'Archivos', 'Leer y editar', 'accent'],
          ['search', 'eye', 'Búsqueda', 'Por patrón', 'accent2'],
          ['run', 'gear', 'Ejecución', 'Comandos y pruebas', 'good'],
          ['web', 'globe', 'Web', 'Documentación', 'warn'],
          ['code', 'bug', 'Código', 'Errores de tipos', 'accent'],
        ];
        tools.forEach(([id, kind, label, sub, color], i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const x = 640 + col * 400 + (row ? 200 : 0);
          const y = 250 + row * 290;
          s.icon({ id, kind, rect: { x, y, w: 300, h: 200 }, label, color, at: 1 + i * 0.7 });
          s.chip({ id: `c-${id}`, text: sub, cx: x + 150, cy: y + 245, color, px: s.style.defaults.labelPx * 0.8, at: 1.5 + i * 0.7 });
          s.packets({ id: `p-${id}`, path: ['brain', id], curve: 'arc', bend: i % 2 ? 60 : -60, shape: 'dot', at: 1.2 + i * 0.7, until: 7, every: 1.4, dur: 1.1, color, trail: 3, track: false });
        });
        s.caption({ text: 'Sin herramientas, Claude solo puede responder con texto.', at: 7, until: 9.6 });
      },
    }),
    scene({
      name: 'ejemplo',
      dur: 12.5,
      transition: { type: 'light-sweep', dur: 0.6 },
      build(s) {
        furniture(s, 4, 'Un ejemplo', 'Ejemplo: arreglar pruebas que fallan');
        s.terminal({
          id: 'term',
          rect: { x: 80, y: 244, w: 860, h: 440 },
          title: 'zsh - proyecto',
          at: 0.4,
          typeAt: 1,
          cps: 30,
          steps: [
            { name: 'fail', cmd: 'bun test', out: ['auth.test.ts', '  login ok', { text: '  login falla', color: 'bad' }, { text: '1 pass, 1 fail', color: 'bad' }], wait: 0.3, pause: 0.2 },
            { name: 'ok', cmd: 'bun test', at: 8.6, out: ['auth.test.ts', '  login ok', { text: '  login ok', color: 'good' }, { text: '2 pass, 0 fail', color: 'good' }], wait: 0.3 },
          ],
        });
        s.editor({
          id: 'ed',
          rect: { x: 980, y: 244, w: 860, h: 440 },
          title: 'Editor',
          file: 'auth.ts',
          sidebar: ['src', '  auth.ts', '  session.ts', 'tests'],
          at: 0.8,
          typeAt: 3,
          cps: 34,
          lines: [
            'export function login(user: User) {',
            { text: '  const ok = check(user.pass);', mark: '-', at: 6 },
            { text: '  const ok = verify(user.pass);', mark: '+', at: 6 },
            '  if (!ok) { throw new Error("bad pass"); }',
            '  return openSession(user.id);',
            '}',
          ],
          highlights: [{ line: 3, at: 5.2, until: 7.8 }],
          cursorLine: 6,
        });
        const labels = ['Corre pruebas', 'Lee el error', 'Busca archivos', 'Lee el código', 'Edita', 'Corre otra vez'];
        const done = [2.6, 3.4, 4, 4.8, 6.6, 10.4];
        const px = s.style.defaults.labelPx * 0.8;
        labels.forEach((text, i) => {
          s.chip({ id: `st${i}`, cx: 373 + 587 * (i % 3), cy: i < 3 ? 735 : 835, text, icon: 'dot', color: 'dim', px, at: 0.9 + i * 0.15, states: [{ at: done[i], icon: 'check', color: 'good', solid: true }] });
        });
        s.burst({ target: 'st5', at: 10.5, radius: 220, shape: 'spark' });
        s.caption({ text: 'Cada resultado decide el paso siguiente.', at: 8, until: 10.6 });
      },
    }),
    scene({
      name: 'contexto',
      dur: 14,
      build(s) {
        furniture(s, 5, 'El contexto', 'Qué llena la ventana de contexto');
        const bands = [
          ['Instrucciones del sistema', 'dim'],
          ['Skills cargadas', 'accent2'],
          ['Memoria automática', 'accent'],
          ['CLAUDE.md', 'good'],
          ['Salidas de comandos', 'warn'],
          ['Archivos leídos', 'accent2'],
          ['Conversación', 'accent'],
        ];
        s.layers({ id: 'ctx', rect: { x: 560, y: 250, w: 800, h: 630 }, at: 0.8, step: 1, layers: bands.map(([text, color]) => ({ text, color })) });
        s.gauge({ id: 'fill', rect: { x: 100, y: 250, w: 380, h: 320 }, to: 0.9, at: 0.9, dur: 6.4, label: 'ventana llena', color: 'warn' });
        s.callout({ id: 'n-rules', target: 'ctx.l4', text: 'Reglas fijas del proyecto', side: 'right', w: 420, at: 7.6, until: 13, color: 'good' });
        s.callout({ id: 'n-mem', target: 'ctx.l3', text: 'Hasta 200 líneas al iniciar', side: 'left', w: 420, at: 9.2, until: 13, color: 'accent' });
        s.callout({ id: 'n-skills', target: 'ctx.l2', text: 'Se cargan a demanda', side: 'right', w: 420, at: 10.8, until: 13, color: 'accent2' });
      },
    }),
    scene({
      name: 'lleno',
      dur: 10.5,
      build(s) {
        furniture(s, 6, 'Contexto lleno', 'Cuando el contexto se llena');
        s.layers({
          id: 'pila',
          rect: { x: 100, y: 260, w: 640, h: 600 },
          at: 0.5,
          step: 0.2,
          layers: [{ text: 'Sistema', color: 'dim' }, { text: 'Skills', color: 'accent2' }, { text: 'CLAUDE.md', color: 'good' }, { text: 'Comandos', color: 'warn' }, { text: 'Archivos', color: 'accent2' }, { text: 'Conversación', color: 'accent' }],
        });
        s.animate({ targets: 'pila', x: [[4.4, 0], [5.8, 540]], y: [[4.4, 0], [5.2, 90]], scale: [[4.4, 1], [5.2, 0.3]], origin: [420, 560] });
        s.counter({ id: 'pct', rect: { x: 760, y: 240, w: 400, h: 200 }, keys: [[0.8, 20], [3.2, 96], [4.6, 96], [6, 30]], suffix: ' %', label: 'contexto usado', color: 'warn', at: 0.8 });
        s.chip({ id: 'limit', cx: 960, cy: 780, text: 'Se acerca al límite', icon: 'bolt', color: 'warn', at: 3.2, until: 4.3 });
        s.label({ id: 'summary', text: 'Resumen', rect: { x: 760, y: 450, w: 400, h: 100 }, color: 'accent', font: 'display', at: 5.2 });
        s.chip({ id: 'lost', cx: 960, cy: 820, text: 'Se pueden perder detalles', icon: 'cross', color: 'warn', at: 6.8 });
        s.icon({ id: 'md', kind: 'doc', rect: { x: 1380, y: 270, w: 320, h: 380 }, label: 'CLAUDE.md', color: 'good', at: 7.2 });
        s.stamp({ id: 'rules', text: 'REGLAS A SALVO', cx: 1540, cy: 780, at: 8, color: 'good' });
        s.caption({ text: 'Con /context ves qué ocupa espacio.', at: 8.8, until: 10.4 });
      },
    }),
    scene({
      name: 'permisos',
      dur: 11.5,
      build(s) {
        furniture(s, 7, 'Seguridad', 'Deshacer cambios y controlar permisos');
        s.table({
          id: 'modos',
          rect: { x: 80, y: 250, w: 980, h: 600 },
          columns: ['Modo', 'Qué hace'],
          rows: [
            ['Auto', 'Un clasificador bloquea lo riesgoso'],
            ['Manual', 'Pregunta antes de editar o ejecutar'],
            ['Accept edits', 'Edita archivos sin preguntar'],
            ['Plan', 'Propone un plan sin editar'],
          ],
          at: 0.5,
          step: 0.5,
          highlight: { row: 1, at: 3 },
        });
        s.node({ id: 'ask', text: 'Claude quiere editar auth.ts', rect: { x: 1140, y: 270, w: 700, h: 190 }, color: 'accent', at: 3 });
        s.node({ id: 'yes', text: 'Permitir', rect: { x: 1140, y: 530, w: 330, h: 130 }, color: 'good', at: 3.4 });
        s.node({ id: 'no', text: 'Rechazar', rect: { x: 1510, y: 530, w: 330, h: 130 }, color: 'bad', at: 3.6 });
        s.cursor({ path: [[3.4, 1700, 780], [5, 'yes'], [5.6, 'yes'], [6.4, 1500, 800]], clicks: [5.6], until: 7 });
        s.stamp({ id: 'ok', text: 'APROBADO', cx: 1480, cy: 780, at: 5.8, color: 'good' });
        s.exit({ targets: ['ask', 'yes', 'no', 'ok'], at: 7.4, to: 'right', dur: 0.7 });
        s.icon({ id: 'undo', kind: 'clock', rect: { x: 1260, y: 260, w: 320, h: 380 }, label: 'Un estado anterior', at: 8, spin: -1.4 });
        s.chip({ id: 'esc1', cx: 1260, cy: 760, text: 'Esc', color: 'accent', solid: true, px: s.style.defaults.labelPx * 1.3, at: 8.6 });
        s.chip({ id: 'esc2', cx: 1580, cy: 760, text: 'Esc', color: 'accent', solid: true, px: s.style.defaults.labelPx * 1.3, at: 9.2 });
        s.caption({ text: 'Esc dos veces vuelve a un estado anterior.', at: 9, until: 11.2 });
      },
    }),
    scene({
      name: 'cierre',
      dur: 7,
      build(s) {
        s.sectionTag({ index: 8, total: TOTAL, name: 'Resumen', at: 0.1 });
        s.kineticText({ id: 'recap', text: 'En *resumen*', rect: { x: 160, y: 140, w: 1600, h: 200 }, mode: 'slam', at: 0.3, px: 150 });
        const rows = [
          ['r1', 'gear', '1. Un bucle: reunir, actuar, verificar', 'accent', 1.2],
          ['r2', 'bolt', '2. Las herramientas dan acción', 'accent2', 2],
          ['r3', 'database', '3. El contexto se llena: cuídalo', 'good', 2.8],
        ];
        rows.forEach(([id, kind, text, color, at], i) => {
          const y = 380 + i * 190;
          s.icon({ id: `${id}-i`, kind, rect: { x: 180, y, w: 160, h: 150 }, color, at });
          s.node({ id, text, rect: { x: 400, y, w: 1340, h: 150 }, color, at: at + 0.2, px: 50 });
        });
        s.particles({ mode: 'ambient', at: 0.5, until: 6.5, count: 16, seed: 8 });
      },
    }),
  ],
});
