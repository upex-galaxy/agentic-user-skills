// Titles demo (8 s): sectionTag, titleCard, caption and sourceFooter on one scene.
export const title = 'Piezas de título';

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'portada',
      dur: 8,
      build(s) {
        s.sectionTag({ index: 2, total: 9, name: 'Pruebas', at: 0.2 });
        s.titleCard({ id: 'hero', title: 'Cómo viaja un cambio hasta producción', subtitle: 'Cinco pasos, una sola regla: nada pasa sin pruebas', at: 0.6, h: 440 });
        s.caption({ text: 'Cada paso deja evidencia que cualquiera puede revisar.', at: 4.2, until: 7.4 });
        s.sourceFooter({ text: 'Guía interna del equipo de QA', at: 1.2 });
      },
    }),
  ],
});
