// The engine is plain browser JS (no build step, no types). Tests import it untyped.
// Declared per file name, not as '*.js', so other skills' text-imported .js files (mkd's ui/app.js) keep their types.
// allowJs is not used for the same reason.
declare module '*/math.js';
declare module '*/core.js';
declare module '*/clock.js';
declare module '*/camera.js';
declare module '*/layout.js';
declare module '*/text.js';
declare module '*/qa.js';
declare module '*/player.js';
declare module '*/index.js';
declare module '*/hologram.js';
declare module '*/sketch.js';
declare module '*/base.js';
declare module '*/smoke.scene.js';
// Piece modules and their demo scenes (batches A and B), imported untyped by tests.
declare module '*/titles.js';
declare module '*/tree.js';
declare module '*/mindmap.js';
declare module '*/timeline.js';
declare module '*/flow.js';
declare module '*/table.js';
declare module '*/diagram-kit.js';
declare module '*/sequence.js';
declare module '*/architecture.js';
declare module '*/code.js';
declare module '*/anatomy.js';
declare module '*/state.js';
declare module '*/motion.js';
declare module '*/sequence.scene.js';
declare module '*/architecture.scene.js';
declare module '*/code.scene.js';
declare module '*/anatomy.scene.js';
declare module '*/state.scene.js';
declare module '*/motion.scene.js';
declare module '*/motion2.scene.js';
declare module '*/bands.js';
// Presets merge: engine modules, piece families, presets and their scenes.
declare module '*/preset.js';
declare module '*/transitions.js';
declare module '*/kit.js';
declare module '*/icons.js';
declare module '*/screens.js';
declare module '*/devices.js';
declare module '*/numbers.js';
declare module '*/annotate.js';
declare module '*/movement.js';
declare module '*/systems.js';
declare module '*/wrappers.js';
declare module '*.scene.js';
// Audio release: narration, WAV codec, synth and mixer, audio QA.
declare module '*/narration.js';
declare module '*/wav.js';
declare module '*/audio.js';
declare module '*/audio-qa.js';
declare module '*/sound-kinds.js';
declare module '*/page-audio.js';
