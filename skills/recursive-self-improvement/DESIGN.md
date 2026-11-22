# recursive-self-improvement: design

Status: phase 1, waiting for approval. Nothing here is installed. Ely's answers to round 1 are settled: full name, skills only, polisher writes in a copy, N0 reads Claude Code transcripts only.

Alias in prose: **RSI**. Folder and frontmatter name: `recursive-self-improvement`.

## What it does

After a session that used skills, RSI checks whether a skill let the user down, decides whose fault it was, and proposes a fix. A person approves every change. It costs almost nothing when there is nothing to fix.

**Difference from `retro`.** `retro` reviews a whole session and suggests changes to the agent's environment of any kind (navigation, lint, rules, tools). RSI starts from one skill, assigns each failure to the skill, the model, the user's intent or the environment, waits for the same failure to recur, and hands a tested copy of the skill to a person to approve. Use `retro` for "what should I change in my setup?" and RSI for "did this skill fail me, and whose fault was it?".

## Flow

```
 session used skills
        |
        v
 [N0] scripts/rsi.py scan <transcript>        0 tokens
   no skill loaded, or score < 2 ----------------> "nothing for now"  (end)
        | score >= 2, or the user asked to improve a skill
        v
 [N1] self-check, one paragraph (~150 words)  ~300 tokens
   answers "none" ----------------------------> "nothing for now"  (end)
        | names a skill and an event
        v
 write the session brief  ~/.rsi/briefs/<date>-<skill>-<session>.md
        |
        v
 [N2] audit: read brief + skill + transcript excerpts, apply the rubric
        |
        v
 ledger: add each finding to ~/.rsi/ledger.jsonl
   not recurrent and not severe ---------------> logged only  (end)
        | recurrence gate passed
        v
 GATE 1  grilling round: one numbered question per finding   (person says yes or no)
        |
        v
 rsi-polisher writes a candidate copy in ~/.rsi/candidates/<skill>/<id>/
   and runs the skill-creator tests on it
        |
        v
 GATE 2  the person reads the diff, the test result and the net line count
        |
        v
 GATE 3  apply: backup, write, record version in the ledger
        |
        v
 rollback available:  scripts/rsi.py rollback <skill>
```

## Why "automatic" needs a convention

A skill cannot start itself when a session ends. Only a hook or plugin can, and the repo's README says to prefer a skill. So each repo opts in with one line in its `AGENTS.md`:

```
## Session close
If this session loaded a skill, run `recursive-self-improvement` before reporting done.
```

The cost of that line is its own tokens in every turn, so it stays at two lines. A repo without the line never gets audited. That limit is real and goes in the README.

Optional later step: a `Stop` hook that runs only N0 (`scan`, no model) and prints one line when the score is 2 or more. It adds no tokens when it stays quiet. Not built in v1.

## Filter levels

| Level | Who runs it | Tokens | Output |
|---|---|---|---|
| N0 | `scripts/rsi.py scan`, plain Python, no model | 0 | JSON: skills loaded, signals, score, verdict `none` or `n1` or `n2` |
| N1 | the session's own agent | about 300 | `none`, or the skill name plus the event numbers |
| N2 | the session's agent, after N1 or an explicit request | about 15k to 40k (estimate, measured in phase 2) | findings with verdicts, ledger entries, a grilling round |

**N0 signals** (Claude Code transcripts under `~/.claude/projects/*/<session>.jsonl`; a `Skill` tool call carries the skill name, and the loaded text arrives in the next meta message):

| Signal | How the script sees it | Points |
|---|---|---|
| Skill loaded | `Skill` tool call or a slash command naming a skill | required, else stop |
| User correction after the load | a short user message matching correction patterns (Spanish and English list in `references/n0-signals.md`) | 1 each, max 2 |
| User interrupt | `[Request interrupted by user]` after the load | 2 |
| Errors after the load | 2 or more `is_error` tool results within 15 tool calls | 1 |
| Retry loop | the same tool with near-identical input 3 times in a row | 1 |
| Explicit request | the user asks to improve or fix a skill | straight to N2 |

Score 0 or 1 gives `none`. Score 2 or more gives `n1`. Weights are a first guess. Phase 2 calibrates them on real transcripts, including clean ones that must return `none`.

Other agents (OpenCode, Codex, Cursor) have no N0. They start at N1.

## Attribution rubric

Five verdicts. Every finding needs an event from the session and a quote from the skill. A finding with no event is dropped as `NOISE`, because the /retro study found that many proposals were generic practice with no event behind them.

| Verdict | It holds when | Usual fix | Edit the skill? |
|---|---|---|---|
| `SKILL` | the text lacks the case, has two readings that both fit, contradicts itself or another loaded instruction, or is stale against the environment | rewrite, add or delete that passage | yes |
| `MODEL` | the text is clear and enough, and the agent did something else | none; sometimes a stronger leading word or a pointer if the passage is buried | rarely |
| `INTENT-UNDERSPECIFIED` | the request had several valid goals and the agent picked one without asking | the skill adds a question or a default | only if the skill should have asked |
| `INTENT-MISREAD` | the request was clear and the agent solved another problem | none | no |
| `ENV` | a tool failed, a permission was denied, a binary or network was missing | fix the environment; maybe one line in the skill's `gotchas.md` | no |
| `NOISE` | no event supports it, or the fix costs more than the failure | drop | no |

