import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { artifactDocId, render } from './render.ts';
import { validateSpec } from './schema.ts';
import APP_JS from './ui/app.js' with { type: 'text' };

/** One item of every type, plus characters that must be escaped. */
const RAW_SPEC = {
  session: 'render-contract',
  source: '.session/x/plan.md',
  title: 'Render <contract> & "golden"',
  intro: { headline: 'Four items', body: 'Body with **bold**', stats: [{ n: '4', label: 'items' }] },
  items: [
    { id: 'D1', type: 'decision', title: 'Pick one', severity: 'high', scope: 'core', problem: 'Plain `problem`.', context: [{ title: 'How it works', body: 'Like *this*.' }], options: [{ key: 'A', label: 'Alpha', justification: '**Recommended** because it is cheap.', recommended: true }, { key: 'B', label: 'Beta', justification: 'Costs more.' }] },
    { id: 'Q1', type: 'question', title: 'Keep it?', content: 'Some content', controls: { type: 'single', required: true, options: [{ value: 'keep', label: 'Keep' }, { value: 'drop', label: 'Drop' }] } },
    { id: 'R1', type: 'report', title: 'Section', content: '# Heading\n\n- a\n- b' },
    { id: 'T1', type: 'table', title: 'Rows', content: 'Intro', table: { columns: ['Test', 'Rate'], rows: [{ id: 'r1', cells: ['a', '1'] }, { id: 'r2', cells: ['b', '2'] }], rowControls: { type: 'single', options: [{ value: 'fix', label: 'Fix' }] } } },
  ],
};
const spec = validateSpec(RAW_SPEC);

/** The page minus inline <script>/<style> bodies: only the markup a wrapper sees. */
function markupOnly(html: string): string {
  return html
    .replace(/<script>[\s\S]*?<\/script>/g, '<script></script>')
    .replace(/<style>[\s\S]*?<\/style>/g, '<style></style>');
}

describe('render: artifact mode', () => {
  const fragment = render(spec, { mode: 'artifact', titlePrefix: 'my-session' });

  it('is a fragment that opens with the title (the Artifact tool adds the skeleton)', () => {
    expect(fragment.startsWith('<title>')).toBe(true);
    expect(markupOnly(fragment)).not.toMatch(/<(?:!doctype|html|head|body|meta)[\s>]/i);
  });

  it('prefixes the escaped title with the session name', () => {
    expect(fragment).toContain('<title>my-session · Render &lt;contract&gt; &amp; &quot;golden&quot;</title>');
  });

  it('falls back to the plain spec title without a prefix', () => {
    const plain = render(spec, { mode: 'artifact' });
    expect(plain.startsWith('<title>Render &lt;contract&gt; &amp; &quot;golden&quot;</title>')).toBe(true);
  });

  it('carries the Send button, the artifact mode and the result doc', () => {
    expect(fragment).toContain('<main id="mkd-app" data-mode="artifact">');
    expect(fragment).toContain('id="mkd-submit" disabled>Send to Claude</button>');
    expect(fragment).toContain('window.__MKD_MODE__ = "artifact";');
    expect(fragment).toContain('window.__MKD_RESULT_DOC__ = "results/render-contract";');
  });

  it('keeps Copy JSON as a secondary fallback button', () => {
    expect(fragment).toContain('<button type="button" class="mkd-bar__btn" id="mkd-copy">Copy JSON</button>');
  });
});

