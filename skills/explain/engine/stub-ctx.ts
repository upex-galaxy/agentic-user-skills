// Canvas 2D stub for pure-logic tests: records every call and property write, measures text as
// length * px * charW (so layout tests do not need a browser or real fonts).
/* eslint-disable ts/no-explicit-any */
export interface StubCtx {
  ctx: any
  log: unknown[][]
  canvas: { width: number, height: number, getContext: () => any }
}

export function makeStubCtx(charW = 0.5): StubCtx {
  const log: unknown[][] = [];
  const state: Record<string, unknown> = { font: '400 10px x', globalAlpha: 1 };
  const canvas: any = { width: 0, height: 0 };
  const ctx: any = new Proxy({}, {
    get(_, key) {
      const k = String(key);
      if (k === 'canvas') { return canvas; }
      if (k === 'getImageData') { return undefined; }
      if (k === 'measureText') {
        return (s: string) => {
          const px = Number(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? 10);
          return { width: s.length * px * charW };
        };
      }
      if (k in state) { return state[k]; }
      return (...args: unknown[]) => {
        log.push([k, ...args]);
        return ctx;
      };
    },
    set(_, key, value) {
      state[String(key)] = value;
      log.push(['set', String(key), value]);
      return true;
    },
  });
  canvas.getContext = () => ctx;
  return { ctx, log, canvas };
}

/** Stub of the Rough.js canvas API: records the shapes it is asked to draw. */
export function installRoughStub(log: unknown[][]) {
  const rec = (name: string) => (...args: unknown[]) => {
    log.push([`rough.${name}`, ...args]);
  };
  (globalThis as any).rough = { canvas: () => ({ rectangle: rec('rectangle'), ellipse: rec('ellipse'), linearPath: rec('linearPath'), line: rec('line') }) };
}
