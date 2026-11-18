# Topologies: One Shape per Kind of Work

> Loaded by the conductor at triage. The question is "what does this work write", not "how many
> workers": that decides whether a shared checkout is safe.

---

## 1 · Decide by what the work writes

| The work writes | Topology | Isolation |
|---|---|---|
| only tracker artifacts or notes | **fleet in the SAME checkout**, one worker per item (or per 2-3 coupled items) | per-worker browser session and output dir, a file-ownership list. A worktree per item is pure cost |
| code, in separate modules | **one Orca worktree per worker**, one worker per MODULE; items sharing a module run in sequence inside that worker | own checkout, branch and PR. Two sessions in one checkout collide on the git index even on disjoint files |
| code, in one tree that cannot be split | same checkout with **explicit file ownership** and pathspec commits, or a worktree per wave when two workers must touch one module (G43) | the `File ownership` list in each brief |
| fixes for scan failures | one worker per real failure CLUSTER, each in a worktree | three failures with one root cause are ONE worker |
| reads only (mapping, discovery) | **not a fleet**: one-shot subagents | none |
| unattended routines | automation over an EXISTING workspace | `references/automations.md` |

Rule of thumb: if the task touches files another live session is touching, use a worktree; if not,
use the shared checkout. Never two workers on one module, in a round or across worktrees.

## 2 · When a worktree

Create an Orca worktree when ANY is true: the work commits code or runs a generator that rewrites
tracked files; it needs its own branch and PR; it writes into a shared build directory; two live
sessions would share one git index. Stay in the shared checkout only when ALL are true: the output is
tracker artifacts and notes, an ownership list partitions its files, and nothing it runs writes to a
shared build directory. "Worktree" means an Orca worktree: the harness's own feature is invisible to
the board and has no managed terminal. Mechanics: the project's git skill.

## 3 · Git rules per topology

**Same checkout**: stage explicit paths (`git add -A` stages another worker's half-finished edit);
commit with a pathspec, `git commit -F <message-file> -- <path>`; re-read each file right before
editing; on `index.lock` wait about 5 s and retry; restore only paths YOU modified this session; the
conductor regenerates whole-repo generated files once, after the round.

**Own worktree**: `git fetch origin`, then verify the worktree's SHA against `origin/<base>` (a
base-ref flag resolves LOCAL refs, so it can be born behind). Merge the base additively; never rebase
or amend anything pushed. Push your branch only and open the PR the project's git strategy asks for.
A base branch held by the primary checkout cannot be checked out in a worktree: a worker "on the
base" is in the primary checkout, where a worktree-wide terminal close has extra radius, so count
terminals first. Integrate, verify, release the worker, orphan audit, remove the worktree
(`references/conductor-cycle.md`).

## 4 · Sizing a round

- The cap is the profile's `max_workers` (its `.agents/project.yaml` `orchestration:` block, when
  present); an explicit user instruction overrides it for that run.
- A round is concurrency; a wave is a status bucket. Keep the words apart.
- The ceiling is usually tracker rate limits and reports processed per turn.
- A single urgent job runs as N=1 outside the rounds and counts against the cap while live.
