// Devices demo (2 scenes, 20 s): a browser with a pull request page inside it and a cursor that clicks "open" and then
// "merge"; a phone with an app screen whose total counts up and a new feature appears, next to a wide app screen.
export const title = 'Dispositivos: navegador, móvil y cursor';

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'pull-request',
      dur: 12,
      build(s) {
        s.label({ id: 'heading', text: 'De la idea a producción en un clic', rect: { x: 160, y: 100, w: 1600, h: 110 }, px: 90, font: 'display', type: true, at: 0.2 });
        const { x, y, w, h } = s.area;
        s.browser({ id: 'web', rect: { x: x + 120, y, w: w - 240, h }, url: 'github.com/tienda/web/pull/128', at: 0.4 });
        s.prPage({
          id: 'pr',
          in: 'web.body',
          at: 1.4,
          title: 'Agregar cupón de descuento',
          number: 128,
          from: 'feat/cupon',
          to: 'main',
          author: 'Lucía',
          stats: { add: 142, del: 18 },
          button: 'Abrir pull request',
          openAt: 3.2,
          checks: [
            { name: 'pruebas', start: 4.2, end: 6.4 },
            { name: 'lint', start: 4.2, end: 5.2 },
            { name: 'build', start: 5.2, end: 7 },
          ],
          reviewers: [{ name: 'Marta', approveAt: 7.4 }, { name: 'Diego', approveAt: 8.2 }],
          mergeAt: 10,
        });
        const at = (id, kx, ky) => {
          const r = s.reg.get(id);
          return [r.x + r.w * kx, r.y + r.h * ky];
        };
        s.cursor({ path: [[1.8, x + w - 500, y + 120], [2.9, ...at('pr.button', 0.8, 0.6)], [3.8, ...at('pr.button', 0.8, 0.6)], [9.4, ...at('pr.merge', 0.85, 0.6)], [11, x + w - 400, y + h - 80]], clicks: [3.2, 10], until: 11.6 });
      },
    }),
    scene({
      name: 'compra',
      dur: 9,
      build(s) {
        s.label({ id: 'heading', text: 'La misma pantalla en el móvil y en la web', rect: { x: 160, y: 100, w: 1600, h: 110 }, px: 90, font: 'display', type: true, at: 0.2 });
        const { x, y, w, h } = s.area;
        s.phone({ id: 'ph', rect: { x: x + 40, y, w: 340, h }, at: 0.4, tilt: 8 });
        s.appScreen({
          id: 'app',
          in: 'ph.screen',
          at: 1.2,
          title: 'Mi tienda',
          rows: [{ label: 'Camiseta', value: '$ 25' }, { label: 'Gorra', value: '$ 12' }],
          total: { label: 'Total', from: 37, to: 49, prefix: '$ ', at: 3, dur: 1.4 },
          cta: 'Pagar',
          feature: { label: 'Modo oscuro', at: 5, badge: 'Nuevo' },
        });
        s.browser({ id: 'web', rect: { x: x + 480, y: y + 20, w: w - 520, h: h - 40 }, url: 'tienda.com/carrito', at: 0.8 });
        s.appScreen({
          id: 'wide',
          in: 'web.body',
          at: 1.6,
          title: 'Carrito',
          rows: [{ label: 'Camiseta', value: '$ 25' }, { label: 'Gorra', value: '$ 12' }, { label: 'Notificaciones', on: true }],
          total: { label: 'Total', from: '$ 37', to: '$ 29,60', at: 4, dur: 1 },
          banner: { text: 'Cupón aplicado', at: 4.4 },
          cta: 'Pagar ahora',
        });
      },
    }),
  ],
});
