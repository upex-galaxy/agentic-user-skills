# agentic-user-skills

A monorepo of **user-level agentic skills** — cross-agent tools that improve the *user's* experience across **any** repo and **any** coding agent (Claude Code, OpenCode, Cursor, Codex…), rather than skills tied to one project's stack.

Other repos (e.g. `agentic-qa-boilerplate`, `agentic-dev-boilerplate`) install these at the **user (global)** level via their installers, so the same skill is never duplicated per project. This repo is the single source of truth.

## Install a skill (user-level)

These skills follow the [`skills`](https://skills.sh) convention. Install one globally with:

```bash
bunx skills add --global https://github.com/upex-galaxy/agentic-user-skills mkd
```

A user-level skill loads automatically in every project — no per-repo wiring.

## Skills

| Skill | Command | What it is |
| --- | --- | --- |
| [`agentic-audit`](skills/agentic-audit/SKILL.md) | — | An **evidence-based project auditor**: reads a whole repo (git history, context artifacts, agent config, tracker mirror, tests, CI) and drives the live app, then scores six axes 0-5 and writes a self-contained HTML evaluation. Two modes: `subject` (`dev` \| `qa` \| `pair`) picks the rubric, `lens` (`external` \| `internal`) picks the register and deliverable. Read-only on the target. |
| [`mkd`](skills/mkd/SKILL.md) | `bun cli/index.ts` (no install) | **MKD (Make Decision)** — a browser-based **decision-deck CLI**: the AI writes a spec of items (decision / question / report / answerable table) and the CLI renders a Catch-Up-style deck — one screen per item, options with **written justifications**, a ★ recommended badge, custom option, skip, quotes, live stats, localStorage persistence. Default flow is non-blocking copy-paste (the user pastes the Result JSON into the chat as the execution contract); `--wait` keeps a blocking same-turn handshake. Successor of `wokitoki`/`toki`. |

## Layout

```
agentic-user-skills/
  skills/
    <skill-name>/
      SKILL.md            # frontmatter + when/what/how + first-run setup
      references/         # deep docs loaded on demand
      cli/                # OPTIONAL bundled CLI — decoupled, zero external deps
  package.json            # gate scripts (lint / types)
  tsconfig.json eslint.config.js .gitignore skills.sh.json
```

**A skill is just a directory.** It may be pure instructions (`SKILL.md` + `references/`) or bundle a self-contained CLI. Each skill is independently extractable.

## Conventions

- **Decoupled CLIs.** Any bundled CLI imports **runtime built-ins only** (Bun / `node:` built-ins) — zero external npm deps, relative imports only. This is what lets a skill travel via `bunx skills add` and stay independently extractable.
- **Zero host footprint.** A bundled tool writes its output (caches, results, artifacts) under the user's home (e.g. `~/.mkd/`), never the consumer repo's cwd.
- **No install step.** A bundled CLI runs straight from the skill directory (`bun <skill-dir>/cli/index.ts`) — no compiled binary, nothing added to PATH.

## Toolchain

- **Bun** runs the TypeScript directly.
- Gates: `bun run types:check` (`tsc --noEmit`) and `bun run lint:check` (ESLint, `@antfu/eslint-config`).

## License

MIT
