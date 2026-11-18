// Annotate demo (4 scenes, 28 s): a kinetic title with emphasis and a hand underline, a code-ish panel with a callout, a
// scribble and a stamp, a dialogue of two bubbles, and chips that flip state.
export const title = 'Anotaciones: texto en movimiento, notas y estados';

const head = (s, text) => s.label({ id: 'heading', text, rect: { x: 160, y: 100, w: 1600, h: 110 }, px: 90, font: 'display', type: true, at: 0.2 });

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'titulo',
      dur: 7,
      build(s) {
        s.kineticText({ id: 'title', text: 'Tu código, *explicado*|en un minuto', rect: { x: 160, y: 230, w: 1600, h: 420 }, mode: 'slam', step: 0.22, at: 0.4, px: 190, underline: ['explicado'] });
        s.kineticText({ id: 'sub', text: 'Cada palabra *entra* en su momento', rect: { x: 260, y: 700, w: 1400, h: 160 }, mode: 'rise', at: 3.2, px: 90, color: 'dim' });
      },
    }),
    scene({
      name: 'revision',
      dur: 9,
      build(s) {
        head(s, 'Revisión de un pedido');
        s.node({ id: 'fn', text: 'validar(pedido)', rect: { x: 200, y: 330, w: 420, h: 120 }, at: 0.4 });
        s.node({ id: 'db', text: 'guardar()', rect: { x: 760, y: 330, w: 420, h: 120 }, at: 0.8 });
        s.node({ id: 'pay', text: 'cobrar()', rect: { x: 200, y: 640, w: 420, h: 120 }, at: 1.2 });
        s.edge({ from: 'fn', to: 'db', at: 1.6 });
        s.callout({ id: 'note', target: 'db', text: 'Aquí falta comprobar el stock', side: 'right', w: 520, at: 2.4, color: 'warn' });
        s.scribble({ id: 'circle', target: 'pay', kind: 'circle', at: 4.2, color: 'bad' });
        s.stamp({ id: 'verdict', text: 'REVISAR', cx: 1400, cy: 700, at: 5.6, color: 'warn' });
      },
    }),
    scene({
      name: 'dialogo',
      dur: 8,
      build(s) {
        head(s, 'Una revisión, en voz alta');
        s.bubble({ id: 'q', rect: { x: 200, y: 300, w: 1150, h: 170 }, initials: 'QA', side: 'left', text: 'Probé el pago con dos tarjetas y la segunda no cobra', at: 0.6 });
        s.bubble({ id: 'd', rect: { x: 570, y: 580, w: 1150, h: 170 }, initials: 'DV', side: 'right', color: 'good', text: 'Gracias, ya lo veo: falta reintentar cuando el banco tarda', at: 3.4 });
      },
    }),
    scene({
      name: 'estados',
      dur: 8,
      build(s) {
        head(s, 'Qué pasó con cada paso');
        const px = s.style.defaults.labelPx * 1.1;
        const rows = [
          ['Pruebas', 330, { text: 'en cola', color: 'warn', icon: 'dot', px, at: 0.6, states: [{ at: 2, text: 'corriendo', icon: 'spinner' }, { at: 4.5, text: 'aprobado', color: 'good', icon: 'check', solid: true }] }],
          ['Estilo', 500, { text: 'corriendo', color: 'warn', icon: 'spinner', px, at: 1, states: [{ at: 3.2, text: 'fallo', color: 'bad', icon: 'cross' }] }],
          ['Despliegue', 670, { text: 'pendiente', color: 'dim', icon: 'dot', px, at: 1.4, states: [{ at: 5.6, text: 'listo', color: 'accent', icon: 'rocket', solid: true }] }],
        ];
        rows.forEach(([name, y, c], i) => {
          s.node({ id: `row${i}`, text: name, rect: { x: 300, y: y - 55, w: 500, h: 110 }, at: 0.3 + i * 0.2 });
          s.chip({ id: `chip${i}`, cx: 1250, cy: y, ...c });
        });
      },
    }),
  ],
});
