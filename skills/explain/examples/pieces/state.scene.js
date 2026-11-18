// Demo (19 s): state machines with curved labeled transitions, a self-loop and a moving active state. The second scene has seven
// states: the default layout wraps them into rows so the nodes stay big instead of one thin strip.
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
    scene({
      name: 'pedido',
      dur: 9,
      build(s) {
        s.label({ id: 'heading2', text: 'Ciclo de vida de un pedido', rect: { x: 160, y: 110, w: 1600, h: 110 }, px: 84, font: 'display', type: true, at: 0.2 });
        s.stateMachine({
          area: { x: 80, y: 290, w: 1760, h: 700 },
          states: ['Nuevo', 'Pagado', 'Preparando', 'Enviado', 'En ruta', 'Entregado', 'Devuelto'],
          transitions: [
            ['Nuevo', 'Pagado', 'pagar'],
            ['Pagado', 'Preparando', 'confirmar'],
            ['Preparando', 'Enviado', 'despachar'],
            ['Enviado', 'En ruta', 'recoger'],
            ['En ruta', 'Entregado', 'entregar'],
            ['Entregado', 'Devuelto', 'devolver'],
            ['Devuelto', 'Nuevo', 'reponer'],
          ],
          path: ['Nuevo', 'Pagado', 'Preparando', 'Enviado', 'En ruta', 'Entregado'],
          pathAt: 4.6,
          pathStep: 0.8,
          at: 0.6,
        });
      },
    }),
  ],
});
