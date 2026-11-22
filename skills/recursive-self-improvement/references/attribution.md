# Attribution rubric

Open this at N2, before you write any finding. A finding assigns one failure to one verdict. The sources are the first-failure rule (arXiv 2607.28802) and the split between a plan not followed, an intent misread and an intent underspecified (AgentRx).

## Steps

1. Read the brief, the skill and the excerpt (`rsi.py excerpt`). Done when you can list the events in order.
2. Find the first failure the agent did not recover from. Later failures are consequences. Done when exactly one event is named.
3. Quote the skill passage that governed that moment. No passage at all is itself the answer (the text lacks the case). Done when you have the quote or the note "no passage".
4. Run the exact reader test: would a careful reader who follows only this text avoid the failure? Yes means `MODEL`. No means `SKILL`. Done when you wrote the answer in one line.
5. If the reader test does not settle it, test the request: was the user's goal clear and the agent solved something else (`INTENT-MISREAD`), or did it have several valid goals and the agent picked one without asking (`INTENT-UNDERSPECIFIED`)?
6. If a tool, permission, binary or network failed first, the verdict is `ENV`.
7. Set the severity. Done when the finding has verdict, subtype, anchor, severity and event id.

## Verdicts

| Verdict | It holds when | Edit the skill? |
|---|---|---|
| `SKILL` | the text lacks the case, has two readings that both fit, contradicts itself or another loaded instruction, or is stale against the environment | yes |
| `MODEL` | the text is clear and enough, and the agent did something else | rarely (a stronger leading word, or a pointer when the passage is buried) |
| `INTENT-UNDERSPECIFIED` | the request had several valid goals and the agent chose one without asking | only if the skill should have asked |
| `INTENT-MISREAD` | the request was clear and the agent solved another problem | no |
| `ENV` | a tool failed, a permission was denied, a binary or the network was missing | no; maybe one line in the skill's `gotchas.md` |
| `NOISE` | no event supports it, or the fix costs more than the failure | no |

A finding with no event is `NOISE`. Drop it.

## Evidence rules

- `SKILL` needs one quote of the faulty passage.
- `MODEL` needs one quote of the clear instruction and one quote of the action that contradicts it.
- `severity: high` when the agent acted outside the repo (sent, deleted, pushed), lost data, or the user said stop or undo. Otherwise `low` or `med`.
- `subtype` is a short label (`ambiguous`, `missing-case`, `contradiction`, `stale`, `buried`, `no-question`). `anchor` names the heading or step, for example `Preferences step 2`. The pair with the skill name is the recurrence key, so keep both stable across sessions.

## Worked examples

**A. `SKILL`, ambiguous.** The skill says "Resolve preset, length, sound and voice in this order". The user wrote "hazme un explainer sketch de 60 segundos". The agent asked all four questions. The user: "ya te dije sketch".

- First failure: the agent re-asked preset (E1).
- Reader test: the text can mean "ask all four" or "resolve each, asking only the unknown ones". Both fit. A careful reader can fail. Verdict `SKILL`, subtype `ambiguous`, anchor `Preferences`.

**B. `MODEL`, clear text ignored.** The skill says "Run `--self-check` before the first real run". The agent ran the tool on the real input first and it failed on a missing binary.

- The instruction is explicit and sits in step 1. The action contradicts it. Verdict `MODEL`. Quote both. No skill edit.
- Exception: if the same instruction sits in the last paragraph, under "Notes", the verdict becomes `SKILL`, subtype `buried`, and the fix is a pointer in step 1.

**C. `INTENT-UNDERSPECIFIED`.** The user said "summarize the PR". The skill covers both a code summary and a release-notes summary, and the agent wrote release notes. The user wanted a code summary.

- Two valid goals, no question asked. If the skill says nothing about choosing, the skill should have asked: edit. If the skill says "ask when the audience is unclear" and the agent skipped it, the verdict is `MODEL`.

**D. `ENV`.** `yt-dlp` returned 403 and the agent retried four times. The failure that started the chain is the 403, a stale binary. Verdict `ENV`. The later retries are consequences.

**E. `NOISE`.** The agent used a table where the user would have liked a list. No event: the user did not react. Drop it.

## Common mistakes

- Blaming the skill for a failure the agent recovered from. Recovery ends the chain.
- Calling `MODEL` because the agent "should have known". Apply the reader test to the text alone.
- Proposing a rewrite when the fix is one pointer or one deleted sentence.
