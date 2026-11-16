# Research subagent brief

Use when the source is large. Fill every `<...>`, paste the whole brief, dispatch ONE subagent (Claude Code: the Agent tool, general-purpose; other harnesses: their subagent or task mechanism). Do not split the research across several subagents: one reader keeps the story coherent and catches discrepancies between sources.

```
Goal: write a content source document (markdown) about <story in one line>, for a separate social-content agent. You write the source, never posts.

Skill: read <skill-dir>/SKILL.md and these references before starting:
<skill-dir>/references/research-protocol.md (section "<type>"),
<skill-dir>/references/evidence-rules.md,
<skill-dir>/references/document-template.md.
They are binding: labels on every number, discrepancies noted, an "unverified" list, privacy scrub.

Source type: <feature | repo | reverse | topic>
Primary sources to read, in this order:
- <path or PR or URL> : <what it holds>
- ...
Read every listed source fully. You may follow references they cite.

Angle / audience: <or "broad tech audience, propose 3 angles">
Document language: <the user's language>; identifiers unchanged.
Save to: <absolute output path>

Rules:
- Read only; do not modify any repo file, do not commit, do not push.
- Never open .env*, .auth/**, settings.local.json, token or credential files; never print environment variables.
- No absolute local paths, usernames, secret values, session ids, terminal handles or private URLs in the document.
- Every number from a source or marked "calculated" with its formula. When sources disagree, use the measured / commit-anchored value and note the other.

Verification before you finish:
1. Run: bash <skill-dir>/scripts/check-content-doc.sh <output path>  (must exit 0; fix and re-run)
2. Re-read the saved file once end to end.

Report back (short): path, word count, the 5-line summary, the main measurements table, discrepancies found, unverified items, and any source you could not read.
```

The conductor then reviews the draft, runs the humanizer pass (SKILL.md step 5), re-runs the checker, and reports to the user.
