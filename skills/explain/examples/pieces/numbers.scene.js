// Numbers demo (3 scenes, 22 s): counter + progress + gauge, a line chart with a marker and a bar chart with step,
// and a dot grid of test results.
export const title = 'Números: contadores, gráficas y puntos';

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'indicadores',
      dur: 8,
      build(s) {
        s.label({ id: 'heading', text: 'Así quedó el lanzamiento', rect: { x: 160, y: 100, w: 1600, h: 110 }, px: 90, font: 'display', type: true, at: 0.2 });
        s.counter({ id: 'users', rect: { x: 160, y: 300, w: 760, h: 320 }, from: 0, to: 12480, at: 0.8, dur: 2.2, label: 'usuarios activos', color: 'accent' });
        s.gauge({ id: 'cover', rect: { x: 1060, y: 280, w: 700, h: 380 }, to: 0.87, at: 1.2, dur: 2, label: 'cobertura de pruebas', color: 'good' });
        s.progress({ id: 'build', rect: { x: 160, y: 760, w: 1600, h: 110 }, label: 'Migración de datos', at: 2.4, dur: 3.5, segments: 20 });
      },
    }),
    scene({
      name: 'tendencia',
      dur: 8,
      build(s) {
        s.label({ id: 'heading', text: 'Errores por semana', rect: { x: 160, y: 100, w: 1600, h: 110 }, px: 90, font: 'display', type: true, at: 0.2 });
        s.chart({
          id: 'trend',
          rect: { x: 160, y: 250, w: 880, h: 640 },
          type: 'area',
          data: [42, 45, 40, 38, 22, 14, 9, 6],
          labels: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
          title: 'Incidentes abiertos',
          at: 0.6,
          dur: 2.4,
          mark: { i: 4, text: 'Pruebas activadas', color: 'good' },
        });
        s.chart({
          id: 'teams',
          rect: { x: 1100, y: 250, w: 660, h: 640 },
          type: 'bars',
          data: [18, 31, 24, 40],
          labels: ['Web', 'API', 'Móvil', 'Datos'],
          colors: ['accent', 'accent2', 'warn', 'good'],
          title: 'Pruebas por equipo',
          at: 1.2,
          step: 0.8,
        });
      },
    }),
    scene({
      name: 'resultados',
      dur: 6,
      build(s) {
        s.label({ id: 'heading', text: '48 pruebas, 3 fallaron', rect: { x: 160, y: 100, w: 1600, h: 110 }, px: 90, font: 'display', type: true, at: 0.2 });
        s.dotGrid({ id: 'grid', rect: { x: 360, y: 280, w: 1200, h: 560 }, rows: 4, cols: 12, fail: [9, 22, 37], at: 0.8, dur: 3.2 });
        s.label({ id: 'caption', text: 'Cada punto es una prueba. Los rojos van primero a revisión.', rect: { x: 260, y: 880, w: 1400, h: 80 }, color: 'dim', type: true, typeAt: 4.2 });
      },
    }),
  ],
});
