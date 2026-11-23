# agentic-user-skills

A monorepo of **user-level agentic skills** — cross-agent tools that improve the *user's* experience across **any** repo and **any** coding agent (Claude Code, OpenCode, Cursor, Codex…), rather than skills tied to one project's stack.

Other repos (e.g. `agentic-qa-boilerplate`, `agentic-dev-boilerplate`) install these at the **user (global)** level via their installers, so the same skill is never duplicated per project. This repo is the single source of truth.

## Install a skill (user-level)

These skills follow the [`skills`](https://skills.sh) convention. Install one globally with:

```bash
bunx skills add --global https://github.com/upex-galaxy/agentic-user-skills mkd
```

A user-level skill loads automatically in every project — no per-repo wiring.

Install any other skill the same way, swapping the last word for its name:

```bash
bunx skills add --global https://github.com/upex-galaxy/agentic-user-skills humanizer
bunx skills add --global https://github.com/upex-galaxy/agentic-user-skills grill-me
```

Skills marked Manual only run when you type their command. Each adapted skill keeps its original MIT `LICENSE` file and a `Source:` line under its title.

## Skills

| Skill | Command | What it is |
| --- | --- | --- |
| [`agentic-audit`](skills/agentic-audit/SKILL.md) | — | An **evidence-based project auditor**: reads a whole repo (git history, context artifacts, agent config, tracker mirror, tests, CI) and drives the live app, then scores six axes 0-5 and writes a self-contained HTML evaluation. Two modes: `subject` (`dev` \| `qa` \| `pair`) picks the rubric, `lens` (`external` \| `internal`) picks the register and deliverable. Read-only on the target. |
| [`mkd`](skills/mkd/SKILL.md) | `bun cli/index.ts` (no install) | **MKD (Make Decision)** — a browser-based **decision-deck CLI**: the AI writes a spec of items (decision / question / report / answerable table) and the CLI renders a Catch-Up-style deck — one screen per item, options with **written justifications**, a ★ recommended badge, custom option, skip, quotes, live stats, localStorage persistence. Default flow is non-blocking copy-paste (the user pastes the Result JSON into the chat as the execution contract); `--wait` keeps a blocking same-turn handshake. Inside Orca the deck opens in a worktree-bound tab and **Send to Agent** returns the Result on stdout, with no copy step (`--copy` opts out). In Claude Code, `--artifact` renders the deck as a claude.ai artifact the agent publishes: **Send to Agent** stores the Result in the artifact's database and wakes the session, with no localhost and no copy step. Successor of `wokitoki`/`toki`. |
| [`humanizer`](skills/humanizer/SKILL.md) | — | Strips AI writing patterns from text a person will read: messages, posts, documents, READMEs. Upstream: Lauren Tan, `unslop` in [cursor/plugins](https://github.com/cursor/plugins) (`pstack/`). MIT. |
| [`writing-for-agents`](skills/writing-for-agents/SKILL.md) | — | Rules for writing skills and instruction files that agents follow: pointers, the two loads, a no-op test, positive prompting. Upstream: Matt Pocock, [mattpocock/skills](https://github.com/mattpocock/skills). MIT. |
| [`technical-writing`](skills/technical-writing/SKILL.md) | — | A docs standard: Diátaxis modes, Google developer style, Simplified Technical English. Covers docs, RFCs, READMEs, PR descriptions and commit messages. Upstream: Lauren Tan, [cursor/plugins](https://github.com/cursor/plugins) (`pstack/`). MIT. |
| [`grill-me`](skills/grill-me/SKILL.md) | `/grill-me` | Manual. A relentless interview that sharpens a plan or design, in rounds of numbered questions. Upstream: Matt Pocock. MIT. |
| [`grilling`](skills/grilling/SKILL.md) | — | The interview loop other skills call: asks until the plan or decision holds up. Upstream: Matt Pocock. MIT. |
| [`grill-with-docs`](skills/grill-with-docs/SKILL.md) | `/grill-with-docs` | Manual. The same interview, but it also writes the glossary and ADRs as decisions settle. Upstream: Matt Pocock. MIT. |
| [`domain-modeling`](skills/domain-modeling/SKILL.md) | — | Builds and sharpens a project's domain model: terminology, glossary, ADRs. Upstream: Matt Pocock. MIT. |
| [`teach`](skills/teach/SKILL.md) | `/teach` | Manual. Guided learning of a new skill or concept over several sessions, in a teaching workspace. Upstream: Matt Pocock. MIT. |
| [`wait-what`](skills/wait-what/SKILL.md) | `/wait-what` | Manual. Use it when the last message did not land: the agent re-pitches it. Upstream: Matt Pocock. MIT. |
| [`to-questionnaire`](skills/to-questionnaire/SKILL.md) | — | Turns a decision you cannot fully answer into a questionnaire for someone else to fill in. Upstream: Matt Pocock. MIT. |
| [`research`](skills/research/SKILL.md) | — | Investigates a question against primary sources and saves cited findings to a repo file. Upstream: Matt Pocock. MIT. |
| [`retro`](skills/retro/SKILL.md) | — | Retrospective on a coding session that proposes improvements to the agent's environment. Upstream: Matt Pocock. MIT. |
| [`diagnosing-bugs`](skills/diagnosing-bugs/SKILL.md) | — | A diagnosis loop for hard bugs and performance regressions, built around a feedback loop you can run. Upstream: Matt Pocock. MIT. |
| [`blast-radius`](skills/blast-radius/SKILL.md) | — | Finds what a change could break and proves its one safety fact by running code. Upstream: Lauren Tan, [cursor/plugins](https://github.com/cursor/plugins) (`pstack/`). MIT. |
| [`show-me-your-work`](skills/show-me-your-work/SKILL.md) | — | A decision trail for long or unattended work: a TSV log with one row per decision. Upstream: Lauren Tan, [cursor/plugins](https://github.com/cursor/plugins) (`pstack/`). MIT. |
| [`wizard`](skills/wizard/SKILL.md) | — | Generates an interactive bash wizard for steps only a human can do: credentials, dashboards, CI secrets. Upstream: Matt Pocock. MIT. |
| [`content-brief`](skills/content-brief/SKILL.md) | — | Writes a factual **content source document** for a social-content agent: a story-shaped markdown file where every number is labelled with its origin, discrepancies are resolved, private data is scrubbed, and hooks, angles, metaphors and a glossary close it. Produces the source, never the posts. Ships a checker script. Own skill. MIT. |
| [`content-teardown`](skills/content-teardown/SKILL.md) | `/content-teardown` | Takes video, reel, carousel and post links apart into layers an agent can read: metadata, transcript, mp4, frames, sound timeline, slides and caption. Writes to `~/.content-teardown/`. Python 3 standard library only; needs `yt-dlp`, `ffmpeg` and, per level, `whisper-cli`, `gallery-dl`, `earshot`, the `watch` skill and `playwright-cli`. Own skill. MIT. |
| [`explain`](skills/explain/SKILL.md) | `bun cli/index.ts` (no install) | Turns a topic, a PR or a document into an **animated explainer video**: the AI writes a scene file from ready-made pieces (63 pieces: flows, sequences, architecture, code, devices, numbers, tables, timelines, state machines), and the CLI checks the layout, dumps stills to review and exports a 1080p MP4 plus an HTML preview. Three presets (hologram, sketch, poster) plus your own, bundled fonts. Optional sound effects and voice-over (Kokoro, or ElevenLabs through an MCP), both off by default. Needs only Bun and Chrome or Chromium. Output under `~/explainers/`; `prune` deletes exported MP4s, which re-export from `scene.js` and the voice cache. Own skill. |
| [`agent-orchestration`](skills/agent-orchestration/SKILL.md) | - | Doctrine for a **conductor plus a fleet of persistent worker sessions**: when to split work, topology by what the work writes, the worker contract, channel discipline, claims over shared data, the close sequence, unattended routines and a dated ledger of measured gotchas. Orca is the default provider (`native` launch); a `jitso` launch mode applies when the `jitso` binary is on PATH and the project has `jitso/jitso.yaml`. Loads beside the vendor `orchestration` guide (`orca skills get orchestration`) and points at it instead of copying it. Successor of the boilerplates' `orca-orchestration`. Own skill. MIT. |
| [`recursive-self-improvement`](skills/recursive-self-improvement/SKILL.md) | — | **Audits a session that used skills** and decides whose fault each failure was: the skill, the model, the user's intent or the environment. A three-level filter keeps it cheap (a script that reads the transcript with no model, a one-paragraph self-check, then the full audit), a recurrence ledger keeps one bad session from triggering an edit, and a person approves every change at three gates (findings, diff, apply) with a backup and a rollback. Ships the `rsi-polisher` subagent, which writes a tested candidate copy under `~/.rsi/candidates/` and never touches the live skill. Python 3 standard library only; state under `~/.rsi/`. A repo opts in with two lines in its `AGENTS.md`. Own skill. MIT. |

## Plugins (Claude Code)

Some tooling cannot travel as a skill, because a skill is instructions and nothing more.
Anything that has to run **automatically on a lifecycle event** needs a plugin: the host
executes it, the model is not involved.

That is a different install path, in the same repo:

```bash
/plugin marketplace add upex-galaxy/agentic-user-skills
/plugin install readback@upex-agentic
```

| Plugin | Command | What it is |
| --- | --- | --- |
| [`readback`](plugins/readback/README.md) | `/readback:speak` | Speaks a short summary at the end of every reply, **without changing the reply itself**. Output only: no microphone, no conversation loop. Built for your own ElevenLabs voice (`PROVIDER=auto` falls back to Kokoro, then the system voice), with four personas, volume leveling and a user-only credit footer. Hooks `Stop` and `UserPromptSubmit`; failures are logged and reported, never fatal. Ships its own deck: [`how-it-works.es.html`](plugins/readback/how-it-works.es.html) / [`.en.html`](plugins/readback/how-it-works.en.html). |

### Skills or plugin?

| | `bunx skills add` | Claude Code plugin |
| --- | --- | --- |
| Installs | Instructions (`SKILL.md`, references) | Skills, commands, agents, **hooks**, MCP servers |
| Runs on a lifecycle event | no | **yes** |
| Cross-agent | yes (Claude Code, OpenCode, Cursor, Codex) | Claude Code today; see each plugin's compatibility table |

Prefer a skill. Reach for a plugin only when the thing has to fire on its own.


## Layout

```
agentic-user-skills/
  .claude-plugin/
    marketplace.json      # the plugin marketplace index for this repo
  skills/
    <skill-name>/
      SKILL.md            # frontmatter + when/what/how + first-run setup
      references/         # deep docs loaded on demand
      how-it-works.es.html  # the skill's visual deck (Spanish), self-contained
      how-it-works.en.html  # its English twin, same slides
      cli/                # OPTIONAL bundled CLI — decoupled, zero external deps
  plugins/
    <plugin-name>/
      .claude-plugin/
        plugin.json       # manifest: metadata + userConfig
      hooks/hooks.json    # lifecycle hooks
      commands/*.md       # slash commands
      scripts/            # what the hooks actually run
  package.json            # gate scripts (lint / types)
  tsconfig.json eslint.config.js .gitignore skills.sh.json
```

**A skill is just a directory.** It may be pure instructions (`SKILL.md` + `references/`) or bundle a self-contained CLI. Each skill is independently extractable.

## Conventions

- **Decoupled CLIs.** Any bundled CLI imports **runtime built-ins only** (Bun / `node:` built-ins) — zero external npm deps, relative imports only. This is what lets a skill travel via `bunx skills add` and stay independently extractable.
- **Python exception.** `content-teardown` bundles one Python 3 script (standard library only, no pip install) because its job is to orchestrate `yt-dlp`, `ffmpeg` and `gallery-dl`. `recursive-self-improvement` does the same with `scripts/rsi.py` for transcript scoring, hashing and diffs. Bun stays the rule for any CLI that ships TypeScript.
- **Zero host footprint.** A bundled tool writes its output (caches, results, artifacts) under the user's home (e.g. `~/.mkd/`), never the consumer repo's cwd.
- **Plugins fail silent.** A plugin hook runs on every turn, so it must never interrupt the session. Any failure path — missing config, dead endpoint, absent dependency — exits 0 without output.
- **Plugins declare their compatibility.** Each plugin's README carries an OS table and an agent table, marking what is *tested* apart from what is merely *expected to work*.
- **Every skill ships its deck.** `how-it-works.es.html` and `how-it-works.en.html` sit in the skill folder, so the deck installs and updates with the skill (`~/.agents/skills/<name>/how-it-works.<lang>.html`). Each one is a short, self-contained HTML deck (5 to 8 slides) built only from that skill's own files; the Spanish one uses tuteo and no opening ¿ or ¡. The boilerplates' Pages sites copy them on deploy and link to them from their user-level skills portal.
- **No install step.** A bundled CLI runs straight from the skill directory (`bun <skill-dir>/cli/index.ts`) — no compiled binary, nothing added to PATH.

## Toolchain

- **Bun** runs the TypeScript directly.
- Gates: `bun run types:check` (`tsc --noEmit`), `bun run lint:check` (ESLint, `@antfu/eslint-config`) and `bun run test` (`bun test`); `bun run repo:check` runs all three.

## License

MIT
