// Reference example (sketch, ~68 s, 9 scenes): how one user story is tested during a sprint.
// Content comes only from the sprint-testing skill (SKILL.md). Shows: kinetic intro, journeyRail, packets, an icon story
// card, a checklist of chips that flip, a browser with an app screen and a cursor, a camera move, a dot grid and a
// chip of cases run, a bug callout, a report assembled by packets, a machine for what each stage leaves, a fan-out of
// hand-offs and a recap. Each fact scene carries a sourceFooter.
export const title = 'Cómo se testea una historia en el sprint';
export const preset = 'sketch';

const SRC = 'skill sprint-testing (SKILL.md)';
const TOTAL = 9;
const STEPS = ['Inicio', 'Planeación', 'Ejecución', 'Reporte', 'Después'];

/** Furniture of every fact scene: section tag, journey rail, heading and source footer. */
function furniture(s, i, name, active, heading) {
  s.sectionTag({ index: i, total: TOTAL, name, at: 0.1 });
  s.journeyRail({ steps: STEPS, active });
  s.heading({ text: heading });
  s.sourceFooter({ text: SRC, at: 1 });
}

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'portada',
      dur: 6,
      transition: { type: 'light-sweep', dur: 0.6 },
      build(s) {
        s.sectionTag({ index: 1, total: TOTAL, name: 'Introducción', at: 0.1 });
        s.parallax({ kind: 'shapes', count: 8 });
        s.kineticText({ id: 'title', text: 'Cómo se testea una *historia*|en el sprint', rect: { x: 330, y: 290, w: 1260, h: 420 }, mode: 'slam', step: 0.24, at: 0.3, px: 180, underline: ['historia'] });
        s.kineticText({ id: 'sub', text: 'Planear, ejecutar y *reportar*, siempre en ese orden', rect: { x: 330, y: 760, w: 1260, h: 130 }, mode: 'rise', at: 2.4, px: 80, color: 'dim' });
        s.icon({ id: 'story', kind: 'doc', rect: { x: 80, y: 300, w: 200, h: 200 }, at: 0.6, idle: 'float' });
        s.icon({ id: 'bug', kind: 'bug', rect: { x: 80, y: 600, w: 200, h: 200 }, at: 1.0, idle: 'sway', color: 'bad' });
        s.icon({ id: 'ok', kind: 'check', rect: { x: 1640, y: 300, w: 200, h: 200 }, at: 1.4, idle: 'pulse', color: 'good' });
        s.icon({ id: 'ship', kind: 'rocket', rect: { x: 1640, y: 600, w: 200, h: 200 }, at: 1.8, idle: 'float', color: 'accent2' });
        s.particles({ mode: 'ambient', at: 0.5, until: 5.4, count: 14, seed: 3 });
      },
    }),
    scene({
      name: 'vision',
      dur: 9,
      build(s) {
        furniture(s, 2, 'Visión general', 0, 'Cuatro pasos, siempre en orden');
        s.icon({ id: 'story', kind: 'doc', rect: { x: 80, y: 262, w: 240, h: 240 }, label: 'Historia de usuario', at: 0.4, idle: 'float' });
        s.kineticText({ id: 'rule', text: 'Planear, ejecutar y *reportar*|en ese orden', rect: { x: 480, y: 262, w: 1360, h: 250 }, mode: 'slam', step: 0.2, at: 1.0, px: 110, align: 'left' });
        const steps = [['Inicio de sesión', 'dim'], ['Etapa 1 Planeación', 'accent'], ['Etapa 2 Ejecución', 'accent2'], ['Etapa 3 Reporte', 'good']];
        steps.forEach(([text, color], i) => {
          s.node({ id: `n${i}`, text, rect: { x: 80 + i * 460, y: 620, w: 380, h: 190 }, at: 1.6 + i * 0.5, color, dur: 0.5 });
        });
        for (let i = 0; i < 3; i++) { s.edge({ id: `e${i}`, from: `n${i}`, to: `n${i + 1}`, at: 2.2 + i * 0.5, color: 'ink' }); }
        s.packets({ id: 'p0', path: ['story', 'n0'], curve: 'arc', bend: 90, shape: 'doc', at: 2.2, dur: 1.0, color: 'accent', track: false, ping: true });
        s.packets({ id: 'p1', edge: 'e0', shape: 'dot', at: 3.4, until: 4.2, every: 0.4, dur: 0.9, color: 'accent', track: false });
        s.packets({ id: 'p2', edge: 'e1', shape: 'dot', at: 4.2, until: 5.0, every: 0.4, dur: 0.9, color: 'accent2', track: false });
        s.packets({ id: 'p3', edge: 'e2', shape: 'dot', at: 5.0, until: 5.8, every: 0.4, dur: 0.9, color: 'good', track: false, ping: true });
        s.caption({ text: 'Las etapas 4, 5 y 6 las toman otras skills.', at: 6.2, until: 8.6 });
      },
    }),
    scene({
      name: 'planeacion',
      dur: 10,
      transition: { type: 'wipe', dur: 0.6 },
      build(s) {
        furniture(s, 3, 'Etapa 1', 1, 'Planeación: antes de tocar la app');
        s.icon({ id: 'story', kind: 'doc', rect: { x: 80, y: 330, w: 280, h: 320 }, label: 'La historia', at: 0.4, idle: 'bob' });
        const rows = ['Riesgo de la historia', 'Análisis de pruebas', 'ATP y ATR', 'Casos en borrador'];
        const colors = ['warn', 'accent', 'accent2', 'good'];
        rows.forEach((text, i) => {
          const y = 250 + i * 150;
          s.node({ id: `r${i}`, text, rect: { x: 760, y, w: 640, h: 120 }, at: 0.8 + i * 0.6, color: colors[i], dur: 0.5 });
          s.chip({ id: `c${i}`, cx: 1650, cy: y + 60, text: 'pendiente', color: 'dim', icon: 'dot', at: 1.0 + i * 0.6, states: [{ at: 2.6 + i * 1.3, text: 'en curso', color: 'warn', icon: 'spinner' }, { at: 3.7 + i * 1.3, text: 'listo', color: 'good', icon: 'check', solid: true }] });
          s.packets({ id: `pk${i}`, path: ['story', `r${i}`], curve: 'arc', bend: i % 2 ? 60 : -60, shape: 'dot', at: 2.0 + i * 1.3, dur: 0.9, color: colors[i], track: false, ping: true });
        });
        s.callout({ id: 'note', target: 'r3', text: 'Varios casos por cada criterio', side: 'left', w: 330, dist: 60, at: 7.0, color: 'warn' });
      },
    }),
    scene({
      name: 'humo',
      dur: 8,
      build(s) {
        furniture(s, 4, 'Etapa 2', 2, 'Ejecución: humo primero');
        s.browser({ id: 'web', rect: { x: 80, y: 250, w: 1000, h: 620 }, url: 'app.mi-producto.com', at: 0.4 });
        s.appScreen({ id: 'app', in: 'web.body', at: 1.2, title: 'La historia en la app', rows: [{ label: 'Entrar a la app' }, { label: 'Abrir la historia' }, { label: 'Flujo principal', on: true }], cta: 'Probar', banner: { text: 'Flujo principal funcionando', at: 4.4, color: 'good' } });
        s.cursor({ path: [[1.4, 1000, 300], [2.6, 'app.cta'], [3.6, 'app.cta'], [6.5, 700, 560]], clicks: [3.0], until: 7.4 });
        s.icon({ id: 'smoke', kind: 'gear', rect: { x: 1260, y: 250, w: 200, h: 200 }, at: 0.8, spin: 1.2, color: 'warn' });
        s.node({ id: 'gate', text: 'Humo: Go o No-Go', rect: { x: 1190, y: 480, w: 560, h: 120 }, at: 1.2, color: 'warn', dur: 0.5 });
        s.chip({ id: 'verdict', cx: 1470, cy: 690, text: 'corriendo', color: 'warn', icon: 'spinner', px: 48, at: 2.0, states: [{ at: 4.4, text: 'Go', color: 'good', icon: 'check', solid: true }] });
        s.stamp({ id: 'go', text: 'GO', cx: 1620, cy: 345, at: 4.8, color: 'good' });
        s.caption({ text: 'Si el humo pasa, se explora a fondo.', at: 5.6, until: 7.6 });
      },
    }),
    scene({
      name: 'exploracion',
      dur: 9.5,
      build(s) {
        furniture(s, 5, 'Etapa 2', 2, 'Ejecución: explorar UI, API y DB');
        s.icon({ id: 'ui', kind: 'laptop', rect: { x: 480, y: 250, w: 300, h: 290 }, label: 'UI', at: 0.4, color: 'accent' });
        s.icon({ id: 'api', kind: 'server', rect: { x: 960, y: 250, w: 300, h: 290 }, label: 'API', at: 0.7, color: 'accent2' });
        s.icon({ id: 'db', kind: 'database', rect: { x: 1440, y: 250, w: 300, h: 290 }, label: 'DB', at: 1.0, color: 'good' });
        s.icon({ id: 'pbi', kind: 'package', rect: { x: 80, y: 250, w: 280, h: 290 }, label: 'Carpeta del PBI', at: 1.3, idle: 'bob' });
        s.cursor({ path: [[1.6, 300, 700], [2.4, 'ui'], [3.3, 'api'], [4.2, 'api'], [5.4, 'db'], [7.4, 1500, 760]], clicks: [2.6, 3.5, 5.6], until: 8.4 });
        s.packets({ id: 'ev0', path: ['ui', 'pbi'], curve: 'arc', bend: -120, shape: 'doc', at: 2.8, dur: 1.2, color: 'accent', track: false, ping: true });
        s.packets({ id: 'ev1', path: ['api', 'pbi'], curve: 'arc', bend: -150, shape: 'doc', at: 3.9, dur: 1.4, color: 'accent2', track: false, ping: true });
        s.packets({ id: 'ev2', path: ['db', 'pbi'], curve: 'arc', bend: -190, shape: 'doc', at: 6.0, dur: 1.8, color: 'good', track: false, ping: true });
        s.callout({ id: 'found', target: 'api', text: 'Aquí aparece un bug', side: 'bottom', w: 460, h: 100, dist: 40, at: 4.4, until: 7.0, color: 'bad' });
        s.dotGrid({ id: 'cases', rect: { x: 420, y: 745, w: 1000, h: 135 }, rows: 3, cols: 14, fail: [17], at: 0.8, dur: 6.5 });
        s.chip({ id: 'run', cx: 1670, cy: 790, text: 'Ejecutando casos', icon: 'spinner', color: 'warn', at: 0.8, states: [{ at: 7.3, text: 'Casos ejecutados', icon: 'check', color: 'good' }] });
        s.camera.focus('api', 3.4, 0.9, { zoom: 1.35 }).reset(6.6, 0.9);
        s.caption({ text: 'La evidencia queda guardada en la carpeta del PBI.', at: 7.8, until: 9.3 });
      },
    }),
    scene({
      name: 'reporte',
      dur: 9.5,
      transition: { type: 'light-sweep', dur: 0.6 },
      build(s) {
        furniture(s, 6, 'Etapa 3', 3, 'Reporte: cerrar lo que se abrió');
        const rows = ['Completar el ATR', 'Comentario de QA', 'Mover el ticket', 'Cerrar ATR, ATS y ATP'];
        const colors = ['accent', 'accent2', 'warn', 'good'];
        s.icon({ id: 'doc', kind: 'doc', rect: { x: 1360, y: 240, w: 400, h: 400 }, label: 'Reporte', at: 0.4, idle: 'float', color: 'ink' });
        rows.forEach((text, i) => {
          const y = 262 + i * 150;
          s.chip({ id: `c${i}`, cx: 240, cy: y + 60, text: 'pendiente', color: 'dim', icon: 'dot', at: 0.8 + i * 0.5, states: [{ at: 2.4 + i * 1.5, text: 'hecho', color: 'good', icon: 'check', solid: true }] });
          s.node({ id: `a${i}`, text, rect: { x: 440, y, w: 700, h: 120 }, at: 0.8 + i * 0.5, color: colors[i], dur: 0.5 });
          s.packets({ id: `pk${i}`, path: [{ id: `a${i}`, anchor: 'right' }, { id: 'doc', anchor: 'left' }], curve: 's', shape: 'dot', at: 2.4 + i * 1.5, dur: 0.9, color: colors[i], track: false, ping: true });
        });
        s.stamp({ id: 'closed', text: 'CERRADO', cx: 1560, cy: 770, at: 8.0, color: 'good' });
        s.caption({ text: 'Si apareció un bug, se reporta con su plantilla.', at: 6.6, until: 9.0 });
      },
    }),
    scene({
      name: 'salidas',
      dur: 9,
      build(s) {
        furniture(s, 7, 'Qué produce cada etapa', 3, 'Qué deja cada etapa');
        s.machine({
          id: 'mq',
          rect: s.area,
          at: 0.4,
          inputs: [{ kind: 'doc', label: '1 ATP y casos' }, { kind: 'package', label: '2 Evidencia', color: 'accent2' }, { kind: 'doc', label: '3 ATR completo', color: 'good' }],
          machine: { label: 'Sprint testing' },
          output: { kind: 'check', label: 'Comentario de QA', color: 'good' },
        });
        s.caption({ text: 'Cada etapa entrega algo que la siguiente usa.', at: 6.2, until: 8.6 });
      },
    }),
    scene({
      name: 'despues',
      dur: 8.5,
      transition: { type: 'light-sweep', dur: 0.6 },
      build(s) {
        furniture(s, 8, 'Después del sprint', 4, 'Y luego, otras skills toman la posta');
        s.icon({ id: 'hub', kind: 'check', rect: { x: 80, y: 290, w: 330, h: 440 }, label: 'sprint-testing', at: 0.4, color: 'good', idle: 'pulse' });
        const next = [['doc', 'test-documentation', 'accent', 700], ['gear', 'test-automation', 'accent2', 1070], ['shield', 'regression-testing', 'warn', 1440]];
        next.forEach(([kind, label, color, x], i) => {
          s.icon({ id: `k${i}`, kind, rect: { x, y: 290, w: 340, h: 440 }, label, at: 1.0 + i * 0.6, color, spin: kind === 'gear' ? 1 : undefined });
          s.packets({ id: `h${i}`, path: ['hub', `k${i}`], curve: 'arc', bend: i === 1 ? 0 : (i - 1) * 130, shape: 'package', at: 2.6 + i * 0.4, until: 5.0 + i * 0.4, every: 0.9, dur: 1.4, color, track: false, ping: true });
        });
        s.caption({ text: 'Documentación, automatización y regresión.', at: 6.0, until: 8.2 });
      },
    }),
    scene({
      name: 'cierre',
      dur: 6.5,
      build(s) {
        s.sectionTag({ index: 9, total: TOTAL, name: 'Resumen', at: 0.1 });
        s.journeyRail({ steps: STEPS, active: 4 });
        s.heading({ text: 'En resumen' });
        const rows = [['1. Planear el riesgo y los casos', 'doc', 'accent'], ['2. Humo primero, luego explorar', 'bug', 'accent2'], ['3. Reportar y cerrar artefactos', 'check', 'good']];
        rows.forEach(([text, kind, color], i) => {
          const y = 270 + i * 200;
          s.icon({ id: `i${i}`, kind, rect: { x: 300, y, w: 170, h: 170 }, at: 0.5 + i * 0.8, color, idle: 'bob' });
          s.node({ id: `r${i}`, text, rect: { x: 540, y, w: 1100, h: 170 }, at: 0.6 + i * 0.8, color, px: 64, dur: 0.5 });
          s.enter({ targets: `r${i}`, at: 0.6 + i * 0.8, from: 'right', dur: 0.6 });
        });
        s.burst({ target: 'i2', at: 3.4, radius: 220, shape: 'spark' });
        s.particles({ mode: 'confetti', at: 3.6, dur: 2.4, count: 50, seed: 7 });
      },
    }),
  ],
});
