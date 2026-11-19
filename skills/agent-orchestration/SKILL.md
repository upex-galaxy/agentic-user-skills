---
name: agent-orchestration
description: "Doctrine for running a conductor plus a fleet of persistent worker sessions (Orca by default, JITSO when the project opted in). Use when asked to orchestrate or parallelize work across sessions; to talk to, steer, check, resume or close a worker; to plan a fleet, a worker worktree or an unattended routine; or when a brief names this skill. Loads beside the vendor `orchestration` guide; not for a plain handoff with nothing back (`orca-cli`)."
license: MIT
compatibility: [claude-code, codex, opencode, cursor]
---

# Agent orchestration: one conductor, a fleet of sessions

This skill covers work that does not fit in one session. A **conductor** talks to the owner and coordinates **workers**. Each worker is a persistent agent session that owns one scope end to end, reports through a mailbox, and can be questioned, steered and resumed. A **Run** is the record of one fleet.

Everything here has a path that works with no runtime at all: the same briefs and the same prompt, pasted into terminals by a human from `launch.txt`. The runtime adds the launch step and a mailbox instead of screen-scraping.

> **You are a worker** (your prompt opens with `/<skill> <label> fleet worker`, or carries Task and Dispatch ids)? Read the filled `COMMON.md` and your `W-<label>.md`, follow your preamble, and load only `orca skills get orchestration`. Stop reading here; `references/worker-contract.md` holds the reasons if you need one.

---

## When to use

- The user asks to parallelize, orchestrate, or run one session per story, module or failure cluster.
- The user wants to talk to, steer, interrupt, question or close a session that is already running.
- The user wants the state of a fleet, or to pick up a Run from a previous session.
- An unattended routine has to dispatch work with nobody at the wheel.

## When not to use

| Situation | Use instead |
|---|---|
| a read, a verification, a map: anything that fits in this turn | one-shot subagents, the host's default executor. This is most work |
| hand one task to another agent and stop caring | a handoff (no Task, no mailbox): `orca skills get orca-cli` |
| hand this whole session to a fresh one | the project's session-handoff flow, if any |
| branch, commit, PR mechanics, or a plain worktree with no fleet | the project's git skill (in the boilerplates, `/git-flow-master`) |
| one long task, one session, no siblings | just do the task |

---

## Two gates

**Runtime gate** (three states):

```bash
command -v orca >/dev/null 2>&1 \
  && [ "$(orca status --json </dev/null 2>/dev/null | jq -r '.result.runtime.reachable' 2>/dev/null)" = "true" ]
```

The flag is nested (`.result.runtime.reachable`); a gate reading a flat field fails closed in silence (G25). On Linux outside an Orca terminal, bare `orca` may be another program: use `orca-ide`, and afterwards always the executable that `skills get` ran with.

| State | This skill does |
|---|---|
| A, no binary | say the one line below, only because the user asked for orchestration, then continue on the fallback |
| B, binary, runtime unreachable | `orca open --json` once, re-check once; still unreachable, state A |
| C, ready | full mode: conductor, worker, automation |

The one line, in the user's language: *"Subagents already give this session one-shot helpers. Persistent sessions you can talk to, with a mailbox, a board and your phone, need Orca on this machine. Without it I still write `launch.txt` with one ready-to-paste line per worker, and you open the terminals."*

Outside this skill, a failed gate costs the work nothing and nothing names the orchestrator (hard rule 10).

**Launch-mode gate** (state C only), `T=$(git rev-parse --show-toplevel)`:

| `command -v jitso` | `test -f "$T/jitso/jitso.yaml"` | Mode | Read |
|---|---|---|---|
| yes | yes | `jitso` | `references/providers/jitso.md` and JITSO's own usage skill |
| any other case | | `native` (the default) | `references/providers/orca.md` |

JITSO may not be installed, and `native` stays the default until JITSO is published and has passed an attended real Orca run. Other providers get a file in `references/providers/` and one row here; none is designed yet (`references/providers/README.md`).

---

## Modes and what each loads

| Mode | Who | Loads |
|---|---|---|
| CONDUCTOR | the session talking to the owner | this file, `references/conductor-cycle.md`, the provider file, `orca skills get orchestration`; `orca skills get orca-cli` at the first terminal or worktree verb; `references/gotchas.md` when something misbehaves |
| WORKER | each launched session | the filled `COMMON.md`, its `W-<label>.md`, its domain skill, `orca skills get orchestration` only (never `orca-cli`) |
| AUTOMATION | an unattended routine | `references/automations.md`, then this file in conductor mode |
| OWNER | the user, by chat or phone | the phrasebook below |

