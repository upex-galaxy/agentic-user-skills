# N0 signals

`scripts/rsi.py scan <transcript>` reads a Claude Code transcript (`~/.claude/projects/*/<session>.jsonl`) and scores it with no model. The `rsi-config` block below is the only copy of the weights and patterns. The script reads it on every run, so edit it here.

## What counts

Only events after the first skill load count. A skill load is a `Skill` tool call, or a slash command that names an installed skill. Sidechain (subagent) messages are ignored.

| Signal | Rule | Weight key |
|---|---|---|
| Correction | a short user text that matches a correction pattern; the count caps at `max_corrections` | `correction` |
| Interrupt | any `[Request interrupted by user...]` | `interrupt` |
| Error burst | `error_count` failed tool results inside `error_window` consecutive results | `error_burst` |
| Retry loop | the same tool called `retry_run` times in a row with inputs at least `retry_similarity` alike | `retry_loop` |
| Explicit request | a short user text that asks to improve or fix a skill; skips the score and gives `n2` | none |

Verdict: no skill loaded gives `none`. An explicit request gives `n2`. A score at or above `threshold` gives `n1`. Anything else gives `none`. A transcript that cannot be parsed gives `n1` with a `note`, so the session's own agent decides.

The output carries counts and names only. It never prints message text.

## Config

```json rsi-config
{
  "threshold": 2,
  "weights": {"correction": 1, "interrupt": 2, "error_burst": 1, "retry_loop": 1},
  "limits": {
    "max_corrections": 2,
    "error_window": 15,
    "error_count": 2,
    "retry_run": 3,
    "retry_similarity": 0.9
  },
  "correction": {
    "max_chars": 160,
    "patterns": [
      "^\\s*(no|nope|wrong|incorrecto)\\b",
      "\\bya te (dije|pedí|pedi|expliqué|explique)\\b",
      "\\bte (dije|pedí|pedi) que\\b",
      "\\beso no (es|era|fue|iba|lo)\\b",
      "\\bno (era|es) (eso|lo que)\\b",
      "\\b(está|esta) mal\\b",
      "\\bno (hagas|quise|quería|queria) (eso|que)\\b",
      "\\bpor qué (hiciste|lo hiciste)\\b",
      "\\b(deshaz|deshacé|revierte)\\b",
      "\\b(that'?s|this is) (not|wrong)\\b",
      "\\bnot what i (asked|meant|wanted|said)\\b",
      "\\bi (already )?(said|told you)\\b",
      "\\b(undo|revert) (that|this|it)\\b",
      "\\bwhy did you\\b",
      "\\b(please )?don'?t do that\\b"
    ]
  },
  "request": {
    "max_chars": 300,
    "patterns": [
      "\\b(improve|fix|polish|audit|review)\\b.{0,30}\\bskill\\b",
      "\\bskill\\b.{0,40}\\b(failed|broke|is wrong|needs? (a )?fix)\\b",
      "\\b(mejora|mejorar|arregla|arreglar|corrige|corregir|revisa|audita)\\b.{0,30}\\bskill\\b",
      "\\bskill\\b.{0,40}\\b(falló|fallo|está mal|esta mal)\\b",
      "recursive-self-improvement"
    ]
  }
}
```

Spanish and English both appear because the owner works in both.

## Recalibrate

1. Run `scan` on 10 to 20 real transcripts that load a skill. Print only the verdicts.
2. If more than about a quarter fire `n1` or `n2`, lower the weight of the noisiest signal or narrow its patterns. Re-run.
3. Check that clean sessions still return `none` and a session with an interrupt plus a correction still returns `n1`. `python3 -I scripts/rsi.py --self-check` covers both.
4. Record the numbers and the date in `gotchas.md`.
