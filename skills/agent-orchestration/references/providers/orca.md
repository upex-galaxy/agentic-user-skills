# Provider: Orca (`native` mode)

The default mode. The conductor starts workers with the Orca runtime's own supervised launch. This file answers each item of the provider interface (`references/providers/README.md`) with commands; lifecycle tables, flag lists and custom-argv topology stay in the vendor guide (`orca skills get orchestration`, its `--reference recovery-and-cleanup`, `coordinator-loop`, `low-level-topology`, `messaging-and-gates`, `placement-and-remote`, and `orca orchestration <verb> --help`). Put `</dev/null` on every scripted call (G4). `ORCA` below means the executable `skills get` ran with.

## 1 Gate and runtime

`command -v orca` and `orca status --json </dev/null | jq -r '.result.runtime.reachable'` equals `true` (G25). Machine details: `references/machine-setup.md`. Orca is the runtime: its mailbox, Runs and Tasks.

## 2 Run and Task

```bash
ORCA orchestration run-create --objective "<what is coordinated>" --json </dev/null   # once per wave; ids into run.md
ORCA orchestration task-create --display-name <label> --spec-file <spec> --json </dev/null
```

`--display-name` is the row label in the app; read it back as `.display_name` (G49). `--deps` has no documented element shape, do not use it (G8). Rename the conductor's own tab (`terminal rename --terminal "$ORCA_TERMINAL_HANDLE" --title "conductor · <slug>"`) so the owner finds it among the worker tabs.

## 3 Launch

The conductor creates the worktree and verifies the base (`references/conductor-cycle.md` section 2), then:

```bash
ORCA orchestration worker-start --task <task_id> --worktree id:<repoId>::<path> \
  --agent <a> [--model <full id> --effort <level>] --keep-open --json </dev/null
```

- `--model` and `--effort` come from the profile's worker-tier pin (a full model id, never an alias, G29); the user's explicit word wins. `--effort` needs `--model`.
- The receipt carries the dispatch id and NOT the terminal handle (G78). Read `agentTerminalHandle` from `worker-list --run <id> --json` and record task, dispatch, handle and name in the roster. Lost them: `worker-show --dispatch <id>`, or `terminal list --worktree <sel>`.
- Nested design: `--parent` takes a Task of the same Run.
- A worker started with no `--keep-open` follows the auto-release default; see "Close".

## 4 First prompt

The task spec IS the first prompt: the runtime injects it, so the worker executes it before anything else can reach it (G58). A thin spec costs real work, so make it self-sufficient: the scope, the brief's ABSOLUTE paths (`COMMON.md` then `W-<label>.md`), the continuation sentence (run every stage until `worker_done`; the one stop is ending the turn after an `ask`), the channel, no heartbeats, and the routing line the project injects when it has one. When the worker runs a skill, open the spec with `/<skill> <label> fleet worker` (G84). Keep `launch.txt` byte-identical to it. Never send the prompt through `terminal send`: a long `--text` is truncated and still reports `accepted:true` (G60, G64). On `agent_prompt_stalled` the text is usually already queued: read the screen before resending (G52).

## 5 Naming

The runtime titles the tab `worker-<task id>` and has no flag to change it (G71). Rename it as soon as the handle exists:

```bash
ORCA terminal rename --terminal <handle> --title "<label>--<handle>" --json </dev/null
```

The label lands only once the app window has opened the tab, and `terminal list` and `terminal show` report another field, so confirm on the screen (G72). A harness session name is set by the project's hook or the harness's rename slash-command sent as raw terminal input; a rename does not name a session. The native `worker-start` has no argv, so no name flag there; a pasted Claude Code line uses `-n`. `references/session-identity.md` has the per-harness table and the rename sweep.

## 6 Model, effort, mode

Model and effort go through `worker-start` only. Permission mode cannot be a flag on this path: it is the app's per-agent default argument (`references/machine-setup.md`), so verify it on screen at readiness (`references/conductor-cycle.md` section 3). Where a harness takes its model from its own config, `worker-read` reports `model: null`: read the status bar and set it with the harness's slash-command.

## 7 Messaging and identity

`send --to dispatch:<id>` (or `run:<id>`) reaches a worker in any state: a working one when its turn ends, a finished or closed one as a follow-up Task answered by a new `worker_done` (one per Task). Re-work goes this way. Sign with `ORCA_TERMINAL_HANDLE` plus the Run id; handles change after a resume (G85). `terminal send` carries raw terminal input only: a command, a harness slash-command (`/rename`, `/mcp`), an interrupt, Ctrl+U (`--text $'\x15'` without `--enter`). Never conversation, never the first prompt, never a nudge (`references/channel-discipline.md`).

## 8 Ask

