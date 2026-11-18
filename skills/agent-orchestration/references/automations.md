# Automations: unattended routines

> Loaded by the conductor in AUTOMATION mode and by whoever registers a routine. A scheduled
> automation runs a prompt on a trigger inside a workspace, with nobody watching or answering: a
> conductor that dispatches and does not produce. The grammar of `orca automations` is the vendor's:
> `orca skills get orca-cli --reference automations`.

---

## 1 · The boundary: the dispatcher never produces

An unattended routine stays reviewable because it never becomes an author. This sentence goes into
every routine's prompt word for word:

> You produce no artifact. Not a draft, not a plan, not a test case, not a report body. You create
> the worker that produces, and you close your session. If you catch yourself writing the deliverable,
> you have left your task.

An automation also publishes nothing, approves nothing on the owner's behalf, invents no work and
commits nothing. When something is ambiguous it neither waits nor guesses: it parks the item, with
the question a person would need to answer, and moves on. What it may decide alone is the project's own decision rule; the four kinds of
`references/worker-contract.md` rule 16 are always parked. The run report states the run's token
cost, even when empty: it decides whether the cadence is right.

---

## 2 · Run discipline

Unwatched failures are quiet: two runs on one item, more workers than anyone approved, a dead run
that leaves workers nobody knows about, a fix that triggers a fix. These rules live in the prompt.

### 2.1 · One lock per routine, never a queue

A manual `orca automations run` fires at once even when a scheduled run is live, and the precheck
gates scheduled runs only, so two fires can overlap on the same item. The lock lives in the prompt:
`lock.json` in `automations/<routine>/` under the scope dir (`references/channel-discipline.md` §3),
so a fresh worktree per run still sees the last fire's lock.

```json
{ "routine": "<slug>", "automation_id": "<id>",
  "owner": "<ORCA_TERMINAL_HANDLE> / <Run id, once created>",
  "started_at": "<ISO-8601 UTC>", "refreshed_at": "<ISO-8601 UTC>",
  "stale_after_minutes": "<copied from the prompt>" }
```

Take it with an exclusive create (`set -o noclobber` before the redirect), then read it back: the lock
is yours only when the file names your handle. Then decide:

| What is on disk | What the run does |
|---|---|
| no lock | create it, read it back, continue |
| refreshed less than `stale_after_minutes` ago | another fire owns the routine: exit with a one-line report naming the owner and start time. Do not wait or retry; the next fire is the retry |
| older than `stale_after_minutes` | the writer died. Reclaim (remove, create no-clobber, read back) and record whose lock, how old, and the dead run's report path: a silent reclaim erases the evidence |
| the prompt declared no window | treat it as live and exit as above: a missing window fails closed |

Rewrite `refreshed_at` at every step boundary and delete the file as the last step, even for a run
that parked everything. A file lock fits here: between two fires no
conductor is awake to arbitrate (unlike `references/claims-protocol.md`).

### 2.2 · A cap on the workers one run opens

At most the profile's `max_workers` in total (its `orchestration:` block, when present), in one
round, unless the prompt declares a lower cap. Items beyond it go in the report as deferred, in the
order the next fire should take them. A second round is what a person approves.

### 2.3 · An empty run is a correct outcome

Nothing eligible: say so and end. The report lists what was considered, why each item was dropped,
and the token cost. Picking a marginal item to fill the report spends a worker on work nobody asked for.

### 2.4 · Write the report as you go

`report-<YYYY-MM-DD-HHMM>.md` next to the lock, one line at every step boundary: items selected and
dropped, each worker opened (item, handle), each closed and its outcome. A report written only at the
end dies with the run and loses the handles of workers left running. A run that reclaims a stale
lock lists in its own report every worker the dead run opened and never closed, and does not close
them: they may still be working, and that is the owner's call.

### 2.5 · The deployed environment is truth

A tracker status says what someone moved, not what the environment runs: a ticket can sit "ready"
while the target build lacks its merge. A routine whose work depends on a deployed build checks the
target environment before opening a worker. Not contained: drop the item and put both build ids in
the report. Unverifiable: send it with the gap named in the brief. Triage names the build tested.

### 2.6 · Three brakes, and a fix never starts a fix

Everything an unattended run produces passes three brakes in order; a run that cannot pass one
reports instead of pushing on:

1. **Checks**: the output passes the repo's own gates before it counts as done. A failure is a
   result to report, never something the dispatcher repairs.
2. **Automatic review**: a reviewer worker that did not write the output reads it against the brief.
   The author never reviews itself; the review is one more worker under the cap (§2.2).
3. **Human review**: a person reads the result later. The routine never waits on it and takes no
   outward or irreversible action that depends on it: merging, publishing and judgment-needing
   writes stay parked in the report.

A fix run never triggers another fix run. When a worker opened to fix a failure fails the brakes, the
run reports the failure and the attempt and stops: the next fire, or a person, is the retry.

---

## 3 · The four gotchas

1. **The prompt is a pointer to a file.** Registering a copy freezes the text at creation, so a later
   edit to the file changes nothing. Register one short line instead: read the versioned routine
   file by absolute path and follow it. If a copy was registered, re-sync it by hand and verify.
2. **Use an existing workspace** when the routine reads or writes state outside git: a fresh one per
   run lacks it and the routine reprocesses everything forever. Pass the selector at creation.
3. **Cost per wake-up is real.** An empty run still costs a full model turn. The daily floor is runs
   per day times the measured cost of one empty wake-up: measure it once per routine, from its own
   run log, before choosing a cadence. A precheck divides the floor by the wake-ups it skips; daily
   pays it once, at the price of up to a cadence of latency.
4. **Session reuse is opt-in, existing-workspace routines only.** Reuse keeps context and its drift;
   a fresh session keeps determinism and re-reads everything.

---

## 4 · Checklist before registering a routine

- [ ] The prompt is a pointer to a versioned routine file, and that file is the source of truth.
- [ ] It contains the "dispatcher never produces" boundary, verbatim.
- [ ] It runs against an existing workspace when it reads out-of-git state, at a cadence its measured
      wake-up cost justifies.
- [ ] The prompt takes the lock first and declares `stale_after_minutes`, above the longest run in
      the routine's history (§2.1).
- [ ] It names its worker cap and where deferred items go (§2.2).
- [ ] It says nothing eligible is a correct outcome, reported (§2.3).
- [ ] The report is written at every step boundary and carries the token cost (§2.4).
- [ ] Ambiguity has a destination that is neither "guess" nor "wait": a parked item, named in the
      prompt. No `ask`: nobody will answer.
- [ ] Anything that selects work against a deployed build checks the environment first (§2.5).
- [ ] The three brakes and the no-chained-fix rule are in the prompt, and every outward or
      irreversible action is parked for a person (§2.6).
- [ ] The close-out is explicit: every worker released, every worktree it made audited for orphans
      before removal (`references/conductor-cycle.md`); a leaking routine takes the runtime down (G31).
- [ ] It was fired manually once and its output reviewed before the schedule was enabled.