Rules:

1. **First unrecovered failure.** Read the events in order. Blame goes to the first failure the agent did not recover from. Later failures are consequences.
2. **Exact reader test.** Would a careful reader who follows only this text avoid the failure? Yes means `MODEL`. No means `SKILL`.
3. **Two quotes.** `SKILL` needs a quote of the faulty passage. `MODEL` needs a quote of the clear instruction and a quote of the action that contradicts it.
4. **Severity.** `high` when the agent acted outside the repo (sent, deleted, pushed), lost data, or the user said stop or undo. Otherwise `low` or `med`.

Sources: the first-failure rule from the failure-attribution study (arXiv 2607.28802), and the split between a plan not followed, an intent misread and an intent underspecified from AgentRx.

## Recurrence gate and ledger

`~/.rsi/ledger.jsonl`, one JSON line per finding:

```
{"ts":"2026-11-21T18:02:00Z","skill":"explain","skill_sha":"a1b2c3d4e5f6","session":"64613803","verdict":"SKILL","subtype":"ambiguous","anchor":"Preferences step 2","severity":"med","evidence":"E2","status":"logged","target":"skill"}
```

`status` moves through `logged`, `proposed`, `approved`, `applied`, `rejected`, `reverted`. `target` is always `skill` in v1. It exists so AGENTS.md or harness findings can be added later without changing the format.

**Gate:** a finding becomes a proposal when the same `skill` + `subtype` + `anchor` appears in 2 or more distinct sessions, or when severity is `high` once. Everything else stays `logged`. One bad session never triggers an edit.

**Measure after.** After an applied change, the ledger counts the same key in the next 5 sessions that load the skill. If it still recurs, RSI proposes a revert or a different fix instead of stacking another change.

## Session brief (minimum format)

Written by the session that worked with the skill, because it holds the context. When a later session is asked to improve a skill, it writes the brief itself from the transcript (`scan --excerpt`) and sets `source: reconstructed`. Maximum 60 lines, 8 events, no secrets (the script refuses paths such as `.env` and token-shaped strings).

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

## The polisher: `rsi-polisher`

Built with `agent-creator` in phase 2, from an approved spec. The shape and limits below go into that spec.

| Axis | Choice | Why |
|---|---|---|
| Shape | Claude Code subagent at user level, `~/.claude/agents/rsi-polisher.md` | `aurora-master.md` already lives there |
| Model | `sonnet` | rewriting prose and judging a diff does not need the strongest model; cheaper than `opus` |
| Preloaded skills | `skill-creator`, `writing-for-agents`, `humanizer` | the three the job needs; nothing else is discoverable |
| Tools | `Read`, `Grep`, `Glob`, `Edit`, `Write`, `Bash` | `Bash` only for `scripts/rsi.py`, `diff` and the skill-creator eval scripts |
| Write scope | `~/.rsi/candidates/**` only | the original skill is never touched by the polisher |
| MCP, web, spawn | none | no network, no sub-agents |
| Input | the approved findings, the skill path, the brief paths | |
| Output contract | candidate path, unified diff, one line per change tied to its event id, test result, net line count, what was left unchanged | the parent reads this and nothing else |
| Eval budget | at most 6 test runs per candidate; reports the cost | tests spawn model runs |

**Candidate rules.** Each change must remove or tighten about as much text as it adds, so skills do not grow with every fix. Each sentence passes the no-op test from `writing-for-agents`. Names, `description` and trigger words change only when a finding is about triggering. Anything a person reads goes through `humanizer`; the skill itself is written in English.

**Non-regression by reading.** For every earlier finding on that skill (applied or rejected) and every brief on file, the polisher states whether the candidate still handles it. This follows the non-regression idea of Skill-V and the control sessions at Perplexity, at the price of reading, not of running.

**Write boundary.** Claude Code does not scope `Write` to a path through the agent's tool list alone. The plan is an allow rule for `~/.rsi/candidates/**`, deny rules for `~/.agents/**` and `~/.claude/**`, and a `PreToolUse` hook as a second wall. Phase 2 proves it: a write outside the folder must fail. This is unverified until then.

## Approval gates

| Gate | What the person sees | Default if nobody answers |
|---|---|---|
| G1 findings | grilling round: a numbered question per finding with the evidence, the verdict and a recommended answer | write findings to `~/.rsi/pending/` and stop |
| G2 diff | the diff, the test result, the net line count, the non-regression notes | stop; the candidate stays in `~/.rsi/candidates/` |
| G3 apply | one yes with the exact path to be written | never applies |

