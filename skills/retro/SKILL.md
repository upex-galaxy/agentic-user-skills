---
name: retro
description: Retrospective on a coding session that proposes improvements to the agent's environment.
metadata:
  author: UPEX Galaxy
---

# Retro

Source: https://github.com/mattpocock/skills (skills/engineering/retro), MIT, (c) 2026 Matt Pocock. Adapted by UPEX Galaxy.

A **retrospective** has been requested, by the user or by a skill that loaded this one. You are suggesting improvements to the coding agent's **environment** to improve future runs.

## Steps

1. Call the Skill tool with "writing-for-agents" for the writing style guide.

2. Read the primary sources for the session you were given. This may mean searching session logs on this machine. With no session named, use the current one.

3. Look for candidates for improvement in these categories.

- **Navigation**: how easy was it for the agent to find the right files? Are there hidden dependencies between files? Would a **navigation pointer** make it easier? _Use when_ the session took a long time to find a piece of information.
- **Automated checks**: are there automated checks that could catch errors the agent made? Linting, typing, tests, filesystem linters? Read the repo's own check command first (its `package.json` or build-tool `lint`/`check` scripts, its CI workflow), so a check that already exists but sits unwired or silently broken is the finding, not a reinvention. A repo with no **guardrail** (no pre-commit hook and no CI job running its lint, typecheck or test command) is itself a finding: an un-linted repo is a standing missed opportunity, not a neutral default. _Use when_ the agent made a mistake an automated check could have caught, or the repo has no guardrail at all.
- **Coding standards**: should the **reviewer agent** be given a new rule to enforce? Should an existing rule be removed or clarified? Classify the violation first. A **mechanical** one (a fixed syntactic pattern, a banned API, an import shape, a file-location rule) gets a deterministic check: a custom rule in the repo's own linter, a new pre-commit hook, or a new CI job, whichever the repo's language and existing guardrail make cheapest. Build the check before writing the rule. Reserve the repo's coding-standards file (`CODING_STANDARDS.md` or its equivalent) for genuine **judgement calls**: cross-file consistency, "matches the surrounding style," anything no guardrail could substitute for. _Use when_ the reviewer agent failed to catch a mistake.
- **Global instruction file**: are there steering instructions in `AGENTS.md` or `CLAUDE.md` that belong in coding standards or automated checks instead? _Use when_ the file is particularly large, in the repo or in the user's global scope.
- **Tool economy**: did the agent make expensive tool calls that could be streamlined? Is any custom tooling (CLIs, MCP servers) particularly token-inefficient? _Use when_ the agent made an expensive tool call.
- **No-ops**: look for instructions in steering files that don't change the agent's behavior. _Use when_ the steering files are large and unwieldy.
- **Information access**: look for ways to give the agent more information, such as teeing dev server logs or read-only access to third-party services. _Use when_ a crucial piece of information was not available to the agent.

4. Rank the candidates by severity and deliver them.

   - A person started this: present the candidates to them in that order.
   - Nobody is at the keyboard (a worker, a routine, a subagent): write the ranked candidates to a file in the run's notes, say its path in your report, and apply none of them. The launcher decides.

Done when every category above has been checked against the session and each candidate names the file or check it would change.

## Reference

### Implementation vs review

All work goes through two stages: implementation and review. The implementation agent has the most **context pressure**. It explores, writes code, and debugs failures.

The review agent has the least. It receives a diff, so it needs no exploration, and it often needs neither to write code nor to debug.

So the review agent imposes the coding standards, and the implementation agent does not.

### Files

You have access to several files in the repo:

- `CLAUDE.md` / `AGENTS.md`: pushed to the context window of every agent working in the repo. Use them sparingly, usually only for **navigation pointers** to other files.
- `CODING_STANDARDS.md` or its equivalent: read during review, not implementation. Add **navigation pointers** to docs folders once it passes 1,000 lines.
- Docs: reference files that other files point to. Look for existing docs before writing new ones.
- Skills: use skills for docs (their description goes into the agent's context window) and for user-invoked commands. Follow the advice in the `writing-for-agents` skill.
