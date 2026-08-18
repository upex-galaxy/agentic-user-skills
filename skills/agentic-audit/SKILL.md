---
name: agentic-audit
description: "Evidence-based audit and scored evaluation of a whole software project — someone else's work or your own — against the agentic-dev / agentic-qa architecture. Produces a 0-5 score per axis plus a shareable single-file HTML report. WHEN to use: the user asks to evaluate, audit, review, grade, assess or give feedback on a PROJECT (not a single diff or PR): a student's or teammate's repo, a mentee's Dojo project, a candidate's take-home, their own boilerplate, or the seam between a product and the QA repo that tests it. Triggers on: `audit this repo`, `evaluate this project`, `review his/her work`, `how is this project doing`, `grade this`, `assess this codebase`, `give feedback on this repo`, `is this aligned with our architecture`, `project health check`, `pre-release readiness of the whole repo`, `evalúa este proyecto`, `audita este repo`, `revisa su trabajo`, `dame feedback de este proyecto`, `qué tan bien lo está haciendo`, `auditoría completa`, `evaluación del alumno`. Use this skill even when the user does not say the word `audit` — if the ask is 'look at everything this person built and tell me how it is', this is the right tool. It works on external repos over HTTPS (clone read-only into scratch) and needs no write access to the target. Do NOT use for: reviewing a single pull request or diff (that's a code-review skill), fixing bugs found in the target, one-file quality passes, or auditing a repo you must also modify — this skill is strictly read-only on the target."
license: MIT
compatibility: [claude-code, opencode, cursor, codex]
allowed-tools: Bash, Read, Write, Grep, Glob
complementary_categories: [meta-skill, quality]
---

# Project Audit

Audit an entire project and return a defensible verdict: a score per axis, findings ranked by what
actually matters, and (for external work) a single-file HTML report the user can hand to the person
who built it.

The value of this skill is not "find problems". It is **evidence over impression**. Anyone can open a
repo and have opinions. This produces claims that survive being challenged, because every one of them
points at a file, a command output, or a measurement.

## The one rule that shapes everything else

**The standard is carried by this skill, never read from the audited repo.**

Most targets are downstream copies of a boilerplate. If you audit a repo against its own vendored copy
of the rules, a project frozen on a six-month-old version scores as fully compliant, because it matches
the rules it shipped with. That is circular and worthless. The rubrics in `references/` are the
standard. The target's own `CLAUDE.md` is *evidence about the target*, not the yardstick.

If a sibling boilerplate happens to exist on the machine (`../agentic-dev-boilerplate`,
`../agentic-qa-boilerplate`), read it to enrich the "what's new upstream" section. Never require it.

## Phase 0 — resolve the mode

Two independent axes. Detect what you can, ask only what stays ambiguous.

**`subject` — what is being audited**

| Value | Meaning | Fingerprints to look for |
|---|---|---|
| `dev` | A product built with the agentic-dev pipeline | `DESIGN.md` + an app dir (`app/`, `src/`), `.context/PRD/`, `.context/SRS/`, `sprint-development` in `.claude/skills/` |
| `qa` | A testing project built on the agentic-qa boilerplate | `kata-manifest.json`, `tests/components/`, `playwright.config.ts` + `.context/master-test-plan.md`, `test-automation` in `.claude/skills/` |
| `pair` | A product **and** the QA project that tests it, including the seam between them | Two paths given, or one repo that carries both a product and a real test suite |

A single repo can be `pair` even without two directories: if a product repo grew its own test layer,
the seam still exists and is worth auditing. Judge by what is there, not by folder count.

**`lens` — who reads the result**

| Value | Register | Deliverable | Score |
|---|---|---|---|
| `external` | Written as the user speaking directly to the author. Warm, direct, never condescending. Opens and closes on something real and good. | Single-file HTML report | Yes, 0-5 per axis plus overall |
| `internal` | Our own repo. Blunt. No diplomacy layer, no praise sandwich, no grade inflation. | Findings in chat, or a Markdown report if asked | Optional, and never rounded up |

State the resolved mode in one line before starting, so a wrong guess gets corrected before the
expensive part: `Modo: subject=dev · lens=external · objetivo=<path o URL>`.

## Phase 1 — acquire, read-only

Clone external targets into scratch, never into the user's working tree:

```bash
git clone --quiet <url> "$SCRATCH/<name>"
```

Never write to, commit in, or push from the target. If the target is a local path the user already
owns, still treat it as read-only: this skill produces a judgment, not a fix. Offering to fix things
comes after the report is delivered and only if the user asks.

Record what you could NOT reach (a private Jira, a login-walled environment, a missing staging URL).
An audit that hides its blind spots reads as complete when it isn't, and the score inherits that lie.
Blind spots go in the report, in their own short section.

## Phase 2 — the six axes

Every subject scores the same six axes. Keeping the skeleton fixed is what makes scores comparable
across projects and across time (the same person re-audited in three months). What changes per subject
is the criteria inside each axis — those live in the rubric files.

