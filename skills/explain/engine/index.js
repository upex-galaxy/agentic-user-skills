// Public entry of the engine: the toolkit handed to scene files, plus the engine factory wired with every piece.
import { createEngine as create, scene } from './core.js';
import { path } from './kit.js';
import * as math from './math.js';
import { pieces as anatomy } from './pieces/anatomy.js';
import { pieces as annotate } from './pieces/annotate.js';
import { pieces as architecture } from './pieces/architecture.js';
import { basePieces } from './pieces/base.js';
import { pieces as code } from './pieces/code.js';
import { pieces as devices } from './pieces/devices.js';
import { pieces as flow } from './pieces/flow.js';
import { pieces as icons } from './pieces/icons.js';
import { pieces as mindmap } from './pieces/mindmap.js';
import { pieces as motion } from './pieces/motion.js';
import { pieces as movement } from './pieces/movement.js';
import { pieces as numbers } from './pieces/numbers.js';
import { pieces as screens } from './pieces/screens.js';
import { pieces as sequence } from './pieces/sequence.js';
import { pieces as state } from './pieces/state.js';
import { pieces as systems } from './pieces/systems.js';
import { pieces as table } from './pieces/table.js';
import { pieces as timeline } from './pieces/timeline.js';
import { pieces as titles } from './pieces/titles.js';
import { pieces as tree } from './pieces/tree.js';
import { pieces as wrappers } from './pieces/wrappers.js';

/** What a scene file receives: `export default kit => ({ title, scenes: [kit.scene({...})] })`. */
export const kit = { scene, ...math, path, W: 1920, H: 1080 };

const families = [basePieces, titles, tree, mindmap, timeline, flow, table, sequence, architecture, code, anatomy, state, motion, icons, screens, devices, numbers, annotate, movement, systems, wrappers];

/** Every piece, keyed by the name a scene calls on the builder (`s.<name>(opts)`). A duplicate name is a wiring bug. */
export const allPieces = families.reduce((acc, fam) => {
  for (const [name, fn] of Object.entries(fam)) {
    if (name in acc) { throw new Error(`piece name used twice: ${name}`); }
    acc[name] = fn;
  }
  return acc;
}, {});

export function createEngine({ canvas, ctx, style, spec, narration }) {
  return create({ canvas, ctx, style, spec, pieces: allPieces, narration });
}

export { basePieces };
