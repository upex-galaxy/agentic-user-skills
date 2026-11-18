import hologramFactory from '../presets/hologram/preset.js';
import sketchFactory from '../presets/sketch/preset.js';
// Resolved built-in presets for unit tests (the scene builder and pieces take a resolved preset).
import { definePreset } from './preset.js';

/* eslint-disable ts/no-explicit-any, ts/no-unsafe-assignment, ts/no-unsafe-call */
export const hologram: any = definePreset(hologramFactory);
export const sketch: any = definePreset(sketchFactory);
