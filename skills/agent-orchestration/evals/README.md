# Evals for agent-orchestration

These are activation evals: each case in `evals.json` pairs a prompt with the outcome expected
(`should_trigger`: does the skill fire or stay quiet). The runner checks structure only, not
behavior: valid JSON, a non-empty prompt and expected output, a boolean `should_trigger`, a unique
`id`, and a `skill_name` that matches the folder. Judging whether a real model activates the skill
needs a model run and a grader, which this folder does not provide.

Run the QA boilerplate's `scripts/run-skill-evals.ts` (it discovers
`<cwd>/.agents/skills/*/evals/evals.json`) in one of two ways:

- From a scratch folder (always works): create `.agents/skills/` in it, link `agent-orchestration`
  there to this skill's folder (or to an installed copy), and run the runner with the scratch folder
  as the working directory.
- With `$HOME` as the working directory, only when the install put the skill in
  `~/.agents/skills/` (an install for Claude Code alone copies it to `~/.claude/skills/` instead).

Keep case ids unique and the folder name equal to `skill_name`.