The worker runs `ask`; it returns at once; the worker ends its turn; Orca wakes it with the answer. The conductor answers with `reply --id <message_id>`. Only `--wait` and `--resume` block, and a timeout leaves the question pending: resume it, never re-ask (G59). Fleet workers never ask the human.

## 9 Wait

End the turn; Orca wakes the conductor. `check` consumes the batch it returns, no `--ack`. One `check --run <id> --wait --types worker_done,escalation,question --timeout-ms 540000` window only where a turn must stay open; a watcher uses `--peek` and never consumes (G6, G51). Never poll. Lost response: `--retry-request`.

## 10 Liveness

`worker-list --run <id> --include-remote` and its `next`; `worker-show --dispatch <id>` shows `observation.agentWait` (a worker parked on a prompt only a human answers; `null` means looked and found none, absent means never looked); `worktree ps` for the compact cross-worktree view. A screen read (`terminal read --terminal <handle> --screen`; lines arrive in `result.terminal.tail`) is an aid, never the verdict (G55). Silence, a timeout or `unverifiable` liveness never proves a worker gone.

## 11 Close

**`--keep-open` is the native default** (one place to change). Reason: a worker's token and context footer exists only on its own screen; auto-release closes the terminal about 2 minutes after `worker_done`, which a mid-turn conductor can miss, and `worker-read` after a release keeps the transcript but not the footer (G54, G88). Revisit only if a later measurement shows the footer surviving the release. Other files cite this paragraph and do not restate it. `worker-read --dispatch <id> --full` still answers after a release: it is how to audit what a released worker did (G89).

In the turn that processes a `worker_done`, after integration is verified:

1. Footer: `terminal read --terminal <handle> --screen`, else `worker-read --dispatch <id>`; cost into the roster.
2. `ORCA orchestration worker-release --dispatch <id> --json </dev/null`: closes that worker's terminal and no other; idempotent; `worker-read` still answers afterwards.
3. Verify the terminal is gone (`terminal list --worktree <sel>`).
4. A release that returns `retained` with `processAction: none` closed nothing (G86): count the terminals in the worktree, then `terminal close --terminal <handle> --tab`. Follow a `release_pending` or `release_unknown` receipt's own recovery action; do not `terminal close` for those.
5. `terminal close --worktree <sel> --all` has WORKTREE radius (it stops every terminal there, including `Setup`): count first. `terminal stop` is deprecated (G18).
6. Orphan audit (`references/conductor-cycle.md` section 6), then `ORCA worktree rm --worktree id:<repoId>::<path> --force [--run-hooks] --json </dev/null` and `git worktree prune`. Pass `--run-hooks` when the project has archive hooks: without it Orca skips them.

An uncertain or unreachable worker: `worker-abandon` fences it without claiming it stopped; `worker-stop` only on the user's explicit cancellation (vendor `recovery-and-cleanup`). `worker-keep-open --dispatch <id>` keeps one already started.

## 12 Re-sync

The list in `references/conductor-cycle.md` section 8, with `request-show` for a lost mutation and `--retry-request` for a lost call. List kept-open workers from `worker-list --terminal-state retained` and release or justify each.

## 13 Board card and pages

One fleet-level card per worktree: `worktree set --worktree <sel> --display-name "<slug> · round <N>" --workspace-status in-progress --comment "<slug> · round <N> · <n> workers · run <id> · roster: <ABS>/roster.md"`. A one-worker worktree carries that worker's whole recovery block (session name, branch, brief path). Set it at launch and every round boundary. Status ids match the board columns; record the mapping in `run.md`.

**Pages.** A generated page the owner should read can open as a worktree-bound browser tab (pass the worktree selector so it is bound, not floating; verify the tab shows no load error and the page rendered). A `file://` URL suits a read-only page; a loopback URL served by the rendering tool suits a page that returns a result (clipboard reads fail in the embedded page). Browser storage is per origin: keep one copy of a stateful page open and say which. With no runtime, open it the ordinary way and say nothing.

## 14 Forbids and gotchas

Nothing is forbidden by Orca itself; the rules are the skill's. Provider gotchas live in `references/gotchas.md`.

## Conscious deviations from the vendor guide

| Vendor guide | This skill | Why |
|---|---|---|
| never make checkouts yourself | the conductor creates, fetches and verifies the worktree | base SHA and provisioning must be verified before launch |
| add `--model` only if the user named one | `--model` and `--effort` from the profile pin | the app default drifts (G29); the user still wins |
| `--keep-open` for chats the user keeps | `--keep-open` by default | the cost footer, see "Close" |
| never steer through a worker's terminal | `terminal send` for raw input only | `/rename`, `/mcp`, an interrupt; never conversation |
