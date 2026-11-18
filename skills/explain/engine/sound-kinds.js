// Sound-effect kinds shared by the engine's event list (core.js), the synth (audio.js) and preset validation.
// Order is the drop priority under the density caps: the first kinds drop first.
export const SOUND_KINDS = ['pop', 'tick', 'blip', 'sparkle', 'hit', 'stamp', 'ding', 'whoosh', 'glitch', 'riser', 'swell', 'success', 'fail'];

/** The sound of a scene transition, by the outgoing transition's type. */
export const transitionSound = type => (type === 'glitch' ? 'glitch' : type === 'zoom-through' ? 'riser' : 'whoosh');
