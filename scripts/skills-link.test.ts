import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

const SCRIPT = join(import.meta.dir, 'skills-link.ts');

let tmp: string;
let home: string;
let repo: string;

/** The whole environment of every child process: nothing of the real HOME is inherited. */
function env(): Record<string, string> {
  if (!home.startsWith(realpathSync(tmpdir()))) {
    throw new Error(`test HOME is outside the temp directory: ${home}`);
  }
  return {
    PATH: process.env.PATH!,
    HOME: home,
    // Bun would otherwise write its cache into the test HOME.
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.invalid',
  };
}

function git(cwd: string, ...args: string[]) {
  const r = spawnSync('git', ['-C', cwd, ...args], { env: env(), encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  }
  return r.stdout.trim();
}

function run(args: string[], root = repo) {
  const r = spawnSync(process.execPath, [join(root, 'scripts', 'skills-link.ts'), ...args], { env: env(), encoding: 'utf8', cwd: tmp });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function write(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

const read = (path: string) => readFileSync(path, 'utf8');
const readJson = (path: string) => JSON.parse(read(path)) as { skills: Record<string, unknown> };
const inHome = (...p: string[]) => join(home, ...p);
const agents = (name: string) => inHome('.agents', 'skills', name);
const claude = (name: string) => inHome('.claude', 'skills', name);
const source = (name: string) => join(repo, 'skills', name);
const lockPath = () => inHome('.agents', '.skill-lock.json');
const isLink = (path: string) => lstatSync(path).isSymbolicLink();
const isRealDir = (path: string) => lstatSync(path).isDirectory();

function backups(): string[] {
  const dir = inHome('.agents', '.skill-backups');
  return existsSync(dir) ? readdirSync(dir).sort().map(n => join(dir, n)) : [];
}

/** Every path under HOME with its content or link target, to prove nothing changed. */
function tree(dir = home, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      out.push(`${path} -> ${readlinkSync(path)}`);
    }
    else if (entry.isDirectory()) {
      out.push(`${path}/`);
      tree(path, out);
    }
    else {
      out.push(`${path}: ${read(path)}`);
    }
  }
  return out;
}

function expectLinked(name: string) {
  expect(readlinkSync(agents(name))).toBe(source(name));
  expect(readlinkSync(claude(name))).toBe(`../../.agents/skills/${name}`);
  expect(realpathSync(claude(name))).toBe(source(name));
}

function writeLock(skills: string[]) {
  const lock = {
    version: 3,
    skills: Object.fromEntries(skills.map(n => [n, { source: `owner/${n}`, sourceType: 'github' }])),
    dismissed: { findSkillsPrompt: true },
    lastSelectedAgents: ['claude-code'],
    somethingNew: [1, 2],
  };
  write(lockPath(), JSON.stringify(lock, null, 2));
}

/** A real copy as `skills add` leaves it, equal to the repo. */
function install(name: string, dir: string) {
  for (const file of ['SKILL.md', 'references/guide.md']) {
    write(join(dir, file), read(join(source(name), file)));
  }
}

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'skills-link-')));
  home = join(tmp, 'home');
  repo = join(tmp, 'repo');
  mkdirSync(home);
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  copyFileSync(SCRIPT, join(repo, 'scripts', 'skills-link.ts'));
  for (const name of ['alpha', 'beta']) {
    write(join(source(name), 'SKILL.md'), `---\nname: ${name}\n---\n`);
    write(join(source(name), 'references', 'guide.md'), `guide of ${name}\n`);
  }
  write(join(repo, 'skills', 'no-skill-file', 'notes.md'), 'not a skill\n');
  write(join(repo, '.gitignore'), '.playwright-cli/\n.DS_Store\n');
  git(repo, 'init', '--quiet', '--initial-branch=main');
  git(repo, 'add', '-A');
  git(repo, 'commit', '--quiet', '-m', 'init');
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('link', () => {
  test('creates one link per skill on an empty HOME', () => {
    const r = run(['link']);
    expect(r.code).toBe(0);
    expectLinked('alpha');
    expectLinked('beta');
    expect(isRealDir(inHome('.agents', 'skills'))).toBe(true);
    expect(isRealDir(inHome('.claude', 'skills'))).toBe(true);
    expect(existsSync(agents('no-skill-file'))).toBe(false);
    expect(backups()).toEqual([]);
  });

  test('moves real directories to the backup and lists how they differ', () => {
    install('alpha', agents('alpha'));
    write(join(agents('alpha'), 'SKILL.md'), 'edited by hand\n');
    write(join(agents('alpha'), 'extra.md'), 'mine\n');
    write(join(agents('alpha'), '.DS_Store'), 'junk');
    write(join(agents('alpha'), '.playwright-cli', 'page.yml'), 'junk');
    write(join(agents('alpha'), 'scripts', '__pycache__', 'x.pyc'), 'junk');
    rmSync(join(agents('alpha'), 'references', 'guide.md'));
    install('alpha', claude('alpha'));
    install('beta', agents('beta'));
    write(join(agents('beta'), '.DS_Store'), 'junk');

    const r = run(['link']);

    expect(r.code).toBe(0);
    expectLinked('alpha');
    expectLinked('beta');
    const [backup] = backups();
    expect(read(join(backup, 'agents', 'alpha', 'SKILL.md'))).toBe('edited by hand\n');
    expect(read(join(backup, 'agents', 'alpha', 'extra.md'))).toBe('mine\n');
    expect(read(join(backup, 'agents', 'alpha', '.playwright-cli', 'page.yml'))).toBe('junk');
    expect(existsSync(join(backup, 'claude', 'alpha', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(backup, 'agents', 'beta', 'SKILL.md'))).toBe(true);
    expect(r.out).toContain('differs: SKILL.md');
    expect(r.out).toContain('only in your copy: extra.md');
    expect(r.out).toContain(`only in the repo: ${join('references', 'guide.md')}`);
    expect(r.out).not.toContain('.DS_Store');
    expect(r.out).not.toContain('.playwright-cli');
    expect(r.out).not.toContain('__pycache__');
    expect(r.out).toMatch(/\.claude\/skills\/alpha to .* \(same as the repo\)/);
    expect(r.out).toMatch(/\.agents\/skills\/beta to .* \(same as the repo\)/);
  });

  test('replaces a link that points elsewhere and parks a stray file', () => {
    mkdirSync(join(tmp, 'other'), { recursive: true });
    mkdirSync(inHome('.agents', 'skills'), { recursive: true });
    mkdirSync(inHome('.claude', 'skills'), { recursive: true });
    symlinkSync(join(tmp, 'other'), agents('alpha'));
    writeFileSync(claude('beta'), 'a file');

    expect(run(['link']).code).toBe(0);

    expectLinked('alpha');
    expectLinked('beta');
    expect(existsSync(join(tmp, 'other'))).toBe(true);
    expect(read(join(backups()[0], 'claude', 'beta'))).toBe('a file');
  });

  test('never touches skills that exist only at user level', () => {
    write(join(agents('third'), 'SKILL.md'), 'third\n');
    write(join(claude('claude-only'), 'SKILL.md'), 'claude only\n');
    symlinkSync(agents('third'), claude('third'));

    expect(run(['link']).code).toBe(0);

    expect(isRealDir(agents('third'))).toBe(true);
    expect(isRealDir(claude('claude-only'))).toBe(true);
    expect(readlinkSync(claude('third'))).toBe(agents('third'));
  });

  test('removes only own entries from the lock, after a backup', () => {
    writeLock(['alpha', 'third', 'beta']);
    const before = read(lockPath());

    expect(run(['link']).code).toBe(0);

    const after = readJson(lockPath());
    const expected = JSON.parse(before) as ReturnType<typeof readJson>;
    delete expected.skills.alpha;
    delete expected.skills.beta;
    expect(after).toEqual(expected);
    expect(read(lockPath())).toBe(JSON.stringify(expected, null, 2));
    expect(read(join(backups()[0], '.skill-lock.json'))).toBe(before);
  });

  test('keeps a symlinked lock file a symlink', () => {
    writeLock(['alpha']);
    const real = join(tmp, 'dotfiles-lock.json');
    copyFileSync(lockPath(), real);
    rmSync(lockPath());
    symlinkSync(real, lockPath());

    expect(run(['link']).code).toBe(0);

    expect(isLink(lockPath())).toBe(true);
    expect(readJson(real).skills).toEqual({});
  });

  test('leaves a lock without own entries byte for byte', () => {
    write(lockPath(), '{"version":3,   "skills":{"third":{}}}\n');

    expect(run(['link']).code).toBe(0);

    expect(read(lockPath())).toBe('{"version":3,   "skills":{"third":{}}}\n');
    expect(backups()).toEqual([]);
  });

  test('changes nothing when the lock is not valid JSON', () => {
    write(lockPath(), '{ broken');
    install('alpha', agents('alpha'));
    const before = tree();

    const r = run(['link']);

    expect(r.code).toBe(1);
    expect(r.out).toContain('not valid JSON');
    expect(tree()).toEqual(before);
  });

  test('--dry-run reports the plan and changes nothing', () => {
    writeLock(['alpha']);
    install('alpha', agents('alpha'));
    write(join(agents('alpha'), 'extra.md'), 'mine\n');
    const before = tree();

    const r = run(['link', '--dry-run']);

    expect(r.code).toBe(0);
    expect(r.out).toContain('would remove 1 own skill(s)');
    expect(r.out).toContain('would move');
    expect(r.out).toContain('only in your copy: extra.md');
    expect(r.out).toContain('would link');
    expect(tree()).toEqual(before);
  });

  test('a second run does nothing', () => {
    writeLock(['alpha', 'third']);
    install('alpha', agents('alpha'));
    expect(run(['link']).code).toBe(0);
    const before = tree();

    const r = run(['link']);

    expect(r.code).toBe(0);
    expect(r.out).toContain('nothing to do');
    expect(tree()).toEqual(before);
  });

  test('refuses to run from a linked worktree', () => {
    const worktree = join(tmp, 'worktree');
    git(repo, 'worktree', 'add', '--quiet', '-b', 'feat/x', worktree);
    install('alpha', agents('alpha'));
    const before = tree();

    const r = run(['link'], worktree);

    expect(r.code).toBe(1);
    expect(r.out).toContain('not a primary checkout');
    expect(tree()).toEqual(before);
  });

  test.each([
    ['another branch', ['switch', '--quiet', '-c', 'feat/x'], '\'feat/x\''],
    ['a detached HEAD', ['switch', '--quiet', '--detach'], 'detached HEAD'],
  ])('refuses on %s, also in a dry run', (_, args, expected) => {
    git(repo, ...args);
    for (const flags of [[], ['--dry-run']]) {
      const r = run(['link', ...flags]);
      expect(r.code).toBe(1);
      expect(r.out).toContain(expected);
    }
    expect(tree()).toEqual([]);
  });

  test.each(['.agents', '.claude'])('aborts when ~/%s/skills is itself a symlink', (parent) => {
    mkdirSync(inHome(parent), { recursive: true });
    symlinkSync(join(repo, 'skills'), inHome(parent, 'skills'));
    writeLock(['alpha']);
    const before = tree();

    for (const command of ['link', 'unlink']) {
      const r = run([command]);
      expect(r.code).toBe(1);
      expect(r.out).toContain('is itself a symlink');
    }
    expect(tree()).toEqual(before);
    expect(git(repo, 'status', '--porcelain')).toBe('');
  });

  test('aborts when a symlinked parent would break the relative link', () => {
    mkdirSync(join(tmp, 'dotfiles', 'claude'), { recursive: true });
    symlinkSync(join(tmp, 'dotfiles', 'claude'), inHome('.claude'));

    const r = run(['link']);

    expect(r.code).toBe(1);
    expect(r.out).toContain('symlinked parent');
    expect(existsSync(inHome('.agents'))).toBe(false);
  });

  test('aborts when ~/.agents resolves into the repo', () => {
    symlinkSync(repo, inHome('.agents'));

    const r = run(['link']);

    expect(r.code).toBe(1);
    expect(r.out).toContain('inside this repo');
    expect(isRealDir(source('alpha'))).toBe(true);
    expect(git(repo, 'status', '--porcelain')).toBe('');
  });

  test.each([
    'link --dryrun',
    'link --help',
    'unlink --dry-run',
    '--quiet',
    'relink',
  ])('rejects "%s" without doing anything', (line) => {
    const r = run(line.split(' '));
    expect(r.code).toBe(2);
    expect(r.err).toContain('usage:');
    expect(tree()).toEqual([]);
  });
});

describe('status', () => {
  const linked = () => expect(run(['link']).code).toBe(0);

  test('is clean after link, and silent with --quiet', () => {
    linked();
    expect(run(['status'])).toMatchObject({ code: 0, out: `own-skills: clean, 2 skill(s) linked to ${repo}\n` });
    expect(run([])).toMatchObject({ code: 0 });
    expect(run(['status', '--quiet'])).toEqual({ code: 0, out: '', err: '' });
  });

  test('reports skills that are not linked, with the fix, and writes nothing', () => {
    install('alpha', agents('alpha'));
    const before = tree();

    const r = run(['status', '--quiet']);

    expect(r.code).toBe(1);
    expect(r.out).toContain('not linked in ~/.agents/skills: alpha (real copy), beta (missing)');
    expect(r.out).toContain('not linked in ~/.claude/skills: alpha (missing), beta (missing)');
    expect(r.out).toContain(`fix: bun ${join(repo, 'scripts', 'skills-link.ts')} link`);
    expect(tree()).toEqual(before);
  });

  test('reports a link that points elsewhere in each directory', () => {
    linked();
    rmSync(agents('alpha'));
    symlinkSync(tmp, agents('alpha'));
    rmSync(claude('beta'));
    install('beta', claude('beta'));

    const r = run(['status']);

    expect(r.code).toBe(1);
    expect(r.out).toContain('~/.agents/skills: alpha (points elsewhere)');
    expect(r.out).toContain('~/.claude/skills: beta (real copy)');
  });

  test('reports a checkout that is not on main and names the branch', () => {
    linked();
    git(repo, 'switch', '--quiet', '-c', 'feat/x');

    const r = run(['status', '--quiet']);

    expect(r.code).toBe(1);
    expect(r.out).toContain('on \'feat/x\', not main: every session is loading that branch\'s skills');
    expect(r.out).toContain(`fix: git -C ${repo} switch main`);
  });

  test('reports uncommitted changes under skills/ only', () => {
    linked();
    write(join(repo, 'README.md'), 'outside skills\n');
    expect(run(['status', '--quiet']).code).toBe(0);

    write(join(agents('alpha'), 'SKILL.md'), 'edited at user level\n');
    write(join(claude('beta'), 'new.md'), 'new\n');
    const r = run(['status', '--quiet']);

    expect(r.code).toBe(1);
    expect(r.out).toContain('live and unpublished');
    expect(r.out).toContain('skills/alpha/SKILL.md');
    expect(r.out).toContain('skills/beta/new.md');
    expect(r.out).not.toContain('README.md');
  });

  test('reports own lock entries that came back', () => {
    linked();
    writeLock(['third']);
    expect(run(['status', '--quiet']).code).toBe(0);

    writeLock(['third', 'beta']);
    const r = run(['status', '--quiet']);

    expect(r.code).toBe(1);
    expect(r.out).toContain('tracks own skills again');
    expect(r.out).toContain(': beta\n');
  });

  test('reports ahead of origin/main offline, and behind it only after --fetch', () => {
    const origin = join(tmp, 'origin.git');
    const other = join(tmp, 'other');
    git(tmp, 'clone', '--quiet', '--bare', repo, origin);
    git(repo, 'remote', 'add', 'origin', origin);
    git(repo, 'fetch', '--quiet', 'origin');
    linked();
    expect(run(['status', '--quiet', '--fetch'])).toEqual({ code: 0, out: '', err: '' });

    git(tmp, 'clone', '--quiet', origin, other);
    git(other, 'commit', '--quiet', '--allow-empty', '-m', 'remote work');
    git(other, 'push', '--quiet', 'origin', 'main');
    expect(run(['status', '--quiet']).code).toBe(0);
    const behind = run(['status', '--fetch']);
    expect(behind.code).toBe(1);
    expect(behind.out).toContain('1 commit(s) behind origin/main');
    expect(behind.out).toContain('pull --ff-only origin main');

    git(repo, 'commit', '--quiet', '--allow-empty', '-m', 'local work');
    expect(run(['status']).out).toContain('diverged: 1 ahead, 1 behind');
    git(repo, 'pull', '--quiet', '--rebase', 'origin', 'main');
    const ahead = run(['status', '--quiet']);
    expect(ahead.code).toBe(1);
    expect(ahead.out).toContain('1 commit(s) ahead of origin/main');
    expect(ahead.out).toContain('push origin main');
  });

  test('reports a failed fetch', () => {
    git(repo, 'remote', 'add', 'origin', join(tmp, 'missing.git'));
    linked();

    const r = run(['status', '--fetch']);

    expect(r.code).toBe(1);
    expect(r.out).toContain('could not fetch origin/main');
  });

  test('sends a worktree run to the primary checkout', () => {
    const worktree = join(tmp, 'worktree');
    git(repo, 'worktree', 'add', '--quiet', '-b', 'feat/x', worktree);
    linked();

    const r = run(['status'], worktree);

    expect(r.code).toBe(1);
    expect(r.out).toContain('not the primary checkout');
    expect(r.out).toContain(`fix: bun ${join(repo, 'scripts', 'skills-link.ts')} status`);
  });

  test('reports a symlinked skills directory and a broken lock as problems', () => {
    mkdirSync(inHome('.claude'), { recursive: true });
    symlinkSync(tmp, inHome('.claude', 'skills'));
    expect(run(['status', '--quiet']).out).toContain('is itself a symlink');

    rmSync(inHome('.claude', 'skills'));
    linked();
    write(lockPath(), '{ broken');
    const r = run(['status', '--quiet']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('not valid JSON');
  });

  test('prints one line, no stack trace, when the checkout is broken', () => {
    rmSync(join(repo, '.git'), { recursive: true });

    const r = run(['status', '--quiet']);

    expect(r.code).toBe(1);
    expect(r.err).toBe('');
    expect(r.out.trimEnd().split('\n')).toHaveLength(1);
    expect(r.out).toStartWith('own-skills: status failed:');
  });
});

describe('unlink', () => {
  test('restores real copies of the working tree', () => {
    write(join(agents('third'), 'SKILL.md'), 'third\n');
    symlinkSync(join(tmp, 'elsewhere'), agents('foreign'));
    expect(run(['link']).code).toBe(0);
    write(join(source('alpha'), 'SKILL.md'), 'uncommitted edit\n');
    write(join(source('alpha'), '.playwright-cli', 'page.yml'), 'junk');

    const r = run(['unlink']);

    expect(r.code).toBe(0);
    for (const name of ['alpha', 'beta']) {
      expect(isRealDir(agents(name))).toBe(true);
      expect(isRealDir(realpathSync(claude(name)))).toBe(true);
      expect(realpathSync(claude(name))).toBe(agents(name));
    }
    expect(read(join(claude('alpha'), 'SKILL.md'))).toBe('uncommitted edit\n');
    expect(read(join(agents('beta'), 'references', 'guide.md'))).toBe('guide of beta\n');
    expect(existsSync(join(agents('alpha'), '.playwright-cli'))).toBe(false);
    expect(readlinkSync(agents('foreign'))).toBe(join(tmp, 'elsewhere'));
    expect(read(join(source('alpha'), 'SKILL.md'))).toBe('uncommitted edit\n');
    expect(backups()).toEqual([]);

    write(join(agents('alpha'), 'SKILL.md'), 'user copy only\n');
    expect(read(join(source('alpha'), 'SKILL.md'))).toBe('uncommitted edit\n');
  });

  test('can be run twice and followed by a new link', () => {
    run(['link']);
    run(['unlink']);

    expect(run(['unlink']).out).toContain('nothing to unlink');
    expect(run(['status']).code).toBe(1);
    expect(run(['link']).code).toBe(0);
    expectLinked('alpha');
  });

  test('keeps a link whose skill is not in the working tree', () => {
    run(['link']);
    rmSync(source('beta'), { recursive: true });

    const r = run(['unlink']);

    expect(r.code).toBe(1);
    expect(r.out).toContain('skipped beta');
    expect(isLink(agents('beta'))).toBe(true);
    expect(isRealDir(agents('alpha'))).toBe(true);
  });
});

describe('link --claude-dir-link', () => {
  const claudeDir = () => inHome('.claude', 'skills');
  const inventory = () => JSON.parse(read(inHome('.agents', '.claude-dir-link.json'))) as { skills: string[], fromClaude: string[] };
  const dirLink = () => run(['link', '--claude-dir-link']);

  /** Content of every file under HOME and the other repo, whatever its path. */
  function contents(): string[] {
    return [...tree(), ...tree(join(tmp, 'elsewhere'))]
      .filter(l => l.includes(': ') && !l.includes('.claude-dir-link.json') && !l.includes('.skill-lock.json'))
      .map(l => l.slice(l.indexOf(': ') + 2));
  }

  /** The kinds of entry a real ~/.claude/skills holds. */
  function populate() {
    write(join(tmp, 'elsewhere', 'channel', 'SKILL.md'), 'channel skill in another repo\n');
    for (const [name, text] of [['third', 'third'], ['same', 'same'], ['drifted', 'drifted in agents'], ['linked', 'linked']]) {
      write(join(agents(name), 'SKILL.md'), `${text}\n`);
    }
    symlinkSync('third', agents('alias'));
    mkdirSync(claudeDir(), { recursive: true });
    install('alpha', agents('alpha'));
    install('alpha', claude('alpha'));
    write(join(claude('alpha'), 'SKILL.md'), 'claude copy of alpha\n');
    symlinkSync('../../.agents/skills/beta', claude('beta'));
    write(join(claude('same'), 'SKILL.md'), 'same\n');
    write(join(claude('drifted'), 'SKILL.md'), 'drifted in claude\n');
    symlinkSync(agents('linked'), claude('linked'));
    symlinkSync('../../.agents/skills/third', claude('third'));
    symlinkSync(join(tmp, 'elsewhere', 'channel'), claude('channel'));
    symlinkSync('../../../elsewhere/channel', claude('channel-relative'));
    symlinkSync('local', claude('sibling'));
    write(join(claude('local'), 'SKILL.md'), 'only in claude\n');
    write(join(claude('borrowed'), 'SKILL.md'), 'real one lives in claude\n');
    symlinkSync(claude('borrowed'), agents('borrowed'));
    write(join(claude('synced'), 'org_account', 'morning', 'SKILL.md'), 'synced by claude\n');
    write(join(claude('.trash'), 'old', 'SKILL.md'), 'trashed\n');
  }

  test('moves everything into ~/.agents/skills, parks what differs and loses nothing', () => {
    populate();
    const before = contents();

    const r = dirLink();

    expect(r.code).toBe(0);
    expect(readlinkSync(claudeDir())).toBe('../.agents/skills');
    const after = contents();
    // Every file that existed still exists somewhere, as often as before.
    expect(before.filter((c) => {
      const at = after.indexOf(c);
      return at < 0 || !after.splice(at, 1).length;
    })).toEqual([]);
    expect(readlinkSync(agents('alpha'))).toBe(source('alpha'));
    expect(readlinkSync(agents('beta'))).toBe(source('beta'));
    for (const name of ['third', 'same', 'drifted', 'linked', 'alias', 'local', 'sibling', 'borrowed', 'channel', 'channel-relative']) {
      expect(existsSync(join(claude(name), 'SKILL.md'))).toBe(true);
    }
    expect(read(join(claude('channel-relative'), 'SKILL.md'))).toBe('channel skill in another repo\n');
    expect(readlinkSync(agents('channel'))).toBe(join(tmp, 'elsewhere', 'channel'));
    expect(isRealDir(agents('borrowed'))).toBe(true);
    expect(read(join(claude('drifted'), 'SKILL.md'))).toBe('drifted in agents\n');
    expect(read(join(agents('synced'), 'org_account', 'morning', 'SKILL.md'))).toBe('synced by claude\n');
    expect(isRealDir(agents('.trash'))).toBe(true);
    const [backup] = backups();
    expect(read(join(backup, 'claude', 'alpha', 'SKILL.md'))).toBe('claude copy of alpha\n');
    expect(read(join(backup, 'claude', 'drifted', 'SKILL.md'))).toBe('drifted in claude\n');
    expect(existsSync(join(backup, 'claude', 'same'))).toBe(true);
    expect(r.out).toMatch(/skills\/drifted to .* \(DIFFERS from ~\/\.agents\/skills\/drifted\)/);
    expect(r.out).toMatch(/skills\/same to .* \(same content\)/);
    expect(r.out).toContain('now also loads: alias');
    expect(inventory().fromClaude).toEqual(['.trash', 'borrowed', 'channel', 'channel-relative', 'local', 'sibling', 'synced']);
    expect(inventory().skills).toContain('third');
    expect(inventory().skills).not.toContain('synced');
    expect(run(['status', '--quiet'])).toEqual({ code: 0, out: '', err: '' });
  });

  test('--dry-run changes nothing', () => {
    populate();
    const before = tree();

    const r = run(['link', '--claude-dir-link', '--dry-run']);

    expect(r.code).toBe(0);
    expect(r.out).toContain('would link ~/.claude/skills -> ../.agents/skills');
    expect(r.out).toContain('would also load');
    expect(tree()).toEqual(before);
  });

  test('is idempotent, and a plain link keeps the layout', () => {
    populate();
    dirLink();
    const before = tree();

    expect(dirLink().out).toContain('nothing to do');
    expect(run(['link']).out).toContain('nothing to do');
    expect(tree()).toEqual(before);
  });

  test('works on an empty HOME', () => {
    expect(dirLink().code).toBe(0);
    expect(realpathSync(claude('alpha'))).toBe(source('alpha'));
    expect(run(['status', '--quiet']).code).toBe(0);
  });

  test.each([
    ['~/.claude/skills is another symlink', () => {
      mkdirSync(inHome('.claude'));
      symlinkSync(tmp, claudeDir());
    }, 'is itself a symlink'],
    ['~/.agents/skills is a symlink', () => {
      mkdirSync(inHome('.agents'));
      symlinkSync(join(repo, 'skills'), inHome('.agents', 'skills'));
    }, 'is itself a symlink'],
    ['~/.claude is a symlink to a deeper folder', () => {
      mkdirSync(join(tmp, 'dotfiles', 'claude'), { recursive: true });
      symlinkSync(join(tmp, 'dotfiles', 'claude'), inHome('.claude'));
    }, 'would not reach'],
  ])('aborts when %s', (_, arrange, message) => {
    arrange();
    const before = tree();

    const r = dirLink();

    expect(r.code).toBe(1);
    expect(r.out).toContain(message);
    expect(tree()).toEqual(before);
  });

  test('status points every fix at this layout', () => {
    populate();
    dirLink();
    rmSync(agents('alpha'));
    install('alpha', agents('alpha'));
    writeLock(['alpha']);

    const r = run(['status', '--quiet']);

    expect(r.code).toBe(1);
    expect(r.out).toContain('not linked in ~/.agents/skills: alpha (real copy)');
    expect(r.out).not.toContain('~/.claude/skills:');
    expect(r.out).toContain('tracks own skills again');
    expect(r.out.match(/fix: bun .* link$/gm)).toBeNull();
    expect(dirLink().code).toBe(0);
    expect(run(['status', '--quiet']).code).toBe(0);
  });

  test('status reports a replaced directory link', () => {
    dirLink();
    rmSync(claudeDir());
    mkdirSync(claudeDir());

    const r = run(['status', '--quiet']);

    expect(r.code).toBe(1);
    expect(r.out).toContain('is no longer a link');
    expect(dirLink().code).toBe(0);
    expect(run(['status', '--quiet']).code).toBe(0);
  });

  test('status reports a third-party skill that disappeared, until a link accepts it', () => {
    populate();
    dirLink();
    rmSync(claude('third'), { recursive: true });
    rmSync(claude('channel'));

    const r = run(['status', '--quiet']);

    expect(r.code).toBe(1);
    expect(r.out).toContain('since the last link: channel, third');
    expect(r.out).toContain('broken or self-referencing link ~/.agents/skills/alias');
    rmSync(agents('alias'));
    expect(dirLink().out).toContain('no longer expected: alias, channel, third');
    expect(run(['status', '--quiet']).code).toBe(0);
  });

  test('unlink gives Claude its own directory back', () => {
    populate();
    dirLink();

    const r = run(['unlink']);

    expect(r.code).toBe(0);
    expect(isRealDir(claudeDir())).toBe(true);
    expect(isRealDir(claude('synced'))).toBe(true);
    expect(isRealDir(claude('.trash'))).toBe(true);
    expect(isRealDir(claude('local'))).toBe(true);
    expect(isLink(claude('channel'))).toBe(true);
    expect(existsSync(agents('synced'))).toBe(false);
    expect(existsSync(agents('local'))).toBe(false);
    expect(isRealDir(agents('alpha'))).toBe(true);
    expect(readlinkSync(claude('alpha'))).toBe('../../.agents/skills/alpha');
    expect(readlinkSync(claude('third'))).toBe('../../.agents/skills/third');
    for (const name of ['channel', 'channel-relative', 'sibling', 'borrowed']) {
      expect(existsSync(join(claude(name), 'SKILL.md'))).toBe(true);
    }
    expect(existsSync(inHome('.agents', '.claude-dir-link.json'))).toBe(false);
    expect(run(['link']).code).toBe(0);
    expectLinked('alpha');
  });
});

describe('damaged third-party entries', () => {
  test.each(['link', '--claude-dir-link'])('status reports emptied and looping entries (%s)', (mode) => {
    run(mode === 'link' ? ['link'] : ['link', mode]);
    mkdirSync(join(agents('emptied'), 'references'), { recursive: true });
    symlinkSync('../../.agents/skills/loop', agents('loop'));
    write(join(agents('nested'), 'SKILL.md'), 'nested\n');
    symlinkSync(agents('nested'), join(agents('nested'), 'nested'));
    mkdirSync(agents('synced'));

    const r = run(['status', '--quiet']);

    expect(r.code).toBe(1);
    expect(r.out).toContain('~/.agents/skills/emptied has no files left');
    expect(r.out).toContain('broken or self-referencing link ~/.agents/skills/loop');
    expect(r.out).toContain('self-referencing link ~/.agents/skills/nested/nested');
    expect(r.out).not.toContain('synced');
  });
});
