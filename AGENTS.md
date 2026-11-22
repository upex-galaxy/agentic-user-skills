# AGENTS.md — AI Persistent Memory · `agentic-user-skills`

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
   only, no host-repo paths/aliases. This is what lets a skill travel via `bunx skills add`. A bundled
   tool must also leave **zero footprint** in the consumer repo: write any output (caches, results,
   artifacts) under the user's home (e.g. `~/.<tool>/`), never the cwd. **No install step**: a bundled
   CLI runs straight from the skill dir (`bun <skill-dir>/cli/index.ts`) — no compiled binary, no PATH.
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
      SKILL.md            # frontmatter (name, description; license, compatibility, allowed-tools,
                          #   complementary_categories when the skill bundles a CLI) + when/what/how
                          #   + a first-run SETUP section when the skill needs setup
      references/         # deep docs loaded on demand (schema, examples, setup)
      how-it-works.es.html  # the skill's visual deck (Spanish) + how-it-works.en.html, its English twin;
                          #   self-contained, 5-8 slides, built only from the skill's own files
      cli/                # OPTIONAL bundled CLI — decoupled, zero-dep (see Critical Rule #8)
        index.ts … ui/
  package.json            # name, bin(s), scripts (build / types / lint). READ it for commands.
  tsconfig.json eslint.config.js .gitignore README.md
