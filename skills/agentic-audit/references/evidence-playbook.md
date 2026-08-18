# Evidence Playbook

How to gather facts fast, in an order that front-loads the cheap signals. Read this before Phase 2.

Everything here is read-only on the target. Nothing writes, commits, or pushes.

## Table of contents

1. Cheap signals first (60 seconds)
2. Git history
3. Context artifacts
4. Agent configuration
5. Issue tracker, with and without access
6. Tests and CI
7. Secret hygiene
8. The live app
9. Sibling boilerplate comparison
10. Traps that produce wrong findings

---

## 1. Cheap signals first

Run these before reading anything in depth. They shape where the remaining effort goes.

```bash
cd "$TARGET"
ls -a                                   # what exists at all: .context, .agents, .github, .husky
git log --oneline | wc -l               # scale of the work
git log -1 --format='%ci'               # is it alive
git log --oneline --reverse | head -3   # how it started
git branch -a                           # branching reality vs claimed strategy
git shortlog -sne | head                # who actually wrote it
```

An absent directory is a finding. `.github` missing means no CI, and that single fact reframes every
test-related claim the project makes about itself. Confirm absence rather than assuming it was deleted:

```bash
git log --oneline -- .github | head -3   # empty output = never existed
```

## 2. Git history

The history tells you how the person works, which is often more informative than the code.

```bash
git log --oneline -30                                  # recent rhythm and message quality
git log --format='%s' | grep -cE '^[a-z]+\(' || true   # conventional-commit adherence
git log --format='%s' | grep -ciE 'claude|copilot|generated with' || true   # AI attribution leaks
git log --format='%an' | sort | uniq -c                # solo or team
```

What to read for:

- **Ticket keys in messages** (`fix(PROJ-123): …`) mean traceability is real, not aspirational.
- **Merge commits from numbered PRs** mean the branch policy is actually enforced, not just documented.
- **Commit size**: hundreds of files in one commit means the agent is driving unsupervised.
- **Session logs / bitácora commits** paired with feature commits mean a human is narrating decisions.

## 3. Context artifacts

Presence is not the same as substance. A template with headings and no content scores 1, not 4.

```bash
find .context -maxdepth 2 -type d | head -40
wc -l .context/**/*.md 2>/dev/null | sort -n | tail -25
```

Sort by line count. Files under ~30 lines are usually stubs or READMEs; the real content shows up in
the tail. Open two or three of the largest and confirm they describe *this* project rather than the
boilerplate's example project. Copied placeholder content is a specific and common finding.

Decision records deserve a direct look: a folder of ADRs whose only file is `ADR-NNNN-template.md` is
a template, while six numbered records with real tradeoffs is one of the strongest positive signals
available.

## 4. Agent configuration

```bash
ls -la .agents/
head -60 .agents/project.yaml
```

Read `project.yaml` for `null` values left from the template — each one is a variable the project never
adapted. The `git_strategy:` block tells you whether a branching policy was chosen deliberately (it
carries a `created` / `updated` stamp) or left unset.

Catalog files (`jira-fields.json`, `jira-workflows.json`, `jira-required.yaml`) are worth their weight:
a synced catalog proves the tracker was actually wired up. Summarize them rather than reading them
whole:

```bash
bun -e 'const w=require("./.agents/jira-workflows.json");
for (const [k,v] of Object.entries(w)) console.log(k, "|", v.jira_issue_type?.name, "|", Object.keys(v.statuses||{}).join(", "))'
```

Then check whether the configured capability is *used*. Custom fields that exist but are empty
everywhere is a precise, useful finding: the person built the rails and hasn't run a train on them yet.

## 5. Issue tracker, with and without access

With access (Atlassian MCP or `acli`), sample the board: status distribution, whether criteria fields
are filled, whether defects link back to their source story.

Without access, the synced mirror under `.context/PBI/` is usually enough:

```bash
ls .context/PBI/epics | head
find .context/PBI -type d -name 'STORY-*' | wc -l
find .context/PBI -type d -name 'STORY-*' -exec ls {} \; | sort | uniq -c | sort -rn
```

That last histogram shows which per-story artifacts exist across the whole backlog, which is a fast
read on consistency: 28 `story.md` but only 19 review files tells you where the discipline drops off.

Say in the report which of the two you used. A mirror can be stale, and the reader deserves to know.

## 6. Tests and CI

Count what exists, then check whether anything runs it automatically. Those are different questions and
the second one is usually the finding.

```bash
find . -path ./node_modules -prune -o \( -name '*.test.*' -o -name '*.spec.*' \) -print | head -20
ls .github/workflows 2>/dev/null || echo "NO CI"
cat .husky/pre-push 2>/dev/null
```

