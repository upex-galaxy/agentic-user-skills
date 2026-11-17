// Demo (10 s): state machine with curved labeled transitions, a self-loop and a moving active state.
export const title = 'Estados de un documento';

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'estados',
      dur: 10,
      build(s) {
        s.label({ id: 'heading', text: 'Ciclo de vida de un documento', rect: { x: 160, y: 60, w: 1600, h: 110 }, px: 84, font: 'display', type: true, at: 0.2 });
        s.stateMachine({
          area: { x: 120, y: 220, w: 1680, h: 760 },
          states: ['Borrador', { id: 'review', text: 'En revisión' }, 'Publicado'],
          transitions: [['Borrador', 'review', 'enviar'], ['review', 'Borrador', 'rechazar'], ['review', 'Publicado', 'aprobar'], ['Publicado', 'Publicado', 'editar']],
          path: ['Borrador', 'review', 'Publicado'],
          pathAt: 5.2,
          pathStep: 1.8,
          at: 0.6,
        });
      },
    }),
  ],
});
