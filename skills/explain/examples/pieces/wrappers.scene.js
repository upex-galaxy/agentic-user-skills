// Wrappers demo (1 scene, 11 s): enter from each side, pop and spin, an animate with keyframes, iris and blinds reveals, an exit.
export const title = 'Envoltorios de movimiento';

const cell = (col, row) => ({ x: 80 + col * 460, y: row === 0 ? 270 : 590, w: 380, h: 230 });

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'envoltorios',
      dur: 11,
      build(s) {
        s.sectionTag({ index: 1, total: 1, name: 'Movimiento', at: 0.1 });
        s.label({ id: 'heading', text: 'Entran, se mueven y se van', rect: { x: 160, y: 120, w: 1600, h: 110 }, px: 90, font: 'display', at: 0.2 });

        s.icon({ id: 'w-left', kind: 'rocket', rect: cell(0, 0), label: 'Desde la izquierda', at: 0 });
        s.icon({ id: 'w-right', kind: 'server', rect: cell(1, 0), label: 'Desde la derecha', at: 0 });
        s.node({ id: 'w-pop', text: 'Con rebote', rect: cell(2, 0), color: 'accent2', at: 0, dur: 0.1 });
        s.icon({ id: 'w-spin', kind: 'gear', rect: cell(3, 0), label: 'Girando', at: 0 });
        s.enter({ targets: 'w-left', at: 0.6, from: 'left' });
        s.enter({ targets: 'w-right', at: 1.0, from: 'right' });
        s.enter({ targets: 'w-pop', at: 1.4, from: 'pop', dur: 0.8 });
        s.enter({ targets: 'w-spin', at: 1.8, from: 'spin', dur: 0.9 });

        s.icon({ id: 'w-move', kind: 'rocket', rect: cell(0, 1), label: 'Se mueve y crece', color: 'good', at: 0 });
        s.animate({ targets: 'w-move', y: [[3.4, 0], [5, -40]], scale: [[3.4, 1], [5, 1.2]], rot: [[3.4, 0], [5, 6]], alpha: [[0.1, 0], [0.7, 1]] });

        s.node({ id: 'w-iris', text: 'Apertura en iris', rect: cell(1, 1), color: 'accent', at: 0, dur: 0.1 });
        s.reveal({ targets: 'w-iris', at: 4, dur: 1.2, shape: 'iris' });
        s.node({ id: 'w-blinds', text: 'Persianas', rect: cell(2, 1), color: 'good', at: 0, dur: 0.1 });
        s.reveal({ targets: 'w-blinds', at: 5.2, dur: 1.2, shape: 'blinds', dir: 'top' });

        s.icon({ id: 'w-exit', kind: 'cloud', rect: cell(3, 1), label: 'Se va', at: 0 });
        s.enter({ targets: 'w-exit', at: 6.4, from: 'bottom', dur: 0.8 });
        s.exit({ targets: 'w-exit', at: 8.4, to: 'right', dur: 0.8 });
      },
    }),
  ],
});
