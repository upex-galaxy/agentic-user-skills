# Providers

A provider file says how one launch mechanism carries the conductor cycle (`references/conductor-cycle.md`). It names commands, never doctrine. The skill ships two: `orca.md` (`native`, the default) and `jitso.md` (`jitso`, which rides on Orca).

## The interface: 13 questions every provider answers

1. Gate: how to detect it is installed and that the project opted in.
2. Runtime: which mailbox, Run and Task store it rides on.
3. Launch: inputs, the ids it returns, which go in the roster.
4. First prompt: how the brief reaches the worker.
5. Naming: tab and session name.
6. Model, effort, permission mode: who sets them and how to verify.
7. Messaging both ways, and sender identity.
8. Questions: how a worker asks and how the answer wakes it.
9. Waiting: how the conductor is woken.
10. Liveness: the proof a worker is alive or gone.
11. Close and cost capture.
12. Re-sync after lost context or a restart.
13. What it forbids, and where its own gotchas live.

## The gate

State C (binary present, runtime reachable) first; then, with `T=$(git rev-parse --show-toplevel)`:

| `jitso` binary on PATH | `$T/jitso/jitso.yaml` exists | Mode | File |
|---|---|---|---|
| any | no | `native` | `orca.md` |
| yes | yes | `jitso` | `orca.md` then `jitso.md` |
| no | yes | `native` | `orca.md`; note once that the project's JITSO hook, if registered, may deny native launch verbs |

A future provider adds one file and one gate row; none is designed here.
