# Evidence rules

The content agent downstream trusts this document completely: it will turn a number into a hook without checking. So the rules below exist to make that trust safe.

## Labels

State the label convention near the top of every document (one short paragraph), then use it consistently.

| Label | Meaning | Example |
|---|---|---|
| `(measured, <source>)` | the number appears in that source, which measured it | `107,867 B (measured, ADR-0009)` |
| `(calculated: <formula>)` | you derived it from measured numbers; show the formula with the real values | `82.6% (calculated: 1 - 18,786 / 107,867)` |
| `(according to <source>)` | a claim the source makes but did not measure (a doc's recommendation, a vendor statement) | `under 200 lines (according to the Claude Code docs)` |
| `(measured with <command> on <date>)` | you re-measured it now | `19,542 B (measured with wc -c on 2026-10-05)` |
| `(interpreted: <reading>)` | the source is ambiguous and you chose a reading; say which | `1/1 (interpreted: exit code in QA / DEV)` |
| `no data` | the figure does not exist in any source | in a table cell |

Rules of thumb:

- A percentage, ratio or "x veces" is almost always `calculated`. Show the formula once; later mentions can point back ("82.6%, see Measurements").
- Approximations say how they approximate ("tokens = bytes / 4, no tokenizer").
- Hooks in "Content material" keep a short label in parentheses when they use a number, so the content agent sees the source.
- Round only in hooks, never in the measurements table.

## Discrepancies

Sources disagree more often than expected (a report measured the working copy, the ADR measured a commit; a deck rounded). When they do:

1. Pick the value that is measured and anchored (a commit, a date, a command) over one that is restated or rounded.
2. Write both values and both sources in a short "Nota" right under the table that uses them.
3. If the choice changes a headline number, give the alternative result too ("with the spike's figure the reduction would be 83.7%").
4. Mention every discrepancy in the report back to the user.

Finding a discrepancy is a good outcome; it is exactly the honesty that makes the document trustworthy.

## When the evidence corrects the request

The requester's own framing is a starting point, not a source. If the evidence says something narrower or different ("it broke completely" when 9 of 14 checks stayed green; "we fixed it" when nothing is merged yet), the document tells what the evidence shows, the title and hooks follow the evidence, and the report back names the correction in one line. Do it plainly, without hedging.

## The "unverified" list

Anything you could not confirm goes into "Honest limits / what was not measured", phrased as what is missing:

- goals that were planned but never measured ("the goal for X is in the plan and appears measured in no report");
- what a number does NOT prove ("100% is the classifier's recall; it does not prove the model opens the file");
- hypotheses from a reverse-engineering job;
- facts with a single non-primary source.

Also add a one-line warning for the content writer under the hooks when a tempting misreading exists ("Do not say 'the AI obeys 100%'; that was not measured").

## Never

- Invent numbers, quotes, user counts, testimonials, dates or outcomes.
- Present a plan's target as a result.
- Fill a gap with a plausible value. Write `no data`.
- Include prices, offers or calls to buy (the public content does not sell).

## Privacy

The document leaves the machine (to another agent, and pieces of it to the public). Before saving, remove or generalize:

| Remove | Replace with |
|---|---|
| absolute local paths (`/Users/...`, `/home/...`, `C:\Users\...`, `/private/tmp/...`, `~/...` pointing at personal folders) | repo-relative paths (`.agents/instructions/agent-git.md`) |
| usernames, personal emails, real names of private people | a role ("the maintainer", "a student") |
| tokens, keys, passwords, secret values, connection strings | nothing; never copy a secret, even redacted |
| session ids, worktree or terminal handles, run ids, internal agent names | a description ("a conductor session") |
| private URLs (internal dashboards, Jira/Slack links of a private workspace, preview deploys) | the name of the thing ("the project's Jira board") |
| client or company data that is not public | a generic description ("a real web app, test copy") |
| local file or folder names that carry session or internal labels (`handoff07-...json`, `impl-fleet/`, worker or run names) | a description of the document ("the spike findings document", "the decision log"); the checker cannot detect these, so look for them on the final read |

Allowed: public repo names (`org/repo`), public PR and issue numbers, public docs URLs, tool names, commit short hashes of public repos.

Local working documents can still be listed in "Sources" by their repo-relative path with a note "(local, unpublished)", so the author knows where a fact came from.
