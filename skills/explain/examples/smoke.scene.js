// Smoke scene (10 s): row layout, 3 nodes, 2 edges, a typewriter label, a group and one camera focus.
// The same file builds in both styles (sketch, hologram): colors come from style tokens, never hex values.
export const title = 'Smoke: cómo viaja un cambio';

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'flujo',
      dur: 6.5,
      transition: { type: 'light-sweep', dur: 0.6 },
      build(s) {
        s.label({ id: 'heading', text: 'Cómo viaja un cambio', rect: { x: 160, y: 110, w: 1600, h: 120 }, px: 96, font: 'display', type: true, at: 0.2 });
        s.row([{ id: 'dev', w: 440, h: 220 }, { id: 'ci', w: 440, h: 220 }, { id: 'main', w: 440, h: 220 }], { gap: 200 });
        s.node({ id: 'dev', text: 'Dev escribe el cambio', at: 1.0, color: 'accent' });
        s.node({ id: 'ci', text: 'CI corre las pruebas', at: 1.8, color: 'accent2' });
        s.node({ id: 'main', text: 'Merge a main', at: 2.6, color: 'good' });
        s.edge({ from: 'dev', to: 'ci', at: 2.2, color: 'ink' });
        s.edge({ from: 'ci', to: 'main', at: 3.0, color: 'ink' });
        s.label({ id: 'caption', text: 'Si las pruebas fallan, el cambio no avanza.', place: { to: 'ci', side: 'bottom', gap: 100 }, w: 1300, h: 90, type: true, typeAt: 3.4, color: 'dim' });
        s.camera.focus('ci', 4.4, 1.0, { zoom: 1.5 });
        s.camera.reset(5.7, 0.6);
      },
    }),
    scene({
      name: 'cierre',
      dur: 4.1,
      build(s) {
        s.label({ id: 'heading', text: 'Todo pasa por revisión', rect: { x: 160, y: 110, w: 1600, h: 120 }, px: 96, font: 'display', type: true, at: 0.6 });
        s.row([{ id: 'tests', w: 420, h: 200 }, { id: 'review', w: 420, h: 200 }], { gap: 240 });
        s.group({ id: 'pr', children: ['tests', 'review'], title: 'Pull request', at: 0.8, pad: 36 });
        s.node({ id: 'tests', text: 'Pruebas verdes', at: 1.2, color: 'good' });
        s.node({ id: 'review', text: 'Revisión humana', at: 1.7, color: 'accent' });
        s.edge({ from: 'tests', to: 'review', at: 2.2, color: 'ink' });
        s.label({ id: 'note', text: 'Nada llega a main sin pasar por aquí.', place: { to: 'pr', side: 'bottom', gap: 70 }, w: 1300, h: 90, type: true, typeAt: 2.6, color: 'dim' });
      },
    }),
  ],
});
