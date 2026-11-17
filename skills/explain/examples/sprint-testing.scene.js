// Reference example (sketch, ~61 s, 8 scenes): how one user story is tested during a sprint.
// Content comes only from the sprint-testing skill (SKILL.md). Shows: flow (overview and a snake layout), mindMap,
// grouped nodes, table, timeline for the hand-off and a three-point recap. Each fact scene carries a sourceFooter.
export const title = 'Cómo se testea una historia en el sprint';

const SRC = 'skill sprint-testing (SKILL.md)';
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
        s.titleCard({ id: 'hero', title: 'Cómo se testea una historia en el sprint', subtitle: 'Planear, ejecutar y reportar, siempre en ese orden', at: 0.4, h: 480 });
      },
    }),
    scene({
      name: 'vision',
      dur: 9,
      build(s) {
        s.sectionTag({ index: 2, total: TOTAL, name: 'Visión general', at: 0.1 });
        s.heading({ text: 'Cuatro pasos, siempre en orden' });
        s.flow({
          id: 'etapas',
          steps: [{ text: 'Inicio de sesión', color: 'dim' }, { text: 'Etapa 1 Planeación', color: 'accent' }, { text: 'Etapa 2 Ejecución', color: 'accent2' }, { text: 'Etapa 3 Reporte', color: 'good' }],
          at: 0.6,
          per: 0.9,
          px: 60,
        });
        s.caption({ text: 'Las etapas 4, 5 y 6 las toman otras skills.', at: 5.8, until: 8.6 });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'planeacion',
      dur: 9.5,
      build(s) {
        s.sectionTag({ index: 3, total: TOTAL, name: 'Etapa 1', at: 0.1 });
        s.heading({ text: 'Planeación: antes de tocar la app' });
        s.mindMap({
          id: 'plan',
          hub: 'Planeación',
          branches: [
            { text: 'Riesgo de la historia' },
            { text: 'Análisis de pruebas' },
            { text: 'ATP y ATR' },
            { text: 'Casos en borrador', children: ['Varios por criterio'] },
          ],
          at: 0.5,
          step: 1.0,
        });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'ejecucion',
      dur: 9.5,
      build(s) {
        s.sectionTag({ index: 4, total: TOTAL, name: 'Etapa 2', at: 0.1 });
        s.heading({ text: 'Ejecución: humo primero, luego explorar' });
        s.row([{ id: 'smoke', w: 420, h: 340 }, { id: 'ui', w: 340, h: 340 }, { id: 'api', w: 340, h: 340 }, { id: 'db', w: 340, h: 340 }], { gap: 110 });
        s.group({ id: 'tri', children: ['ui', 'api', 'db'], title: 'Exploración UI, API y DB', at: 1.4, pad: 40 });
        s.node({ id: 'smoke', text: 'Prueba de humo: Go o No-Go', at: 0.6, color: 'warn' });
        s.node({ id: 'ui', text: 'UI', at: 2.0, color: 'accent' });
        s.node({ id: 'api', text: 'API', at: 2.5, color: 'accent2' });
        s.node({ id: 'db', text: 'DB', at: 3.0, color: 'good' });
        s.edge({ from: 'smoke', to: 'ui', at: 1.8, color: 'ink' });
        s.travelDot({ path: ['smoke', 'ui', 'api', 'db'], at: 3.8, dur: 2.6 });
        s.caption({ text: 'La evidencia queda guardada en la carpeta del PBI.', at: 6.4, until: 9.0 });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'reporte',
      dur: 9.5,
      build(s) {
        s.sectionTag({ index: 5, total: TOTAL, name: 'Etapa 3', at: 0.1 });
        s.heading({ text: 'Reporte: cerrar lo que se abrió' });
        s.flow({
          id: 'reporte',
          layout: 'snake',
          cols: 2,
          steps: [{ text: 'Completar el ATR', color: 'accent' }, { text: 'Comentario de QA', color: 'accent2' }, { text: 'Mover el ticket', color: 'warn' }, { text: 'Cerrar ATR, ATS y ATP', color: 'good' }],
          at: 0.6,
          per: 0.9,
          px: 56,
        });
        s.caption({ text: 'Si apareció un bug, se reporta con su plantilla.', at: 6.6, until: 9.0 });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'tabla',
      dur: 9,
      build(s) {
        s.sectionTag({ index: 6, total: TOTAL, name: 'Qué produce cada etapa', at: 0.1 });
        s.heading({ text: 'Qué deja cada etapa' });
        s.table({
          id: 'salidas',
          columns: ['Etapa', 'Qué produce'],
          rows: [
            ['1 Planeación', 'ATP, ATR y casos en borrador'],
            ['2 Ejecución', 'Evidencia y resultado de cada caso'],
            ['3 Reporte', 'ATR completo y comentario de QA'],
          ],
          at: 0.6,
          step: 0.7,
          rowH: 120,
          highlight: { row: 2, at: 5.2 },
        });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    scene({
      name: 'despues',
      dur: 8.5,
      transition: { type: 'light-sweep', dur: 0.6 },
      build(s) {
        s.sectionTag({ index: 7, total: TOTAL, name: 'Después del sprint', at: 0.1 });
        s.heading({ text: 'Y luego, otras skills toman la posta' });
        s.timeline({
          id: 'handoff',
          milestones: [
            { label: 'Reporte', date: 'sprint-testing' },
            { label: 'Documentación', date: 'test-documentation' },
            { label: 'Automatización', date: 'test-automation' },
            { label: 'Regresión', date: 'regression-testing' },
          ],
          at: 0.6,
          dur: 4.6,
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
        s.node({ id: 'r1', text: '1. Planear el riesgo y los casos', at: 0.6, color: 'accent', px: 64 });
        s.node({ id: 'r2', text: '2. Humo primero, luego explorar', at: 1.4, color: 'accent2', px: 64 });
        s.node({ id: 'r3', text: '3. Reportar y cerrar artefactos', at: 2.2, color: 'good', px: 64 });
      },
    }),
  ],
});
