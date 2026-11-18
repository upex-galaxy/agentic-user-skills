// Systems demo (5 scenes, 41 s): a CI pipeline where a job fails and passes on retry, a git graph with a branch and a
// merge, a machine turning files into a package, a fleet rolling from v1 to v2 and the layers of a stack.
export const title = 'Sistemas: pipeline, git, máquina, flota y capas';

const heading = (s, text) => s.label({ id: 'heading', text, rect: { x: 160, y: 100, w: 1600, h: 110 }, px: 90, font: 'display', type: true, at: 0.2 });

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'pipeline',
      dur: 10,
      build(s) {
        heading(s, 'Un pipeline que falla y se recupera');
        s.pipeline({
          id: 'ci',
          rect: s.area,
          runAt: 1,
          at: 0.4,
          stages: [
            { name: 'Construir', jobs: [{ name: 'Compilar', dur: 1.4 }, { name: 'Estilo', dur: 1 }] },
            { name: 'Probar', jobs: [{ name: 'Unitarias', dur: 1.6 }, { name: 'Integración', dur: 2, ok: false }] },
            { name: 'Reintento', jobs: [{ name: 'Integración', dur: 2 }] },
          ],
        });
      },
    }),
    scene({
      name: 'git',
      dur: 9,
      build(s) {
        heading(s, 'Una rama que vuelve a main');
        s.gitGraph({
          id: 'g',
          rect: s.area,
          at: 0.4,
          lanes: [{ name: 'main', color: 'accent' }, { name: 'feature/pago', color: 'accent2' }],
          commits: [
            { id: 'c1', lane: 'main', col: 0, at: 1, label: 'inicio' },
            { id: 'c2', lane: 'main', col: 1, at: 1.7, parents: ['c1'], label: 'base' },
            { id: 'f1', lane: 'feature/pago', col: 2, at: 2.6, parents: ['c2'], label: 'botón' },
            { id: 'f2', lane: 'feature/pago', col: 3, at: 3.4, parents: ['f1'], label: 'pruebas' },
            { id: 'c3', lane: 'main', col: 3, at: 4, parents: ['c2'], label: 'arreglo' },
            { id: 'm', lane: 'main', col: 4, at: 5.2, parents: ['c3', 'f2'], label: 'fusión', tag: 'v1.0' },
          ],
        });
      },
    }),
    scene({
      name: 'maquina',
      dur: 9,
      build(s) {
        heading(s, 'De archivos a un paquete');
        s.machine({
          id: 'mq',
          rect: s.area,
          at: 0.4,
          inputs: [{ kind: 'doc', label: 'código' }, { kind: 'doc', label: 'estilos', color: 'accent2' }, { kind: 'database', label: 'datos', color: 'warn' }],
          machine: { label: 'Empaquetar' },
          output: { kind: 'package', label: 'app.zip', color: 'good' },
        });
      },
    }),
    scene({
      name: 'flota',
      dur: 8,
      build(s) {
        heading(s, 'Actualizar sin parar el servicio');
        s.fleet({ id: 'fl', rect: s.area, count: 4, from: 'v1', to: 'v2', lb: 'Balanceador', startAt: 1.4, step: 1.2, at: 0.3 });
      },
    }),
    scene({
      name: 'capas',
      dur: 6,
      build(s) {
        heading(s, 'Las capas de la pila');
        s.layers({
          id: 'pila',
          rect: { x: 360, y: 260, w: 1200, h: 600 },
          at: 0.8,
          step: 0.6,
          layers: [{ text: 'Infraestructura', color: 'accent2' }, { text: 'Datos', color: 'good' }, { text: 'Servicios', color: 'accent' }, { text: 'Interfaz', color: 'warn' }],
        });
      },
    }),
  ],
});
