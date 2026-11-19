# Conductor cycle

Loaded by `agent-orchestration` in CONDUCTOR mode, with the provider file the gate picked (`references/providers/orca.md` for `native`, plus `references/providers/jitso.md` for `jitso`). This file is provider-neutral: the order, the decisions and the traps. Commands live in the provider file. Vendor grammar lives in `orca skills get orchestration` and `orca orchestration <verb> --help`; read those, do not copy them here.

---

## 1 Scope and run files

The scope directory holds everything the fleet needs to survive a crash. Default: `<primary checkout>/.session/orchestration/<slug>/`, where `<slug>` names the wave of work (kebab-case, dated when it repeats). The project's profile key `orchestration.scope_dir` (its `.agents/project.yaml` `orchestration:` block, when present) overrides the default. Never ask the owner for the path.

Everything written inside a worktree dies with it. The scope lives in the PRIMARY checkout, and a worker reaches it by an absolute path in its prompt, never a relative one. Seed the files from `templates/`.

| File | Owner | Holds |
|---|---|---|
| `run.md` | conductor | Run id, objective, conductor handle, created-at, base branch, topology, launch mode, scope path, decision-log path |
| `roster.md` | conductor | one row per worker (label, task, dispatch or launch id, terminal, worktree, agent, model, verified mode, name, resume command, status, cost) |
| `COMMON.md` | conductor | the common brief every worker reads first |
| `W-<label>.md` | conductor | the per-worker brief |
| `launch.txt` | conductor | one self-contained launch line per worker, ALWAYS written (the fallback path for a human paste) |
| `claims.md` | conductor | the claims ledger (`references/claims-protocol.md`) |
| `reports/<label>.md` | that worker | the long report; `worker_done` points at it |
| `kickoff.md` | conductor | the handoff pointer for the next conductor |
| `learnings.md` | conductor | facts about the system or repo the next wave needs |
| `skill-improvements.md` | conductor | gaps in the skills this wave exposed |
| decision log | conductor | every decision and every owner answer (section 4) |

One owner per file: two writers on a same-checkout file collide. A worker writes exactly one file, its own report. `<label>` is the roster label, `[<KEY>-]<slug>`, kebab-case.

The roster is what makes every later step possible: without the dispatch or launch id you cannot address a worker, without the terminal you cannot read or close one, without the name and the resume command you cannot bring one back. Update a row the moment a value is issued; add the worker's cost when you read the footer at close.

---

## 2 Launch order

Order matters. Steps 5 to 9 are one indivisible operation: splitting them is how a worker ends up idle for hours or unnamed (G32).

1. **Triage.** For each unit of work ask what it writes (`references/topologies.md`), then fix the topology and the worker count. A unit that does not need a worker goes to a subagent.
2. **Topology.** Same checkout, or one worktree per worker. Record it in `run.md`.
3. **Claims check.** Before any launch, check the claims ledger for overlap with work in flight (`references/claims-protocol.md`).
4. **Briefs first.** Write `COMMON.md` and every `W-<label>.md` before launching anything. The task spec cites them by absolute path, and on the native path the spec is the worker's first prompt, so it must be self-sufficient (`references/brief-template.md`, `references/providers/orca.md` "First prompt").
5. **Worktree, created by the conductor.** Create it just before launch (one made half an hour earlier is born stale), then:
   - fetch the remote;
   - fast-forward the worktree to the remote base;
   - verify the worktree HEAD equals the remote base SHA. Never mask the check with `|| true`: a stale base is the quiet failure.
6. **The project's provisioning step.** A named generic step: whatever makes a fresh worktree able to work (dependencies, env files, generated artifacts, caches, trust prompts). The project's profile or its own setup notes name it. Run it before the launch, and read it back.
   **A missing step disguises itself.** A worktree that lacks something does not fail loudly: the worker burns its first hour on an error that looks like its own code. When a worker's first symptom is strange, suspect provisioning before the brief. Checklist for any project, each item verified, never assumed:
   - dependencies installed and runnable;
   - the env or credentials file the project needs is present (presence only, never its content);
   - generated or gitignored files the project needs exist;
   - git identity and hooks behave as in the primary;
   - nothing the worker needs lives only in the primary's gitignored files.
