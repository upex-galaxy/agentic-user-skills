// Maintainer tool: makes this repo's primary checkout the single source of the user-level skills it owns.
//
//   ~/.agents/skills/<name>  ->  <root>/skills/<name>        (absolute, one link per skill)
//   ~/.claude/skills/<name>  ->  ../../.agents/skills/<name>
//
// With `link --claude-dir-link` the second line becomes one link for the whole directory,
// ~/.claude/skills -> ../.agents/skills, and every skill lives in ~/.agents/skills.
//
// Built-ins only. A real directory is never deleted: it moves to ~/.agents/.skill-backups/<timestamp>/.
// A parent directory is never linked: `skills add/remove` would then delete files of this repo.

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmdirSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = 'usage: bun scripts/skills-link.ts [status [--quiet] [--fetch] | link [--dry-run] [--claude-dir-link] | unlink]';
const FLAGS: Record<string, string[]> = { status: ['--quiet', '--fetch'], link: ['--dry-run', '--claude-dir-link'], unlink: [] };
/** Generated files: not a difference between two copies, and not restored by `unlink`. */
const JUNK = new Set(['.DS_Store', '.playwright-cli', '__pycache__']);
const MAX_LISTED = 20;
/** Folders Claude Code writes under ~/.claude/skills. They are not skills. */
const CLAUDE_MANAGED = ['synced', '.trash', '.staging'];
const CLAUDE_DIR_TARGET = '../.agents/skills';

/** An expected stop: the message explains why nothing was done. */
class Refusal extends Error {}

type Kind = 'none' | 'link' | 'dir' | 'file';

interface Lock {
  raw: string
  data: { skills?: Record<string, unknown> }
}

/** Written by the directory-link layout, so `status` can report a skill that disappeared. */
interface Inventory {
  skills: string[]
  /** Entries that existed only under ~/.claude/skills; `unlink` moves them back. */
  fromClaude: string[]
}

interface Problem {
  text: string
  fix: string
}

const root = resolve(dirname(realpathSync(fileURLToPath(import.meta.url))), '..');
const repoSkills = join(root, 'skills');
const home = homedir();
const agentsSkills = join(home, '.agents', 'skills');
const claudeSkills = join(home, '.claude', 'skills');
const lockPath = join(home, '.agents', '.skill-lock.json');
const backupRoot = join(home, '.agents', '.skill-backups');
const inventoryPath = join(home, '.agents', '.claude-dir-link.json');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

const quote = (s: string) => /^[\w./~@-]+$/.test(s) ? s : `'${s.replaceAll('\'', '\'\\\'\'')}'`;
const tilde = (p: string) => p.startsWith(home + sep) ? `~${p.slice(home.length)}` : p;
/** One line for an error: what the failed command printed, else the message. */
function errorLine(e: unknown): string {
  const stderr = String((e as { stderr?: unknown }).stderr ?? '').trim();
  return (stderr || (e instanceof Error ? e.message : String(e))).trim().split('\n')[0];
}
const self = (args: string) => `bun ${quote(join(root, 'scripts', 'skills-link.ts'))} ${args}`;
const gitCommand = (args: string) => `git -C ${quote(root)} ${args}`;

function kind(path: string): Kind {
  try {
    const s = lstatSync(path);
    return s.isSymbolicLink() ? 'link' : s.isDirectory() ? 'dir' : 'file';
  }
  catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return 'none';
    }
    throw e;
  }
}

/** realpath that also works for a path that does not exist yet. */
function realish(path: string): string {
  if (existsSync(path)) {
    return realpathSync(path);
  }
  const parent = dirname(path);
  return parent === path ? path : join(realish(parent), basename(path));
}

const isInside = (path: string, dir: string) => path === dir || path.startsWith(dir + sep);

function git(args: string[], timeout = 10_000): string {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  // A caller such as a git hook must not redirect these commands to another repository.
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) {
    delete env[name];
  }
  return execFileSync('git', ['--no-optional-locks', '-C', root, ...args], {
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout,
  }).trimEnd();
}

/** The checked-out branch, or null on a detached HEAD. */
function currentBranch(): string | null {
  try {
    return git(['symbolic-ref', '--quiet', '--short', 'HEAD']);
  }
  catch (e) {
    if ((e as { status?: number }).status === 1) {
      return null;
    }
    throw e;
  }
}

