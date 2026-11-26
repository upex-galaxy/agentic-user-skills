# Provider: JITSO (`jitso` mode)

Read `providers/orca.md` first: JITSO rides on the same Orca runtime, mailbox, wake and mail rules. This file holds only what differs. Direct-mode launches and the messaging below were measured on a real Orca; a fleet run with a conductor on the current JITSO was not. JITSO may not be installed; `native` stays the default until JITSO passes an attended real Orca run.

## Gate

`jitso` only when the `jitso` binary is on PATH AND `<repo root>/jitso/jitso.yaml` exists. Every other case is `native`. `jitso init` sets a project up (skill, `AGENTS.md` block, `jitso/jitso.yaml`, guard for each harness on PATH); like `setup` and `install`, run it only when the human asked. Then run `jitso doctor` once (read-only); a non-zero exit stops the run: report its line. Load the JITSO usage skill before anything else; it owns the flags and the exit codes, this file does not copy them.

## Launch

Only `jitso launch` starts a session. The JITSO guard denies just that: `worker-start`, `start_worker` and a terminal or worktree that runs a harness, or the harness itself. Never retry a denied call, go back to `jitso launch`.

1. Run by Orca, as in `orca.md` section 2. No Task: in fleet mode `jitso launch` rejects `--task` and JITSO creates the Task itself from the brief.
2. Write the brief to `.jitso/briefs/<name>.md` (the launcher reads that folder only), headings `Goal`, `Scope`, `Done when`, `Report format`, built from `templates/COMMON.md` plus `templates/W-brief.md`. The brief checks only warn: fix and preview again.
3. Preview, then launch for real:

```bash
jitso launch --build <id> --brief .jitso/briefs/<name>.md --mode fleet --run <run> [--worktree <sel>] [--parent <launch id>] --dry-run
```

Omit `--parent` for a top conductor (one a human started). A launched conductor passes its own launch id. The conductor still creates and verifies the worktree (`conductor-cycle.md` section 2) and passes it with `--worktree`. A clean dry run does not promise the real launch works.

## Composing a build

A build's `harness:` is `claude`, `codex`, `opencode` or `pi` (JITSO v0.3). Each harness honors less than Claude Code, and `jitso build validate` rejects a build that asks for what its harness cannot give: codex takes no subagents, `tools` or `user:` items and keeps the owner's own Codex MCP servers (the launch prints a note); opencode takes no subagents, `tools` or `agents_md: exclude`; pi takes no MCP server at all. Only a claude launch reports tokens at `jitso close`.

Run `jitso arsenal` to see what a build may name; `--all` adds what a restricting allowlist leaves out. An absent or empty list is open. A conductor composes just in time: `jitso build draft -` (`id`, `model`, `effort` are enough) and launches the draft; `jitso build save <id>` is optional and asks nothing. User skills and MCP servers are `user:<name>`, restricted by `~/.jitso/jitso.yaml` when it lists any. `cloud:` connectors and OAuth servers are refused, and a literal secret in a user server's env, headers or args refuses the launch.

## Another repository (JITSO v0.8)

`jitso launch ... --repo <absolute path>` sends the worker there. Your repository keeps builds, briefs, registry and fleet; the target gives skills, MCP servers and instructions and needs no `jitso/jitso.yaml`. `jitso arsenal --repo <path>` lists what a build may name there; `jitso build draft <file|-> --repo <path>` drafts one. Exit 3 `is not registered in Orca`: the printed `orca repo add --path <path>` line trusts that folder, so tell the human (a launched conductor: its launcher), run it, relaunch. One direct Claude launch was measured; fleet mode and other harnesses were not.

## What travels

A launch that carries a package (the jitso skill for conductor builds and builds that name `jitso`, any `user:` item) writes `.jitso/launches/<id>/pkg/`, passed with `--add-dir`. The guard always travels, in the form each harness takes. Codex runs project hooks only after the owner trusts them (`codex exec` skips untrusted hooks silently). `jitso setup hook --scope user` guards the owner's own session, which JITSO does not launch.

A top conductor tells the human the build and the brief before a real launch, unless they asked for exactly that. A launched conductor reports them to its launcher instead; fleet workers never ask the human. JITSO composes the model, effort, MCP servers and skills from the build: the conductor passes none of them.

## Naming and roster

JITSO titles the tab `[jitso:<id>] <build>`. Keep it: `reap` matches that mark. The roster maps `<label>` to the launch id (`Launch id` column); the dispatch id still comes from `worker-list`.

## Who is running and who talked (JITSO v0.5 and v0.6)

| Command | What it gives |
|---|---|
| `jitso fleet [--json] [--all]` | read only: every session Orca lists, this project first (launch id, state, handle, parent, repo, title). A worker finds a named peer and its own row here |
| `jitso link <from> <to>` | records that one session talked to another; each side is a launch id, a terminal handle or an exact title |
| `jitso graph [--port <n>] [--json]` | for the human: a live view on `127.0.0.1` of sessions, hierarchy and who talked to whom, from any folder. It never reads message text |

Every `brief.md` a launch writes ends with the communication rule: find the peer with `jitso fleet`; between two Claude Code sessions use `SendMessage` to the session name (the tab title) and then run `jitso link`; otherwise `orca orchestration send --to <handle> --from <own handle>`, answered with `reply`. Measured with two launched Claude Code sessions: both paths delivered and answered. Orca warns that a terminal mailbox is lost if that terminal closes. A session a human opened by hand gets no rule: tell it how, or give it this section.

## Close

Instead of `worker-release`: `jitso close <launch id>` after integration is verified. It closes that one terminal, lists terminals to confirm it is gone, then writes the end event. If the terminal is still listed, nothing is written and `close` is retried. A JITSO worker has no cost footer (it runs with `--setting-sources project`, so the user statusline is not loaded). Its cost is the `tokens:` line `jitso close` prints for a claude launch (also in the end event): tokens only, no dollar figure. Then the orphan audit and worktree removal as usual. At the end of the fleet run `jitso reap --run <run>`: it ends launches whose terminal is gone and prints every worker no launch explains (a native start that slipped through).

## Re-sync

The list in `orca.md`, plus `.jitso/launches.jsonl` (append only, in the primary checkout) and `jitso reap --run <run>`.

## Open

Adopted terminals may skip auto-release; `jitso close` owns the close.
