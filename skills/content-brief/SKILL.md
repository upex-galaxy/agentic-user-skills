---
name: content-brief
description: Source document for social content, with every number traced to its origin. Use when something built, a repo or a topic would make good content; asked for a content brief or a source for reels, videos, carousels.
license: MIT
metadata:
  author: UPEX Galaxy
---

# content-brief: capture a content source document

People build things, and some of them would make good reels, videos or carousels. This skill captures one of those moments as a **content source document**: a markdown file with the full story, every number traced to where it came from, the honest limits, and raw material (hooks, angles, metaphors, glossary) that a separate content agent will shape into posts.

You produce the source, never the posts. The content agent decides format, final hook and CTA; your job is to hand it facts it can trust and enough story that it never has to guess. A content agent that invents a number burns the brand, so everything here is built around traceability.

The quality bar is a ~5,000-word document about a refactor of agent instructions: a real before/after table, each figure labelled "(measured, <source>)" or "(calculated: <formula>)", a discrepancy between two sources called out and resolved, 12 quotable hooks, 3 angles with 7 beats each, and an "Honest limits" section listing what was never measured. Aim for that density; shorter sources give shorter documents, never padded ones.

## Workflow

```
1 intake -> 2 research -> 3 draft -> 4 scrub + check -> 5 humanizer -> 6 report
```

### 1. Intake (one message, no questionnaire)

Work out from the conversation, asking only for what you cannot infer:

| Field | What to settle | Default when unsaid |
|---|---|---|
| Source type | `feature` (just built), `repo` (a whole project), `reverse` (an existing thing, reconstruct why it exists), `topic` (a subject, no local artifact) | infer from the request and cwd |
| Where to look | paths, PRs, branches, date range, URLs | the current repo and this session's work |
| Angle / audience | e.g. "devs who use Codex", "QA juniors" | broad tech audience; propose 3 angles |
| Language | language of the document | the user's language; identifiers stay as-is |
| Output path | see "Where the file goes" | per the rule below |

If the source is obvious ("esto da para contenido" right after finishing a feature), do not ask anything: state your reading in one line and start.

### 2. Research

Read `references/research-protocol.md` for the per-type checklist (what to read for a feature, a repo, a reverse-engineering job, a topic) and the order that finds the real numbers fastest.

**Delegate the heavy reading when the source is large** (a whole repo, more than ~10 files, or more than ~50 KB of reports): dispatch ONE research subagent with the brief in `references/subagent-brief.md`, filled in. The conductor stays light: it does intake, reviews the draft, runs the checks and the humanizer pass, and reports. Small sources (one spike section, one PR, one ADR) are faster inline. Harnesses without subagents: do it inline and read in batches.

While reading, follow the evidence rules in `references/evidence-rules.md`. The short version:

- Every number carries its source: `(measured, <source>)`, or `(calculated: <formula>)` when you derived it from measured numbers.
- When two sources disagree, use the measured / commit-anchored one, write the other next to it, and say which you used and why.
- Anything you could not confirm goes to an "unverified" list, never into the prose as fact.
- No invented numbers, quotes, user counts or testimonials. A missing figure is written "no data".

### 3. Draft

Use the section shape in `references/document-template.md`. Write in the document language, with the writing rules listed there (no em/en dashes in prose, no "not X, but Y" contrasts, no inflated words, varied sentence length). The "Content material" section is where the value for the content agent concentrates: hooks must be concrete (a number, a tool, an error), and every hook that leans on a number keeps its label.

### 4. Scrub and check

The document will be read by another agent and pieces of it will be published. Apply the privacy rules in `references/evidence-rules.md#privacy` (no absolute local paths, usernames, tokens or secret values, session ids, terminal handles, private URLs; public repo names and PR numbers are fine). Then run the checker on the saved file:

```bash
bash <this-skill-dir>/scripts/check-content-doc.sh <path-to-doc.md>
```

It fails on privacy hits and missing sections, and reports dashes, labels and word count. Fix every failure and re-run until it exits 0. Then re-read the whole saved file once with fresh eyes: does every number have a label, does the summary match the measurements table, are the limits honest.

### 5. Humanizer pass

Load the `humanizer` skill in file mode on the saved document: it rewrites prose only and leaves code blocks, tables, numbers, labels, paths and identifiers untouched. If `humanizer` is not installed, apply the writing rules from the template yourself. Re-run the checker after the pass (a rewrite can reintroduce a dash).

### 6. Report back

Short, in the user's language:

1. The path (always, absolute or `~`-relative so they can open it) and the word count.
2. The 5-line summary, copied from the document.
3. The main measurements table (before/after), or "no hay mediciones" when the source has none.
4. Discrepancies found between sources and how each was resolved, plus any place where the evidence corrected the request's own framing.
5. The unverified items.
6. The state of the work as the document states it (merged, in progress, designed only).

Do not paste the whole document into the chat. Do not write posts.

## Where the file goes

1. A path the user names wins.
2. Inside a git repo whose root has a `.session/` folder: `<repo-root>/.session/content/<slug>.md`. Confirm with `git check-ignore` that it will not be committed; if it would be, warn the user in the report.
3. Anywhere else: `~/content-briefs/<slug>.md` (one inbox for every source document, and nothing lands in a repo where it could be committed by accident).

`<slug>` is a short kebab-case name for the story in the document language (`divulgacion-progresiva`, `un-solo-harness`). If the file exists, ask before overwriting or add `-2`.

## Related skills

- If you have a social-content skill, it can advise on what the content agent needs: concrete hooks, an objective per piece (reach, authority, connection, conversion) and a hard rule against invented numbers and sales language. Leave posts to the content agent; this document carries no prices, offers or calls to buy.
- The document is local working material. Keep it out of commits and out of publication.

## Reference files

| File | Read when |
|---|---|
| `references/research-protocol.md` | step 2, always: per source-type checklist |
| `references/evidence-rules.md` | step 2 and step 4: labels, discrepancies, unverified list, privacy |
| `references/document-template.md` | step 3: section shape, writing rules, a filled mini-example |
| `references/subagent-brief.md` | step 2, when delegating the reading |
| `scripts/check-content-doc.sh` | step 4 and after step 5 |
