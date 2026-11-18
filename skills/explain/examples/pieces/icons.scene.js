// Icons demo (3 scenes, 12 s): the 22 glyphs in two grids with labels, then the four idle motions.
export const title = 'Iconos';

const grid = (s, items, cols, at) => {
  const { x, y, w, h } = s.area;
  const rows = Math.ceil(items.length / cols);
  const cw = w / cols;
  const ch = h / rows;
  items.forEach(([kind, label], i) => {
    const rect = { x: x + (i % cols) * cw + 20, y: y + Math.floor(i / cols) * ch + 10, w: cw - 40, h: ch - 20 };
    s.icon({ id: `ic-${kind}`, kind, rect, label, at: at + i * 0.12, spin: kind === 'gear' ? 1.2 : undefined });
  });
};

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'cosas',
      dur: 5,
      build(s) {
        s.sectionTag({ index: 1, total: 3, name: 'Iconos', at: 0.1 });
        s.label({ id: 'heading', text: 'Cosas del sistema', rect: { x: 160, y: 120, w: 1600, h: 110 }, px: 90, font: 'display', at: 0.2 });
        grid(s, [['laptop', 'Portátil'], ['server', 'Servidor'], ['database', 'Base de datos'], ['cloud', 'Nube'], ['package', 'Paquete'], ['container', 'Contenedor'], ['user', 'Persona'], ['gear', 'Engranaje'], ['doc', 'Documento'], ['rocket', 'Despliegue'], ['globe', 'Red global']], 6, 0.4);
      },
    }),
    scene({
      name: 'estados',
      dur: 4,
      build(s) {
        s.sectionTag({ index: 2, total: 3, name: 'Iconos', at: 0.1 });
        s.label({ id: 'heading', text: 'Estados y señales', rect: { x: 160, y: 120, w: 1600, h: 110 }, px: 90, font: 'display', at: 0.2 });
        grid(s, [['shield', 'Seguridad'], ['lock', 'Candado'], ['heart', 'Favorito'], ['clock', 'Tiempo'], ['bolt', 'Rápido'], ['branch', 'Rama'], ['check', 'Correcto'], ['cross', 'Fallo'], ['phone', 'Móvil'], ['bug', 'Error'], ['eye', 'Vigilancia']], 6, 0.4);
      },
    }),
    scene({
      name: 'movimiento',
      dur: 4,
      build(s) {
        s.sectionTag({ index: 3, total: 3, name: 'Iconos', at: 0.1 });
        s.label({ id: 'heading', text: 'Cuatro movimientos', rect: { x: 160, y: 120, w: 1600, h: 110 }, px: 90, font: 'display', at: 0.2 });
        const modes = [['float', 'rocket', 'Flota'], ['bob', 'heart', 'Rebota'], ['sway', 'bug', 'Se mece'], ['pulse', 'bolt', 'Late']];
        modes.forEach(([idle, kind, label], i) => {
          s.icon({ id: `m-${idle}`, kind, rect: { x: 160 + i * 440, y: 300, w: 380, h: 440 }, label, idle, at: 0.4 + i * 0.2 });
        });
      },
    }),
  ],
});