| # | Axis | Asks |
|---|---|---|
| 1 | Foundation | Does the project know what it is? Requirements, architecture docs, domain language, decision records |
| 2 | Backlog | Is the work modeled, or does it live in someone's head? Epics, stories, criteria, defects, roadmap |
| 3 | Traceability | Can you get from a line of code back to the reason it exists? Commits, branches, PRs, tickets, promotion policy |
| 4 | Architecture | Does the code follow a shape someone chose on purpose? Layering, design system, fixtures, conventions |
| 5 | Verification | What proves it works, and does that proof run automatically? Tests, coverage, CI, environments |
| 6 | Agent discipline | Is a human steering the agent? Session logs, decision records, evidence of review and rejection |

Load exactly one rubric for the subject:

- `references/rubric-dev.md` — criteria and evidence anchors for `subject=dev`
- `references/rubric-qa.md` — same for `subject=qa`, including KATA layering and test-design doctrine
- `references/rubric-pair.md` — for `subject=pair`: the six axes applied to the **seam** (testability
  surface, credentials handoff, ATP/ATR flow, defect round-trip, traceability across the two repos)

How to collect the evidence for each axis (exact commands, what to grep, how to read a git history,
how to drive the live app) → `references/evidence-playbook.md`. Read it before Phase 2; it is the
difference between an audit and a vibe.

## Phase 3 — the live surface

If the project ships something a user can open, open it. A repo audit that never launches the product
misses the half of the story the author cares about most.

Screenshot the primary flows at mobile and desktop widths, read the console, check heading order, image
alternatives, language attribute, and tap-target sizes. `references/evidence-playbook.md` has the
measurement snippets. Keep this proportionate: this is a project audit, not a full test pass. Three or
four measured observations beat twenty guesses.

## Phase 4 — verify before you score

This phase exists because the first pass is always wrong somewhere, and a wrong finding in a document
someone else reads costs more than a missed one.

**Measure, don't eyeball.** A code block that looks clipped on mobile may sit in a scrollable wrapper.
Walk the ancestor chain and read the computed overflow before calling it a defect. A test that looks
flaky may be serializing on purpose. Read the comment above it first.

**Triage every finding into two tiers before assigning severity:**

- **Real problems** get weight: actual bugs, hardcoded credentials, reliability risks, missing
  automation gates, decisions with a concrete downside you can name.
- **Pattern deviations** are observations, not errors: the target does X where the reference
  architecture does Y, with no demonstrated cost. Almost nobody implements a reference architecture by
  the book. Phrase these as a comparison ("the pattern we use does X, yours does Y, here's the
  tradeoff"), never as a violation to fix, and do not let them drag the score down.

**Ask instead of assuming intent.** When the target deliberately diverges from the reference
architecture, the interesting question is *why*, and you don't have the answer. Put the question in the
report addressed to the author rather than scoring the divergence as ignorance. A deliberate,
well-reasoned divergence is a sign of seniority; treating it as a mistake destroys the credibility of
everything else in the document.

## Phase 5 — score and write

Scores are 0-5 per axis, one decimal, with the overall as the plain mean. Anchors:

| Score | Means |
|---|---|
| 5 | Complete and deliberate. Evidence is easy to point at |
| 4 | Solid, with one named gap that has a cheap fix |
| 3 | Present but partial. Works today, will hurt at scale |
| 2 | Started and abandoned, or copied without adaptation |
| 1 | Token presence. A template with nothing filled in |
| 0 | Absent |

Never invent a decimal to make a total look better. If two axes are 4 and four are 5, the overall is
4.7, not "about 5".

**Stamp the rubric version** (`rubric: agentic-audit v1`) in the report. A score without a rubric
version can't be compared to the next one, and comparison over time is most of the value for a mentor.

**`lens=external`** → build the HTML from `assets/report-template.html`. It is a single self-contained
file: inline CSS, screenshots embedded as base64 data URIs, no external requests, so it survives being
dropped into Slack, email, or a browser with no network. Structure:

1. Masthead: who it's for, who it's from, date, what was audited
2. Verdict: overall score and one sentence that stands alone
3. What was examined, including what could not be reached
4. Score per axis
5. What is above the median — specific, quoted from their own work, not generic praise
6. Findings, ordered by return on effort, each with the fix
7. Subject-specific deep dive (the architecture question, the seam, whatever this project's real fork is)
8. Next moves: a short numbered list they could start tomorrow
9. Close: something genuinely good, and the offer to re-run

Writing register for `external`: second person, the user's voice, mirroring the user's language. Quote
the author's own code or comments when praising: "you wrote X, and that's why Y" lands, "great job on
testing" doesn't. Never end on a critical note.

**`lens=internal`** → skip the HTML unless asked. Deliver the findings ranked, each with file and line,
no preamble, no sandwich. Our own repos don't need to be handled gently, and softening internal
findings is how they get ignored.

## Phase 6 — deliver and stop

Save the report next to the user's work (`.context/reports/` if it exists, otherwise ask), hand over the
path, and summarize in chat with the headline verdict plus a bullet menu of the findings so the user can
pull the ones they care about.

Then stop. Do not start fixing the target, do not open PRs against someone else's repo, and do not send
the report anywhere yourself. Handing a judgment about a person to that person is the user's call about
timing and framing, always.

## Re-audits

When auditing the same project again, read the previous report first if it exists. The most useful line
in a second audit is not the new score, it's the delta: what moved, what didn't, and whether the
findings from last time were acted on. Say so explicitly, per axis, and keep the rubric version fixed
across the comparison so the numbers mean the same thing.
