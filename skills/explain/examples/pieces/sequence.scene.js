// Demo (7.5 s): sequence diagram with sync, async and return messages and activation bars.
export const title = 'Secuencia: inicio de sesión';

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'secuencia',
      dur: 7.5,
      build(s) {
        s.label({ id: 'heading', text: 'Qué pasa al iniciar sesión', rect: { x: 160, y: 60, w: 1600, h: 110 }, px: 84, font: 'display', type: true, at: 0.2 });
        s.sequence({
          area: { x: 140, y: 210, w: 1640, h: 780 },
          actors: ['Cliente', 'API', { id: 'db', text: 'Base de datos' }],
          messages: [
            { from: 'Cliente', to: 'API', text: 'POST /login' },
            { from: 'API', to: 'db', text: 'Buscar usuario', kind: 'async' },
            { from: 'db', to: 'API', text: 'Usuario y clave', kind: 'return' },
            { from: 'API', to: 'Cliente', text: '200 con token', kind: 'return' },
          ],
          activation: true,
          at: 0.6,
        });
      },
    }),
  ],
});