/** A linked worktree (and a submodule) has `.git` as a file. */
const isPrimaryCheckout = () => kind(join(root, '.git')) === 'dir';

function ownSkills(): string[] {
  return readdirSync(repoSkills, { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(join(repoSkills, e.name, 'SKILL.md')))
    .map(e => e.name)
    .sort();
}

/** ~/.claude/skills is one link that reaches ~/.agents/skills. The only directory link accepted. */
const isClaudeDirLink = () => kind(claudeSkills) === 'link' && existsSync(claudeSkills) && existsSync(agentsSkills)
  && realpathSync(claudeSkills) === realpathSync(agentsSkills);

/** Why the user-level directories cannot be managed in this layout, or null. */
function directoryProblem(dirLayout: boolean): string | null {
  const dirLinked = isClaudeDirLink();
  for (const dir of dirLinked ? [agentsSkills] : [agentsSkills, claudeSkills]) {
    const k = kind(dir);
    if (k === 'link') {
      return `${tilde(dir)} is itself a symlink (to ${readlinkSync(dir)}). Links are managed inside a real directory: through a linked parent, \`skills add/remove\` deletes the target's files. Replace it with a real directory first.`;
    }
    if (k === 'file') {
      return `${tilde(dir)} is a file, not a directory.`;
    }
  }
  const agents = realish(agentsSkills);
  if (isInside(agents, root) || (!dirLinked && isInside(realish(claudeSkills), root))) {
    return 'a user-level skills directory resolves to a folder inside this repo, probably through a symlinked parent.';
  }
  if (dirLinked) {
    return null;
  }
  if (dirLayout) {
    // The directory link is relative to the real location of ~/.claude.
    return realish(resolve(realish(dirname(claudeSkills)), CLAUDE_DIR_TARGET)) === agents
      ? null
      : `~/.claude is reached through a symlink, so the relative link ${CLAUDE_DIR_TARGET} would not reach ${tilde(agentsSkills)}.`;
  }
  const claude = realish(claudeSkills);
  if (agents === claude || realish(resolve(claude, '..', '..', '.agents', 'skills')) !== agents) {
    return `${tilde(claudeSkills)} is reached through a symlinked parent, so the relative link ../../.agents/skills/<name> would not reach ${tilde(agentsSkills)}.`;
  }
  return null;
}

function readLock(): Lock | null {
  if (kind(lockPath) === 'none') {
    return null;
  }
  const raw = readFileSync(lockPath, 'utf8');
  let data: Lock['data'] | null;
  try {
    data = JSON.parse(raw) as Lock['data'] | null;
  }
  catch {
    throw new Refusal(`${tilde(lockPath)} is not valid JSON; fix or remove it.`);
  }
  if (typeof data !== 'object' || data === null) {
    throw new Refusal(`${tilde(lockPath)} is not a JSON object; fix or remove it.`);
  }
  return { raw, data };
}

const lockedOwn = (lock: Lock | null, own: string[]) => own.filter(n => Object.hasOwn(lock?.data.skills ?? {}, n));

/** The links of one skill. The directory-link layout needs nothing per skill under ~/.claude. */
function wantedLinks(name: string, dirLayout: boolean) {
  const links = [
    { where: 'agents', path: join(agentsSkills, name), target: join(repoSkills, name) },
    { where: 'claude', path: join(claudeSkills, name), target: `../../.agents/skills/${name}` },
  ];
  return dirLayout ? links.slice(0, 1) : links;
}

/** Names in ~/.agents/skills that can be skills: not hidden, not managed by Claude Code. */
const skillEntries = () => kind(agentsSkills) === 'dir'
  ? readdirSync(agentsSkills).filter(n => !n.startsWith('.') && !CLAUDE_MANAGED.includes(n)).sort()
  : [];

function readInventory(): Inventory | null {
  if (kind(inventoryPath) === 'none') {
    return null;
  }
  try {
    const { skills, fromClaude } = JSON.parse(readFileSync(inventoryPath, 'utf8')) as Inventory;
    if (Array.isArray(skills) && Array.isArray(fromClaude)) {
      return { skills, fromClaude };
    }
  }
  catch {}
  throw new Refusal(`${tilde(inventoryPath)} is not readable; remove it and run link --claude-dir-link again.`);
}

const isLinkTo = (path: string, target: string) => kind(path) === 'link' && readlinkSync(path) === target;

/** Relative path -> content of every file under `dir`. */
function snapshot(dir: string, prefix = '', out = new Map<string, Buffer>()) {
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    if (JUNK.has(entry.name)) {
      continue;
    }
    const rel = join(prefix, entry.name);
    if (entry.isDirectory()) {
      snapshot(dir, rel, out);
    }
    else if (entry.isSymbolicLink()) {
      out.set(rel, Buffer.from(`symlink to ${readlinkSync(join(dir, rel))}`));
    }
    else {
      out.set(rel, readFileSync(join(dir, rel)));
    }
  }
  return out;
}

