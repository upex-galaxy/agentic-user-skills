// Public entry of the engine: the toolkit handed to scene files, plus the engine factory wired with every piece.
import { createEngine as create, scene } from './core.js';
import * as math from './math.js';
import { pieces as anatomy } from './pieces/anatomy.js';
import { pieces as architecture } from './pieces/architecture.js';
import { basePieces } from './pieces/base.js';
import { pieces as code } from './pieces/code.js';
import { pieces as flow } from './pieces/flow.js';
import { pieces as mindmap } from './pieces/mindmap.js';
import { pieces as motion } from './pieces/motion.js';
import { pieces as sequence } from './pieces/sequence.js';
import { pieces as state } from './pieces/state.js';
import { pieces as table } from './pieces/table.js';
import { pieces as timeline } from './pieces/timeline.js';
import { pieces as titles } from './pieces/titles.js';
import { pieces as tree } from './pieces/tree.js';

/** What a scene file receives: `export default kit => ({ title, scenes: [kit.scene({...})] })`. */
export const kit = { scene, ...math, W: 1920, H: 1080 };

const families = [basePieces, titles, tree, mindmap, timeline, flow, table, sequence, architecture, code, anatomy, state, motion];

/** Every piece, keyed by the name a scene calls on the builder (`s.<name>(opts)`). A duplicate name is a wiring bug. */
export const allPieces = families.reduce((acc, fam) => {
  for (const [name, fn] of Object.entries(fam)) {
    if (name in acc) { throw new Error(`piece name used twice: ${name}`); }
    acc[name] = fn;
  }
  return acc;
}, {});

export function createEngine({ canvas, ctx, style, spec }) {
  return create({ canvas, ctx, style, spec, pieces: allPieces });
}

export { basePieces };
