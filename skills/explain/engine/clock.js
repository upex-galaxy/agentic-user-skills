// Virtual clock shim. Installed before any scene code so authors cannot break determinism by accident:
// Date.now / new Date() / performance.now follow the frame time, Math.random is reseeded per frame,
// and requestAnimationFrame callbacks only run when the engine seeks a frame.
import { rng } from './math.js';

const BASE_EPOCH_MS = 1_700_000_000_000;

/**
 * Install the shim on `target` (defaults to globalThis). Returns the clock handle:
 * `seek(ms)` sets virtual time, reseeds Math.random, flushes the rAF queue.
 * `real` keeps the original functions (the preview loop must use them).
 */
export function installClock(target = globalThis) {
  if (target.__explainClock) { return target.__explainClock; }
  const RealDate = target.Date;
  const perf = target.performance;
  const real = {
    Date: RealDate,
    random: target.Math.random,
    now: perf ? perf.now.bind(perf) : () => RealDate.now(),
    raf: target.requestAnimationFrame ? target.requestAnimationFrame.bind(target) : undefined,
    caf: target.cancelAnimationFrame ? target.cancelAnimationFrame.bind(target) : undefined,
  };
  let virtualMs = 0;
  let rand = rng(1);
  let queue = [];
  let nextId = 0;

  class VirtualDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) { super(BASE_EPOCH_MS + virtualMs); }
      else { super(...args); }
    }

    static now() {
      return BASE_EPOCH_MS + virtualMs;
    }
  }

  const clock = {
    real,
    now: () => virtualMs,
    seek(ms) {
      virtualMs = ms;
      rand = rng(Math.round(ms * 1000) + 1);
      const due = queue;
      queue = [];
      for (const [, cb] of due) { cb(virtualMs); }
    },
    uninstall() {
      target.Date = RealDate;
      target.Math.random = real.random;
      if (perf) { perf.now = real.now; }
      if (real.raf) { target.requestAnimationFrame = real.raf; }
      if (real.caf) { target.cancelAnimationFrame = real.caf; }
      delete target.__explainClock;
    },
  };

  target.Date = VirtualDate;
  target.Math.random = () => rand();
  if (perf) { perf.now = () => virtualMs; }
  target.requestAnimationFrame = (cb) => {
    queue.push([++nextId, cb]);
    return nextId;
  };
  target.cancelAnimationFrame = (id) => {
    queue = queue.filter(([i]) => i !== id);
  };
  target.__explainClock = clock;
  return clock;
}
