import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';
import { findChrome } from './chrome.ts';
import { exportVideo, stills } from './export.ts';

const temps: string[] = [];
/** A temp dir removed after the file's tests. */
function temp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}
afterAll(() => { for (const d of temps) { rmSync(d, { recursive: true, force: true }); } });

const engine = join(import.meta.dir, '../engine/export.js');

/** Self-contained page: Mediabunny + engine/export.js bundled and inlined as one module script. */
async function buildTestPage(duration: number): Promise<string> {
  const dir = temp('explain-entry-');
  mkdirSync(dir, { recursive: true });
  const entry = join(dir, 'entry.js');
  writeFileSync(entry, `import { runExport } from ${JSON.stringify(engine)};\nwindow.runExport = runExport;\n`);
  const built = await Bun.build({ entrypoints: [entry], target: 'browser', format: 'esm' });
  if (!built.success) { throw new Error(`bundle failed: ${built.logs.join('\n')}`); }
  const code = (await built.outputs[0].text()).replaceAll('</script', '<\\/script');
  return `<!doctype html><html><body style="margin:0"><canvas id="c" width="1920" height="1080"></canvas>
<script type="module">
${code}
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
function render(t) {
  ctx.fillStyle = '#1b2333'; ctx.fillRect(0, 0, 1920, 1080);
  ctx.fillStyle = '#ffb454'; ctx.fillRect(100 + (t / ${duration}) * 1500, 400, 200, 200);
}
render(0);
window.runExport({ canvas, render, duration: ${duration}, fps: 30 });
</script></body></html>`;
}

const chrome = findChrome();
const maybe = chrome ? test : test.skip;

describe('headless export', () => {
  maybe('exports a 3 s H.264 MP4', async () => {
    const out = join(temp('explain-'), 'test.mp4');
    const res = await exportVideo({ html: await buildTestPage(3), out, duration: 3, fps: 30, timeoutMs: 120_000 });
    expect(statSync(out).size).toBeGreaterThan(1000);
    expect(res.bytes).toBe(statSync(out).size);
    expect(await Bun.file(out).slice(0, 12).text()).toContain('ftyp');
  }, 150_000);

  maybe('writes PNG stills', async () => {
    const outDir = temp('explain-');
    const res = await stills({ html: await buildTestPage(3), outDir, times: [0, 1.5], timeoutMs: 60_000 });
    expect(res.files.length).toBe(2);
  }, 90_000);

  if (!chrome) { test.skip('needs a Chrome/Chromium binary (set EXPLAIN_CHROME)', () => {}); }
});