---

## Quick start (conductor)

1. Run both gates. State A or B: the one line, then the fallback.
2. Pick the topology from what the work writes (`references/topologies.md`) and run the claims collision check (`references/claims-protocol.md` section 5).
3. Create the scope dir: `<primary checkout>/.session/orchestration/<slug>/`, or the profile's `orchestration.scope_dir`. Seed `run.md`, `roster.md`, `COMMON.md`, `W-<label>.md` and `launch.txt` from `templates/`. Write the briefs before anything is launched.
4. Run `references/conductor-cycle.md` sections 2 and 3 with the provider file: create the worktree, provision it, launch, name, verify readiness. That is one operation (hard rule 3).
5. End your turn. Orca wakes you when mail arrives (hard rule 7). Answer each `ask` with `reply --id`.
6. Close each finished worker in the turn that processes its `worker_done` (hard rule 1, `conductor-cycle.md` section 6).
7. Harvest learnings, write `kickoff.md`, report to the owner in counts (hard rule 23).

---

## Decision tree: is this even orchestration?

1. It fits in this turn and is a read, a check or a map: one-shot subagent, stop.
2. You want to hand it away and stop caring: a handoff, not orchestration.
3. You need to supervise, wait for results, answer questions or coordinate dependencies: continue.
4. It writes code: one worktree per worker. It does not: a fleet in the same checkout.
5. Supervised workers: launch through the provider's launch verb (`native`: `worker-start --agent`; `jitso`: `jitso launch`), never a hand-typed agent command line.
6. Nobody at the wheel: `references/automations.md`.

## Executors

| | One-shot subagent (default) | Supervised worker |
|---|---|---|
| Lives | inside the turn | until it is closed |
| Context | lost when it reports | persists; you keep talking to it |
| Channel | none until it finishes | mailbox: messages, questions, replies at any time |
| Owner sees it | no | yes: board, terminal, phone |
| Best for | reading, verifying, mapping | a whole scope written and integrated on its own; long work |

The fan-out cap still applies to fleets, for a different reason: tracker and service rate limits, and how many reports one conductor can process.

---

## The owner phrasebook

The roster resolves "the one on BK-123" into a Task, a dispatch, a terminal and a worktree. Match by meaning, in the owner's language.

| The owner says | The conductor does |
|---|---|
| "how are they doing?" | `task-list` plus `worker-list --run <id> --include-remote`; one table: key, stage, state, last message |
| "tell the worker on BK-123 ..." | `orchestration send --to dispatch:<id>`; long text as a file plus a pointer. It reaches the worker when its current turn ends |
| "ask W2 whether ..." | a message to that dispatch, then end the turn |
| "what is X doing?" | `worker-read` by dispatch; the screen only as backup |
| "tell it yes" | `reply --id <message id>` |
| "launch another one for ..." | Task, worktree, launch, name, readiness: one operation |
| "pause X" | an interrupt into its terminal (raw input), then read the screen |
| "close X" | the close sequence (`conductor-cycle.md` section 6) |
| "pick up last night's Run" | re-sync from `run.md` (`conductor-cycle.md` section 8) |

---

## Hard rules

The numbers are stable because other files cite them.

