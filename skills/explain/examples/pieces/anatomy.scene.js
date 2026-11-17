// Demo (8 s): an object built from simple shapes with numbered callouts pointing to its parts.
export const title = 'Anatomía de un teléfono';

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'anatomia',
      dur: 8.5,
      build(s) {
        s.label({ id: 'heading', text: 'Las partes que importan', rect: { x: 160, y: 50, w: 1600, h: 110 }, px: 84, font: 'display', type: true, at: 0.2 });
        s.anatomy({
          id: 'phone',
          area: { x: 120, y: 190, w: 1680, h: 800 },
          aspect: 0.5,
          parts: [
            { id: 'body', shape: 'round', x: 0, y: 0, w: 1, h: 1, color: 'dim' },
            { id: 'screen', shape: 'rect', x: 0.08, y: 0.1, w: 0.84, h: 0.7, color: 'accent2' },
            { id: 'camera', shape: 'ellipse', x: 0.44, y: 0.03, w: 0.12, h: 0.04, color: 'accent' },
            { id: 'button', shape: 'ellipse', x: 0.4, y: 0.86, w: 0.2, h: 0.09, color: 'good' },
          ],
          labels: [
            { part: 'screen', text: 'Pantalla táctil' },
            { part: 'camera', text: 'Cámara frontal', side: 'left' },
            { part: 'button', text: 'Botón de inicio' },
            { target: { x: 0, y: 0.45, w: 0.04, h: 0.1 }, text: 'Carcasa', side: 'left' },
          ],
          at: 0.5,
        });
      },
    }),
  ],
});
