# Document template

Headings and labels below are in English. When the document is in another language, translate headings and labels, keep the order, and use the language's own label forms (the table at the end lists Spanish equivalents; the checker accepts both). Identifiers, commands and quoted config stay as they are.

Sections scale with the source: a single spike finding or PR gives ~1,500-3,500 words, a multi-PR feature 4,000-6,000. Padding hurts the content agent more than a short document does. A section with nothing real to say gets one honest line ("No performance measurements exist; the change is configuration only").

## Shape

```markdown
# <Title: the topic + one concrete image>

Source document for producing content (reel, video, carousel). It holds facts, figures with their source and supporting material. It contains no posts.

<Repos / scope / date: what is covered and when it happened. Short names if there is more than one repo.>

Status: <built and merged | in progress, not merged | designed, not built | existing (reverse-engineered) | public topic>. Saying it up top keeps the content agent from telling a design as if it were a result.

Label convention: <one line covering measured / calculated / according to, and any approximation (tokens = bytes / 4)>.

## Summary in 5 lines
1-5. Problem, cause, idea, mechanism, result with its main number. Each line stands alone.

## The problem
Subsections with their own names. Real numbers in a table when there are more than two. Include why the obvious shortcuts did not work, if relevant.

## The idea
The idea in plain words, where it comes from, and "Material for analogies" (3-5 everyday analogies).

## The design
How it works. An ASCII diagram if there is flow or layers (plain characters: +--+ | -> v). One short real fragment (config, log, command) copied from the source, with its origin. What was deliberately left fixed and why.

## How it was built
Numbered steps: research, decisions, implementation, verification. No private details (no local paths, no session names). A table of PRs if they are public.

## The measurements
Before / after table with a label in every cell. Percentages and "x times" marked calculated with their formula. Discrepancy notes under the table that uses them.
When there is no "after" yet (design only, or work in progress), the table shows what was measured before and an "expected per the design" column marked `(according to <source>)`, or the cell `no data`. Never fill an "after" with what the design promises.

## The result and what changes for the user
Bullets with the practical change for the user, each with its source or its number.

## Honest limits / what was not measured
What was not measured, what a number does not prove, goals that were not met, hypotheses, figures with a date.

## Content material
### Quotable hooks
8-12, concrete (a number, a tool, an error). A short label when they use a number.
Voice: first person ("I deleted", "I measured") only for what the author really did. If it was an experiment, a test copy or an agent's work, the hook says so ("in a test copy", "an agent measured").
A warning for the writer, if a tempting and false reading exists.
### Angle 1: "<name>" (<suggested format>, <structure>)
5-7 numbered beats, from hook to close.
### Angle 2 ... ### Angle 3 ...
Three genuinely different angles (for example: symptom -> cause -> cost -> cut; investigator reel; saveable authority carousel). When useful, name each one's objective: reach, authority, connection or conversion.
### Suggested visual metaphors
4-6 images a designer or a video could show.
### Plain-language glossary
Table of 6-12 terms: term | what it is, in one sentence a non-technical person understands.

## Sources
Local documents (repo-relative path, "local, unpublished") and versioned / public files (repo, path, PRs, public URLs with the date consulted).
```

## Writing rules

- Prose in the document language; identifiers, commands, file names and quoted config stay as they are.
- Use a comma, a colon, parentheses or two sentences where a dash would go: the checker fails on em dash (U+2014) and en dash (U+2013) in prose. Numeric ranges like `2024-2026` use a hyphen.
- State each claim directly. Skip "not X, but Y" contrasts, staged openers ("Let's see", "Here's the thing") and one-line closers that repeat the paragraph.
- Pick plain words over inflated ones (crucial, fundamental, robust, leverage, seamless, comprehensive).
- Vary sentence length on purpose. A 4-word sentence next to a 25-word one.
- Specific beats general: a number, a file, a date. A sentence that stays true after deleting the topic is filler.
- Bold only as a landing point in lists, about one per item, never a whole clause.

## Filled mini-example (one subsection, to calibrate tone)

```markdown
### Codex cut off the file silently

Codex merges a project's `AGENTS.md` files into one budget, `project_doc_max_bytes`, which defaults to 32,768 bytes. Anything past that is cut at the exact byte and only a log warning remains (spike plan §2.3, verified in the Codex source).

- Codex saw 30.4% of the QA file (calculated: 32,768 / 107,867).
- What fell outside: git policy, ticket cache, variables, memory.
```

## Spanish equivalents (checker accepts both)

| English | Spanish |
|---|---|
| Summary in 5 lines | Resumen en 5 líneas |
| The problem | El problema |
| The idea | La idea |
| The design | El diseño |
| How it was built | Cómo se construyó |
| The measurements | Las mediciones |
| The result | El resultado |
| Honest limits | Límites honestos |
| Content material | Material para contenido |
| Sources | Fuentes |
| Quotable hooks | Frases citables (hooks) |
| Angle N | Ángulo N |
| measured / calculated / according to / interpreted | medido / calculado / según / interpretado |
| no data / unverified | sin dato / sin verificar |
