# Rubric — `subject=pair`

For a product **and** the testing effort aimed at it. Load only this file when `subject=pair`.

This mode audits something the other two cannot see: the **seam**. A product can score well on its own,
a test suite can score well on its own, and the handoff between them can still be broken, which is
where most real quality loss happens.

Run the relevant parts of `rubric-dev.md` and `rubric-qa.md` for context, but score *these* six axes.
Report the two component scores as supporting information, not as the headline.

The seam exists even inside a single repository. If a product grew its own test layer, the same
questions apply: the two roles are still distinct, they are just wearing the same hat.

---

## Axis 1 — Testability surface

Can someone test this without asking the author anything?

| Look for | Where |
|---|---|
| A testability guide reachable from the running app | a `/qa` route or published document |
| Credentials for test accounts, delivered without being committed | environment variable pointing at a tracker page or vault |
| Seeded or generatable test data, and a way to reset it | seed scripts, factory endpoints |
| Stable hooks for automation: test ids, accessible names, predictable routes | markup, selector strategy |
| Deterministic behavior available: no unavoidable AI, randomness, or third-party dependency in the critical path | feature flags, deterministic modes |

- **5** — an external tester is productive on day one without a conversation
- **3** — the app is testable by someone who already knows it
- **1** — testing requires the author on a call

This axis rewards work that feels invisible. Say so explicitly when it is present: a testability page
with real credentials is the single highest-leverage artifact a developer can hand a QA engineer, and
almost nobody builds one unprompted.

## Axis 2 — Requirement handoff

Do the criteria the developer built against and the cases the tester wrote come from the same place?

| Look for | Where |
|---|---|
| Acceptance criteria written before implementation, not reconstructed after | ticket history, refinement artifacts |
| Test cases derived from those criteria, plus risk beyond them | case inventory vs criteria |
| Ambiguities raised before the sprint rather than filed as defects after | refinement notes, early comments |
| Shared vocabulary between the product's language and the test names | glossary vs test titles |

- **5** — criteria refined before build, cases derived from them and extended by risk, ambiguities
  resolved upstream
- **3** — criteria exist, cases exist, no visible relationship between them
- **1** — testing discovers what the feature was supposed to do

The measurable signal: the ratio of defects found before implementation to defects found after. A
project with dozens of post-build defects and zero pre-build questions is doing detection, not
prevention, and that is worth naming without treating it as failure. It is the normal starting point,
and it is measurable against itself over the next few sprints.

## Axis 3 — Traceability across the boundary

Does an identifier survive the whole trip?

```
story -> criteria -> test plan -> test case -> automated test -> execution -> defect -> back to story
```

| Look for | Where |
|---|---|
| Test plan and results artifacts attached to the story, filled | tracker fields or linked items |
| Cases carrying identifiers that appear in the automated code | decorators, annotations |
| Defects linked to the story that spawned them and to the run that found them | tracker links |
| Quality work parented consistently rather than scattered | tracker hierarchy |

- **5** — the chain is unbroken in both directions and mechanical, not narrative
- **3** — links exist as prose in comments; a human can reconstruct the chain with effort
- **1** — the chain breaks at the first hop

## Axis 4 — Defect round-trip

What happens to a finding, from discovery to closed?

| Look for | Where |
|---|---|
| Defects with reproduction steps, expected vs observed, and measured evidence | defect records |
| Severity assigned with a stated rationale, priority derived from it | fields |
| Fix verification recorded, on the environment where it matters | retest notes |
| Regression protection added for defects worth protecting | new case or test referencing the defect |

- **5** — findings carry evidence, get verified after the fix, and the important ones leave a
  regression test behind
- **3** — good reports that vanish once closed; nothing prevents recurrence
- **1** — defects as chat messages

A defect that produced no test is a defect that will come back. Count how many closed findings left
protection behind; the ratio is a single number that captures this axis honestly.

## Axis 5 — Environment and release gates

Is there a place to test that resembles production, and does anything stop a bad release?

| Look for | Where |
|---|---|
| An environment between local and production, with its own data | branch to environment mapping |
| A gate that runs the suite before promotion | CI workflows, branch protection |
| Deploy verification: does anyone check after the promotion | smoke checks, deployment notes |
| Rollback path defined before it is needed | strategy config, runbook |

- **5** — promotion is gated by an automated check and verified after landing
- **3** — a real staging environment with a human-only gate
- **1** — one environment, and it's production

## Axis 6 — Role separation

Are the two hats distinguishable, whoever is wearing them?

| Look for | Where |
|---|---|
| Test artifacts that are not just a restatement of implementation notes | plans, case content |
| Findings that surprised the author, not only what they already knew was unfinished | defect content |
| Testing that attacks the product rather than confirming it | negative cases, boundaries, abuse paths |
| The tester's view recorded separately from the builder's | separate artifacts or clearly separated sections |

- **5** — the testing view is independent enough to have found things the build view missed
- **3** — competent verification of what was built, little adversarial pressure
- **1** — testing is the developer re-running the happy path

For a solo author wearing both hats, this axis measures discipline rather than headcount. The question
is whether they can put on the second hat honestly, and the evidence is simple: did testing produce
surprises. If every finding is something they already had on a list, the two roles have collapsed into
one, and saying so gently is one of the more useful things this audit can do for them.
