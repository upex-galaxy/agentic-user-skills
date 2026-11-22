# Agent Spec: rsi-polisher

Version: 1 · Platform: Claude Code · Shape: subagent
Location: user (`~/.claude/agents/rsi-polisher.md`). Source of truth: this skill's `agents/rsi-polisher.md`. Approved by Ely on 2026-11-22 (design round 1 and the polisher table in `DESIGN.md`).

## 1. Job
Take approved findings about one skill and write a tested candidate copy of that skill, then return the diff. The main session applies it after a person approves.

## 2. Invocation
- Started by: the main session delegates after gate 1 of `recursive-self-improvement`.
- Trigger: approved findings, a candidate path made by `rsi.py candidate`, brief paths.
- Not for: editing a live skill, applying a change, auditing a session (the main session does those).

## 3. Scope matrix
| Axis | Decision | Why |
|---|---|---|
| Built-in tools | Read, Grep, Glob, Edit, Write, Bash | reads the skill and briefs, edits the candidate |
| Shell | only through the hook allowlist: `rsi.py scan|excerpt|diff|sha|candidate|ledger list|ledger measure`, `diff`, `grep`, `ls`, `wc`, `cat`, `head`, `tail`, `cd`, `python3 -m scripts.<skill-creator module>`, `quick_validate.py` | tests and diff, nothing that writes elsewhere |
| MCP servers | none | no network, no memory writes |
| Skills | preload `skill-creator`, `writing-for-agents`, `humanizer` | the three the job needs |
| Instructions/memory | default (CLAUDE.md loads) | nothing to omit |
| Model / effort | sonnet / medium | rewriting prose and judging a diff does not need opus |
| Autonomy | inherits the parent's permission mode | the hook and deny rules hold in every mode |
| Limits | `maxTurns: 40`, at most 6 test runs | tests spawn model runs |

## 4. Explicitly denied
| Denied | Mechanism | Reason |
|---|---|---|
| Write or Edit outside `~/.rsi/candidates/**` | `PreToolUse` hook `rsi.py guard` (exit 2), plus the deny rules below | the live skill is never touched |
| Bash that redirects, pipes, chains or substitutes | the same hook | closes shell write paths |
| `rsi.py apply`, `rollback`, `ledger add|set|load`, `brief-check` | the same hook | those write outside the candidate |
| Agent (spawning) | not in `tools` | leaf agent |
| WebFetch, WebSearch, MCP | not in `tools` | no network |

Second wall: settings rules the owner adds to `~/.claude/settings.json` (not applied by the build; see section 10):

```json
{
  "permissions": {
    "deny": [
      "Edit(//Users/ely/.agents/**)",
      "Edit(//Users/ely/.claude/**)"
    ]
  }
}
```

`Edit(...)` rules cover `Write` too. They apply to every session, so they also stop the main session from editing skills by hand; that is a real cost, and the reason this snippet is left to the owner.

## 5. Output contract
`STATUS:` line, then `candidate`, `diff`, `changes`, `tests`, `net lines`, `non-regression`, `left unchanged`, in that order. No transcript of the work.

## 6. System prompt outline
Role, five-step procedure with completion criteria, boundaries, stop conditions, output. See `rsi-polisher.md`.

## 7. Context budget
- Loads at start: a 50-line prompt, 6 tool definitions, three preloaded skills (`skill-creator` is the largest, about 500 lines).
- Compared with a default session: no MCP tools, no web tools, no Agent tool.
- Measure after install: `/context` inside a delegated run.

## 8. Files to create
| Path | Purpose |
|---|---|
| `~/.claude/agents/rsi-polisher.md` | the agent |
| `~/.agents/skills/recursive-self-improvement/scripts/rsi.py` | holds the `guard` hook command |

## 9. Verification plan
- Validator: `validate_agent.py` passes with no errors.
- Delegation check. Routes: "write a candidate for these approved findings on skill X", "polish the candidate at ~/.rsi/candidates/x/c1". Does not route: "improve the explain skill" (the main session runs RSI first), "apply this candidate".
- Boundary check: a `Write` outside `~/.rsi/candidates/` must fail. Result: verified for the hook on 2026-11-22 (real run in bypass mode: outside `Write` and `Bash` redirect blocked, candidate `Write` allowed). The settings deny rules are unverified. Details in `references/gotchas.md`, "Write boundary test".

## 10. Open questions and assumptions
- The hook fails open when `python3` or `rsi.py` is missing (any exit code other than 2 does not block). The deny rules in section 4 close that gap, so install them.
- Validator warning kept on purpose: with `Bash` listed, `Glob` and `Grep` do not exist on macOS, so the agent searches with `grep` and `ls` through the hook allowlist. `Bash` stays because `rsi.py diff` and the `skill-creator` scripts need it.
- A project-level agent would need folder trust for hooks. This agent lives at user level, so it does not.
- Skill-creator's `run_eval` needs `python3 -m scripts.run_eval` from the skill-creator folder; the hook allows `cd` and that form. Whether a full eval run passes through the hook is unverified.