1. Close a finished worker in the turn that processes its `worker_done`: verify integration, read the worker's cost (native: the screen footer; JITSO: the `tokens:` line `jitso close` prints; see the provider reference), release, confirm the terminal is gone, audit orphans, remove the worktree. Live worktrees left open have taken the runtime down (G31).
2. Provision the worktree before launching, with the project's own provisioning step. A missing step disguises itself as another failure.
3. Create the worktree, launch, name, and verify that the spec landed: one indivisible operation. A worker once sat idle for hours because its brief never arrived (G32).
4. The channel is an assignment. `orchestration send` carries every message between sessions; anything longer than a couple of sentences goes in a file with a one-line pointer; `terminal send` carries raw terminal input only (a command, a slash-command, an interrupt), never conversation and never a first prompt (G60, G64, G66). `references/channel-discipline.md`.
5. Launch each tier in the permission mode the profile declares, never an edits-only mode: it leaves every command waiting on an absent human (G27). Verify the worker's mode at readiness. With no profile, impose nothing: record the mode in the roster and report `auto` or edits-only as a stall risk.
6. Handle each `check` batch whole before the next. A consuming `check` marks its batch handled; there is no ack step.
7. Start the workers and end your turn: Orca wakes you. Never poll and never build a monitor; a script that watches the mailbox uses `--peek`, or it takes your mail. Where a turn must stay open, one `check --wait` window of at most 540 s, because the harness kills a foreground command at 600 s (G51).
8. A worktree-wide close has worktree radius: count the terminals first, and close one terminal by its handle.
9. A base-ref flag resolves local refs: verify the new worktree's SHA against the remote base, with nothing hiding the failure (G20).
10. A failed gate costs the work nothing. Outside this skill nothing names the orchestrator, lists it as a prerequisite or reports its absence.
11. Text typed into a terminal and not submitted is not an instruction.
12. One dev server and one browser per worktree; close every browser-automation session before reporting (G37).
13. No repo-wide discards in a shared checkout: another session shares the tree. Restore only paths you changed in this session.
14. Commits follow the project's git skill; this skill defines no trailers. No AI attribution.
15. A stage boundary is not a checkpoint. Prompt and brief both say: run every stage until `worker_done`. The one stop is ending the turn right after an `ask` (G58).
16. "My measurement contradicts the conductor" is a mandatory `ask` with both readings and the evidence. Never comply silently, never deviate silently.
17. A success code describes the call, never the outcome: verify at the destination (G11, G60, G64, G67, G68).
18. `ok: false` on a `terminal send` means a human is typing in that terminal. Do not retry; wait, then read the screen (G65).
19. A message that begins mid-sentence is a truncation until proven otherwise. Ask for the pointer; do not answer the fragment (G64).
20. A name is not an address. Sign briefs, reports and mail with `ORCA_TERMINAL_HANDLE` plus the Run id; handles change after a resume, the Run id is the stable part (G69, G70, G85).
21. The channel carries no identity: a recipient that cannot identify the sender from the payload asks instead of inferring (G69).
22. A conductor decides scope; a worker decides execution. Anything that widens the brief (a new file owner, another ticket, a shared fixture) stops and escalates.
23. A report is a count, not a narrative: passed, remaining, blocked and on whom, then prose if at all (`references/standby-report-contract.md`).
24. A session launched by another session never asks the human. Errors, blockers and the four decision kinds (product behaviour, a new security posture, an irreversible or outward action, what a person signs) go to its launcher; a technical call inside its brief is its own, reported as DECIDED (`references/worker-contract.md` rule 16).
25. No periodic heartbeats: each one wakes the conductor to read the word "alive". A worker sends `worker_done`, `ask`, `escalation`, and nothing on a schedule (G34).
26. The profile holds defaults. An explicit user instruction in the conductor session overrides them for that run; do not ask the user to confirm a default they never mentioned.
27. In `jitso` mode only `jitso launch` starts a session. Never type `worker-start` or a harness command line there: the JITSO hook denies it, and an unlogged worker has no card.

---

## Brakes and the decision log

Every automatic trigger speeds the fleet up, and a fleet without brakes produces fast, unreviewed output. Three brakes apply to what a routine or a worker produces: the project's own automated gates; a cold review by a reader that did not write the work; a person reading the result before it merges or ships, which never makes a run wait. Add one automatic trigger at a time, throttled. Cap any loop at three tries, then report `BLOCKED: `. A fix run never chains.

A routine, and any worker that runs long or past a person's attention, keeps a decision log in the scope dir (`decisions.tsv`, or `decisions-<label>.tsv` per worker): one row per decision, evidence as a pointer. Use the `show-me-your-work` skill; without it, keep its six columns by hand (`ts`, `phase`, `decision`, `why`, `evidence`, `result`). A failed append is reported and the run goes on.

---

## Defaults: the project's profile

When the project has a profile (its `.agents/project.yaml` `orchestration:` block, when present), the conductor reads these keys by path. Without one, it uses the user's instructions and records what it chose in `run.md`.

