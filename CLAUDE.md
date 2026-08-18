# CLAUDE.md — AI Persistent Memory · `agentic-user-skills`

> AI memory. Loads EVERY session. This repo is a **monorepo of user-level agentic skills** — skills
> that improve the *user's* experience across ANY repo and ANY coding agent (Claude Code, OpenCode,
> Cursor, Codex…), not skills tied to one project's stack. Other repos (e.g. `agentic-qa-boilerplate`,
> `agentic-dev-boilerplate`) install these at **user (global) level** via their installers — this repo
> is the single source so the same skill is never duplicated per project.
>
> Heavy per-skill detail → that skill's `references/`. Scripts → READ `package.json`. Setup → `README.md`.

---

## 1. CRITICAL RULES — ALWAYS APPLY

1. **CREDENTIALS**: ALWAYS read from `.env`. NEVER hardcode/guess. NEVER commit secrets.
2. **NO AI ATTRIBUTION**: NEVER include "Generated with Claude Code", "Co-Authored-By: Claude", or any
   AI-attribution line in commits or PR bodies. Commits look human-authored.
3. **CONFIRM BEFORE PUSH TO `main`**: never push to `main` without explicit user confirmation. Never
   delete a remote branch without confirmation.
4. **GIT HISTORY**: never rewrite pushed history (rebase/amend on pushed commits), never force-push a
   shared branch. Always add forward (new commits).
5. **QUALITY VERIFICATION**: after code changes verify in order — **types → lint → (E2E)**. No skipping.
6. **FILE OPERATIONS**: ALWAYS read a file before editing. Preserve formatting + indentation.
7. **SCRIPTS = READ `package.json` DIRECTLY**. Never quote build/test commands from this file — drift
   kills. Open `package.json` first, then answer.
8. **SKILL DECOUPLING (load-bearing for distribution)**: any CLI/code a skill bundles MUST import
   **runtime built-ins only** (Bun / `node:` built-ins) — **zero external npm deps**, relative imports
   only, no host-repo paths/aliases. This is what lets a skill travel via `bunx skills add` and compile
   to a standalone binary. A bundled tool must also leave **zero footprint** in the consumer repo: write
   any output (caches, results, artifacts) under the user's home (e.g. `~/.<tool>/`), never the cwd.
9. **LANGUAGE DETECTION + MIRRORING**: read the FULL user message, detect their working language, and
   mirror it in ALL conversational replies. Repo artifacts ALWAYS English regardless: code, comments,
   commits, PR titles/bodies, branch/file names, config values, external-action artifacts.
10. **DEFAULT COMMUNICATION — CAVEMAN**: if the `caveman` skill is installed user-level, respond at
    caveman level `full` by default (drop articles/fillers/pleasantries; fragments OK; technical terms
    exact; code/commits/PRs/security warnings always normal English). Revert only on explicit request
    ("normal mode", "habla normal", …). If not installed, no-op.

---

## 2. BEHAVIORAL LAYER — HOW THE AI REASONS

**THINK BEFORE CODING.** State assumptions. Multiple interpretations → present them, never pick
silently. Simpler approach exists → say so. Unclear → STOP, name the confusion, ASK.

**SIMPLICITY FIRST.** Minimum code that solves the problem. No features beyond the ask, no speculative
abstractions, no error handling for impossible cases.

**SURGICAL CHANGES.** Touch only what's required. Match existing style. Don't refactor unbroken code.
Remove only the imports/vars your change made unused.

**GOAL-DRIVEN EXECUTION.** Define success criteria, loop until verified. Multi-step → state a plan with
an explicit `verify:` per step (test passes, file exists, exit 0, types clean).

**EXPANDABLE RESPONSES (BUTLER).** Default to a terse headline that resolves the literal question, then
surface other topics as an atomic bullet menu (one specific topic per bullet, never broad buckets). The
user pulls; don't push every detail at once.

**PM VOICE (default register).** Headline reports user/product/quality value, not the technical action.
Composes on top of Butler. Suspend to a technical register when the message contains file paths / shell
/ errors / security / migrations, or the output is a commit / PR body / code block.

**VISUAL MAPPING.** When content is naturally tabular/sequential/hierarchical, prefer a table / ASCII
diagram / tree over prose — it should REPLACE prose, not decorate it.

---

## 3. ORCHESTRATION MODE — main conversation = command center, subagents = executors

USE SUBAGENTS FOR: reading/writing multiple files, research across the repo, git ops, verification
(types/lint/E2E), multi-file edits, long tasks. NO SUBAGENTS FOR: quick lookups, memory reads/writes,
asking the user, planning. Brief every dispatch with: goal, files to read, exact step-by-step
instructions, the report format, and the rules to follow. Run independent tasks in parallel ONLY when
they touch disjoint files; sequence anything that shares a file. On a subagent error → STOP, report
full context, no fix without approval.

---

## 4. REPO LAYOUT — how skills live here

```
agentic-user-skills/
  skills/
    <skill-name>/
      SKILL.md            # frontmatter (name, description, license, compatibility, allowed-tools,
                          #   complementary_categories) + when/what/how + a first-run SETUP section
      references/         # deep docs loaded on demand (schema, examples, setup)
      cli/                # OPTIONAL bundled CLI — decoupled, zero-dep (see Critical Rule #8)
        index.ts … ui/
  package.json            # name, bin(s), scripts (build / types / lint). READ it for commands.
  tsconfig.json eslint.config.js .gitignore README.md
```