function differences(copy: string, source: string): string[] {
  const a = snapshot(copy);
  const b = snapshot(source);
  return [...new Set([...a.keys(), ...b.keys()])].sort().flatMap((rel) => {
    const left = a.get(rel);
    const right = b.get(rel);
    if (!left) {
      return [`only in the repo: ${rel}`];
    }
    if (!right) {
      return [`only in your copy: ${rel}`];
    }
    return left.equals(right) ? [] : [`differs: ${rel}`];
  });
}

function printList(lines: string[], indent: string) {
  for (const line of lines.slice(0, MAX_LISTED)) {
    console.log(indent + line);
  }
  if (lines.length > MAX_LISTED) {
    console.log(`${indent}... and ${lines.length - MAX_LISTED} more`);
  }
}

/** Moves everything under ~/.claude/skills to ~/.agents/skills (or the backup) and links the directory. */
function linkClaudeDirectory(own: string[], dryRun: boolean) {
  const would = dryRun ? 'would ' : '';
  const entries = kind(claudeSkills) === 'dir' ? readdirSync(claudeSkills).sort() : [];
  const moved: string[] = [];
  const park = (path: string, where: string, name: string, note: string) => {
    const backup = join(backupRoot, stamp, where, name);
    console.log(`${would}move ${tilde(path)} to ${tilde(backup)} (${note})`);
    if (!dryRun) {
      mkdirSync(dirname(backup), { recursive: true });
      renameSync(path, backup);
    }
  };

  for (const name of entries) {
    const from = join(claudeSkills, name);
    const to = join(agentsSkills, name);
    const fromKind = kind(from);
    const linkText = fromKind === 'link' ? readlinkSync(from) : '';
    const pointsAt = fromKind === 'link' ? resolve(claudeSkills, linkText) : '';
    // An agents entry that is only a link into ~/.claude/skills (or leads nowhere) gives way to the real one.
    const borrowed = !own.includes(name) && kind(to) === 'link'
      && (isInside(resolve(agentsSkills, readlinkSync(to)), claudeSkills) || !existsSync(to));
    const taken = own.includes(name) || (kind(to) !== 'none' && !borrowed);

    if (fromKind === 'link' && !borrowed
      && (pointsAt === to || (existsSync(from) && existsSync(to) && realpathSync(from) === realpathSync(to)))) {
      console.log(`${would}remove the link ${tilde(from)} (${tilde(to)} covers it)`);
      if (!dryRun) {
        unlinkSync(from);
      }
      continue;
    }
    if (taken && !CLAUDE_MANAGED.includes(name)) {
      const other = own.includes(name) ? join(repoSkills, name) : to;
      const diff = fromKind === 'dir' && existsSync(other) && statSync(other).isDirectory()
        ? differences(from, realpathSync(other))
        : null;
      const note = fromKind === 'link'
        ? `a link to ${linkText}, DIFFERS from ${tilde(to)}`
        : diff && !diff.length ? 'same content' : `DIFFERS from ${own.includes(name) ? 'the repo' : tilde(to)}`;
      park(from, 'claude', name, note);
      printList(diff ?? [], '    ');
      continue;
    }
    if (kind(to) !== 'none') {
      park(to, 'agents', name, borrowed ? 'a link that the real entry replaces' : 'the folder Claude Code uses replaces it');
    }
    console.log(`${would}move ${tilde(from)} to ${tilde(to)}`);
    moved.push(name);
    if (dryRun) {
      continue;
    }
    // A relative link can mean something else from its new folder.
    if (fromKind === 'link' && resolve(agentsSkills, linkText) !== pointsAt) {
      symlinkSync(isInside(pointsAt, claudeSkills) ? join(agentsSkills, relative(claudeSkills, pointsAt)) : pointsAt, to);
      unlinkSync(from);
    }
    else {
      renameSync(from, to);
    }
  }

  const loadedNow = skillEntries().filter(n => !entries.includes(n) && existsSync(join(agentsSkills, n, 'SKILL.md')));
  if (loadedNow.length) {
    console.log(`Claude Code ${dryRun ? 'would also load' : 'now also loads'}: ${loadedNow.join(', ')}`);
  }
  console.log(`${would}link ${tilde(claudeSkills)} -> ${CLAUDE_DIR_TARGET}`);
  if (!dryRun) {
    // rmdir fails on a directory that is not empty, so nothing written meanwhile can be lost.
    if (kind(claudeSkills) === 'dir') {
      rmdirSync(claudeSkills);
    }
    mkdirSync(dirname(claudeSkills), { recursive: true });
    symlinkSync(CLAUDE_DIR_TARGET, claudeSkills);
  }
  return moved;
}