Read the hooks literally. Hooks that run format, lint and types but no tests are common, and they
create a false sense of protection worth naming plainly: the suite only protects when someone
remembers to run it.

For BDD-style suites, the tag counts give you real coverage numbers:

```bash
grep -c '^\s*\(Scenario\|Escenario\)' <feature-file>
grep -c '@automated\|@automatizado' <feature-file>
```

## 7. Secret hygiene

```bash
git log --all --oneline -- .env | head -3      # was a real .env ever committed
grep -rIn --exclude-dir=node_modules --exclude-dir=.git -oE 'eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}' . | head
```

Expect false positives from documentation examples. Verify each hit by opening it before reporting;
calling a placeholder in `.env.example` a leaked credential destroys trust in the whole audit. A clean
result is worth stating positively in the report, because it is genuinely one of the first things that
breaks when people move fast with an agent.

## 8. The live app

The `playwright-cli` binary drives a real browser from the shell. Sessions are named with `-s=` so
several can coexist.

```bash
playwright-cli -s=audit open <url>
playwright-cli -s=audit resize 390 844
playwright-cli -s=audit screenshot --filename=shots/home-mobile.png
playwright-cli -s=audit console error
playwright-cli -s=audit close
```

Measured checks beat opinions. This one returns heading order, missing alternatives, language, and
tap targets below the 44 px comfort threshold in a single call:

```bash
playwright-cli -s=audit eval "() => { const r={};
  r.h=[...document.querySelectorAll('h1,h2,h3,h4')].map(e=>e.tagName+':'+e.textContent.trim().slice(0,28));
  r.imgNoAlt=[...document.images].filter(i=>!i.hasAttribute('alt')).length;
  r.lang=document.documentElement.lang;
  r.small=[...document.querySelectorAll('button,a')].map(b=>({t:b.textContent.trim().slice(0,20),x:b.getBoundingClientRect()}))
    .filter(o=>o.x.width>0&&(o.x.width<44||o.x.height<44)).map(o=>o.t+' '+Math.round(o.x.width)+'x'+Math.round(o.x.height));
  return JSON.stringify(r); }"
```

For a suspected overflow, walk the ancestor chain before judging — a scrollable wrapper turns a "bug"
into a nit:

```bash
playwright-cli -s=audit eval "() => { const el=[...document.querySelectorAll('pre,table')].find(e=>e.scrollWidth>e.clientWidth+2);
  const chain=[]; let n=el; for(let i=0;i<4&&n;i++){const cs=getComputedStyle(n);
  chain.push({tag:n.tagName,ox:cs.overflowX,sw:n.scrollWidth,cw:n.clientWidth}); n=n.parentElement;}
  return JSON.stringify(chain); }"
```

Note: `playwright-cli` will not load `file://` URLs — the page comes back blank. To render-check a local
HTML file (including the report you just built), serve it over loopback first:

```bash
python3 -m http.server 8791 --bind 127.0.0.1 & sleep 2
playwright-cli -s=doc goto http://127.0.0.1:8791/report.html
```

## 9. Sibling boilerplate comparison

Only when a sibling exists locally, and only to enrich the "what's new upstream" note:

```bash
ls ../agentic-dev-boilerplate/.claude/skills ../agentic-qa-boilerplate/.claude/skills 2>/dev/null
diff <(ls "$TARGET/.claude/skills") <(ls ../agentic-dev-boilerplate/.claude/skills) 2>/dev/null
```

Frame version drift as information, not as a failing grade. A project frozen on an older version that
works and that its owner understands end to end is in better shape than one chasing every upstream
change. Mention only the upstream capabilities that would solve a problem the audit actually found.

## 10. Traps that produce wrong findings

| Trap | What it looks like | How to avoid it |
|---|---|---|
| Auditing against the target's own vendored rules | Everything scores high, nothing surfaces | Score against this skill's rubrics only |
| Grep hit treated as a finding | "Leaked JWT" that is a docs placeholder | Open every hit before reporting it |
| Absence assumed | "They deleted CI" | `git log -- <path>` to prove it never existed |
| Visual bug by screenshot | Clipped content that actually scrolls | Read computed styles up the ancestor chain |
| Stale mirror read as live state | Backlog claims that contradict the board | Say which source you used |
| Deliberate divergence scored as ignorance | Author feels talked down to, ignores the rest | Ask why in the report instead of scoring it |
| Praise with no anchor | "Great structure!" | Quote their own file, line, or comment |
