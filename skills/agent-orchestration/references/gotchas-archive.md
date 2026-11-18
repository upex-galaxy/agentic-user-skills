# Gotchas archive (history only)

Loaded by nobody; history only. Rows here were true on the version and date given and no longer drive behaviour. The live ledger is `references/gotchas.md`. Ids are never renumbered.

---

## Whole rows retired

| # | Gotcha | Symptom | Fix | Measured | Verified against |
|---|---|---|---|---|---|
| G1 | **An unacknowledged batch replays forever** and hides everything queued behind it. Delivery is FIFO and a bound Run replays the same batch until it is acked | a `check` returns a message you recognize from 20 minutes ago | ack in the SAME command that re-arms the wait: `check --ack <id> --wait --types ... --timeout-ms ...`. Leave no window in which the ack can be forgotten | 2026-09-04, a downstream project: a wave-1 status reappeared at the head of the queue while wave 2 was already launched, and wave 2's first reports were invisible | 1.4.190 (superseded: a consuming `check` marks its batch, no `--ack` needed) |
| G2 | **An unacked batch also kills the notice.** The runtime notifies only on empty to non-empty, so once mail is unread it never notifies again | four messages accumulate for hours and the conductor believes the mailbox is quiet | verify every ack (`acknowledged` equals the id requested, pending count drops) and do not put it in a compound command whose exit code gets swallowed | 2026-09-14, a downstream project: an ack inside a compound command exited 1, nobody checked | 1.4.190 (superseded with G1) |
| G3 | **A Run admits exactly ONE actionable waiter**, and an orphaned one blocks the mailbox. A waiter started with a shell `&` holds the slot with nobody listening | `check` returns a failure naming an existing waiter instead of a batch. A quiet mailbox and a blocked one look identical | arm the waiter as a tracked foreground/background TASK, never with `&`. Recover by locating and killing the stale `orchestration check` process, then re-arm | 2026-09-04, a downstream project | 1.4.190 (superseded: several `--wait` calls may wait on one inbox) |
| G45 | **Retired (2026-10-05): the shell-hook environment loader was retired from the boilerplate, so no worker credential depends on a shell hook any more.** Every MCP server reads the worktree's own `.env` through its loader, and every other process loads its own config; nothing exports a secret into a worker's shell | none (retired) | provision the worktree's `.env`, restart the session after every `.env` change, and VERIFY the worker's MCP servers connected on its screen before dispatching work (`references/machine-setup.md`) | 2026-09-17, a dogfood fleet: the shell-hook seam measured. 2026-10-05: retired | 1.4.190 |

---

## Lies in the vendor guide (verified by hand, 2026-09-17, 1.4.190)

| The guide said | Reality | Checked |
|---|---|---|
| use `check --unread --inject`, recommended twice | **`--inject` does not exist on `check`.** The runtime answers with an unknown-flag error; `--inject` lives only on `dispatch` | 2026-09-17, v1.4.190 |
| `coordinator-start` / `coordinator-stop` appear in `--help` with all their flags | **retired**: both are no-ops that return a recovery action and perform no effect. The schema now says so in its own notes | 2026-09-17, v1.4.190 |
| `skills get --reference` / `--references` | **rejected** on 1.4.190. Valid flags were `--full`, `--json`, `--topic` (plus the global ones) | 2026-09-17, v1.4.190 |

The fourth row (`task-create --deps`, element shape undocumented) lives on in G8.

---

## Superseded texts (the new text is in the ledger under the same id)

| # | Old gotcha | Old symptom | Old fix | Measured | Verified against |
|---|---|---|---|---|---|
| G44 | **A custom-argv terminal can NEVER be supervised.** The runtime decides "is this an agent" from the argv IT launched, never from the running process, so `worker-start --terminal <handle>` answers `agent_unconfigured` on a terminal whose agent TUI is demonstrably alive on screen | the adoption step fails on a perfectly healthy worker, and the whole fleet runs unsupervised without anyone deciding that | supervision requires the NATIVE path (`worker-start ... --agent`). A terminal created with our own command line is unsupervised BY CONSTRUCTION: plan its cleanup by handle and its blockers as `status` (G53) | 2026-09-17, a dogfood fleet, measured three ways on three live terminals: with a wrapper script, with the bare binary, and with no env prefix at all. Neither the wrapper nor the env prefix is the cause | 1.4.190 |
| G46 | **`orchestration send --to <terminal handle>` never reaches a busy agent.** It queues mail nothing tells the worker to read, and **both it and `terminal send` return `ok: true`**, so the useless call is indistinguishable from the useful one | the worker works on, oblivious; the conductor believes it delivered | the only verb that reaches a RUNNING session is `terminal send`. Mailbox addresses (`run:<id>`, `dispatch:<id>`) are for messages a worker will `check`, never for a nudge | 2026-09-17, a dogfood fleet: the preamble pointer was sent the wrong way first and had to be resent | 1.4.190 |
| G57 | **The first `worker_done` revokes the Dispatch, and everything addressed to it afterwards bounces.** `capability_revoked_at` is stamped at that moment | a question the worker raised BEFORE finishing can no longer be answered (`reply` returns `dispatch_inactive`, code and message, not a warning), and a second `worker_done` comes back as `Rejected worker_done: ... capability is revoked` even though the worker kept working and produced real output | answer a worker's questions BEFORE it settles, and read a settled worker's later output from its report and its screen, never from the mailbox. A worker that keeps working after `worker_done` is not misbehaving; it has simply lost its channel | 2026-09-18, a dogfood fleet (a 04:21 question answered at 05:1x: refused; the 04:49 `worker_done` rejected) | 1.4.190 |

---

## Dropped as vendor-covered

G5, G13, G14, G16: covered by `orca orchestration check --help` / `orca terminal read --help`.
