// Demo (8.5 s): pulse, shake, highlight (underline) and travelDot on a three-node flow.
export const title = 'Movimiento: pulso, sacudida, subrayado y punto';

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'movimiento',
      dur: 8.5,
      build(s) {
        s.label({ id: 'heading', text: 'Un pedido recorre el sistema', rect: { x: 160, y: 90, w: 1600, h: 110 }, px: 84, font: 'display', type: true, at: 0.2 });
        s.row([{ id: 'a', w: 420, h: 200 }, { id: 'b', w: 420, h: 200 }, { id: 'c', w: 420, h: 200 }], { gap: 200 });
        s.node({ id: 'a', text: 'Cliente', at: 0.6, color: 'accent' });
        s.node({ id: 'b', text: 'Servidor', at: 1.0, color: 'accent2' });
        s.node({ id: 'c', text: 'Base de datos', at: 1.4, color: 'good' });
        s.edge({ from: 'a', to: 'b', at: 1.8, color: 'ink' });
        s.edge({ from: 'b', to: 'c', at: 2.2, color: 'ink' });
        s.pulse({ target: 'b', at: 3.0, times: 2, dur: 1.2 });
        s.shake({ target: 'c', at: 4.4 });
        s.highlight({ target: 'a', style: 'underline', at: 5.2, until: 6.2 });
        s.travelDot({ path: ['a', 'b', 'c'], at: 5.6, dur: 2.4 });
        s.label({ id: 'caption', text: 'Pulso, sacudida, subrayado y un punto que viaja.', place: { to: 'b', side: 'bottom', gap: 110 }, w: 1400, h: 90, type: true, typeAt: 3.0, color: 'dim' });
      },
    }),
  ],
});