/** Records what ~/.agents/skills holds now. Returns whether anything changed. */
function recordInventory(moved: string[]): boolean {
  const old = readInventory();
  const next: Inventory = { skills: skillEntries(), fromClaude: [...new Set([...old?.fromClaude ?? [], ...moved])].sort() };
  if (old && JSON.stringify(old) === JSON.stringify(next)) {
    return false;
  }
  const dropped = old?.skills.filter(n => !next.skills.includes(n)) ?? [];
  if (dropped.length) {
    console.log(`no longer expected: ${dropped.join(', ')}`);
  }
  console.log(`record ${next.skills.length} skill(s) in ${tilde(inventoryPath)}, so status can report one that disappears`);
  writeFileSync(inventoryPath, `${JSON.stringify(next, null, 2)}\n`);
  return true;
}

/** Rollback of the directory link: a real directory again, with one link per skill. */
function restoreClaudeDirectory() {
  const inventory = readInventory();
  unlinkSync(claudeSkills);
  mkdirSync(claudeSkills);
  const own = ownSkills();
  const back = [...new Set([...CLAUDE_MANAGED, ...inventory?.fromClaude ?? []])]
    .filter(n => !own.includes(n) && kind(join(agentsSkills, n)) !== 'none');
  for (const name of back) {
    const from = join(agentsSkills, name);
    const to = join(claudeSkills, name);
    const pointsAt = kind(from) === 'link' ? resolve(agentsSkills, readlinkSync(from)) : '';
    // A link between two entries that both go back must follow its neighbour.
    if (back.some(n => isInside(pointsAt, join(agentsSkills, n)))) {
      symlinkSync(join(claudeSkills, relative(agentsSkills, pointsAt)), to);
      unlinkSync(from);
    }
    else {
      renameSync(from, to);
    }
    console.log(`moved back: ${tilde(to)}`);
  }
  const names = skillEntries().filter(n => existsSync(join(agentsSkills, n, 'SKILL.md')));
  for (const name of names) {
    if (kind(join(claudeSkills, name)) === 'none') {
      symlinkSync(`../../.agents/skills/${name}`, join(claudeSkills, name));
    }
  }
  if (inventory) {
    unlinkSync(inventoryPath);
  }
  console.log(`${tilde(claudeSkills)} is a real directory again, with ${names.length} per-skill link(s)`);
}