| Key | Applied |
|---|---|
| `max_workers` | the cap per round; an ad-hoc single job still counts while live |
| `default_agent`, `default_model`, `default_effort` | the worker tier: `worker-start --agent / --model / --effort`, or the `launch.txt` line. A full model id, never an alias (G29) |
| `conductor_model`, `conductor_effort` | a conductor another conductor launches |
| `permission_modes` | the mode per tier (`conductor`, `worker`, `subagent`), translated per harness in `references/machine-setup.md` |
| `model_overrides` | entries matched against a brief's topics; a match replaces the tier default for that brief |
| `scope_dir` | the scope root instead of `<primary checkout>/.session/orchestration/` |

A round is one concurrency group, up to the cap. "Wave" belongs to a workflow's own status buckets; never reuse it for concurrency.

---

## The fallback, in full

With no binary, only who launches and how state is read change:

| Step | Fallback |
|---|---|
| plan, brief | identical: same topology, same claims check, same files |
| launch | the human pastes the `launch.txt` lines into N terminals; the file is written on every path |
| identity | a pasted Claude Code line names the session with `-n`; elsewhere the human types the harness rename verb (`references/session-identity.md`) |
| state | the workflow's own blocked-state tokens and the tracker |
| questions | the worker writes them in its report with options and a recommendation, and keeps going on what does not depend on them |
| close | the human closes the terminals |
| claims | the append-only ledger (`references/claims-protocol.md` section 6), smaller rounds |

The prompt is identical on both paths, down to its opening token and its no-stopping sentence: the path nobody exercises is the one that breaks in silence.

---

## Distinctions

| Frequent confusion | What is true |
|---|---|
| installing the vendor guide enables orchestration | no: the binary carries the commands and serves its own guide; the gate is on the binary |
| a harness worktree equals an Orca worktree | no: the harness one is invisible to the board and the phone and has no managed terminal |
| idle means finished | no: idle means ready for input; finished means `worker_done`. Liveness comes from `worker-list` and its `next` (G55) |
| mail cannot reach a busy worker | it can: it arrives when the worker's current turn ends; a finished worker gets it as a follow-up Task (G46) |
| a context-only dispatch is supervised | no: it is unsupervised on purpose, and the release verbs do not close it (G19) |

## Conscious deviations from the vendor guide

| Guide says | This skill does | Why |
|---|---|---|
| let `worker-start` create the worker's workspace | the conductor creates it (fetch, SHA check, provisioning) | a base born stale or unprovisioned fails later in disguise (G20, G21) |
| add `--model` only if the user named one | pin the profile's full model id | the profile is what the owner named; an alias moves on its own (G29) |
| finished workers close on their own | native workers start with `--keep-open` for now | the cost footer must be read before the terminal closes (`references/providers/orca.md`, Close) |
| never steer through a worker's terminal | `terminal send` only for raw input (`/rename`, `/mcp`, an interrupt) | a worker cannot run its own harness slash-commands (G76, G83) |

---

## First-run setup

Once per machine: `references/machine-setup.md` (binary and runtime, the per-agent permission setting, the Claude Code bypass dialog, optional pairing, optional JITSO). Once per project: its profile keys and its provisioning step, written by the project, not by this skill.

## References

| File | Holds |
|---|---|
| `references/conductor-cycle.md` | the conductor's cycle: scope files, launch order, readiness, mail, liveness, close, conductor-only operations, re-sync, harvest |
| `references/providers/orca.md` · `providers/jitso.md` · `providers/README.md` | the commands per mode, and the interface a future provider answers |
| `references/worker-contract.md` | the sixteen worker rules and their reasons |
| `references/channel-discipline.md` | which verb carries what, reading a send result, pointer files |
| `references/claims-protocol.md` | claims over shared data, arbitration, the no-runtime ledger |
| `references/topologies.md` | topology by what the work writes, git rules, sizing a round |
| `references/brief-template.md` | the 7-component brief, the fleet fields, the prompt shape |
| `references/standby-report-contract.md` | what a session emits when it stops |
| `references/session-identity.md` | naming per harness, the label rule, the crash case |
| `references/automations.md` | unattended routines: lock, cap, report, brakes |
| `references/machine-setup.md` | the one-time machine checklist |
| `references/gotchas.md` | the dated ledger of measured gotchas (`gotchas-archive.md`: retired rows, loaded by nobody) |
| `templates/` | `run.md`, `roster.md`, `COMMON.md`, `W-brief.md`, `launch.txt` |

Vendor grammar lives in the binary: `orca skills get orchestration [--reference <name>]`, `orca skills get orca-cli`, `orca <command> --help`.