7. **Launch.** The provider's launch (`providers/orca.md` or `providers/jitso.md`): Task, worker start, ids into the roster.
8. **Name.** Tab and session name `<label>--<handle>` as the provider file says; the handle exists only after launch.
9. Run section 3 before the worker receives anything more.
10. Board card, then end the turn (section 4). `launch.txt` is written in step 4 even when the provider launches natively; its prompt stays byte-identical to the spec.

Put `</dev/null` on every scripted Orca call: the binary reads stdin when attached and a loop or background shell then hangs with no output (G4).

---

## 3 Readiness

Verify on the worker's own screen, not from a receipt. Send no further work until all four hold:

| Check | Pass |
|---|---|
| Name | tab and session name read `<label>--<handle>` (or the harness's own naming, marked `(roster only)` when it cannot be set) |
| Permission mode | the mode shown (status bar, or the process argv) equals the profile's mode for the worker tier; record it in the roster `Mode` column. No profile: impose none, read and record the mode, and report `auto` or an edits-only mode as a stall risk (G27). A mismatch means the app's per-agent default arguments are wrong: fix them (`references/machine-setup.md`) and relaunch |
| Credentials | the worker's tool servers show as connected on its own screen (for example `/mcp` on Claude Code), and the worktree holds its env file. Readiness is not capability. Missing: provision, restart the session, send nothing until they show |
| Spec landed | the worker is executing its brief (it names the brief or has started stage one), not idle at an empty prompt. An empty prompt means the first prompt did not land: read the provider file before resending anything (G52) |

A worker that fails a check is relaunched or repaired before any work is sent.

---

## 4 Mail and decisions

The conductor starts its workers and ENDS ITS TURN. Orca wakes it when mail arrives. Do not poll, do not build a monitor; a watcher that only observes uses `--peek` and never takes the mail. The only exception is one `check --wait` window of at most 540 s where a turn must stay open (the harness kills a foreground command at 600 s, and a foreground `sleep` is blocked, G87). A timeout is not a dead mailbox.

**Handle each batch whole.** A consuming `check` marks the batch it returns; the next one returns newer mail. Read the whole batch, answer every question, decide each terminal's fate, then end the turn. A lost response is reissued with `--retry-request`, never re-sent.

**Answering `ask`.** A worker's `ask` returns at once and the worker ends its turn; Orca wakes it with the answer. Reply with `orchestration reply --id <message_id> --body "<text>"` using the id from the pending batch. A substantive answer goes in a file in the scope with a one-line pointer through `send`, and the worker states the decision back in its own words before acting (`references/channel-discipline.md`). A pending question is resumed, never re-asked.

**The escalation relay.** A worker sends you everything that needs a person (a question, an error or blocker it could not clear inside its brief). A worker never asks the human; only the session the human types into does. For each item:

1. A technical call inside the approved plan is yours: decide, reply, and report it as DECIDED with the option it beat.
2. Anything else goes to the human, informed: what the record says, the options with value and cost, one recommendation. A small item waits for the end-of-turn sweep; a heavy one goes in an `mkd` deck; one that blocks a worker goes at once.
3. Reply by message id so the worker's `ask` resolves, and record the question and the answer in the run's decision log.

A worker that reports it asked the human directly gets the same log entry. A conductor launched by another conductor relays upward to its launcher the same way.

---

## 5 Liveness

Run a sweep at a round boundary or when the owner asks, never as a background monitor.

1. `worker-list --run <id> --include-remote` and follow its `next`. It gives each worker's terminal accounting and liveness; a completed Task can still own a live terminal.
2. Silence alone proves nothing: a quiet worker may be thinking, parked on a prompt only a human can answer, or done. A timeout or `unverifiable` liveness never authorizes autonomous stop, retry or release.
3. A screen read is an aid for a worker that answers nothing (a hung selector shows no message). The prompt box is always drawn, so the prompt character proves nothing (G55).
4. After a runtime restart or a session resume, handles change (G22, G85): the Run id is the stable part. Re-issue the tab rename and the session name per `references/session-identity.md` (the rename sweep), once per restart, and update the roster before the next message.

A worker mid-`ask` is waiting, not stalled. To steer a working or finished worker use `send --to dispatch:<id>` (`references/channel-discipline.md`); never nudge through the terminal.

---

## 6 Close

In the turn that processes a `worker_done`, in this order. The commands are in the provider file ("Close"): `providers/orca.md` for `native`, `providers/jitso.md` for `jitso`.

1. **Integration verified.** Commits landed (`git cherry`), the PR opened where the strategy asks, tracker artifacts in their declared status. A released worker whose work never integrated cannot be recovered from the board.
2. **Cost.** Native: read the cost footer and put it in the roster; it exists only on the worker's screen. JITSO: no footer exists, take the `tokens:` line `jitso close` prints (`providers/jitso.md`, "Close").
3. **Release.** One release, per the provider.
4. **Terminal gone.** Verify it, never assume (a success code describes the call, not the outcome).
5. **Orphan audit.** Removing a worktree deletes everything gitignored inside it, silently, exit 0. Before removal:
   - `git -C <wt> status --porcelain`: uncommitted work is committed or copied out;
   - `git -C <wt> cherry -v origin/<base>`: unintegrated commits are pushed or integrated;
   - the project's own audit of gitignored state (its setup notes), when it has one: STATE worth keeping is rescued to the primary, never overwritten;
   - will anyone resume this worker's session? A harness finds sessions by working directory, so a removed worktree takes the resume command with it. Keep the worktree while a resume is possible, else mark the row `resume: gone (worktree removed)`.
6. **Worktree removal.** Part of closing, not a later chore: a release closes only the agent terminal, so the worktree and its branch pile up otherwise.
7. **Stays only with a reason.** A worktree or terminal that stays has a written reason and an owner in the roster. A worktree some other session created, one not in your roster, is not yours to remove: report it. Before the final report the worktree list shows only the primary plus what the roster explains; anything else is a leak.

---

## 7 Conductor-only operations

A fleet has one writer for anything shared. These are never delegated:

- **Credential and token minting.** Authenticate and mint before launching; workers only read the result. Use per-worker isolation where the login supports it, so one refresh cannot invalidate another worker's token.
- **Schema or tracker sync** at fleet altitude: the plan-level pull and push, cache hydration. A worker reads its own item and does not re-hydrate the whole cache.
- **Regenerating whole-repo generated files** (registries, manifests, lockfiles) that every worker would otherwise rewrite: regenerate once at integration.
- **Arbitrating claims** (`references/claims-protocol.md`).

---

## 8 Re-sync and handoff

A Run outlives its session. After lost context, a restart or a takeover, take the Run id from `run.md`, not from the run list (Runs from other repos coexist on one machine), then:

1. `run-use --id <run_id>`, and `run-current` to see what this terminal is bound to.
2. `inbox --terminal run:<id> --limit 50 --full`: mail `check` already handled.
3. `worker-list --run <id> --include-remote`.
4. `task-list --run <id>`.
5. Roster against `terminal list`: every roster terminal exists, every terminal in the worktrees is explained. Kept-open workers are listed and decided (release or keep with a reason).
6. A lost mutation: `request-show` for its request id; a lost `check` or other call: `--retry-request <id>`, never a fresh call that repeats the effect.

`kickoff.md` is the handoff pointer, written by the outgoing conductor and loadable as is: Run id, topology, rounds closed, what is in flight with ids, open claims, the next decision waiting for the owner, absolute paths of the scope files. One file, no archaeology. Sign messages with `ORCA_TERMINAL_HANDLE` plus the Run id.

---

## 9 Harvest

Three files in the scope, one owner each, appended and never rewritten.

| File | Goes in | Does not |
|---|---|---|
| `learnings.md` | facts about the system under work that the next wave needs | per-worker narrative |
| `skill-improvements.md` | gaps in the skills: a missing step, a wrong order, a stage with no verifier | product bug reports |
| `kickoff.md` | the handoff pointer | a diary |

At the close of the wave, call the `retro` skill when installed: give it the run's scope and have it write ranked candidates into `learnings.md` and `skill-improvements.md`, applying none. Not installed: harvest inline from the same two files and say so in the report; it never blocks the close. Then report to the owner: outcomes per worker, evidence, costs, open blockers, what you did not verify. Neither file is a deliverable; anything the team needs lives in the project's tracker.