function link(dryRun: boolean, dirFlag: boolean) {
  // Every check runs before the first write.
  if (!isPrimaryCheckout()) {
    throw new Refusal(`${root} is not a primary checkout (a git worktree has .git as a file), so skills would point at a temporary folder. Run this script from the primary checkout.`);
  }
  const branch = currentBranch();
  if (branch !== 'main') {
    throw new Refusal(`${root} is on ${branch ? `'${branch}'` : 'a detached HEAD'}, not main. Run: ${gitCommand('switch main')}`);
  }
  const own = ownSkills();
  if (!own.length) {
    throw new Refusal(`no skill with a SKILL.md under ${repoSkills}.`);
  }
  // An existing directory link is kept: it is the chosen layout.
  const dirLinked = isClaudeDirLink();
  const dirLayout = dirFlag || dirLinked;
  const blocked = directoryProblem(dirLayout);
  if (blocked) {
    throw new Refusal(blocked);
  }
  const lock = readLock();
  if (dirLayout) {
    readInventory();
  }
  const would = dryRun ? 'would ' : '';
  let changes = 0;

  // The lock goes first: while it tracks a skill, `skills update -g` replaces that link with a copy.
  const tracked = lockedOwn(lock, own);
  if (lock && tracked.length) {
    const backup = join(backupRoot, stamp, '.skill-lock.json');
    console.log(`${would}remove ${tracked.length} own skill(s) from ${tilde(lockPath)} (backup: ${tilde(backup)}): ${tracked.join(', ')}`);
    changes++;
    if (!dryRun) {
      mkdirSync(dirname(backup), { recursive: true });
      writeFileSync(backup, lock.raw);
      for (const name of tracked) {
        delete lock.data.skills![name];
      }
      // Write next to the real file and rename, so a symlinked lock stays a symlink.
      const target = realpathSync(lockPath);
      const temp = `${target}.tmp-${process.pid}`;
      writeFileSync(temp, JSON.stringify(lock.data, null, 2) + (lock.raw.endsWith('\n') ? '\n' : ''), { mode: statSync(target).mode });
      renameSync(temp, target);
    }
  }

  if (!dryRun) {
    mkdirSync(agentsSkills, { recursive: true });
    if (!dirLayout) {
      mkdirSync(claudeSkills, { recursive: true });
      // The directory-link layout is over: nothing to compare against.
      if (kind(inventoryPath) !== 'none') {
        unlinkSync(inventoryPath);
      }
    }
  }

  for (const name of own) {
    for (const { where, path, target } of wantedLinks(name, dirLayout)) {
      if (isLinkTo(path, target)) {
        continue;
      }
      changes++;
      const current = kind(path);
      if (current === 'dir' || current === 'file') {
        const backup = join(backupRoot, stamp, where, name);
        const diff = current === 'dir' ? differences(path, join(repoSkills, name)) : ['it is a file, not a directory'];
        console.log(`${would}move ${tilde(path)} to ${tilde(backup)} (${diff.length ? 'DIFFERS from the repo' : 'same as the repo'})`);
        printList(diff, '    ');
        if (!dryRun) {
          mkdirSync(dirname(backup), { recursive: true });
          renameSync(path, backup);
        }
      }
      else if (current === 'link') {
        console.log(`${would}replace the link ${tilde(path)} (it pointed to ${readlinkSync(path)})`);
        if (!dryRun) {
          unlinkSync(path);
        }
      }
      console.log(`${would}link ${tilde(path)} -> ${target}`);
      if (!dryRun) {
        symlinkSync(target, path);
      }
    }
  }

  let moved: string[] = [];
  if (dirLayout && !dirLinked) {
    changes++;
    moved = linkClaudeDirectory(own, dryRun);
  }
  if (dirLayout && !dryRun && recordInventory(moved)) {
    changes++;
  }

  if (!changes) {
    console.log(`own-skills: nothing to do, ${own.length} skill(s) already linked to ${root}`);
  }
  else if (dryRun) {
    console.log('own-skills: dry run, nothing was changed');
  }
  else {
    console.log(`own-skills: ${own.length} skill(s) linked to ${root}`);
  }
}

/** Turns every link into this repo back into a real copy of the working tree. */
function unlink() {
  const dirLinked = isClaudeDirLink();
  const blocked = directoryProblem(dirLinked);
  if (blocked) {
    throw new Refusal(blocked);
  }
  if (dirLinked) {
    readInventory();
  }
  const linked = (kind(agentsSkills) === 'dir' ? readdirSync(agentsSkills) : []).sort().flatMap((name) => {
    const path = join(agentsSkills, name);
    if (kind(path) !== 'link') {
      return [];
    }
    const source = resolve(agentsSkills, readlinkSync(path));
    return source !== repoSkills && isInside(source, repoSkills) ? [{ name, path, source }] : [];
  });
  if (!linked.length && !dirLinked) {
    console.log(`own-skills: nothing to unlink, no link in ${tilde(agentsSkills)} points into ${repoSkills}`);
    return;
  }
  const branch = linked.length ? currentBranch() : 'main';
  if (branch !== 'main') {
    console.log(`warning: copying from ${branch ? `branch '${branch}'` : 'a detached HEAD'}, not main`);
  }
  const staging = join(backupRoot, stamp, 'staging');
  let skipped = 0;
  for (const { name, path, source } of linked) {
    if (!existsSync(join(source, 'SKILL.md'))) {
      console.log(`skipped ${name}: ${source} has no SKILL.md in the working tree, the link stays`);
      skipped++;
      continue;
    }
    // Copy first, then swap, so a failed copy leaves the link in place.
    const temp = join(staging, name);
    mkdirSync(staging, { recursive: true });
    cpSync(source, temp, { recursive: true, verbatimSymlinks: true, filter: from => !JUNK.has(basename(from)) });
    unlinkSync(path);
    renameSync(temp, path);
    console.log(`restored a real copy: ${tilde(path)}`);
  }
  if (existsSync(staging)) {
    rmdirSync(staging);
    if (!readdirSync(dirname(staging)).length) {
      rmdirSync(dirname(staging));
    }
  }
  if (dirLinked) {
    restoreClaudeDirectory();
  }
  console.log(`own-skills: ${linked.length - skipped} cop(ies) restored from ${root}`);
  console.log(`Lock entries and parked directories were not restored: see ${tilde(backupRoot)}, or reinstall with \`bunx skills add --global\`.`);
  if (skipped) {
    process.exitCode = 1;
  }
}

