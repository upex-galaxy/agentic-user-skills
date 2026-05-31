# WokiToki setup — the `toki` global binary

`toki` is distributed as **source** (Bun built-ins only, zero external npm deps) and compiled to a **single self-contained binary** the first time the skill is used. This file documents that first-run flow, the fallback, and how to rebuild.

## First-run build (lazy, idempotent)

Before the first `toki` invocation in a session, ensure the binary exists; build it if missing:

```bash
command -v toki >/dev/null 2>&1 || bun build --compile "<skill-dir>/cli/index.ts" --outfile "$HOME/.bun/bin/toki"
```

- `<skill-dir>` — this skill's install directory. User-level (global) install, that is `~/.claude/skills/wokitoki`.
- `--compile` produces a standalone executable that **embeds** the two UI assets (`cli/ui/app.css`, `cli/ui/app.js`). They are imported as text via Bun import attributes (`import APP_CSS from './ui/app.css' with { type: 'text' }`), which is what lets `bun build --compile` bake them into the binary — so the executable renders the full UI from anywhere, with no sibling files required.
- `~/.bun/bin` is on PATH for every Bun install, so the freshly built `toki` runs immediately.
- The build is idempotent: re-running it overwrites the binary in place. Re-run it after pulling skill updates so the binary tracks the source.

## Fallback — run from source (no compile)

If `--compile` is unavailable, or you can't write into `~/.bun/bin`, run directly from source — identical behavior, just a slower cold start:

```bash
bun "<skill-dir>/cli/index.ts" <specPath>
```

## Output location — `~/.toki/`

Everything the CLI writes lands under `~/.toki/`:

- `~/.toki/result-<name>.json` — a backup of each submitted Result (the stdout copy is authoritative).
- `~/.toki/<name>-img-<blockId>[-<rowId>]-<n>.<ext>` — any clipboard image the user pasted, decoded to a file; the Result's `images[]` carries that path.

Writing under `$HOME` (via `node:os` `homedir()` + `node:path` `join`) — never the cwd — is what makes the tool leave **zero footprint** in whatever repo it runs inside.

## Notes

- Binary size is ~50–90 MB (it embeds the Bun runtime). If that is undesirable, prefer the run-from-source fallback above as the default invocation.
- Nothing here needs network access or external dependencies; the only requirement is `bun` on PATH.
