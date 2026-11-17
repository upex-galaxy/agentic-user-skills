// Demo (10 s): morph, expand and squeeze.
export const title = 'Movimiento: transformar, abrir y fusionar';

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'transformar',
      dur: 6.5,
      transition: { type: 'crossfade', dur: 0.5 },
      build(s) {
        s.label({ id: 'heading', text: 'Un borrador se vuelve publicación', rect: { x: 160, y: 60, w: 1600, h: 110 }, px: 80, font: 'display', type: true, at: 0.2 });
        s.reg.add('draft', { x: 240, y: 460, w: 380, h: 170 });
        s.reg.add('final', { x: 1040, y: 400, w: 640, h: 300 });
        s.node({ id: 'draft', text: 'Borrador', at: 0.6, color: 'accent', shape: 'rect' });
        s.node({ id: 'final', text: 'Publicado', at: 3.0, color: 'good' });
        s.morph({ from: 'draft', to: 'final', at: 1.6, dur: 1.3, fromShape: 'rect', toShape: 'round', color: 'accent', toColor: 'good' });
        s.expand({ target: 'final', at: 3.6, dur: 0.9, closeAt: 6.0, color: 'good', rect: { x: 380, y: 230, w: 1160, h: 700 }, title: 'Publicado', lines: ['Visible para todos', 'Con enlace permanente', 'Se puede editar luego'] });
      },
    }),
    scene({
      name: 'fusionar',
      dur: 5,
      build(s) {
        s.label({ id: 'heading', text: 'Tres piezas, un solo servicio', rect: { x: 160, y: 60, w: 1600, h: 110 }, px: 80, font: 'display', type: true, at: 0.2 });
        s.row([{ id: 't1', w: 380, h: 180 }, { id: 't2', w: 380, h: 180 }, { id: 't3', w: 380, h: 180 }], { gap: 120 });
        s.node({ id: 't1', text: 'Pedidos', at: 0.5, color: 'accent' });
        s.node({ id: 't2', text: 'Pagos', at: 0.8, color: 'accent2' });
        s.node({ id: 't3', text: 'Envíos', at: 1.1, color: 'warn' });
        s.squeeze({ targets: ['t1', 't2', 't3'], into: { id: 'all', text: 'Servicio único', color: 'good' }, at: 2.2, dur: 1.4 });
      },
    }),
  ],
});
