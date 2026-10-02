# MKD — Setup (there is none)

MKD ships as source and runs straight from the skill directory. There is **no
install step, no compiled binary, nothing added to PATH**.

## Requirements

- **Bun** (any recent version). It runs the TypeScript CLI directly. If
  missing: `curl -fsSL https://bun.sh/install | bash` (the user runs this, not
  the AI).
- **Orca** is optional. When the CLI finds it (`ORCA_TERMINAL_HANDLE` set, or
  `orca status --json` reports a reachable runtime) the default flow opens the
  deck in a worktree-bound Orca tab and blocks until submit. Nothing to
  configure; `--copy` opts out. See `SKILL.md`, "Which flow runs".

## How the AI runs it

```bash
bun "<skill-dir>/cli/index.ts" <specPath> [flags]
```

`<skill-dir>` resolution:

| Install level | Path |
| --- | --- |
| Project | `<repo>/.claude/skills/mkd` |
| User (global) | `~/.claude/skills/mkd` |

Installed via the skills CLI: `bunx skills add <repo-or-url> mkd` (project) or
`bunx skills add --global <repo-or-url> mkd` (user level).

## Footprint

Everything the tool writes lands under `~/.mkd/`:

| File | What |
| --- | --- |
| `spec-<name>.json` | The spec the AI writes (convention, keeps the repo clean). |
| `deck-<name>.html` | The rendered self-contained deck page (copy mode). |
| `result-<name>.json` | Result backup (wait mode: `--wait` or the Orca flow). |
| `<name>-img-*.{png,jpg,…}` | Pasted images persisted to disk (wait mode). |
| `opened-<name>.json` | Where the deck was last opened (origin + browser), used to warn before the answers split across two copies. |

Nothing is ever written to the consumer repo's cwd — no `.gitignore` edits
needed anywhere.

## Notes

- The page loads Bricolage Grotesque / Albert Sans / Spline Sans Mono from
  Google Fonts with full system fallback stacks; offline the deck still works.
- Answers persist in the browser's localStorage keyed by `session`, so closing
  and reopening `deck-<name>.html` never loses work. In wait mode the origin is
  `http://localhost:<port>`, and the port is stable per deck (4747-4946, from
  `<name>` or else `session`), so rerunning the same spec reopens the saved
  answers. localStorage belongs to one origin in one browser: an Orca tab and
  the system browser never share it. A NEW deck for the same
  `session` reuses (and overwrites) that saved state — reuse a session slug
  only when re-opening the same set of items.
