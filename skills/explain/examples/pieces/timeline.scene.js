// Timeline demo (16 s): a progress fill and a marker that lights each milestone as it passes. Five milestones stay on one row;
// the second scene has eight, which wrap into two rows joined by a curved turn so the labels stay big.
export const title = 'Línea de tiempo';

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'historia',
      dur: 8,
      build(s) {
        s.sectionTag({ index: 5, total: 9, name: 'Historia', at: 0.1 });
        s.label({ id: 'heading', text: 'Del prototipo a la escala', rect: { x: 160, y: 120, w: 1600, h: 110 }, px: 90, font: 'display', type: true, at: 0.2 });
        s.timeline({
          id: 'camino',
          area: { x: 80, y: 260, w: 1760, h: 700 },
          milestones: [
            { label: 'Primera idea', date: '2023' },
            { label: 'Prototipo con cinco usuarios', date: '2024' },
            { label: 'Pruebas automáticas en cada cambio', date: 'Primavera' },
            { label: 'Lanzamiento público', date: 'Verano' },
            { label: 'Mil equipos activos', date: 'Hoy' },
          ],
          at: 0.6,
          dur: 4.6,
        });
        s.sourceFooter({ text: 'bitácora del producto', at: 1 });
      },
    }),
    scene({
      name: 'recorrido',
      dur: 9,
      build(s) {
        s.label({ id: 'heading2', text: 'Un año de producto, mes a mes', rect: { x: 160, y: 120, w: 1600, h: 110 }, px: 90, font: 'display', type: true, at: 0.2 });
        s.timeline({
          id: 'anio',
          milestones: [
            { label: 'Primera idea', date: 'Enero' },
            { label: 'Entrevistas con clientes', date: 'Febrero' },
            { label: 'Prototipo en papel', date: 'Marzo' },
            { label: 'Versión alfa cerrada', date: 'Mayo' },
            { label: 'Pruebas con usuarios', date: 'Junio' },
            { label: 'Beta pública', date: 'Agosto' },
            { label: 'Lanzamiento', date: 'Octubre' },
            { label: 'Mil equipos activos', date: 'Diciembre' },
          ],
          at: 0.6,
          dur: 5,
        });
      },
    }),
  ],
});
