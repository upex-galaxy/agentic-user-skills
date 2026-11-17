// Test harness for batch B: builds a scene spec with the base pieces plus the given piece maps, on the stub canvas.
/* eslint-disable ts/no-explicit-any, ts/no-unsafe-assignment, ts/no-unsafe-call, ts/no-unsafe-member-access, ts/no-unsafe-return */
import { createEngine } from '../core.js';
import { kit } from '../index.js';
import { defaultTimes, runQA } from '../qa.js';
import { installRoughStub, makeStubCtx } from '../stub-ctx.ts';
import hologram from '../styles/hologram.js';
import sketch from '../styles/sketch.js';
import { basePieces } from './base.js';

export const STYLES = [['hologram', hologram], ['sketch', sketch]] as const;

export function buildEngine(spec: any, pieces: Record<string, any>, style: any = hologram) {
  const stub = makeStubCtx(0.55);
  if (style === sketch) { installRoughStub(stub.log); }
  const engine = createEngine({ canvas: stub.canvas, style, spec, pieces: { ...basePieces, ...pieces } });
  return { engine, ...stub };
}

/** Build one scene from a build(s) function. */
export function buildScene(build: (s: any) => void, pieces: Record<string, any>, dur = 10, style: any = hologram) {
  return buildEngine({ scenes: [{ name: 'test', dur, build }] }, pieces, style);
}

/** Build a demo scene file with the kit and run the QA gate over it. */
export function qaOfDemo(demo: any, pieces: Record<string, any>, style: any) {
  const { engine } = buildEngine(demo(kit), pieces, style);
  return runQA(engine, defaultTimes(engine, 0.25));
}

/** Records of the QA sample at scene time t, by item id. */
export function records(engine: any, t: number): Record<string, any> {
  const out: Record<string, any> = {};
  for (const r of engine.sample(t)[0].records) { out[r.id] = r; }
  return out;
}
