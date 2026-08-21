# MKD — Worked examples

Copy-pasteable specs. Write the file to `~/.mkd/spec-<name>.json`, run
`bun "<skill-dir>/cli/index.ts" ~/.mkd/spec-<name>.json`, and the deck lands at
`~/.mkd/deck-<name>.html`.

Author `title` / `problem` / `content` / justifications in the USER'S language —
the examples below are in English for the repo, but a Spanish-speaking user gets
a Spanish deck.

---

## 1. Post-audit decision deck (the canonical use)

Decisions with context balloons, severity chips, a recommended option with an
explicit WHY, and an intro with stat tiles.

```json
{
  "session": "audit-skills-alignment",
  "source": ".session/pbi-refactor/audit.md",
  "title": "Catch-Up: audit decisions",
  "intro": {
    "headline": "8 decisions await you after the audit",
    "body": "Five auditors swept the skills and docs. **93 findings are mechanical** (already verified); these decisions need your call before anything is touched.",
    "stats": [
      { "n": 115, "label": "verified findings" },
      { "n": 93, "label": "mechanical, ready" },
      { "n": 8, "label": "decisions for you" }
    ]
  },
  "items": [
    {
      "id": "D1",
      "type": "decision",
      "title": "Do container issues also carry components?",
      "severity": "medium",
      "scope": "test-documentation",
      "problem": "Doctrine mandates **components** on Tests and bugs. The payloads that create **containers** (Test Plan, Execution, Set) carry none, and nobody ever decided whether they should.",
      "context": [
        {
          "title": "What is a component in Jira?",
          "body": "A tag for a **functional module** of the app (Cart, Auth, Checkout). It feeds the per-module coverage dashboards."
        }
      ],
      "options": [
        {
          "key": "A",
          "label": "Mandatory on Plans and Executions, optional on Sets",
          "justification": "A plan/execution is 1:1 with its Story, so the module is **inherited for free** and module dashboards extend to plans. Sets cross modules by design; forcing them creates arbitrary picks. **Recommended**: maximum filter value, zero artificial decisions.",
          "recommended": true
        },
        {
          "key": "B",
          "label": "Mandatory everywhere, Sets included",
          "justification": "Total consistency — no payload without the field. Cost: Sets accumulate long component lists with little real filter value."
        }
      ]
    }
  ]
}
```

---

## 2. Mixed deck — decision + question + report + table

One deck can interleave all four item types; each is one screen.

```json
{
  "session": "release-readiness",
  "title": "Release 2.4 — your input",
  "items": [
    {
      "id": "D1",
      "type": "decision",
      "title": "Ship with the flaky checkout test?",
      "severity": "high",
      "problem": "The release gate is green except **one flaky test** (12% failure rate) in checkout.",
      "options": [
        {
          "key": "A",
          "label": "Quarantine it and ship",
          "justification": "Unblocks the release today; the test moves to the flaky board with an owner. Cost: checkout loses one automated guard until it is fixed. **Recommended** because the covered path also has manual smoke coverage.",
          "recommended": true
        },
        {
          "key": "B",
          "label": "Hold the release until it is fixed",
          "justification": "No coverage gap ever ships. Cost: release slips at least 2 days and the fix owner is on PTO."
        }
      ],
      "allowCustom": true
    },
    {
      "id": "Q1",
      "type": "question",
      "title": "Which environments get the canary?",
      "content": "The canary can roll to any subset of regions **before** the full rollout.",
      "controls": {
        "type": "multi",
        "required": true,
        "options": [
          { "value": "us-east", "label": "us-east" },
          { "value": "eu-west", "label": "eu-west" },
          { "value": "ap-south", "label": "ap-south" }
        ]
      },
      "text": { "placeholder": "Constraints or timing notes" }
    },
    {
      "id": "R1",
      "type": "report",
      "title": "What changed since 2.3",
      "content": "### Highlights\n\n- Checkout latency **-18%** (p95)\n- New payment provider behind a flag\n- 3 breaking API deprecations, all with shims\n\nHighlight anything you want to react to and add your comments.",
      "text": { "placeholder": "Reactions, concerns, questions" }
    },
    {
      "id": "T1",
      "type": "table",
      "title": "Deprecation shims — keep or drop per API",
      "content": "One verdict per row. Quote any cell to anchor a comment to it.",
      "table": {
        "columns": ["API", "Consumers left", "Shim cost"],
        "rows": [
          { "id": "api-v1-login", "cells": ["/v1/login", "3", "low"] },
          { "id": "api-v1-cart", "cells": ["/v1/cart", "0", "high"] }
        ],
        "rowControls": {
          "type": "single",
          "options": [
            { "value": "keep", "label": "Keep shim" },
            { "value": "drop", "label": "Drop now" }
          ]
        },
        "rowText": { "placeholder": "Why / conditions" }
      }
    }
  ]
}
```

---

## 3. Report-only deck (long explanation, point-by-point reactions)

Splitting a long report into `report` items gives the user one section per
screen — the Catch-Up way to collect anchored reactions.

```json
{
  "session": "arch-review-feedback",
  "title": "Architecture review — react per section",
  "intro": { "headline": "4 sections, react to each one" },
  "items": [
    { "id": "S1", "type": "report", "title": "Data layer", "content": "…markdown…" },
    { "id": "S2", "type": "report", "title": "Auth model", "content": "…markdown…" },
    { "id": "S3", "type": "report", "title": "Caching strategy", "content": "…markdown…" },
    { "id": "S4", "type": "report", "title": "Open risks", "content": "…markdown…", "text": { "required": true, "placeholder": "Your verdict on the risks" } }
  ]
}
```

---

## 4. `--wait` variant (same-turn answer)

Any spec works in `--wait` mode — only the invocation changes:

```bash
bun "<skill-dir>/cli/index.ts" ~/.mkd/spec-release-readiness.json --wait --timeout 120
```

The CLI blocks, the footer gains a **Send to Claude** button (label via
`submitLabel`), stdout carries ONLY the Result JSON, and pasted images come
back as `~/.mkd/...` file paths. Use it when the next step cannot proceed
without the answer; otherwise prefer the non-blocking default.
