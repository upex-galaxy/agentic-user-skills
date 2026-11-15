---
name: wizard
description: Generate an interactive bash wizard that walks a human through steps only they can perform. Use when provisioning infrastructure; setting up credentials or CI secrets; walking an unfamiliar third-party dashboard; running a one-off migration or cutover.
license: MIT
metadata:
  author: UPEX Galaxy
---

# Wizard

Source: https://github.com/mattpocock/skills (skills/engineering/wizard), MIT, (c) 2026 Matt Pocock. Adapted by UPEX Galaxy.

A **wizard** is a bash script that walks a human, step by step, through a manual procedure that is tedious to do by hand and tedious to re-explain to an AI every time. It opens each URL, says exactly what to click and copy, captures the values, writes them where they belong (`.env`, GitHub secrets), confirms at every stage, and shows how many stages are left. It might configure third-party services, run a one-off migration, or move the project from one state to another.

[template.sh](template.sh) already provides the UX: stage-by-stage progress, confirmation gates, cross-platform URL opening (including WSL), hidden secret entry, idempotent `.env` upserts, `gh secret` and `gh variable` writes, and a closing summary. Your job is to scope the procedure and author its stages. The library above the `STAGES` marker is identical in every wizard, so leave it unedited.

Use a wizard only for steps the human must perform. Steps the agent can run itself stay with the agent.

A wizard is ephemeral by default: built for one run, saved to a scratch or `scripts/` path, deleted when the job is done. Commit it only when the user wants a repeatable setup path that lives in the repo.

## Process

### 1. Scope the procedure

Work out every manual step the human must take and every value captured along the way. Read the repo first and ask second:

- For setup: `.env`, `.env.example`, `.env.*`, `README`, `docker-compose*`, framework config, and `.github/workflows/*` (every `secrets.*` and `vars.*` reference is a value the wizard must produce).
- For a migration or transition: the current state, the target state, and the irreversible actions between them.

Then show the user the ordered list of stages and the values each produces, and confirm. They may add, drop, or reorder.

With nobody at the keyboard, write that list into the run's notes, take the narrowest reading of the procedure (fewest stages, no irreversible action the task did not name), say in the report that you assumed it, and continue.

**Done when:** every stage is named in order, and for each captured value you know (a) where the human gets it, (b) where it is written (`.env`, a GitHub secret, both, or nowhere, since some stages are pure actions), and (c) whether it is secret (hidden entry) or public.

### 2. Map each stage's journey

For each stage, write the path a human follows: which URL to open, what to do there, where a value is shown, which variable it fills. For example: "Dashboard → Developers → API keys → Reveal test key → copy". Where you do not know the current UI or the exact command, say so and ask the user or check the docs. Steps you cannot trace to a source stay out of the wizard.

**Done when:** every stage traces to concrete instructions a stranger could follow.

### 3. Author the wizard

Copy `template.sh` to the target path. Replace the example stage with one `stage` per step, in dependency order. Use the library helpers: `stage`, `say`/`step`, `open_url`, `ask`/`ask_secret`, `write_env`, `set_secret`/`set_var`, `pause`/`confirm`. Set `TOTAL_STAGES` to the number of stages you wrote.

Hold the bar the template sets: open the URL before asking for its value, use `ask_secret` for anything secret, `write_env` every persisted value, `set_secret` only the values CI needs, and `confirm` before any irreversible action. Each `stage` clears the screen so only the current step is visible, so keep a stage to one focused task and nothing the human needs scrolls away.

### 4. Verify and hand off

- Run `bash -n <script>`, and `shellcheck` if available.
- Run `chmod +x <script>`.
- Trace the script statically instead of running it end to end, since it opens browsers and blocks on human input: every value from step 1 is captured and lands where step 1 said, and every `set_secret` name exactly matches a `secrets.*` reference in CI.
- Tell the user how to run it. If it is a repeatable setup path, commit it and link it from the README so the next person runs the script instead of asking an AI. In an autonomous run, put the run command in the report for the launcher to pass on.

Secret values stay out of the chat and out of the agent's reach: the human types them into the wizard, and the wizard writes them.
