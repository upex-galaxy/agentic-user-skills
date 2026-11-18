// Movement demo (5 scenes, 31 s): packets on arc, S and anchor paths with a ping, confetti and a burst, parallax with a
// camera move, a spotlight, a split screen with two icons, and a journey rail on every scene.
export const title = 'Movimiento: paquetes, fiesta y foco';

const STEPS = ['Envío', 'Fiesta', 'Profundidad', 'Foco', 'Dividido'];

/** Furniture of every scene: section tag, journey rail and heading. */
function furniture(s, i, heading) {
  s.sectionTag({ index: i + 1, total: STEPS.length, name: STEPS[i], at: 0.1 });
  s.journeyRail({ steps: STEPS, active: i });
  s.heading({ text: heading });
}

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'envio',
      dur: 8,
      build(s) {
        furniture(s, 0, 'Los datos viajan');
        s.icon({ id: 'laptop', kind: 'laptop', rect: { x: 160, y: 430, w: 280, h: 340 }, label: 'Tu laptop', at: 0.4 });
        s.icon({ id: 'server', kind: 'server', rect: { x: 820, y: 300, w: 280, h: 340 }, label: 'Servidor', at: 0.6 });
        s.icon({ id: 'database', kind: 'database', rect: { x: 1480, y: 520, w: 280, h: 340 }, label: 'Base de datos', at: 0.8 });
        s.packets({ id: 'up', path: ['laptop', 'server'], curve: 'arc', bend: -110, shape: 'doc', at: 1.6, until: 2.8, every: 0.6, dur: 1.4, color: 'accent', ping: true });
        s.packets({ id: 'down', path: ['server', 'database'], curve: 's', shape: 'package', at: 3.6, until: 4.6, every: 0.5, dur: 1.4, color: 'accent2', ping: true });
        s.packets({ id: 'back', path: [{ id: 'database', anchor: 'left' }, [1190, 840], { id: 'laptop', anchor: 'bottom' }], curve: 'arc', bend: 90, at: 5.6, until: 6.4, every: 0.4, dur: 1.8, color: 'good', track: false });
      },
    }),
    scene({
      name: 'fiesta',
      dur: 6,
      build(s) {
        furniture(s, 1, 'Listo para producción');
        s.icon({ id: 'rocket', kind: 'rocket', rect: { x: 700, y: 250, w: 520, h: 620 }, label: 'Versión 2.0', at: 0.4, idle: 'float' });
        s.icon({ id: 'ok', kind: 'check', rect: { x: 160, y: 330, w: 420, h: 480 }, label: 'Pruebas', at: 0.6 });
        s.icon({ id: 'users', kind: 'user', rect: { x: 1340, y: 330, w: 420, h: 480 }, label: 'Usuarios', at: 0.8 });
        s.burst({ target: 'rocket', at: 1.4, radius: 260, shape: 'spark' });
        s.particles({ mode: 'confetti', at: 1.6, dur: 2.6, count: 70, seed: 11 });
        s.particles({ mode: 'hearts', origin: [1550, 760], at: 3.2, dur: 2.2, count: 8, seed: 4 });
        s.caption({ text: 'Todo salió bien. A celebrar.', at: 2.2 });
      },
    }),
    scene({
      name: 'profundidad',
      dur: 6.5,
      build(s) {
        furniture(s, 2, 'Capas con profundidad');
        s.parallax({ kind: 'shapes', count: 9 });
        s.icon({ id: 'a', kind: 'cloud', rect: { x: 120, y: 290, w: 520, h: 560 }, label: 'Nube', at: 0.4 });
        s.icon({ id: 'b', kind: 'shield', rect: { x: 700, y: 290, w: 520, h: 560 }, label: 'Seguridad', at: 0.6 });
        s.icon({ id: 'c', kind: 'bolt', rect: { x: 1280, y: 290, w: 520, h: 560 }, label: 'Velocidad', at: 0.8 });
        s.camera.focus('b', 2, 1.3, { zoom: 1.2 }).reset(4.8, 1.2);
      },
    }),
    scene({
      name: 'foco',
      dur: 6,
      build(s) {
        furniture(s, 3, 'Mira solo esto');
        s.icon({ id: 'f1', kind: 'laptop', rect: { x: 120, y: 290, w: 520, h: 560 }, label: 'Equipo', at: 0.4 });
        s.icon({ id: 'f2', kind: 'bug', rect: { x: 700, y: 290, w: 520, h: 560 }, label: 'El fallo', at: 0.6 });
        s.icon({ id: 'f3', kind: 'gear', rect: { x: 1280, y: 290, w: 520, h: 560 }, label: 'Motor', at: 0.8, spin: 1 });
        s.spotlight({ target: 'f2', at: 2, until: 4.8, pad: 24 });
        s.caption({ text: 'Todo lo demás se apaga.', at: 2.4, until: 4.8 });
      },
    }),
    scene({
      name: 'dividido',
      dur: 5,
      build(s) {
        furniture(s, 4, 'Antes y después');
        s.splitScreen({ id: 'split', left: { color: 'bad', label: 'Antes' }, right: { color: 'good', label: 'Después' }, slant: 60, at: 0.4 });
        s.icon({ kind: 'clock', in: 'split.left', inset: 50, label: 'Horas a mano', at: 1.4 });
        s.icon({ kind: 'bolt', in: 'split.right', inset: 50, label: 'Minutos', at: 1.8 });
      },
    }),
  ],
});
