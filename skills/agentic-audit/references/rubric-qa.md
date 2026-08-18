# Rubric — `subject=qa`

Criteria for a testing project built on the agentic-qa boilerplate (or any serious test-automation repo
claiming a layered architecture). Load only this file when `subject=qa`.

The reference architecture is KATA:

```
Layer 4    Fixtures        dependency injection: { api }, { ui }, { test }
Layer 3.5  Steps           reusable ATC chains used as preconditions
Layer 3    Components      LoginPage, UsersApi ... the @atc methods live here
Layer 2    Base            UiBase (Playwright helpers), ApiBase (HTTP helpers)
Layer 1    TestContext     config, faker, environment, agnostic utilities
```

An ATC is one complete, atomic mini-flow. It never calls another ATC; reusable chains belong in Steps.
Each ATC carries an identifier tying it to a case in the test-management system.

A project using a different architecture is not automatically worse. Judge whether *a* deliberate shape
exists and holds, then compare against KATA in the report so the author can decide. Pattern deviation
with no demonstrated cost is an observation, never a deduction.

---

## Axis 1 — Foundation

Does the test project know what it is testing and why?

| Look for | Where |
|---|---|
| A master test plan: what gets tested, at which level, and the reasoning | `.context/master-test-plan.md` |
| System maps of the product under test | `.context/business/` |
| Environment matrix with URLs and credential sources | `.agents/project.yaml`, `.env.example` |
| Test-architecture decision records | `.context/ADR/` |

- **5** — a plan that states risk-based priorities and level assignment, plus ADRs for the hard-to-
  reverse choices (runner, fixture model, isolation, auth in tests)
- **3** — a plan that lists features without saying what deserves depth
- **1** — the boilerplate's template, unedited

## Axis 2 — Backlog and test inventory

Is the test work itself modeled?

| Look for | Where |
|---|---|
| Cases documented in the test-management system, not only in code | tracker / TMS |
| Plan and results artifacts per story (ATP / ATR) | story fields or linked items |
| Defects filed with steps, evidence, severity, and a link to the source story | tracker, `.context/PBI/defects/` |
| A registry of what exists so components and cases are not duplicated | `kata-manifest.json` |

- **5** — cases live in the TMS with identifiers, plans and results are filled per story, defects carry
  evidence and link back to their story, the manifest is current
- **3** — cases exist only as code or only as a scenario file; plans and results empty
- **1** — no inventory; nobody can answer "is this covered" without reading the suite

A frequent and useful finding: the custom fields for plans and results exist in the tracker and are
empty everywhere. That is rails without a train, and it is a cheap gap to close.

## Axis 3 — Traceability

Can you go from a failing test to the requirement it protects, and back?

| Look for | Where |
|---|---|
| Case identifier on each automated test, matching the TMS | `@atc('KEY')` decorators or equivalent |
| Ticket key in commits, branches, PR titles | git history |
| Story to plan to execution to case links intact | tracker link graph |
| Defects reachable from the run that found them | execution records |

- **5** — an identifier survives the whole chain: story, case, automated test, run, defect
- **3** — code and tracker both exist but nothing connects them mechanically
- **1** — tests named after files, no link to any requirement

## Axis 4 — Architecture

Does the suite have a shape that survives growth?

| Look for | Where |
|---|---|
| Layer boundaries: no Playwright calls leaking into domain components, no HTTP built inline in tests | `tests/components/` |
| Atomic actions that don't call each other; chains extracted to Steps | domain components |
| Fixtures chosen by need (API-only tests not launching a browser) | fixture usage per spec |
| Data built by factories rather than depending on shared mutable state | data factories vs hardcoded records |
| Path aliases instead of relative import chains | imports |

- **5** — layering holds under reading, factories generate per-test data, fixtures are scoped, no
  cross-calling between atomic actions
- **3** — a real structure with leaks: locators duplicated across files, some tests reaching into the
  page object of another domain
- **1** — flat spec files with everything inline

**Serialized execution is the tell.** A suite pinned to a single worker almost always means tests
compete for shared mutable state. Do not report the setting as the problem; report the coupling that
forces it, and note that per-test data generation is what removes the constraint. If the author already
documented the reason in a comment, quote it and credit the diagnosis before suggesting the fix.

## Axis 5 — Verification

Does the suite run, and does anyone find out when it fails?

| Look for | Where |
|---|---|
| CI executing the suite on pull requests and on a schedule | `.github/workflows/` |
| Reporting that survives the run: traces, screenshots, a published report | reporter config, artifacts |
| Failure classification: regression vs flaky vs environment vs known | run analysis, docs |
| Coverage declared honestly: how many cases exist, how many automated | tags, manifest, plan |

- **5** — CI-gated, artifacts retained, failures triaged into categories, coverage stated as a number
  the author can defend
- **3** — the suite runs locally and reliably, nothing automatic
- **1** — tests that only pass on one machine

Coverage is a ratio, never a claim. "18 of 100 scenarios automated" is a healthy sentence. "Good
coverage" is not.

## Axis 6 — Agent discipline and test design

Is a tester thinking, or is the agent generating cases?

| Look for | Where |
|---|---|
| Cases derived beyond the acceptance criteria: boundaries, state transitions, error paths | case inventory |
| Evidence of exploration finding real defects, with reproduction detail | defect reports |
| Session narrative with reasoning and discarded hypotheses | session logs, bitácora |
| Manual verification recorded with dates alongside automated status | scenario tags, results |

- **5** — criteria treated as the floor, techniques visible in the case set (equivalence classes,
  boundaries, state transitions), defects with measured evidence rather than screenshots alone
- **3** — one case per criterion, happy paths only
- **1** — generated cases nobody executed

Verifying acceptance criteria is the floor, not the ceiling. A suite that covers every criterion and
nothing else scores 3 here regardless of how green it is, and the report should say why: the criteria
describe what someone remembered to specify, and the interesting failures live outside them.