```

**A skill is just a directory.** It may be pure instructions (SKILL.md + references) or bundle a
self-contained CLI. Keep each skill independently extractable.

---

## 5. DISTRIBUTION MODEL — how these skills reach users

- **Consumed project-level or user-level.** A skill lives in the consumer repo's `.claude/skills/<name>`
  (project) or `~/.claude/skills/<name>` (user, via `bunx skills add --global <this-repo> <skill>`).
- **No-install CLIs.** A bundled CLI ships as source and the AI runs it from the skill directory:
  `bun <skill-dir>/cli/index.ts <args>`. No compiled binary, no PATH entry, no Phase-0 build. UI assets
  are still imported `with { type: 'text' }` (embedded strings, no per-call I/O).
- **Zero host footprint.** A bundled tool writes its caches/results under `~/.<tool>/`, never the
  consumer repo's cwd — so running it inside any repo dirties nothing there.
- **Idempotent.** Re-running an installer overwrites in place; no duplicates across repos.

---

## 6. TOOLCHAIN + VERIFICATION

- **Runtime/toolkit: Bun** (TS runs directly). Gates: `tsc --noEmit` (types) + ESLint
  (`@antfu/eslint-config` style — newline interface delimiters, `no-console` off).
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
| `mkd` (no binary — `bun cli/index.ts`) | **MKD (Make Decision)** — a browser-based **decision-deck CLI**, successor of `wokitoki`/`toki` fused with the Catch-Up prototype. The AI writes a spec of `items` (`decision` \| `question` \| `report` \| `table`); the CLI renders a one-screen-per-item deck (progress rail, intro + summary, skip = decide later, live stats, localStorage persistence, verdigris+amber light/dark skin, MKD wordmark). **Default = non-blocking copy-paste**: render `~/.mkd/deck-<name>.html`, open browser, exit 0; the user pastes the Result JSON into the chat as the execution contract. `--wait` keeps the blocking loopback handshake (Result JSON on stdout; only mode with image paste). **Inside Orca** (`ORCA_TERMINAL_HANDLE` or a reachable `orca status`) the default is wait mode in a worktree-bound Orca tab, stable per-deck port, tab closed on exit; `--copy` opts out; the agent runs it in the background. **In Claude Code** (opt-in, never automatic) `--artifact` renders a claude.ai Artifact fragment (`~/.mkd/artifact-<name>.html`, path on stdout); the agent publishes it with `capabilities: {db, comments}` and a watch, and Send writes `results/<session>` + `comments.sendToClaude`. **Hard rule (validator-enforced)**: every decision option carries a written `justification`; max 1 `recommended` per decision and its justification states the why. | **v2** |
| `humanizer` (no binary) | Strips AI writing patterns from text a person will read: messages, posts, documents, READMEs. Adapted from upstream (MIT, original `LICENSE` kept in the folder). | Active |
| `writing-for-agents` (no binary) | Rules for writing skills and instruction files that agents follow: pointers, the two loads, a no-op test, positive prompting. Adapted from upstream (MIT, original `LICENSE` kept in the folder). | Active |
| `technical-writing` (no binary) | A docs standard: Diátaxis modes, Google developer style, Simplified Technical English. Covers docs, RFCs, READMEs, PR descriptions and commit messages. Adapted from upstream (MIT, original `LICENSE` kept in the folder). | Active |
| `grill-me` (no binary) | Manual. A relentless interview that sharpens a plan or design, in rounds of numbered questions. Adapted from upstream (MIT, original `LICENSE` kept in the folder). | Active |
| `grilling` (no binary) | The interview loop other skills call: asks until the plan or decision holds up. Adapted from upstream (MIT, original `LICENSE` kept in the folder). | Active |
| `grill-with-docs` (no binary) | Manual. The same interview, but it also writes the glossary and ADRs as decisions settle. Adapted from upstream (MIT, original `LICENSE` kept in the folder). | Active |
| `domain-modeling` (no binary) | Builds and sharpens a project's domain model: terminology, glossary, ADRs. Adapted from upstream (MIT, original `LICENSE` kept in the folder). | Active |
| `teach` (no binary) | Manual. Guided learning of a new skill or concept over several sessions, in a teaching workspace. Adapted from upstream (MIT, original `LICENSE` kept in the folder). | Active |
| `wait-what` (no binary) | Manual. Use it when the last message did not land: the agent re-pitches it. Adapted from upstream (MIT, original `LICENSE` kept in the folder). | Active |
| `to-questionnaire` (no binary) | Turns a decision you cannot fully answer into a questionnaire for someone else to fill in. Adapted from upstream (MIT, original `LICENSE` kept in the folder). | Active |
| `research` (no binary) | Investigates a question against primary sources and saves cited findings to a repo file. Adapted from upstream (MIT, original `LICENSE` kept in the folder). | Active |
| `retro` (no binary) | Retrospective on a coding session that proposes improvements to the agent's environment. Adapted from upstream (MIT, original `LICENSE` kept in the folder). | Active |
| `diagnosing-bugs` (no binary) | A diagnosis loop for hard bugs and performance regressions, built around a feedback loop you can run. Adapted from upstream (MIT, original `LICENSE` kept in the folder). | Active |
| `blast-radius` (no binary) | Finds what a change could break and proves its one safety fact by running code. Adapted from upstream (MIT, original `LICENSE` kept in the folder). | Active |
| `show-me-your-work` (no binary) | A decision trail for long or unattended work: a TSV log with one row per decision. Adapted from upstream (MIT, original `LICENSE` kept in the folder). | Active |
| `wizard` (no binary) | Generates an interactive bash wizard for steps only a human can do: credentials, dashboards, CI secrets. Adapted from upstream (MIT, original `LICENSE` kept in the folder). | Active |
| `content-brief` (no binary) | Writes a factual **content source document** for a separate social-content agent: every number labelled with its origin, discrepancies resolved, private data scrubbed, hooks and angles at the end. Produces the source, never the posts. Bundles `scripts/check-content-doc.sh`. Own skill, MIT. | Active |
| `content-teardown` (Python script) | Takes video, reel, carousel and post links apart into layers (meta, transcript, video, frames, audio, slides). One Python 3 standard-library script, `scripts/content_teardown.py` (`--self-check` runs offline checks); output under `~/.content-teardown/`, Instagram login profile under `~/.content-teardown/.sessions/instagram` (mode 700, never opened or committed). Depends on external tools (`yt-dlp`, `ffmpeg`, `gallery-dl`, `whisper-cli`, `earshot`, the `watch` skill, `playwright-cli`), each reported as `ok:false` when missing. Own skill, MIT. | Active |
| `explain` (no binary, `bun cli/index.ts`) | Turns a topic, a PR or a document into an **animated explainer video**: the AI writes one `scene.js` from 63 pieces in 12 families (diagrams, screens, devices, numbers, annotations, movement, systems, camera, transitions), and the CLI builds a self-contained HTML player, runs a QA gate (bounds, overlap, text fit, no opening inverted question or exclamation marks, determinism), dumps stills to review, and exports a 1080p H.264 MP4. Three presets (`hologram`, `sketch`, `poster`) with bundled free fonts, plus user presets under `~/.explain/presets` (`preset new`, `check`, `use`, `promote`). Optional sound effects (synthesized in plain JS, mixed and muxed in the page) and voice-over (`say` on a scene; Kokoro started and stopped per use, or ElevenLabs only through an MCP, never an API key), both off by default; clips cached under `~/.explain/voice/`. Zero-dep export path: Bun plus a system Chrome or Chromium, no install, `ffprobe` optional. Output under `~/explainers/<yyyy-mm-dd>-<slug>/`. Own skill, MIT. | v1 |
| `agent-orchestration` (no binary) | Doctrine for a conductor plus a fleet of persistent worker sessions, successor of the boilerplates' `orca-orchestration`. Two launch modes behind one gate: `native` (Orca `worker-start`, the default) and `jitso` (only when the `jitso` binary is on PATH and the project has `jitso/jitso.yaml`); future providers add a file under `references/providers/`. Generic: project values come from the project's profile (`.agents/project.yaml` `orchestration:` block, when present). Vendor grammar is never copied: it points at `orca skills get orchestration`. `references/gotchas.md` is the only file allowed dates and Orca versions; gotcha and hard-rule ids are never renumbered. Own skill, MIT. | Active |
| `recursive-self-improvement` (Python script) | **Audits a session that used skills**: decides whose fault each failure was (skill, model, intent or environment), keeps a recurrence ledger, and proposes skill fixes that a person approves at three gates (findings, diff, apply). A three-level filter keeps it cheap: N0 is `scripts/rsi.py scan` (no model, reads Claude Code transcripts), N1 is a one-paragraph self-check, N2 is the full audit. One Python 3 standard-library script, `scripts/rsi.py` (`--self-check` runs offline checks); state under `~/.rsi/` (`ledger.jsonl`, `briefs/`, `candidates/`, `backups/`), never the cwd. Ships the `rsi-polisher` subagent source in `agents/` (install copies it to `~/.claude/agents/`); the polisher writes only under `~/.rsi/candidates/`. A repo opts in with two lines in its own `AGENTS.md`. Own skill, MIT. | Active |

`mkd` security contract (do not regress): per-run `x-mkd-token` + loopback bind on `/submit` (`--wait`
mode); stdout carries ONLY the Result JSON (`--artifact`: only the fragment path); the server shapes the body AGAINST THE SPEC (unknown items
dropped, stats/`wasRecommended` recomputed server-side) and must pass through every legit field —
silently dropping unknown fields is the bug class that once bit `rows[]`/`images[]`.

---

## 8. CURRENT STATE — mkd v2 shipped on `feat/mkd`

The wokitoki→mkd fusion is implemented on branch `feat/mkd` (rename + unified deck + docs), verified
with types/lint + `playwright-cli` E2E (copy-mode full flow, persistence hydration, highlight-to-quote,
`--wait` submit with stdout contract). UX/design reference lives at
`agentic-qa-boilerplate/.session/pbi-jira-cache-refactor/catchup-decisiones.html` (the validated
prototype). Pending follow-up in **`agentic-qa-boilerplate`**: its installer's `USER_LEVEL_SKILLS`
still lists `wokitoki` — update it to `mkd` once this lands on main.

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
