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
    expect(fragment).toContain('id="mkd-submit" disabled>Send to Agent</button>');
    expect(fragment).toContain('window.__MKD_MODE__ = "artifact";');
    expect(fragment).toContain('window.__MKD_RESULT_DOC__ = "results/render-contract";');
  });

  it('keeps Copy JSON as a secondary fallback button', () => {
    expect(fragment).toContain('<button type="button" class="mkd-bar__btn" id="mkd-copy">Copy JSON</button>');
  });
});

describe('app.js: wake hint after Send', () => {
  const hint = 'If Claude does not answer within a minute, type "listo" in the chat: your answers are saved.';

  it('ships the hint, gated on artifact mode and a notified Send', () => {
    expect(APP_JS).toContain(hint);
    expect(APP_JS).toContain('if (mode === \'artifact\' && wakeHint)');
  });

  it('keeps the hint out of the copy and wait pages markup', () => {
    expect(markupOnly(render(spec, { mode: 'copy' }))).not.toContain('listo');
    expect(markupOnly(render(spec, { mode: 'wait', submitToken: 't' }))).not.toContain('listo');
  });
});

describe('display options', () => {
  const page = render(spec, { mode: 'copy' });

  it('renders Hide recommended as a switch, Shuffle as a button, Original order hidden', () => {
    expect(page).toContain('<input type="checkbox" class="mkd-switch__input" id="mkd-hide-rec" role="switch">');
    expect(page).toMatch(/<button type="button" class="mkd-view__btn" id="mkd-shuffle"[^>]*>[\s\S]*?Shuffle options<\/button>/);
    expect(page).toMatch(/id="mkd-unshuffle"[^>]*aria-label="Original order" hidden>[\s\S]*?Original order<\/span><\/button>/);
    expect(page).not.toMatch(/id="mkd-shuffle" role="switch"/);
  });

  it('rerolls on every press, labels by screen position, restores the author order on demand', () => {
    expect(APP_JS).toContain('shuffleBtn.addEventListener(\'click\', reshuffle)');
    expect(APP_JS).toContain('unshuffleBtn.addEventListener(\'click\', restoreAuthorOrder)');
    expect(APP_JS).toContain('letter.textContent = on ? positionLetter(position) : key');
    expect(APP_JS).toContain('(previous && same(out, previous))');
  });

  it('marks the bolded Recommended lead-in of the recommended option only', () => {
    expect(page).toContain('<strong class="mkd-rec-word">Recommended</strong> because it is cheap.');
    expect(page).toContain('<span class="mkd-opt__just">Costs more.</span>');
  });

  it('keeps Previous / Skip / Next in the sticky bar only, never inside a card', () => {
    expect(page).toContain('<nav class="mkd-bar__nav" aria-label="Deck navigation">');
    expect(page).toContain('id="mkd-next">Next &#8594;</button>');
    expect(page).not.toContain('mkd-card__nav');
    expect(page).toContain('id="mkd-auto-advance" role="switch">');
  });

  it('switches a decision with 4+ options to the compact layout', () => {
    const wide = validateSpec({ ...RAW_SPEC, items: [{ ...RAW_SPEC.items[0], options: ['A', 'B', 'C', 'D', 'E'].map(key => ({ key, label: key, justification: key })) }] });
    expect(render(wide, { mode: 'copy' })).toContain('<div class="mkd-opts is-dense">');
    expect(page).toContain('<div class="mkd-opts">');
  });

  it('omits the display options on a deck without decisions', () => {
    const noDecisions = validateSpec({ ...RAW_SPEC, items: RAW_SPEC.items.slice(1) });
    expect(render(noDecisions, { mode: 'copy' })).not.toContain('class="mkd-view"');
  });
});

describe('render: copy and wait modes are unchanged', () => {
  // SHA-256 of each page with the inlined app.js body replaced by a
  // placeholder. Every other byte - markup, CSS, embedded spec, globals -
  // must match. Re-pinned for the W1 UI redesign: navy/pastel theme tokens,
  // progress footer (replaces the five counters), send-confirmation dialog,
  // the Hide recommended and Auto-advance switches, the Shuffle / Original
  // order buttons, SVG header icons, the sticky action bar (Previous / Skip /
  // Next moved out of the cards, More overflow on phones), compact 4+ option
  // decisions, viewport-fit=cover, the media lightbox dialog and media CSS
  // (carousel, embeds, link cards, diagrams, option thumbnails), and the
  // artifact-only video-card / missing-image styles (shared CSS; the copy and
  // wait markup itself is unchanged),
  // the color-mix guard on the translucent header, and the default submit
  // label renamed from Send to Claude to Send to Agent (harness-neutral).
  // Update these only for an intentional change to the copy/wait markup.
  const shellHash = (html: string): string =>
    createHash('sha256').update(html.replace(APP_JS, () => '<app.js>')).digest('hex');

  it('copy mode', () => {
    expect(shellHash(render(spec, { mode: 'copy' })))
      .toBe('5c6e2fc41948ea44001a570197e5eae2b4c868efd7db1b513da838efb81cfa13');
  });

  it('wait mode', () => {
    expect(shellHash(render(spec, { mode: 'wait', submitToken: 'tok-123' })))
      .toBe('de189e6d24cbeb0930032e66628305c619aad1405cab3c322351258c3dd0e7a4');
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
