// Narrated example (3 scenes, Spanish): voice-over with `say` beats, visuals placed on the voice windows (s.voice),
// one explicit effect (s.sfx) and pieces that carry their own sound cues (counter, stamp). Build it silent, with
// --sound on, or with a voice: `voice kokoro <this file>` first, then `export <this file> --voice kokoro --sound on`.
// Every fact comes from skills/explain/references/audio.md.
export const title = 'Cómo se narra un video';

const SRC = 'skills/explain/references/audio.md';

export default ({ scene }) => ({
  title,
  lang: 'es',
  scenes: [
    // 1. The narration is scene data: each beat becomes a voice window the visuals follow.
    scene({
      name: 'guion',
      dur: 7,
      transition: { type: 'light-sweep', dur: 0.5 },
      say: [
        { text: 'Cada escena trae su propio texto.' },
        { text: 'Los elementos aparecen cuando la voz los nombra.' },
      ],
      build(s) {
        s.sectionTag({ index: 1, total: 3, name: 'Guion', at: 0.1 });
        s.heading({ text: 'La voz es parte de la escena' });
        s.row([{ id: 'say', w: 480, h: 420 }, { id: 'voice', w: 480, h: 420 }, { id: 'pieces', w: 480, h: 420 }], { gap: 120 });
        s.node({ id: 'say', text: 'say', at: s.voice[0].at, color: 'accent' });
        s.node({ id: 'voice', text: 's.voice', at: s.voice[0].end - 0.4, color: 'accent2' });
        s.node({ id: 'pieces', text: 'Las piezas', at: s.voice[1].at + 0.6, color: 'good' });
        s.edge({ from: 'say', to: 'voice', at: s.voice[0].end - 0.6 });
        s.edge({ from: 'voice', to: 'pieces', at: s.voice[1].at + 0.4 });
        s.sfx({ kind: 'swell', at: s.voice[1].at + 0.6, gain: 0.6 });
        s.sourceFooter({ text: SRC, at: 0.5 });
      },
    }),
    // 2. The cache: a line is synthesized once, then every build reads it.
    scene({
      name: 'cache',
      dur: 7,
      transition: { type: 'push-zoom', dur: 0.5 },
      say: 'Cada línea se genera una vez y queda guardada. La segunda vez no cuesta nada.',
      build(s) {
        s.sectionTag({ index: 2, total: 3, name: 'Caché', at: 0.1 });
        s.heading({ text: 'Una línea, una sola vez' });
        s.row([{ id: 'gen', w: 700, h: 420 }, { id: 'cost', w: 700, h: 420 }], { gap: 160 });
        s.node({ id: 'gen', text: 'Generada y guardada', at: s.voice[0].at + 0.3, color: 'accent' });
        s.counter({ id: 'cost', to: 0, from: 31, dur: 1.4, at: s.voice[0].at + 2.6, label: 'Créditos la segunda vez' });
        s.sourceFooter({ text: SRC, at: 0.5 });
      },
    }),
    // 3. The timing rule: the scene stretches, the voice is never cut.
    scene({
      name: 'tiempo',
      dur: 6,
      say: 'Si la voz es más larga, la escena se estira. La voz nunca se corta.',
      build(s) {
        s.sectionTag({ index: 3, total: 3, name: 'Tiempo', at: 0.1 });
        s.heading({ text: 'La escena espera a la voz' });
        // The node takes the upper part of the content area; the stamp lands below it, clear of the caption band.
        s.stack([{ id: 'scene', w: 1300, h: 300 }, { id: 'stampBox', w: 620, h: 170 }], { gap: 70 });
        s.node({ id: 'scene', text: 'La escena dura lo que dura la voz', at: s.voice[0].at, color: 'accent2' });
        s.stamp({ id: 'never', text: 'Nunca se corta', rect: s.reg.get('stampBox'), at: s.voice[0].end - 1.2, color: 'good' });
        s.sourceFooter({ text: SRC, at: 0.5 });
      },
    }),
  ],
});
