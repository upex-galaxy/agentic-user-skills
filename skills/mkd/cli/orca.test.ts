import type { Runner, RunOutput } from './orca.ts';
import { describe, expect, it } from 'bun:test';
import {
  closeOrcaTab,
  derivePort,
  detectOrca,
  openOrcaTab,
  PORT_BASE,
  PORT_SPAN,
  resolveMode,
  resolveOrcaCommand,
  worktreeSelector,
} from './orca.ts';

/**
 * A scripted runner: each call is matched against `script` by the joined
 * command line; every call is recorded so a test can assert what was spawned.
 */
function fakeRunner(script: Array<[RegExp, RunOutput]>): Runner & { calls: string[][] } {
  const calls: string[][] = [];
  const run: Runner = async (cmd) => {
    calls.push(cmd);
    const line = cmd.join(' ');
    const hit = script.find(([pattern]) => pattern.test(line));
    return hit ? hit[1] : { code: null, stdout: '' };
  };
  return Object.assign(run, { calls });
}

const json = (value: unknown): string => JSON.stringify(value);
const noSleep = async (): Promise<void> => {};

describe('resolveOrcaCommand', () => {
  it('prefers ORCA_CLI_COMMAND, split on whitespace', () => {
    expect(resolveOrcaCommand({ ORCA_CLI_COMMAND: 'wsl.exe orca' }, 'linux')).toEqual(['wsl.exe', 'orca']);
  });

  it('uses orca-dev in an Orca dev checkout', () => {
    expect(resolveOrcaCommand({ ORCA_DEV_REPO_ROOT: '/src/orca' }, 'darwin')).toEqual(['orca-dev']);
  });

  it('never runs bare orca on Linux outside a managed terminal (GNOME screen reader)', () => {
    expect(resolveOrcaCommand({}, 'linux')).toEqual(['orca-ide']);
  });

  it('uses orca inside a managed Linux terminal and on macOS', () => {
    expect(resolveOrcaCommand({ ORCA_TERMINAL_HANDLE: 'term_1' }, 'linux')).toEqual(['orca']);
    expect(resolveOrcaCommand({}, 'darwin')).toEqual(['orca']);
  });
});

describe('detectOrca', () => {
  it('detects from ORCA_TERMINAL_HANDLE without spawning anything', async () => {
    const run = fakeRunner([]);
    const result = await detectOrca({ ORCA_TERMINAL_HANDLE: 'term_1' }, 'darwin', run);
    expect(result).toEqual({ detected: true, via: 'terminal-env', cmd: ['orca'] });
    expect(run.calls).toHaveLength(0);
  });

  it('detects a reachable runtime from orca status --json', async () => {
    const run = fakeRunner([[/status --json/, { code: 0, stdout: json({ ok: true, result: { runtime: { reachable: true } } }) }]]);
    const result = await detectOrca({}, 'darwin', run);
    expect(result.detected).toBe(true);
    expect(result.via).toBe('status');
    expect(run.calls[0]).toEqual(['orca', 'status', '--json']);
  });

  it('is not detected when the runtime is unreachable', async () => {
    const run = fakeRunner([[/status/, { code: 0, stdout: json({ result: { runtime: { reachable: false } } }) }]]);
    expect((await detectOrca({}, 'darwin', run)).detected).toBe(false);
  });

  it('is silently not detected when the binary is missing, fails, or prints garbage', async () => {
    expect((await detectOrca({}, 'darwin', fakeRunner([]))).detected).toBe(false);
    expect((await detectOrca({}, 'darwin', fakeRunner([[/status/, { code: 1, stdout: '' }]]))).detected).toBe(false);
    expect((await detectOrca({}, 'darwin', fakeRunner([[/status/, { code: 0, stdout: 'not json' }]]))).detected).toBe(false);
  });

  it('probes orca-ide, not orca, on Linux outside a managed terminal', async () => {
    const run = fakeRunner([]);
    await detectOrca({}, 'linux', run);
    expect(run.calls[0][0]).toBe('orca-ide');
  });
});

describe('worktreeSelector', () => {
  it('binds to the git toplevel of the cwd', async () => {
    const run = fakeRunner([[/rev-parse --show-toplevel/, { code: 0, stdout: '/repo/wt\n' }]]);
    expect(await worktreeSelector('/repo/wt/skills/mkd', run)).toBe('path:/repo/wt');
    expect(run.calls[0]).toEqual(['git', '-C', '/repo/wt/skills/mkd', 'rev-parse', '--show-toplevel']);
  });

  it('falls back to the cwd outside a git repo', async () => {
    const run = fakeRunner([[/rev-parse/, { code: 128, stdout: '' }]]);
    expect(await worktreeSelector('/some/folder', run)).toBe('path:/some/folder');
  });
});

