# Provider: JITSO (`jitso` mode)

Read `providers/orca.md` first: JITSO rides on the same Orca runtime, mailbox, wake and mail rules. This file holds only what differs. Nothing here was measured on a real Orca: JITSO's own record says its attended real run has not happened. JITSO may not be installed; `native` stays the default until JITSO is published and passes an attended real Orca run.

## Gate

`jitso` only when the `jitso` binary is on PATH AND `<repo root>/jitso/jitso.yaml` exists. Every other case is `native`. Then run `jitso doctor` once (read-only); a non-zero exit stops the run: report its line. Load the JITSO usage skill before anything else; it owns the flags and the exit codes, this file does not copy them.

## Launch

Only `jitso launch` starts a session. `worker-start`, `start_worker` and `terminal create` from an agent session are denied by the JITSO hook: never retry a denied call, go back to `jitso launch`.

1. Run by Orca, as in `orca.md` section 2. No Task: in fleet mode `jitso launch` rejects `--task` and JITSO creates the Task itself from the brief.
2. Write the brief to `.jitso/briefs/<name>.md` (the launcher reads that folder only), headings `Goal`, `Scope`, `Done when`, `Report format`, built from `templates/COMMON.md` plus `templates/W-brief.md`.
3. Preview, then launch for real:

```bash
jitso launch --build <id> --brief .jitso/briefs/<name>.md --mode fleet --run <run> [--worktree <sel>] [--parent <launch id>] --dry-run
```

Omit `--parent` for a top conductor (one a human started). A launched conductor passes its own launch id. The conductor still creates and verifies the worktree (`conductor-cycle.md` section 2) and passes it with `--worktree`. A clean dry run does not promise the real launch works.

A top conductor tells the human the build and the brief before a real launch, unless they asked for exactly that. A launched conductor reports them to its launcher instead; fleet workers never ask the human. JITSO composes the model, effort, MCP servers and skills from the build: the conductor passes none of them.

## Naming and roster

JITSO titles the tab `[jitso:<id>] <build>`. Keep it: `reap` matches that mark. The roster maps `<label>` to the launch id (`Launch id` column); the dispatch id still comes from `worker-list`.

## Close

Instead of `worker-release`: `jitso close <launch id>` after integration is verified. It closes that one terminal, lists terminals to confirm it is gone, then writes the end event. If the terminal is still listed, nothing is written and `close` is retried. A JITSO worker has no cost footer (it runs with `--setting-sources project`, so the user statusline is not loaded). Its cost is the `tokens:` line `jitso close` prints from v0.1.2 (input, cache write, cache read, output; also recorded as `tokens` in the end event), tokens only, no dollar figure; before v0.1.2, sum the transcript at `transcript_path` by hand, deduplicated by `message.id`. Then the orphan audit and worktree removal as usual. At the end of the fleet run `jitso reap --run <run>`: it ends launches whose terminal is gone and prints every worker no launch explains (a native start that slipped through).

## Re-sync

The list in `orca.md`, plus `.jitso/launches.jsonl` (append only, in the primary checkout) and `jitso reap --run <run>`.

## Open

Whether the JITSO guard denies a plain worktree create with no agent is unverified (binary absent here): if it does, pass the worktree to `jitso launch` and say so in the run report. Adopted terminals may skip auto-release; `jitso close` owns the close.
