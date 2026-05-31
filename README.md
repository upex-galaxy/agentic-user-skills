# agentic-user-skills

A monorepo of **user-level agentic skills** — cross-agent tools that improve the *user's* experience across **any** repo and **any** coding agent (Claude Code, OpenCode, Cursor, Codex…), rather than skills tied to one project's stack.

Other repos (e.g. `agentic-qa-boilerplate`, `agentic-dev-boilerplate`) install these at the **user (global)** level via their installers, so the same skill is never duplicated per project. This repo is the single source of truth.

## Install a skill (user-level)

These skills follow the [`skills`](https://skills.sh) convention. Install one globally with:

```bash
bunx skills add --global https://github.com/upex-galaxy/agentic-user-skills wokitoki
```

A user-level skill loads automatically in every project — no per-repo wiring.

## Skills

| Skill | Command | What it is |
| --- | --- | --- |
| [`wokitoki`](skills/wokitoki/SKILL.md) | `toki` | A blocking, browser-based **human-in-the-loop feedback CLI** the AI drives mid-conversation: it serves a local dark web UI where the user answers each block (question / report / answerable table) with controls + free text + highlight-to-quote + clipboard images, then returns anchored Result JSON on stdout the same turn. Replaces inline questionnaires and unanchored prose feedback. |

## Layout

```
agentic-user-skills/
  skills/
    <skill-name>/
      SKILL.md            # frontmatter + when/what/how + first-run setup
      references/         # deep docs loaded on demand
      cli/                # OPTIONAL bundled CLI — decoupled, zero external deps
  package.json            # bin(s) + gate scripts (lint / types)
  tsconfig.json eslint.config.js .gitignore skills.sh.json
```

**A skill is just a directory.** It may be pure instructions (`SKILL.md` + `references/`) or bundle a self-contained CLI. Each skill is independently extractable.

## Conventions

- **Decoupled CLIs.** Any bundled CLI imports **runtime built-ins only** (Bun / `node:` built-ins) — zero external npm deps, relative imports only. This is what lets a skill travel via `bunx skills add` and compile to a standalone binary (`bun build --compile`).
- **Zero host footprint.** A bundled tool writes its output (caches, results, artifacts) under the user's home (e.g. `~/.toki/`), never the consumer repo's cwd.
- **Lazy global binary.** If a skill ships a CLI, its `SKILL.md` first-run section builds the binary on demand, e.g. `command -v toki || bun build --compile skills/wokitoki/cli/index.ts --outfile ~/.bun/bin/toki`.

## Toolchain

- **Bun** runs the TypeScript directly; `bun build --compile` produces the binaries.
- Gates: `bun run types:check` (`tsc --noEmit`) and `bun run lint:check` (ESLint, `@antfu/eslint-config`).

## License

MIT