**A skill is just a directory.** It may be pure instructions (SKILL.md + references) or bundle a
self-contained CLI. Keep each skill independently extractable.

---

## 5. DISTRIBUTION MODEL — how these skills reach users

- **Consumed user-level.** Other repos' installers run `bunx skills add --global <this-repo> <skill>`,
  landing the skill once at the user level so it loads in every project without per-repo wiring.
- **Bundled CLI → global binary, built lazily.** If a skill ships a CLI, its `SKILL.md` first-run /
  Phase-0 section makes the AI check for the binary and build it if missing, e.g.
  `command -v <bin> || bun build --compile <skill-dir>/cli/index.ts --outfile ~/.bun/bin/<bin>`.
  For `--compile` to embed UI/asset files, import them with `with { type: 'text' }` (Bun embeds those;
  `readFileSync(import.meta.url)` does NOT survive compilation). Fallback: `bun <skill-dir>/cli/index.ts`.
- **Zero host footprint.** A bundled tool writes its caches/results under `~/.<tool>/`, never the
  consumer repo's cwd — so running it inside any repo dirties nothing there.
- **Idempotent.** Re-running an installer / rebuild overwrites in place; no duplicates across repos.

---

## 6. TOOLCHAIN + VERIFICATION

- **Runtime/toolkit: Bun** (TS runs directly; `bun build --compile` for binaries). Gates: `tsc --noEmit`
  (types) + ESLint (`@antfu/eslint-config` style — newline interface delimiters, `no-console` off).
  Always READ `package.json` for the exact script names; never quote them from memory.
- **E2E a bundled CLI with the `playwright-cli` binary** (drive the real running tool in a headless
  browser). Assert real-user visibility (computed `opacity`, `getBoundingClientRect`) and the tool's
  contract (stdout shape, exit code, files written) — NOT just DOM presence / `classList` (that hides
  CSS/JS-mismatch bugs).
- After any change: types → lint → E2E, in that order.

---

## 7. CURRENT SKILLS

| Skill | What it is | Status |
|---|---|---|
| `agentic-audit` (no binary) | An **evidence-based auditor of a whole project** — someone else's or our own. Sweeps git history, `.context/` artifacts, `.agents/` config, the tracker mirror, tests and CI, then drives the live app with `playwright-cli`, scores six fixed axes 0-5 and emits a single-file HTML evaluation. `subject` (`dev` \| `qa` \| `pair`) selects the rubric; `lens` (`external` \| `internal`) selects register and deliverable. Load-bearing invariant: **the rubric travels with the skill**, never read from the audited repo, or version drift scores as compliance. Strictly read-only on the target. | **v1** |
| `wokitoki` (binary `toki`) | A blocking interactive **human-in-the-loop feedback CLI** the AI invokes mid-conversation: serves a local dark web UI where the user answers each block (question / report / answerable table) with controls + free text + highlight-to-quote + clipboard images, then returns anchored JSON on stdout the same turn. Replaces inline questionnaires + unanchored prose feedback. | **Being extracted** from `agentic-qa-boilerplate` per the handoff — see §8 |

`wokitoki` security contract (do not regress when moving it in): per-run `x-toki-token` + loopback bind
on `/submit`; stdout carries ONLY the Result JSON; the server's defensive body-shaping must pass through
every field (it silently drops unknown fields — that bug bit `rows[]` and `images[]`).

---

## 8. CURRENT TASK — extract WokiToki into this repo

This repo starts EMPTY. The immediate work is to move the finished WokiToki implementation in and wire
its distribution. The full, self-sufficient plan lives in the source repo:

- **Handoff:** `agentic-qa-boilerplate/.scratch/wokitoki-cli/HANDOFF-NEXT-extract-to-agentic-user-skills.md`
- **Source code (to move):** `agentic-qa-boilerplate` branch `feat/wokitoki-cli` → `cli/toki/*` +
  `.claude/skills/wokitoki/*`.

It covers: create this repo's scaffolding, move the CLI under `skills/wokitoki/cli/`, apply the
portability refinements (asset-embed for `--compile`, output → `~/.toki/`, lazy binary build in
SKILL.md), verify with `playwright-cli`, then (in the QA + dev repos) add `wokitoki` to the installer's
USER-level skills list and close/salvage QA PR #3. Read the handoff before starting.

---

## 9. GIT WORKFLOW

Small skills monorepo → **GitHub-flow**: `main` is always usable; do feature work on
`feat/…` / `fix/…` / `docs/…` / `chore/…` branches → PR → `main`. Conventional commits
(`feat:` / `fix:` / `docs:` / `refactor:` / `chore:` …), one responsibility per commit, no AI
attribution, confirm before pushing to `main`. Use `gh` for PRs. (If you adopt the `git-flow-master`
skill, it auto-detects + adapts.)

---

## 10. MEMORY (engram)

Engram is **per-project** — memories are scoped to this repo's path/remote, so the rich WokiToki build
history saved under `agentic-qa-boilerplate` will NOT auto-surface here; the §8 handoff is the source of
truth for the extraction. Going forward, in THIS repo: call `mem_save` proactively after any decision,
convention, bug fix (with root cause), non-obvious discovery, or established pattern — don't wait to be
asked. Before saying "done", save a `mem_session_summary` (Goal / Discoveries / Accomplished / Next
Steps / Relevant Files).

---

*AI persistent memory for `agentic-user-skills`. Update when structure, conventions, or skills change.*
