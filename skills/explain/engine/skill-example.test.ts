/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import example from '../examples/skill.scene.js';
import { allPieces } from './index.js';
import { qaOfDemo } from './pieces/harness-b.ts';
import { installRoughStub } from './stub-ctx.ts';
import { hologram, sketch } from './test-presets.ts';

describe('examples/skill.scene.js (explain a skill)', () => {
  for (const [name, style] of [['hologram', hologram], ['sketch', sketch]] as const) {
    test(`builds from the layout recipes and passes the QA gate (${name})`, () => {
      installRoughStub([]);
      const qa = qaOfDemo(example, allPieces, style);
      expect(qa.errors.map((e: any) => `${e.type} ${e.scene} ${e.id}`)).toEqual([]);
    });
  }
});
