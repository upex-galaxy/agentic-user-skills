/**
 * A wall-clock or drift limit for a test: `local` as written, `local * factor` when `CI` is set, because shared
 * runners stall for reasons the code does not control (a cold Chrome, slow frames, a noisy neighbour).
 */
export const ciLimit = (local: number, factor: number): number => (process.env.CI ? local * factor : local);