function checkoutProblems(fetch: boolean): Problem[] {
  const problems: Problem[] = [];
  const branch = currentBranch();
  if (branch !== 'main') {
    problems.push({
      text: `the checkout is on ${branch ? `'${branch}'` : 'a detached HEAD'}, not main: every session is loading ${branch ? 'that branch\'s' : 'that commit\'s'} skills`,
      fix: gitCommand('switch main'),
    });
  }
  const dirty = git(['status', '--porcelain', '--', 'skills']).split('\n').filter(Boolean);
  if (dirty.length) {
    const shown = dirty.slice(0, 5).map(l => l.slice(3)).join(', ');
    const more = dirty.length > 5 ? `, and ${dirty.length - 5} more` : '';
    problems.push({
      text: `uncommitted changes under skills/ (live and unpublished): ${shown}${more}`,
      fix: `${gitCommand('add skills')} && ${gitCommand('commit')}`,
    });
  }
  if (fetch) {
    try {
      git(['fetch', '--quiet', 'origin', 'main'], 20_000);
    }
    catch (e) {
      problems.push({ text: `could not fetch origin/main: ${errorLine(e)}`, fix: gitCommand('fetch origin main') });
    }
  }
  // Without --fetch this compares against the last fetched origin/main. A missing ref means nothing to compare.
  let counts: string;
  try {
    counts = git(['rev-list', '--left-right', '--count', 'refs/remotes/origin/main...refs/heads/main', '--']);
  }
  catch {
    return problems;
  }
  const [behind, ahead] = counts.split(/\s+/).map(Number);
  if (behind && ahead) {
    problems.push({ text: `main and origin/main diverged: ${ahead} ahead, ${behind} behind`, fix: `${gitCommand('pull --rebase origin main')} (on main)` });
  }
  else if (behind) {
    problems.push({ text: `main is ${behind} commit(s) behind origin/main`, fix: `${gitCommand('pull --ff-only origin main')} (on main)` });
  }
  else if (ahead) {
    problems.push({ text: `main is ${ahead} commit(s) ahead of origin/main (not published)`, fix: `${gitCommand('push origin main')} (after the owner confirms)` });
  }
  return problems;
}

/** True for a directory with no file anywhere inside. */
function isHollow(dir: string): boolean {
  return readdirSync(dir, { withFileTypes: true })
    .every(e => JUNK.has(e.name) || (e.isDirectory() && isHollow(join(dir, e.name))));
}

/** Damage to any entry of ~/.agents/skills, own or not: what `skills add/remove` and `ln` can leave behind. */
function entryProblems(own: string[]): Problem[] {
  const problems: Problem[] = [];
  for (const name of skillEntries().filter(n => !own.includes(n))) {
    const path = join(agentsSkills, name);
    if (kind(path) === 'link' && !existsSync(path)) {
      problems.push({ text: `broken or self-referencing link ${tilde(path)} -> ${readlinkSync(path)}`, fix: `rm ${quote(path)} && reinstall the skill` });
    }
    else if (kind(path) === 'dir' && isHollow(path)) {
      problems.push({ text: `${tilde(path)} has no files left`, fix: `reinstall it, or restore it from ${quote(backupRoot)}` });
    }
    // `ln -sfn <skill> <the same folder>` creates the link inside it, pointing back at it.
    const inner = join(path, name);
    if (kind(path) === 'dir' && kind(inner) === 'link' && existsSync(inner) && realpathSync(inner) === realpathSync(path)) {
      problems.push({ text: `self-referencing link ${tilde(inner)}`, fix: `rm ${quote(inner)}` });
    }
  }
  return problems;
}

