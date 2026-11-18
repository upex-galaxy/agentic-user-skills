/* eslint-disable ts/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import fixture from '../examples/qa/opening-marks.scene.js';
import { createEngine, kit } from './index.js';
import { runQA } from './qa.js';
import { installRoughStub, makeStubCtx } from './stub-ctx.ts';
import { hologram, sketch } from './test-presets.ts';

describe('opening-marks fixture', () => {
  for (const preset of [hologram, sketch]) {
    test(`every piece that shows text is flagged (${preset.name})`, () => {
      const stub = makeStubCtx(0.45);
      installRoughStub(stub.log);
      const spec = (fixture)(kit);
      const engine = createEngine({ canvas: stub.canvas, style: preset, spec });
      const flagged = new Set<string>(runQA(engine, [0.5], { determinism: false }).errors.filter((e: any) => e.type === 'opening-punctuation').map((e: any) => e.id));
      const ids = engine.texts().filter((x: any) => x.text.includes('¿')).map((x: any) => x.id);
      const expected = new Set<string>(ids.filter((id: string) => id.startsWith('q-')));
      const pieces = ['q-title', 'q-heading', 'q-caption', 'q-tag', 'q-footer', 'q-node', 'q-label', 'q-flow', 'q-table', 'q-timeline', 'q-mind', 'q-tree', 'q-code', 'q-icon', 'q-counter', 'q-progress', 'q-gauge', 'q-chart', 'q-editor', 'q-terminal', 'q-diff', 'q-web', 'q-pr', 'q-app', 'q-kinetic', 'q-stamp', 'q-bubble', 'q-chip', 'q-callout', 'q-rail', 'q-pipe', 'q-layers', 'q-fleet', 'q-git', 'q-machine', 'q-split'];
      const hit = (id: string) => [...flagged].some(f => f === id || f.startsWith(`${id}-`) || f.startsWith(`${id}.`));
      const missing = pieces.filter(id => !hit(id));
      expect(missing.join(' ')).toBe('');
      expect([...expected].every(id => flagged.has(id))).toBe(true);
    });
  }
});