**Apply** resolves the skill's real path (the `~/.claude/skills/<name>` entries are symlinks), copies the current folder to `~/.rsi/backups/<skill>/<timestamp>/`, writes the candidate, and records the new `skill_sha` and the backup path in the ledger. **Rollback** restores the newest backup. It refuses when the skill's hash differs from the one recorded at apply, unless the person confirms, because someone edited it since.

When the skill also lives in `agentic-user-skills`, the repo copy is the source of truth. RSI tells the person to port the change there. It never commits or pushes.

With nobody at the keyboard, RSI runs N0 and N1, writes the brief and the findings, and stops before any candidate.

## Files

```
skills/recursive-self-improvement/
  SKILL.md                    under 150 lines: flow, gates, when to read each reference
  DESIGN.md                   this file; kept for maintainers, never loaded by the skill
  LICENSE                     MIT, own skill
  scripts/rsi.py              Python 3 standard library only. Subcommands:
                              scan, excerpt, brief-check, ledger, candidate, diff, apply, rollback
  references/
    attribution.md            the rubric with worked examples
    n0-signals.md             correction patterns, weights, how to recalibrate
    brief-format.md           the brief template and the scrub rules
    ledger.md                 fields, the gate, the measure-after rule
    polisher.md               the spec the agent is built from, the candidate rules
    gotchas.md                traps already paid for; the only file allowed dates
  agents/rsi-polisher.md      source of the subagent; install copies it to ~/.claude/agents/
  how-it-works.es.html        repo convention, built last in phase 2
  how-it-works.en.html
```

All footprint is under `~/.rsi/` (`ledger.jsonl`, `briefs/`, `candidates/`, `backups/`, `pending/`). The script writes nothing in the working directory, as the repo rules require. It uses `python3 -I`, like `content-teardown`.

## Install (phase 2)

- Copy the folder to `~/.agents/skills/recursive-self-improvement`, then add the symlink `~/.claude/skills/recursive-self-improvement -> ../../.agents/skills/recursive-self-improvement`. The other skills there are real copies with the same symlink, so this matches them. A symlink into this worktree would break when the worktree is removed.
- Copy `agents/rsi-polisher.md` to `~/.claude/agents/`.
- The skill is not added to any repo's `AGENTS.md` by RSI. Each repo decides.
- No push and no pull request to `agentic-user-skills`.

## Description (candidate, 212 characters)

```
Audit a session that used skills, decide whose fault each failure was (skill, model, intent or environment) and propose skill fixes for approval. Use when closing such a session, or when asked to improve a skill.
```

## Evidence behind the choices

| Choice | Source |
|---|---|
| Candidates only, never edit the live skill; review before it applies | Perplexity (self-improving skills), getrush.ai |
| Recurrence before an edit; one bad session never triggers one | Perplexity |
| Small focused edit from human feedback, reviewed | Warp |
| Every finding tied to a session event; measure after; retire what does not help | /retro study (arXiv 2610.34938) |
| Keep only text the agent used; little to learn when a strong model already follows the rules | Cortex (arXiv 2610.14216) |
| Backups, diff review by someone independent, version record | getrush.ai |
| First unrecovered failure; plan not followed vs intent misread vs intent underspecified | arXiv 2607.28802, AgentRx |
| Non-regression on historical evidence | Skill-V (arXiv 2610.11781) |
| `SKILL.md` under 500 lines, one level of references, `description` decides the trigger | official skill authoring guide |

## Risks

| Risk | Mitigation |
|---|---|
| N0 fires too often and burns tokens | score threshold, calibrated on real transcripts in phase 2; clean sessions must return `none` |
| One session overfits a skill | recurrence gate; `high` severity is the only shortcut |
| Skills grow with every fix | candidate rule: add no more than you remove; report the net line count |
| Wrong blame (`MODEL` called `SKILL`) | exact reader test and the two-quote rule |
| Brief leaks private data | scrub in `brief-check`; briefs stay in `~/.rsi/`, never in a repo |
| The polisher writes outside its copy | allow and deny rules plus a hook; proved in phase 2 |
| Eval runs cost more than the fix is worth | 6-run cap and a reported cost |
| Claude Code changes the transcript format | `scan` fails soft and falls back to N1; note in `gotchas.md` |
| Repos without the `AGENTS.md` line are never audited | stated in the README; the optional `Stop` hook covers N0 later |
| A fix helps one repo and hurts another that shares the skill | the diff names the findings that justify it; the measure-after window catches regressions |
| RSI edits itself | allowed through the same three gates; the polisher never writes its own agent file |

## Decisions

| Decision | Answer |
|---|---|
| Name | `recursive-self-improvement` (round 1, Q1) |
| Scope | skills only; `target` field reserved (Q2) |
| Polisher autonomy | writes only in `~/.rsi/candidates/`, runs the skill-creator tests, returns the diff; the main session applies after approval (Q3) |
| N0 sources | Claude Code transcripts only (Q4) |
| Still open | none for the design; voice and credits for the video are asked separately |
