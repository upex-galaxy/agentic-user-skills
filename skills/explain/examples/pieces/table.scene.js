// Table demo (9 s): a comparison that fills row by row, then highlights one row.
export const title = 'Tabla comparativa';

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'comparacion',
      dur: 9,
      build(s) {
        s.sectionTag({ index: 7, total: 9, name: 'Comparación', at: 0.1 });
        s.label({ id: 'heading', text: 'Manual o automatizado', rect: { x: 160, y: 120, w: 1600, h: 110 }, px: 90, font: 'display', type: true, at: 0.2 });
        s.table({
          id: 'comp',
          area: { x: 160, y: 270, w: 1600, h: 640 },
          columns: ['Criterio', 'Manual', 'Automatizado'],
          rows: [
            ['Velocidad', 'Lenta, depende de una persona', 'Rápida, corre en cada cambio'],
            ['Costo inicial', 'Bajo', 'Alto: hay que escribir las pruebas'],
            ['Exploración', 'Excelente', 'Limitada'],
            ['Regresión', 'Cansada y repetitiva', 'Ideal'],
          ],
          at: 0.6,
          step: 0.6,
          highlight: { row: 3, at: 5.6 },
        });
        s.sourceFooter({ text: 'experiencia del equipo', at: 1 });
      },
    }),
  ],
});
