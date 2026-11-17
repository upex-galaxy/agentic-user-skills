// Demo (8 s): architecture in three layers; zones reveal, then nodes, then links.
export const title = 'Arquitectura en capas';

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'capas',
      dur: 8.5,
      build(s) {
        s.label({ id: 'heading', text: 'Así se reparte el sistema', rect: { x: 160, y: 40, w: 1600, h: 100 }, px: 80, font: 'display', type: true, at: 0.2 });
        s.architecture({
          area: { x: 160, y: 160, w: 1600, h: 840 },
          zones: [
            { id: 'client', title: 'Cliente', nodes: [{ id: 'web', text: 'App web' }, { id: 'mobile', text: 'App móvil' }] },
            { id: 'api', title: 'API', nodes: [{ id: 'gateway', text: 'Gateway' }, { id: 'orders', text: 'Pedidos' }] },
            { id: 'data', title: 'Datos', nodes: [{ id: 'pg', text: 'Postgres' }, { id: 'cache', text: 'Caché' }] },
          ],
          links: [['web', 'gateway', 'HTTPS'], ['mobile', 'gateway'], ['gateway', 'orders', 'REST'], ['orders', 'pg', 'SQL'], ['orders', 'cache', 'lee']],
          at: 0.6,
        });
      },
    }),
  ],
});