function linkProblems(): Problem[] {
  const dirLinked = isClaudeDirLink();
  const dirLayout = dirLinked || kind(inventoryPath) !== 'none';
  const relink = self(dirLayout ? 'link --claude-dir-link' : 'link');
  const blocked = directoryProblem(dirLayout);
  if (blocked) {
    return [{ text: blocked, fix: `replace it with a real directory, then ${relink}` }];
  }
  const problems: Problem[] = [];
  const own = ownSkills();
  if (dirLayout && !dirLinked) {
    problems.push({ text: `${tilde(claudeSkills)} is no longer a link to ${tilde(agentsSkills)}`, fix: relink });
  }
  const wrong: Record<string, string[]> = { agents: [], claude: [] };
  for (const name of own) {
    for (const { where, path, target } of wantedLinks(name, dirLayout)) {
      if (!isLinkTo(path, target)) {
        const k = kind(path);
        const state = k === 'none' ? 'missing' : k === 'link' ? 'points elsewhere' : k === 'dir' ? 'real copy' : 'file';
        wrong[where].push(`${name} (${state})`);
      }
    }
  }
  for (const [where, names] of Object.entries(wrong)) {
    if (names.length) {
      problems.push({ text: `not linked in ~/.${where}/skills: ${names.join(', ')}`, fix: relink });
    }
  }
  problems.push(...entryProblems(own));
  try {
    const gone = readInventory()?.skills.filter(n => !own.includes(n) && kind(join(agentsSkills, n)) === 'none') ?? [];
    if (gone.length) {
      problems.push({
        text: `skills gone from ${tilde(agentsSkills)} since the last link: ${gone.join(', ')}`,
        fix: `reinstall them; if you removed them on purpose, ${relink}`,
      });
    }
    const tracked = lockedOwn(readLock(), own);
    if (tracked.length) {
      problems.push({ text: `the skills lock tracks own skills again (\`skills update -g\` would replace their links): ${tracked.join(', ')}`, fix: relink });
    }
  }
  catch (e) {
    if (!(e instanceof Refusal)) {
      throw e;
    }
    problems.push({ text: errorLine(e), fix: `edit or remove that file, then ${relink}` });
  }
  return problems;
}

function status(quiet: boolean, fetch: boolean) {
  let problems: Problem[];
  if (isPrimaryCheckout()) {
    problems = [...checkoutProblems(fetch), ...linkProblems()];
  }
  else {
    const primary = dirname(git(['rev-parse', '--path-format=absolute', '--git-common-dir']));
    problems = [{
      text: `${root} is not the primary checkout, so it cannot judge the links`,
      fix: `bun ${quote(join(primary, 'scripts', 'skills-link.ts'))} status`,
    }];
  }
  if (problems.length) {
    console.log(`own-skills: ${problems.length} problem(s)`);
    for (const { text, fix } of problems) {
      console.log(`- ${text}\n  fix: ${fix}`);
    }
    process.exitCode = 1;
  }
  else if (!quiet) {
    console.log(`own-skills: clean, ${ownSkills().length} skill(s) linked to ${root}`);
  }
}

const [command = 'status', ...flags] = process.argv.slice(2);
// An unknown flag stops here: a mistyped --dry-run must not run a real link.
if (!Object.hasOwn(FLAGS, command) || flags.some(f => !FLAGS[command].includes(f))) {
  console.error(USAGE);
  process.exitCode = 2;
}
else {
  try {
    if (command === 'link') {
      link(flags.includes('--dry-run'), flags.includes('--claude-dir-link'));
    }
    else if (command === 'unlink') {
      unlink();
    }
    else {
      status(flags.includes('--quiet'), flags.includes('--fetch'));
    }
  }
  catch (e) {
    console.log(`own-skills: ${command} ${e instanceof Refusal ? 'refused' : 'failed'}: ${errorLine(e)}`);
    process.exitCode = 1;
  }
}