describe('derivePort', () => {
  it('is stable for the same deck', () => {
    expect(derivePort('audit')).toBe(derivePort('audit'));
  });

  it('stays inside the documented range', () => {
    for (const key of ['a', 'audit', 'pbi-jira-cache', 'x'.repeat(500), '']) {
      const port = derivePort(key);
      expect(port).toBeGreaterThanOrEqual(PORT_BASE);
      expect(port).toBeLessThan(PORT_BASE + PORT_SPAN);
    }
  });

  it('spreads different decks over different ports', () => {
    const ports = new Set(['alpha', 'beta', 'gamma', 'delta', 'epsilon'].map(derivePort));
    expect(ports.size).toBeGreaterThan(1);
  });
});

describe('resolveMode', () => {
  const none = { wait: false, copy: false, noOpen: false };

  it('keeps the old default outside Orca: copy mode, system browser', () => {
    expect(resolveMode(none, false)).toEqual({ mode: 'copy', opener: 'system' });
  });

  it('defaults to wait mode in an Orca tab inside Orca', () => {
    expect(resolveMode(none, true)).toEqual({ mode: 'wait', opener: 'orca' });
  });

  it('--copy forces the copy-paste flow inside Orca', () => {
    expect(resolveMode({ ...none, copy: true }, true)).toEqual({ mode: 'copy', opener: 'system' });
  });

  it('--wait outside Orca serves and opens the system browser', () => {
    expect(resolveMode({ ...none, wait: true }, false)).toEqual({ mode: 'wait', opener: 'system' });
  });

  it('--no-open opens nothing in any mode', () => {
    expect(resolveMode({ ...none, noOpen: true }, true)).toEqual({ mode: 'wait', opener: 'none' });
    expect(resolveMode({ ...none, noOpen: true }, false)).toEqual({ mode: 'copy', opener: 'none' });
  });
});

describe('openOrcaTab', () => {
  const base = { cmd: ['orca'], url: 'http://localhost:4801/', selector: 'path:/repo', sleep: noSleep };
  const created = { code: 0, stdout: json({ ok: true, result: { browserPageId: 'page-1' } }) };
  const listed = (loadError: unknown): RunOutput => ({
    code: 0,
    stdout: json({ ok: true, result: { tabs: [{ browserPageId: 'page-1', url: base.url, loadError }] } }),
  });
  const closed = { code: 0, stdout: json({ ok: true, result: { closed: true } }) };

  it('creates a worktree-bound tab and confirms it loaded', async () => {
    const run = fakeRunner([[/tab create/, created], [/tab list/, listed(null)]]);
    expect(await openOrcaTab({ ...base, run })).toEqual({ ok: true, pageId: 'page-1' });
    expect(run.calls[0]).toEqual(['orca', 'tab', 'create', '--url', base.url, '--worktree', 'path:/repo', '--json']);
    expect(run.calls.some(cmd => cmd.includes('close'))).toBe(false);
  });

  it('fails without closing anything when tab create fails (selector not found)', async () => {
    const run = fakeRunner([[/tab create/, { code: 1, stdout: json({ ok: false, error: { code: 'selector_not_found' } }) }]]);
    const result = await openOrcaTab({ ...base, run });
    expect(result).toEqual({ ok: false, reason: 'tab create failed (selector_not_found)' });
    expect(run.calls).toHaveLength(1);
  });

  it('closes the tab it created when the page reports a load error', async () => {
    const run = fakeRunner([
      [/tab create/, created],
      [/tab list/, listed({ code: -102, description: 'ERR_CONNECTION_REFUSED' })],
      [/tab close/, closed],
    ]);
    const result = await openOrcaTab({ ...base, run });
    expect(result).toEqual({ ok: false, reason: 'tab load error (ERR_CONNECTION_REFUSED)' });
    expect(run.calls.at(-1)).toEqual(['orca', 'tab', 'close', '--page', 'page-1', '--worktree', 'path:/repo', '--json']);
  });

  it('closes the tab when it never shows up in tab list', async () => {
    const run = fakeRunner([
      [/tab create/, created],
      [/tab list/, { code: 0, stdout: json({ ok: true, result: { tabs: [] } }) }],
      [/tab close/, closed],
    ]);
    const result = await openOrcaTab({ ...base, run, polls: 3 });
    expect(result).toEqual({ ok: false, reason: 'tab not listed' });
    expect(run.calls.filter(cmd => cmd.includes('list'))).toHaveLength(3);
    expect(run.calls.at(-1)?.includes('close')).toBe(true);
  });

  it('treats a missing binary as a failure, never a throw', async () => {
    const result = await openOrcaTab({ ...base, run: fakeRunner([]) });
    expect(result.ok).toBe(false);
  });
});

describe('closeOrcaTab', () => {
  it('reports true only when Orca confirms the close', async () => {
    const opts = { cmd: ['orca'], pageId: 'page-1', selector: 'path:/repo' };
    expect(await closeOrcaTab({ ...opts, run: fakeRunner([[/tab close/, { code: 0, stdout: json({ result: { closed: true } }) }]]) })).toBe(true);
    expect(await closeOrcaTab({ ...opts, run: fakeRunner([[/tab close/, { code: 1, stdout: '' }]]) })).toBe(false);
  });
});
