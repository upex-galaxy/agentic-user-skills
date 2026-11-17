// Mind map demo (9 s): a hub, four curved branches growing in order, two of them with a second level.
export const title = 'Mapa mental';

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'mapa',
      dur: 9,
      build(s) {
        s.sectionTag({ index: 3, total: 9, name: 'Calidad', at: 0.1 });
        s.mindMap({
          id: 'calidad',
          area: { x: 80, y: 130, w: 1760, h: 820 },
          hub: 'Calidad del producto',
          branches: [
            { text: 'Pruebas', children: ['Unitarias', 'De punta a punta'] },
            { text: 'Procesos', children: ['Revisión de código', 'Releases'] },
            { text: 'Datos' },
            { text: 'Equipo' },
          ],
          at: 0.4,
          step: 1.1,
        });
      },
    }),
  ],
});
