import { describe, expect, test } from 'bun:test';
import { resolveSound } from './audio.js';
import { contrast, definePreset, parseColor } from './preset.js';
import { hologram } from './test-presets.ts';

const minimal = () => ({
  name: 'mini',
  palette: { bg: '#ffffff', ink: '#111111', dim: '#666666', accent: '#0055cc', accent2: '#aa0066', good: '#117733', warn: '#aa7700', bad: '#bb2222', panel: '#ffffff' },
  faces: [],
  background() {},
  shape() {},
  line() {},
  poly() {},
  text() {},
  highlight() {},
});

describe('definePreset', () => {
  test('lists every missing member in one error', () => {
    expect(() => definePreset(() => ({ name: 'x', palette: { bg: '#000' }, faces: [] }))).toThrow(/palette\.ink.*palette\.panel.*background\(\).*highlight\(\)/);
  });

  test('fills defaults, color(), font() and fallbacks; is idempotent', () => {
    const p = definePreset(minimal);
    expect(p.color('accent')).toBe('#0055cc');
    expect(p.color('onPanel')).toBe('#111111');
    expect(p.color('#123456')).toBe('#123456');
    expect(p.font('mono', 20)).toBe('500 20px monospace');
    expect(p.defaults.radius).toBe(18);
    expect(p.export.bitrate).toBe(2e6);
    expect(typeof p.dot).toBe('function');
    expect(typeof p.fill).toBe('function');
    expect(definePreset(p)).toBe(p);
  });

  test('warns on low contrast and parses colors', () => {
    const p = definePreset(() => ({ ...minimal(), palette: { ...minimal().palette, ink: '#eeeeee' } }));
    expect(p.warnings.join(' ')).toContain('ink on bg');
    expect(parseColor('rgba(10,20,38,0.86)')).toEqual([10, 20, 38, 0.86]);
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  test('a built-in preset resolves once and keeps its sweep hook', () => {
    expect(definePreset(hologram)).toBe(hologram);
    expect(typeof hologram.transitions.sweep).toBe('function');
    expect(hologram.name).toBe('hologram');
  });
  test('a legacy object with a top-level sweep doubles it as the transition hook', () => {
    const sweep = () => {};
    const p = definePreset({ ...minimal(), sweep });
    expect(typeof p.transitions.sweep).toBe('function');
  });
});

describe('definePreset sound block', () => {
  test('a preset without sound resolves to the engine defaults', () => {
    const p = definePreset(minimal);
    expect(p.sound).toBeUndefined();
    expect(resolveSound(p.sound)).toEqual(resolveSound());
  });

  test('a valid sound block stays raw on the style', () => {
    const sound = { gain: 0.8, voices: { pop: { f0: 600 } }, space: { wet: 0.1 } };
    const p = definePreset(() => ({ ...minimal(), sound }));
    expect(p.sound).toEqual(sound);
    expect(resolveSound(p.sound).voices.pop.f0).toBe(600);
  });

  test('unknown kinds and params fail in the single error', () => {
    const bad = () => definePreset(() => ({ ...minimal(), sound: { voices: { boing: { f0: 300 }, pop: { wobble: 1 } } } }));
    expect(bad).toThrow(/sound\.voices\.boing.*sound\.voices\.pop\.wobble/);
    expect(() => definePreset(() => ({ name: 'x', faces: [], sound: { voices: { boing: {} } } }))).toThrow(/palette.*sound\.voices\.boing/);
  });
});
