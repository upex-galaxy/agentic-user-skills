# Machine setup: the one-time checklist

Loaded by whoever sets up a new machine, once. Everything here lives in the app's own settings store on this computer: no repo file carries it and no CLI command sets it, so a fresh clone cannot restore it. Project items (an env-file loader, repo setup and archive hooks, install scripts) are in the project's own setup notes.

## 1 Binary and runtime

```bash
command -v orca                                          # the binary
orca status --json </dev/null | jq -r '.result.runtime.reachable'   # want: true
orca open --json </dev/null                              # if not reachable, once, then re-check once
```

The gate is a binary plus a reachable runtime; the nested flag is `.result.runtime.reachable`. A vendor skill being installed is not part of it.

On Linux, outside an Orca-managed terminal, the CLI registers as `orca-ide` (`/usr/bin/orca` is the GNOME screen reader). Use the executable `skills get` ran with, for the gate and every later command. Inside Orca's own terminals `orca` is correct.

## 2 Vendor guides

```bash
orca skills get orchestration       # the vendor guide, served by the binary
orca skills get orca-cli
orca skills list                    # topics; installing the stubs is optional
```

The binary serves the guides and their deeper `--reference` topics on demand, so a machine with the binary and no installed stubs is fully capable. If you install them, install them globally, never with `--local` inside a project (a stub landing in the project's skill store shows up as an untracked skill).

## 3 Permission mode per tier

The native launch accepts a model and an effort level and nothing else: a permission mode cannot be a flag, it is a per-agent default argument in the app (Settings, the Agents section; read the screen for the exact label). The profile declares the mode for each tier (`orchestration.permission_modes`, vocabulary `bypass | auto | ask | inherit`), and the conductor verifies the result on each worker at readiness (`references/conductor-cycle.md` section 3).

| Mode | Claude Code | Codex CLI | OpenCode | Pi |
|---|---|---|---|---|
| bypass | `--dangerously-skip-permissions` (= `--permission-mode bypassPermissions`) | `--dangerously-bypass-approvals-and-sandbox` (`-a never -s workspace-write` keeps `.git` read-only and the network off: a worker cannot commit) | `--auto` (aliases `--yolo`, `--dangerously-skip-permissions`) or `"permission": {"*": "allow"}` | nothing to set; `--approve` skips the project-trust prompt |
| auto | `--permission-mode auto` (a classifier; it pauses and PROMPTS after 3 consecutive or 20 total blocks) | `--approve-for-me` | no equivalent | no equivalent |
| ask | the default mode | `-a on-request` | the default | n/a |
| inherit | a subagent inherits its parent's mode | same | same | same |

Harness flags move between releases: confirm each with `<harness> --help` on the machine. `bypass` does not mean nothing stops: Claude Code still stops on its first-run dialog, explicit `ask` rules, `AskUserQuestion` and protected-path deletes, and refuses to run as root; OpenCode `--auto` still applies an explicit `deny`; Codex's full bypass has no sandbox (full disk and network). The project's own `permissions.deny` stays in every mode. `auto` and an edits-only mode are not non-interactive: the first stalls after its block limit, the second on its first Bash call, and an unwatched worker stalls with them (G27).

Per agent the fleet uses: worker tier, put the flag of the profile's mode in the agent's default arguments (Orca's own default Claude launch has been seen carrying the bypass flag, G79: read what is there before adding); conductor tier, start the session the human types into with that mode's flag; subagent tier, `inherit`, nothing to set. Leave the run mode per agent, so a global yolo or manual switch never decides a worker's mode.

The security tradeoff, stated once: an instruction injected through content a bypass worker reads runs with the owner's rights and network. No profile means no mode is imposed, and the conductor reads and records what each worker actually runs.

## 4 Claude Code bypass dialog

With bypass, set `skipDangerousModePermissionPrompt: true` in the user-level Claude Code settings once. Without it every bypass worker stops on a first-run confirmation dialog nobody sees.

## 5 Mobile pairing (optional)

Pairing a phone makes the board card, its comment and shared artifacts readable away from the desk, and a worker's question answerable there. The app issues the pairing code; the commands are `orca environment list` and `orca environment add --pairing-code <code>`. Which controls the phone offers over a pending question is unverified: record what you find in `references/gotchas.md`.

## 6 JITSO (optional)

JITSO is optional and may not be installed. Install and register it as its own documentation says (the owner runs the setup commands, never an agent session); `jitso doctor` then reports what is missing. `native` is the default until JITSO is published and passes an attended real Orca run (`references/providers/jitso.md`).

## 7 Checklist

Every item needs the owner at the machine: app settings and trust prompts cannot be set by an agent or a routine. A session that finds one missing reports it and stops before dispatching.

```
[ ] binary installed; `.result.runtime.reachable` is true; (Linux) the executable `skills get` ran with noted
[ ] (optional) vendor stubs installed globally, never --local in a project
[ ] Settings, Agents: each agent's default arguments carry the flag of the profile's worker mode
    from the table in section 3, confirmed with `<harness> --help`, not guessed
[ ] Claude Code with bypass: `skipDangerousModePermissionPrompt: true` in the user settings
[ ] the project's own setup notes done (env loader, repo hooks and their trust prompts, installs)
[ ] (optional) phone paired
[ ] (optional) JITSO installed, `jitso doctor` clean
[ ] one test worker launched and released end to end BEFORE a real fleet
```

The last line matters: on a machine where nobody has released a worker, the cleanup path is untested, and a wrong cleanup path is the one that takes the runtime down (G31).
