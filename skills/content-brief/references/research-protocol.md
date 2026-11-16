# Research protocol

Goal of research: collect enough verified facts to tell the story (problem, idea, design, build, numbers, result, limits) and enough concrete detail for hooks. Read primary sources first; summaries (final reports, chat recaps) are useful for the story but their numbers must be traced back to where they were measured.

Keep a running fact list while you read, one line per fact:

```
- <fact> | <source, short name> | measured / calculated / claimed / unverified
```

The draft is written from this list, which is what makes every label honest.

## Which type is it

| Type | Signal | Core question the document answers |
|---|---|---|
| feature | "I just finished X", work done in this session, a merged PR | what was broken, what changed, what it measurably bought |
| repo | "make content from this repo", a project link or folder | what this project is, who it is for, what is unusual about it |
| reverse | "this already existed", "why does this exist", an old mechanism | why it exists: the problem it was built for, reconstructed from evidence |
| topic | a concept, a trend, a tool, no local artifact | what is true about it today, with cited public sources |

Mixed cases are normal (a feature in a repo you also need to explain). Use the main type's checklist and borrow from the others.

## feature

Read in this order; stop when a step adds nothing new.

1. **Decision trail.** Plan or spike documents, decision logs (JSON/markdown), issue or ticket text, design docs and their addenda. They hold the "why" and the options that were rejected (good story material).
2. **Measurements.** Per-unit or per-PR reports, benchmark output, test counts, before/after sizes, timings. These are the numbers. Note the commit or date each was taken at.
3. **ADRs / changelogs** written for the change. Often the most precise "before" figure, tied to a commit.
4. **The diff itself.** `git log --oneline <range>`, `git show --stat`, `gh pr view <n> --json title,body,mergedAt,additions,deletions` (when `gh` is available). Count PRs, files, tests. Merge dates from `git log`, not from memory.
5. **The result in place.** Read the final files (config, script, doc) to quote one small real snippet (a config block, a log line) that makes the design concrete.
6. **Check the state of the work, read-only.** `git status --short`, `git worktree list`, `git log --oneline <base>..<branch>` and the remote default branch tell you whether the change is merged, on a branch, or uncommitted in a worktree. Uncommitted or unmerged work is described as "in progress, not merged" and never counted as a result; do not run its tests or modify it.
7. **Re-measure when cheap.** If a size or count can be checked now (`wc -c`, `wc -l`, a test count), do it and label it "(measured with `wc -c` on <date>)". Note when today's value differs from the report's.

## repo

1. `README`, top-level docs, `package.json` / `pyproject.toml` / equivalent (stack, scripts, version).
2. Architecture: folder tree (2 levels), entry points, any `docs/architecture` or ADR folder.
3. History: `git log --reverse | head` (when it started), `git shortlog -sn | head` only for counts (no personal names in the output unless public maintainers), tags/releases, commit count, recent activity.
4. Size and shape: file counts per language, test counts, CI config. Label all as "(measured, <command>, <date>)".
5. What is unusual: the one mechanism or decision a viewer would not expect. That becomes the story spine.
6. Public signals only if public: stars, issues, PR counts from `gh`.

## reverse (an existing thing, reconstruct why)

The risk here is making up a plausible origin story. Reconstruct from evidence and say how sure you are.

1. **Find the birth.** `git log --follow --diff-filter=A -- <file>` for the first commit; `git log -S '<identifier>'` (pickaxe) for when a concept appeared; the PR or issue that introduced it.
2. **Read the first version**, then the biggest later changes (`git log --follow --stat -- <file>`). The commit messages and PR bodies often state the problem.
3. **ADRs, comments, docs** that mention it. Comments like "workaround for", "because X truncates" are direct evidence of the why.
4. **What breaks without it.** Tests that cover it, callers (`grep -rn`), configs that depend on it.
5. **Write the reconstructed why with a confidence mark**: "documented (ADR-0007)", "inferred from commit `abc123` and test X", or "no evidence: hypothesis". Hypotheses go in "unverified", never in the story as fact.

## topic (no local artifact)

1. **Search the web, Exa first** (`web_search_exa`, `web_fetch_exa` when available), then other search tools. Prefer primary sources: official docs, source code, papers, the author's own post, vendor changelogs.
2. Two independent sources for any number that will become a hook. One source is fine for descriptive facts; mark it.
3. Record title, publisher, URL and date for every source; check the date, since topics move fast and a 2-year-old benchmark may be wrong today.
4. For library / CLI / API behaviour, current docs beat memory (Context7 or the vendor docs).
5. If you have a related artifact (a repo using the tool, a past measurement), add it: first-hand numbers make the strongest hooks.

## Material that feeds "Content material"

Collect these while reading, they are hard to find afterwards:

- Surprising numbers (big ratios, "0 of 81", silent limits like "cuts at 32,768 bytes").
- A one-line real artifact: a log line, a config key, an error message, a command.
- The rejected options and why (good material for "what did not work" beats).
- Anything that went wrong during the build and how it was caught.
- Plain-language analogies the sources themselves use.
