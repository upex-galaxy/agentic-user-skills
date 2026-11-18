// Ready example (hologram, ~52 s, 6 scenes): explain an agent SKILL from its SKILL.md. Copy it to explain any skill:
// swap the facts and keep the structure: title, when to use it, the steps, the key idea, before/after, recap.
// It places everything with the layout helpers (s.row, s.stack, splitScreen) and the layout recipes of
// references/direction.md, so no coordinates are typed by hand. Every fact comes from skills/blast-radius/SKILL.md.
export const title = 'Qué hace la skill blast-radius';
export const preset = 'hologram';

const SRC = 'skills/blast-radius/SKILL.md';
const TOTAL = 6;
const RAIL = ['Cuándo', 'Pasos', 'Certeza', 'Antes y después'];

/** Furniture of the middle scenes: tag, rail, heading, source. */
function furniture(s, index, name, heading) {
  s.sectionTag({ index, total: TOTAL, name, at: 0.1 });
  s.journeyRail({ steps: RAIL, active: index - 2 });
  s.heading({ text: heading });
  s.sourceFooter({ text: SRC, at: 1 });
}

export default ({ scene }) => ({
  title,
  lang: 'es',
  scenes: [
    // 1. Title: kinetic text, then the four ideas as icons in a row (the row grows to fill its area).
    scene({
      name: 'portada',
      dur: 7,
      transition: { type: 'light-sweep', dur: 0.5 },
      build(s) {
        s.sectionTag({ index: 1, total: TOTAL, name: 'Introducción', at: 0.1 });
        s.kineticText({ id: 'hero', text: 'La skill|*blast-radius*', rect: { x: 160, y: 200, w: 1600, h: 340 }, mode: 'slam', step: 0.2, at: 0.3, underline: ['blast-radius'] });
        const ideas = [['branch', 'Un cambio'], ['eye', 'Lo que rompe'], ['bolt', 'Un hecho clave'], ['check', 'Probado']];
        s.row(ideas.map(([kind]) => ({ id: `i-${kind}`, w: 300, h: 240 })), { area: { x: 160, y: 580, w: 1600, h: 300 }, gap: 80 });
        ideas.forEach(([kind, label], i) => s.icon({ id: `i-${kind}`, kind, label, at: 2.2 + i * 0.3, idle: 'float' }));
        s.packets({ path: ['i-branch', 'i-eye', 'i-bolt', 'i-check'], at: 3.6, every: 0.7, count: 4, shape: 'dot' });
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
    // 2. Recipe "hero plus side chips": the hero icon on the left, its use cases stacked on the right.
    scene({
      name: 'cuando',
      dur: 8,
      build(s) {
        furniture(s, 2, 'Cuándo', 'Cuándo usarla');
        s.row([{ id: 'heroBox', w: 640, h: 520 }, { id: 'side', w: 860, h: 520 }], { gap: 140 });
        s.icon({ id: 'heroIcon', kind: 'bolt', in: 'heroBox', inset: 40, label: 'blast-radius', at: 0.5, idle: 'pulse', color: 'accent' });
        const uses = ['Saber qué puede romper un cambio', 'Revisar un diff chico que no convence', 'Sin nadie al teclado'];
        s.stack(uses.map((_, i) => ({ id: `use${i}`, w: 860, h: 120 })), { area: s.reg.get('side'), gap: 40 });
        uses.forEach((text, i) => s.chip({ id: `use${i}-chip`, rect: s.reg.get(`use${i}`), text, icon: 'check', px: s.style.defaults.labelPx * 0.8, color: i === 0 ? 'accent' : 'ink', at: 1.6 + i * 0.6 }));
        s.caption({ text: 'Busca lo que grep no muestra.', at: 4, typeDur: 1 });
      },
    }),
    // 3. Recipe "ladder or steps": a flow lays the six steps out by itself; pulse points at the one that matters.
    scene({
      name: 'pasos',
      dur: 10,
      build(s) {
        furniture(s, 3, 'Pasos', 'Seis pasos, uno decisivo');
        s.flow({ id: 'pasos', layout: 'snake', cols: 3, steps: ['Leer el cambio', 'Hallar el hecho clave', 'Mirar donde grep no llega', 'Riesgos honestos', 'Probar el hecho', 'Varios modelos'], at: 0.5, per: 0.6 });
        s.pulse({ target: 'pasos-2', at: 5, times: 2 });
        s.pulse({ target: 'pasos-5', at: 6.4, times: 2 });
        s.caption({ text: 'El hecho clave se prueba con código.', at: 5, typeDur: 1 });
      },
    }),
    // 4. Recipe "diagram left plus text right": the certainty ladder on the left, the point on the right.
    scene({
      name: 'certeza',
      dur: 9,
      build(s) {
        furniture(s, 4, 'Certeza', 'Qué tan seguro estás');
        s.row([{ id: 'ladder', w: 980, h: 600 }, { id: 'point', w: 620, h: 600 }], { gap: 100 });
        const levels = ['1. Lo dijiste', '2. Señalaste la línea', '3. Mostraste que no pasa', '4. Lo corriste', '5. Lo reprodujiste en la app'];
        s.stack(levels.map((_, i) => ({ id: `lv${i}`, w: 980, h: 100 })), { area: s.reg.get('ladder'), gap: 20 });
        levels.forEach((text, i) => s.node({ id: `lv${i}`, text, at: 0.5 + i * 0.4, color: i === 3 ? 'accent' : 'dim' }));
        s.kineticText({ id: 'paso4', text: 'Casi siempre|alcanza con|el *paso 4*', rect: s.reg.get('point'), mode: 'rise', at: 3, step: 0.15 });
        s.pulse({ target: 'lv3', at: 4.5, times: 2 });
      },
    }),
    // 5. Recipe "before/after split": splitScreen registers each half; pieces go in with `in:`.
    scene({
      name: 'antes-despues',
      dur: 9,
      build(s) {
        furniture(s, 5, 'Antes y después', 'Un informe no alcanza');
        s.splitScreen({ id: 'split', left: { color: 'bad', label: 'Suena bien' }, right: { color: 'good', label: 'Probado' }, at: 0.3 });
        // Each half is a registered rect: place pieces in its upper part and keep the bottom for the verdict.
        const top = r => ({ x: r.x + r.w * 0.2, y: r.y + 30, w: r.w * 0.6, h: r.h * 0.62 });
        const L = s.reg.get('split.left');
        s.icon({ id: 'doc', kind: 'doc', rect: top(L), label: 'Un informe convincente', at: 1, color: 'dim' });
        s.icon({ id: 'run', kind: 'check', rect: top(s.reg.get('split.right')), label: 'Un script que corre', at: 2.4, color: 'good' });
        s.stamp({ id: 'unproven', text: 'unproven', rect: { x: L.x + L.w * 0.22, y: L.y + L.h * 0.74, w: L.w * 0.56, h: L.h * 0.2 }, at: 4, color: 'warn' });
        s.caption({ text: 'Sin prueba, el hecho queda como unproven.', at: 5, typeDur: 1 });
      },
    }),
    // 6. Recap in three points, stacked by the layout helper.
    scene({
      name: 'cierre',
      dur: 7,
      build(s) {
        s.sectionTag({ index: 6, total: TOTAL, name: 'Resumen', at: 0.1 });
        s.heading({ text: 'En resumen' });
        const points = ['1. Busca lo que grep no muestra', '2. Encuentra el hecho clave', '3. Pruébalo corriendo código'];
        s.stack(points.map((_, i) => ({ id: `p${i}`, w: 1300, h: 130 })), { gap: 36 });
        points.forEach((text, i) => s.node({ id: `p${i}`, text, at: 0.5 + i * 0.6, color: i === 2 ? 'accent' : 'ink' }));
        s.sourceFooter({ text: SRC, at: 1 });
      },
    }),
  ],
});