describe('render: copy and wait modes are unchanged', () => {
  // SHA-256 of each page with the inlined app.js body replaced by a
  // placeholder, captured from `main` at 97d4e80 (before artifact mode).
  // Every other byte - markup, CSS, embedded spec, globals - must match.
  // Update these only for an intentional change to the copy/wait markup.
  const shellHash = (html: string): string =>
    createHash('sha256').update(html.replace(APP_JS, () => '<app.js>')).digest('hex');

  it('copy mode', () => {
    expect(shellHash(render(spec, { mode: 'copy' })))
      .toBe('48141817f1d55d759f7edd35b29b3a1488a76866f330b79b1ccae678ff87518d');
  });

  it('wait mode', () => {
    expect(shellHash(render(spec, { mode: 'wait', submitToken: 'tok-123' })))
      .toBe('66720e27045d77dad4e0bb5a9af4d7e4aedfa6059154a7bc31cc4208f05bc9af');
  });

  it('never leaks the artifact globals into copy or wait pages', () => {
    expect(render(spec, { mode: 'copy' })).not.toContain('window.__MKD_RESULT_DOC__ = "');
    expect(render(spec, { mode: 'wait', submitToken: 't' })).not.toContain('window.__MKD_RESULT_DOC__ = "');
  });
});

describe('artifactDocId', () => {
  it('passes a slug session through unchanged', () => {
    expect(artifactDocId('audit-skills_v2.1')).toBe('audit-skills_v2.1');
  });

  it('replaces characters a db path segment rejects', () => {
    expect(artifactDocId('PBI 12/sprint #3')).toBe('PBI-12-sprint--3');
  });

  it('never yields a bare dot segment and caps the length', () => {
    expect(artifactDocId('.')).toBe('deck.');
    expect(artifactDocId('x'.repeat(300))).toHaveLength(200);
  });
});

describe('cli: --artifact', () => {
  const cli = join(import.meta.dir, 'index.ts');

  /** Run the CLI with HOME pointed at a temp dir, so `~/.mkd/` lands there. */
  function runCli(args: string[]): { code: number, stdout: string, stderr: string, home: string } {
    const home = mkdtempSync(join(tmpdir(), 'mkd-test-'));
    const specPath = join(home, 'spec-demo.json');
    writeFileSync(specPath, JSON.stringify(RAW_SPEC));
    const env = { ...process.env, HOME: home, ORCA_TERMINAL_HANDLE: '' };
    const proc = Bun.spawnSync(['bun', cli, specPath, ...args], { env, stdout: 'pipe', stderr: 'pipe' });
    return {
      code: proc.exitCode,
      stdout: proc.stdout.toString(),
      stderr: proc.stderr.toString(),
      home,
    };
  }

  it('writes ~/.mkd/artifact-<name>.html, prints only its path on stdout, exits 0', () => {
    const run = runCli(['--artifact', '--title-prefix', 'my-session']);
    try {
      const expected = join(run.home, '.mkd', 'artifact-demo.html');
      expect(run.code).toBe(0);
      expect(run.stdout).toBe(`${expected}\n`);
      expect(readFileSync(expected, 'utf8').startsWith('<title>my-session · ')).toBe(true);
      expect(run.stderr).toContain('doc_id "render-contract"');
    }
    finally {
      rmSync(run.home, { recursive: true, force: true });
    }
  });

  it('rejects --artifact with --wait or --copy (exit 2)', () => {
    for (const flag of ['--wait', '--copy']) {
      const run = runCli(['--artifact', flag]);
      rmSync(run.home, { recursive: true, force: true });
      expect(run.code).toBe(2);
      expect(run.stdout).toBe('');
    }
  });

  it('rejects --title-prefix without --artifact (exit 2)', () => {
    const run = runCli(['--copy', '--no-open', '--title-prefix', 'x']);
    rmSync(run.home, { recursive: true, force: true });
    expect(run.code).toBe(2);
  });

  it('keeps exit 2 for a bad spec', () => {
    const home = mkdtempSync(join(tmpdir(), 'mkd-test-'));
    const specPath = join(home, 'spec-bad.json');
    writeFileSync(specPath, JSON.stringify({ session: 's', title: 't', items: [] }));
    const proc = Bun.spawnSync(['bun', cli, specPath, '--artifact'], { env: { ...process.env, HOME: home }, stdout: 'pipe', stderr: 'pipe' });
    rmSync(home, { recursive: true, force: true });
    expect(proc.exitCode).toBe(2);
    expect(proc.stdout.toString()).toBe('');
  });
});
