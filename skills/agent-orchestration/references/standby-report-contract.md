# Standby report contract: what a session emits when it stops

> Loaded by any session that goes to standby, stops on human-in-the-loop, or reaches a final status,
> conductor and worker alike. Not mid-flight: a report at every stage boundary is a heartbeat in
> disguise, and `references/worker-contract.md` rule 4 forbids those.
>
> This is the GENERAL form. A workflow skill that needs domain vocabulary writes its own instance
> and cites this file for the shape. Nothing here names a product.

**Why it exists.** Two readers at once: the human scanning a terminal with five of these open, and the
next agent session picking up the state. Hard rule 23 is the one-line version: a report is a count,
not a narrative, and the reader is deciding, not reading.

---

## The six parts, in order

**1 · One-line verdict, above everything.** Someone with five reports open must triage which to open
without opening any. It states the count, whether the thing moves, and who is holding it.

> *25 of 30 pass. Does not transition. Blocked on three different people, zero replies in 2 days.*

**2 · Metrics table.** At most nine rows, every value a number or a yes/no, no prose. Three rows earn
their place and are usually missing:

| Row | Why it is load-bearing |
|---|---|
| Needed to finish | the only number that answers "how close are we" |
| Waiting since | two days and twenty minutes read identically without it |
| Replies on the thread | zero says the channel is dead, a different problem from a hard question |

**3 · Detail table**, one row per blocked item, with two columns that are not optional:

- `Blocker` is a closed vocabulary, never free text: `no-data`, `no-access`, `no-permission`,
  `partial`, `defect`. Without it two rows both reading "not run" hide that one is three assertions
  out of four and the other cannot reach the fixture at all. Closed tags let a reader collapse five
  rows into one problem on sight.
- `Who unblocks it` is a named role or person, never "the team". An unnamed owner is not actionable.

**4 · Root cause line, always present, including when there is none.** The sentence that collapses
five rows into one problem is the most valuable one. Its absence is information too: *"no single root
cause, three distinct ones"* tells the reader they need three conversations.

**5 · Unblock options, numbered and self-contained.** Any one unblocks the set. If they are not
interchangeable, say which unblocks what.

**6 · The explicit negative.** *"Nothing failed: these assertions are not executable with the current
fixture."* Without it a reader sees "not run" and assumes something broke.

---

## Three envelopes, same numbers

Box drawing reads well in a terminal and is destroyed everywhere else, as a pipe table is when a
document tool flattens it. Use plain ASCII when the target is unknown.

| Destination | Shape |
|---|---|
| a terminal, for the operator | box drawing |
| a comment on a tracker artifact or a PR | bullets with a separator, never pipe tables |
| a chat or a document surface | whatever that surface renders natively |

Pasting the terminal form into a tracker comment produces garbage; that is why the contract names
envelopes and not just a format.

---

## What this is not

- Not a progress table. That answers "how is the whole thing going" across units, for a channel; this
  answers "why is this one stopped and who unblocks it", at a decision moment. If their status
  vocabularies disagree, the progress table wins: it is the one a human posts publicly.
- Not a heartbeat, and not a narrative (hard rule 23): prose that is accurate and unusable for the
  decision in front of the reader has failed, most often when the writer knows the material best.
