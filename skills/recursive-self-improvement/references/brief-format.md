# Session brief

The session that worked with the skill writes the brief, because it holds the context. A later session that is asked to improve a skill writes it from `rsi.py excerpt` and sets `source: reconstructed`.

## Template

```
---
skill: explain
skill_path: /Users/<user>/.agents/skills/explain
skill_sha: a1b2c3d4e5f6
session: 64613803
source: author            # author | reconstructed
asked_by_user: false
---
## Goal
One sentence: what the user wanted from the session.

## Events
E1 | turn 14 | skill said: "Resolve preset, length, sound and voice in this order" (Preferences)
   | happened: agent asked all four questions although the request named a preset
   | user: "ya te dije sketch"

## Suspected cause (a guess, not a verdict)
## What would have helped
```

## Rules

- At most 60 lines and 8 events. Pick the events that moved the session off course.
- `skill_sha` comes from `python3 -I scripts/rsi.py sha <skill_path>`.
- Quote the skill and the user in their own words. Do not paraphrase either.
- The suspected cause is a guess. N2 decides the verdict from the events.

## Scrub

`rsi.py brief-check <file>` refuses a brief that contains a path such as `.env`, `auth.json`, `credentials`, `id_rsa`, `*.pem`, `.npmrc` or `.netrc`, a token-shaped string (`sk-`, `ghp_`, `xox*-`, `AKIA`, a JWT, `Bearer`, a private key header) or a long opaque string. Fix the text and run it again. Replace a secret with a description of it.

Run `brief-check --save` on a clean brief. It writes `~/.rsi/briefs/<date>-<skill>-<session>.md`. Briefs stay there and never go into a repo.
