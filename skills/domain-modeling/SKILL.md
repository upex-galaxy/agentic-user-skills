---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when discussing codebase terminology; writing or editing a glossary; recording or editing an ADR.
metadata:
  author: UPEX Galaxy
---

# Domain Modeling

Source: https://github.com/mattpocock/skills (skills/engineering/domain-modeling), MIT, (c) 2026 Matt Pocock. Adapted by UPEX Galaxy.

Actively build and sharpen the project's domain model as you design. This is the *active* discipline: challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* the glossary for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

## File structure

The project may already keep its domain vocabulary and decision records somewhere (a domain map, a `docs/` folder, an ADR directory). Use that location and its format. Only when none exists, use the defaults below: `GLOSSARY.md` and `docs/adr/`.

Most repos have a single context:

```
/
├── GLOSSARY.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

If a `GLOSSARY-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:

```
/
├── GLOSSARY-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── GLOSSARY.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── GLOSSARY.md
│       └── docs/adr/
```

Create files lazily: only when you have something to write. If no glossary exists, create one when the first term is resolved. If no ADR directory exists, create it when the first ADR is needed.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in the glossary, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account': do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is right?"

### Update the glossary inline

When a term is resolved, update the glossary right there. Don't batch these up: capture them as they happen. Use the format in [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md).

The glossary holds vocabulary and nothing else: no implementation details, no spec, no scratch notes, no implementation decisions.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).

## With nobody at the keyboard

A worker, a scheduled routine or a subagent has nobody to answer a challenge, and waiting would stall the run. Keep the same discipline and settle the questions yourself:

- Write each conflict or fuzzy term you would have raised into the run's notes or report, with the canonical term you recommend.
- Write to the glossary only terms the code, the tickets or the docs already settle. A term only you inferred goes in the report as proposed, so a person confirms it before it becomes vocabulary.
- Write an ADR only for a decision the task itself made and that passes the three gates. State in the report that you wrote it.
- With several contexts and no clear match, pick the one the task's files live in and say so in the report.
