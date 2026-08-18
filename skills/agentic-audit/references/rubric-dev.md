# Rubric — `subject=dev`

Criteria for a product built with the agentic-dev pipeline (or any AI-assisted product repo that claims
a similar discipline). Load only this file when `subject=dev`.

The pipeline this rubric assumes:

```
project-foundation  ->  PRD / SRS / business maps / domain glossary
design-system       ->  DESIGN.md tokens + per-screen specs
project-bootstrap   ->  scaffolding: app, api, db, auth, env
product-management  ->  epics + stories with acceptance criteria in the tracker
sprint-development  ->  per story: plan -> implement -> review -> staging -> production
unit-testing        ->  TDD slices
testability-guide   ->  in-app /qa page + credentials artifact for whoever tests it
```

A project that never ran a stage is not automatically penalized. Penalize the *consequence*: no
foundation shows up as contradictory requirements, no design system shows up as UI drift. Score the
outcome, cite the missing stage as the cause.

---

## Axis 1 — Foundation

Does the project know what it is?

| Look for | Where |
|---|---|
| Requirements and scope written down, describing *this* product | `.context/PRD/`, `.context/SRS/` |
| System maps: data, features, API | `.context/business/` |
| Domain glossary with the project's own vocabulary | `.context/business/domain-glossary.md` |
| Decision records with real tradeoffs, superseded not deleted | `.context/ADR/` |

- **5** — all present, sized like real documents, project-specific, plus numbered ADRs with genuine
  decisions (auth model, data ownership, a rejected alternative named)
- **3** — requirements exist but architecture is implicit; ADR folder holds only the template
- **1** — headings copied from the boilerplate with the example project's content still inside

The sharpest test: read the glossary, then read three UI strings. If the product uses different words
for the same concept than the glossary does, the foundation is decoration.

## Axis 2 — Backlog

Is the work modeled outside someone's head?

| Look for | Where |
|---|---|
| Epics and stories that map to shipped behavior | tracker, or `.context/PBI/` mirror |
| Acceptance criteria per story, testable, in a field or comment | story artifacts |
| Defects tracked as work items, not as memory | `.context/PBI/defects/` or equivalent |
| A sequencing artifact: what unblocks what | `dev-roadmap.md`, `master-implementation-plan.md` |

- **5** — every shipped feature traces to a story with criteria; defects are filed with reproduction
  steps and evidence; a roadmap orders the remaining work by dependency
- **3** — stories exist but criteria are one-liners or missing; defects live in chat
- **1** — a board with card titles and nothing else

Read three criteria and ask whether you could write a failing test from them without asking a question.
That is the difference between a 5 and a 3 on this axis.

## Axis 3 — Traceability

Can you get from a line of code to the reason it exists?

| Look for | Where |
|---|---|
| Ticket key in commit subjects and branch names | `git log`, `git branch -a` |
| PRs that reference the ticket and merge under the declared policy | `gh pr list --state merged`, merge commits |
| A declared branch strategy that matches the branches that exist | `.agents/project.yaml` `git_strategy:` vs `git branch -a` |
| Promotion discipline: integration branch, gated release | history of the production branch |

- **5** — key in every commit, branch prefixes consistent, promotion method matches the declared
  policy, hotfix path exercised correctly at least once
- **3** — keys appear sporadically; strategy documented but not followed
- **1** — everything on the default branch with generic messages

A declared strategy that the history contradicts is worse than no declaration, and worth saying so:
the document creates false confidence for anyone joining later.

## Axis 4 — Architecture

Did someone choose the shape on purpose?

| Look for | Where |
|---|---|
| Layer boundaries respected (api / data access / ui) | source tree |
| Design tokens defined and actually used instead of ad-hoc values | `DESIGN.md`, component styles |
| Per-screen design specs and a record of deliberate divergences | `.context/design/` |
| Server/client boundaries, auth enforcement in the right place | middleware, route handlers, row-level policies |

- **5** — consistent layering, tokens referenced rather than duplicated, divergences from the design
  registered with the reason
- **3** — sound structure but UI values drift; fidelity decided ad hoc per ticket with no record
- **1** — the framework's default scaffold with features bolted on

Divergence from a mockup is not a defect by itself. An *unrecorded* divergence is, because the next
person cannot tell a decision from an accident.

## Axis 5 — Verification

What proves it works, and does that proof run without a human remembering?

| Look for | Where |
|---|---|
| Unit tests near the logic that can actually break | `*.test.ts` next to the module |
| End-to-end coverage of the primary user journeys | e2e suite |
| CI running the suite on every pull request | `.github/workflows/` |
| Environment separation and a smoke check after deploy | workflow files, deployment notes |

- **5** — layered tests, CI green as a merge gate, someone can break the build
- **3** — real tests exist but nothing runs them automatically
- **1** — a test folder with the framework's example spec

Grade the *gate*, not the count. A hundred tests nobody runs score below twenty that block a merge.
When there is no CI, say plainly what it costs: every test written so far only protects on the days
someone remembers to run it.

## Axis 6 — Agent discipline

Is a human steering, or is the agent driving?

| Look for | Where |
|---|---|
| Session narrative: what was done, why, what's next | bitácora / session logs |
| Evidence of measuring before fixing, and of rejecting agent suggestions | log entries, code comments |
| Comments that explain a non-obvious *why*, not a restated *what* | config files, tricky modules |
| Tracker artifacts written by the human loop, not dumped by the agent | comments on tickets |

- **5** — decisions narrated with the reasoning, at least one documented case of the author
  overruling the agent or discarding a false positive after measuring
- **3** — logs exist but read as changelogs: what changed, never why
- **1** — no trace of review; huge commits landing whole features at once

This axis is where you find the strongest praise material in the whole audit. Quote it directly: a
comment where the author explains why they serialized a suite, or why they kept a token instead of
chasing a mockup, is proof of judgment that no score communicates as well as the sentence itself.
