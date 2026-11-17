// Folder tree demo (9 s): a project structure revealed row by row, then two paths highlighted one at a time.
export const title = 'Árbol de carpetas';

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'carpetas',
      dur: 9,
      build(s) {
        s.sectionTag({ index: 4, total: 9, name: 'Estructura', at: 0.1 });
        s.label({ id: 'heading', text: 'Dónde vive cada cosa', rect: { x: 160, y: 120, w: 1600, h: 110 }, px: 90, font: 'display', type: true, at: 0.2 });
        s.folderTree({
          id: 'proyecto',
          area: { x: 360, y: 260, w: 1200, h: 700 },
          root: 'mi-app',
          data: {
            'src': { app: { 'page.tsx': null, 'layout.tsx': null }, components: { 'Boton.tsx': null }, lib: { 'db.ts': null } },
            'tests': { 'login.spec.ts': null, 'carrito.spec.ts': null },
            'package.json': null,
          },
          at: 0.8,
          highlight: ['mi-app/src/app', 'mi-app/tests'],
          hlAt: 5,
          hlStep: 1.8,
        });
        s.sourceFooter({ text: 'repositorio del proyecto', at: 1 });
      },
    }),
  ],
});
