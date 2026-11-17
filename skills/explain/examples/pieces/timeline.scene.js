// Timeline demo (8 s): five milestones, a progress fill and a marker that lights each one as it passes.
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
  ],
});
