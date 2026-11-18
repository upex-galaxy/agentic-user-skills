# Run: <slug>

> Copy to `<scope path>/run.md`. Owner: the conductor. Replace every `<…>`. A second conductor binds
> to this file, so all it needs to take over is here.

| Field | Value |
|---|---|
| Run id | `run_…` |
| Objective | <one sentence: what is being coordinated> |
| Coordinator handle | `…` |
| Created | <YYYY-MM-DD HH:MM> by <label> |
| Primary checkout | <absolute path> |
| Scope path | <absolute path: `<primary checkout>/.session/orchestration/<slug>/`, or the profile's `orchestration.scope_dir`> |
| Base branch | <branch> |
| Launch mode | <native \| jitso> (`references/providers/README.md`) |
| Topology | <same-checkout fleet \| worktree per worker \| worktree per cluster> (`references/topologies.md`) |
| Worker cap | <n> (source: the profile's `orchestration.max_workers`, or the user's explicit instruction for this run) |
| Agent / model / effort | <agent> / <full model id> / <effort> |
| Supervision | <supervised (native or jitso launch) \| unsupervised (pasted lines from `launch.txt`)>. Note a missing permission mode here (`references/machine-setup.md`) |
| Board status mapping | <todo=… · in-progress=… · in-review=… · completed=…> |
| Board card shape | <one card per worker \| ONE fleet card pointing at the roster> |
| Gate state at start | <ready \| no binary (fallback: the human pastes `launch.txt`)> |

## Scope files

All under the scope path:

- `<scope path>/roster.md`
- `<scope path>/COMMON.md`
- `<scope path>/launch.txt`
- `<scope path>/claims.md`
- `<scope path>/reports/`

## Rounds

| Round | Workers | Started | Closed | Notes |
|---|---|---|---|---|
| 1 | <labels> | <HH:MM> | <HH:MM> | |

Rounds are concurrency groups.

## Conductor-only operations done for this Run

Operations the project reserves to the conductor (credentials, syncs, generated files).

- [ ] <operation> (<when>, scope: <…>)
- [ ] generated files regenerated after integration (<which>)

## Open decisions for the owner

1. <decision, with the recommendation>

## Log

- <YYYY-MM-DD HH:MM>: <what happened, one line>
