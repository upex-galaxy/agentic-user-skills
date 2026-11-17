// Flow demo (10 s): a pipeline of five steps; a dot travels between them and each step turns active, then done.
export const title = 'Flujo de un cambio';

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'pipeline',
      dur: 10,
      build(s) {
        s.sectionTag({ index: 6, total: 9, name: 'Pipeline', at: 0.1 });
        s.label({ id: 'heading', text: 'El camino de un cambio', rect: { x: 160, y: 120, w: 1600, h: 110 }, px: 90, font: 'display', type: true, at: 0.2 });
        s.flow({
          id: 'ci',
          area: { x: 80, y: 300, w: 1760, h: 420 },
          steps: ['Código', 'Build', 'Pruebas', 'Revisión', 'Despliegue'],
          at: 0.5,
          per: 0.85,
          dwell: 0.35,
        });
        s.caption({ text: 'Si un paso falla, el cambio se queda ahí.', at: 6.2, until: 9.4 });
      },
    }),
  ],
});
