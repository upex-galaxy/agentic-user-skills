// QA fixture: every piece that shows text gets an opening question mark. `check` must flag each piece id with
// `opening-punctuation` (engine/qa.test.ts asserts it). Not a video: layouts overlap on purpose, one scene per family.
export const title = 'Fixture: opening marks';

const Q = '¿Qué';

export default ({ scene }) => ({
  title,
  scenes: [
    scene({ name: 'titles', dur: 2, build(s) {
      s.titleCard({ id: 'q-title', title: `${Q} título`, subtitle: `${Q} subtítulo` });
      s.heading({ id: 'q-heading', text: `${Q} encabezado` });
      s.caption({ id: 'q-caption', text: `${Q} leyenda` });
      s.sectionTag({ id: 'q-tag', index: 1, total: 2, name: `${Q} sección` });
      s.sourceFooter({ id: 'q-footer', text: `${Q} fuente` });
    } }),
    scene({ name: 'base', dur: 2, build(s) {
      s.row([{ id: 'q-node', w: 400, h: 200 }, { id: 'q-other', w: 400, h: 200 }], { gap: 200 });
      s.node({ id: 'q-node', text: `${Q} nodo` });
      s.label({ id: 'q-label', text: `${Q} etiqueta`, rect: { x: 100, y: 800, w: 600, h: 80 } });
    } }),
    scene({ name: 'diagrams', dur: 2, build(s) {
      s.flow({ id: 'q-flow', area: { x: 80, y: 300, w: 1760, h: 420 }, steps: [`${Q} paso`, 'Dos'] });
      s.table({ id: 'q-table', area: { x: 160, y: 270, w: 1600, h: 640 }, columns: [`${Q} columna`, 'B'], rows: [['a', 'b']] });
      s.timeline({ id: 'q-timeline', area: { x: 80, y: 260, w: 1760, h: 700 }, milestones: [{ label: `${Q} hito`, date: '2024' }, { label: 'Otro', date: '2025' }] });
      s.mindMap({ id: 'q-mind', area: { x: 80, y: 130, w: 1760, h: 820 }, hub: `${Q} centro`, branches: [{ text: 'Rama' }] });
      s.folderTree({ id: 'q-tree', area: { x: 360, y: 260, w: 1200, h: 700 }, root: `${Q}-raiz`, data: { 'a.ts': null } });
      s.codeBlock({ id: 'q-code', title: 'x.ts', area: { x: 120, y: 200, w: 1680, h: 780 }, lines: [`// ${Q} comentario`] });
    } }),
    scene({ name: 'icons-numbers', dur: 2, build(s) {
      s.icon({ id: 'q-icon', kind: 'laptop', rect: { x: 100, y: 300, w: 300, h: 300 }, label: `${Q} ícono` });
      s.counter({ id: 'q-counter', rect: { x: 500, y: 300, w: 500, h: 300 }, from: 0, to: 10, label: `${Q} contador` });
      s.progress({ id: 'q-progress', rect: { x: 100, y: 700, w: 1600, h: 110 }, label: `${Q} avance` });
      s.gauge({ id: 'q-gauge', rect: { x: 1100, y: 280, w: 700, h: 380 }, to: 0.5, label: `${Q} cobertura` });
      s.chart({ id: 'q-chart', rect: { x: 160, y: 250, w: 880, h: 640 }, type: 'bars', data: [1, 2], labels: ['a', 'b'], title: `${Q} gráfico` });
    } }),
    scene({ name: 'screens', dur: 2, build(s) {
      s.editor({ id: 'q-editor', rect: { x: 80, y: 250, w: 800, h: 600 }, file: 'a.ts', lines: [`// ${Q} línea`] });
      s.terminal({ id: 'q-terminal', rect: { x: 960, y: 250, w: 800, h: 600 }, steps: [{ cmd: `echo ${Q}`, out: `${Q} salida` }] });
      s.diffView({ id: 'q-diff', rect: { x: 80, y: 870, w: 800, h: 150 }, file: 'a.ts', lines: [{ op: '+', text: `${Q} cambio` }] });
    } }),
    scene({ name: 'devices', dur: 2, build(s) {
      s.browser({ id: 'q-web', rect: { x: 80, y: 250, w: 1100, h: 700 }, url: `${Q}.com` });
      s.prPage({ id: 'q-pr', in: 'q-web.body', title: `${Q} pull request`, number: 1, from: 'a', to: 'main' });
      s.phone({ id: 'q-phone', rect: { x: 1400, y: 250, w: 300, h: 600 } });
      s.appScreen({ id: 'q-app', in: 'q-phone.screen', title: `${Q} app`, rows: [{ label: 'Fila', value: '1' }] });
    } }),
    scene({ name: 'annotate', dur: 2, build(s) {
      s.kineticText({ id: 'q-kinetic', text: `${Q} texto`, rect: { x: 160, y: 230, w: 1600, h: 300 } });
      s.stamp({ id: 'q-stamp', text: `${Q} sello`, cx: 1400, cy: 700 });
      s.bubble({ id: 'q-bubble', rect: { x: 200, y: 600, w: 900, h: 170 }, text: `${Q} burbuja` });
      s.chip({ id: 'q-chip', cx: 600, cy: 900, text: `${Q} chip` });
      s.label({ id: 'q-target', text: 'blanco', rect: { x: 1300, y: 300, w: 300, h: 80 } });
      s.callout({ id: 'q-callout', target: 'q-target', text: `${Q} nota`, side: 'bottom', w: 400 });
    } }),
    scene({ name: 'movement-systems', dur: 2, build(s) {
      s.journeyRail({ id: 'q-rail', steps: [`${Q} uno`, 'Dos'], active: 0 });
      s.pipeline({ id: 'q-pipe', rect: { x: 80, y: 250, w: 1760, h: 300 }, stages: [{ name: `${Q} etapa`, jobs: [{ name: 'Job', dur: 1 }] }] });
      s.layers({ id: 'q-layers', rect: { x: 80, y: 600, w: 800, h: 400 }, layers: [{ text: `${Q} capa` }] });
      s.fleet({ id: 'q-fleet', rect: { x: 960, y: 600, w: 880, h: 400 }, count: 2, from: `${Q}v1`, to: 'v2' });
    } }),
    scene({ name: 'systems-2', dur: 2, build(s) {
      s.gitGraph({ id: 'q-git', rect: { x: 80, y: 250, w: 1760, h: 300 }, lanes: [{ name: `${Q}-rama` }], commits: [{ id: 'c1', lane: `${Q}-rama`, col: 0, label: 'c' }] });
      s.machine({ id: 'q-machine', rect: { x: 80, y: 600, w: 1760, h: 400 }, inputs: [{ kind: 'doc', label: `${Q} entrada` }], machine: { label: 'M' }, output: { kind: 'package', label: 'out' } });
    } }),
    scene({ name: 'split', dur: 2, build(s) {
      s.splitScreen({ id: 'q-split', left: { label: `${Q} izquierda` }, right: { label: 'Derecha' } });
    } }),
  ],
});
