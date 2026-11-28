---
name: wake-on
description: Watch something until a condition changes and wake the session when it does, at zero model tokens while waiting. Use this whenever the user wants to be told when something happens without polling by hand or spending tokens, even if they never say "watch" or "sentinel". Typical asks are waiting for a PR approval or review comment, a CI run to finish, a ticket status to change, a Playwright or CLI output to change, a file or endpoint to change. Spanish triggers include "centinela", "avísame cuando", "espera hasta que", "quédate escuchando", "vigila el PR", "despiértame cuando". A watcher keeps running through any number of events and only ends when the user says so.
license: MIT
metadata:
  author: UPEX Galaxy
---

# wake-on

A shell watcher polls a condition with plain tools (`gh`, a CLI, `curl`). It costs no model tokens while
it runs. Each change becomes one line in an event log. A second command, `wake`, blocks until that log has
unread lines, prints them and exits. The exit is what wakes the session.

Two processes, because one is not enough. If the watcher itself exited on the first event, anything that
happened between that wake-up and the next arm would be lost. Here the watcher never exits on an event, and
the log remembers what `wake` has already delivered, so an event written while the session was busy is
handed over on the next `wake`.

## Vocabulary

| Term | Meaning |
|---|---|
| watch | one named thing being observed, for example `pr-42` |
| watcher | the background process that polls until `stop` |
| preset | a small file that says what to read and how to describe a change |
| event log | `events.log`, one line per change, kept per watch |
| wake | the blocking command that returns the unread events |

## The loop

```bash
WO=<skill-dir>/scripts/wake-on.sh                  # <skill-dir> is the folder that holds this SKILL.md
bash $WO presets                                   # what can be watched and which parameters it takes
bash $WO start pr-review pr-42 REPO=owner/name PR=42
```

Then arm the wake as a **background Bash call** (`run_in_background: true`) and keep working or stop the turn:

```bash
bash $WO wake pr-42
```

When it returns, read the events, act on them, and **arm `wake` again straight away**. A watch that nobody
waits on still records events, so a late re-arm loses nothing, but an unarmed wake means nobody is told.

Stop only when the user says the watch is no longer needed, or the thing being watched is truly finished
and the user agrees:

```bash
bash $WO stop pr-42
```

| Command | Use |
|---|---|
| `start <preset> <name> [KEY=VAL ...]` | create a watch. If the name exists and its watcher died, it restarts with the saved parameters and reports what changed while it was down |
| `wake <name> [name ...]` | block until any listed watch has new events. Several names share one wake |
| `status [name ...]` | is the watcher alive, how long since its last poll, events logged versus consumed |
| `log <name> [n]` | read recent events without consuming them |
| `stop <name>` | the only way a watch ends |

## Why it cannot go quiet by accident

- A failing poll (expired login, network, a command that exits non-zero) does not end the watcher. After 10
  failures in a row it writes one `WATCH WARNING` event, and a `WATCH RECOVERED` event when polling works again.
- If the watcher process dies, the next `wake` exits with `WATCH DEAD`. If the process is alive but stopped
  polling, `wake` exits with `WATCH STALE`. Both wake the session, so silence is never a failure mode.
  "Stopped polling" means no poll for more than two intervals plus a minute, and never less than 15 minutes.
  The watcher records its interval, so a 30-minute poll is not called stale between two normal polls.
- State lives in `~/.wake-on/instances/<name>/` (override with `WAKE_ON_HOME`), outside any repository.

After a session resumes, a handoff, or any doubt, run `status` first. A watch from an earlier session may
still be running and its events are waiting in the log.

## Presets

| Preset | Watches | Parameters |
|---|---|---|
| `pr-review` | reviews, inline and plain comments (and their edits), PR state and review decision, from anyone except the author and bots | `REPO`, `PR`, optional `SELF`, `INTERVAL` (120) |
| `gh-run` | a GitHub Actions run and each of its jobs, every status or conclusion change | `REPO`, `RUN`, optional `INTERVAL` (60) |
| `command` | anything a shell command prints. A line that appears or disappears is an event | `CMD`, optional `INTERVAL` (120) |

`command` is the agnostic one and covers most new needs without writing a preset. Examples:

```bash
# A ticket's status and assignee (your tracker CLI prints one "Field: value" line per field; keep only those)
bash $WO start command tk-123 "CMD=cd /path/to/project && <tracker-cli> get TK-123 | grep -E '^(Status|Assignee):'" INTERVAL=300
# A page element via the Playwright CLI, a deploy via curl, a count via a SQL CLI: same shape
bash $WO start command health "CMD=curl -fsS https://example.com/health" INTERVAL=60
```

Print the state, one fact per line, and nothing that changes on its own (timestamps, request ids). A line
that differs on every poll is an event on every poll.

## Choosing the interval

The watcher is the only thing that spends API budget. Count the calls per poll and the poll rate. `pr-review`
makes 4 `gh` calls per poll, so 120 s is about 120 calls an hour, far under GitHub's 5000. Use 60 s or more for
remote APIs, 10 s or more for local checks. Slower is fine for approvals, which arrive in hours.

## Adding a preset

A preset is one file in `presets/<name>.sh`, sourced by the engine. Define:

| Function or variable | Required | What it does |
|---|---|---|
| `PRESET_SUMMARY`, `PRESET_PARAMS` | yes | text shown by `presets` |
| `preset_init` | yes | validate parameters, set defaults, return non-zero to refuse |
| `preset_snapshot` | yes | print the current state, one fact per line, exit non-zero if the read failed |
| `preset_describe` | no | read `$WAKE_ADDED` and `$WAKE_REMOVED` (newline lists) and call `emit "text"` once per event. The default emits `ADDED` / `REMOVED` lines |

Rules that came from real failures:

- The engine sets `pipefail`. Keep it that way: without it a failing `gh api ... | jq` returns success with
  empty output, the snapshot looks like "everything was deleted", and the next good poll reports it all as new.
- `emit` takes one line. Use `oneline` to flatten and cut a body.
- Put the facts that identify a change in the line itself, such as an `updated_at`, so an edit is a new line.
- Test with `WAKE_ON_TEST_DROP=1 bash $WO start ...` and a short `INTERVAL`. It deletes one baseline line so the
  first poll produces a fake event, which proves the whole path without waiting for a real change.

## Where a script belongs

This folder is shared. Installed at user level, every session in every project reads the same presets. That
makes it the right home for a pattern that repeats and the wrong home for a one-off.

- **One concrete need stays with the work.** A probe for one PR's pipelines or one ticket's status lives in the
  project that needs it and runs through the `command` preset (`CMD='bash path/to/probe.sh'`). The path is saved
  with the watch, so a restart finds it.
- **Promote it to a preset here the second time the same pattern is needed,** in any project. Promoting means
  copying the logic into `presets/<name>.sh`, turning every hard-coded name into a parameter, testing it with
  `WAKE_ON_TEST_DROP=1`, adding it to the preset table above and committing it.
- **Keep presets generic.** No project paths, ticket ids or hostnames inside a preset. They arrive as parameters.
  A preset that only makes sense in one repo is a probe, so it stays in that repo.
- **A running watch keeps the preset it started with.** The watcher loads its preset once, so an edit reaches a
  watch the next time that watch starts, not while it runs. Test an edited preset on a new watch name first.
- **Every change to this skill is a git commit in its source repository,** so a bad edit can be undone. Edit
  the source, because reinstalling overwrites an installed copy. Check `git log -- presets/<name>.sh` before
  changing a preset, stage the specific files you touched, and write a message that says what changed and why.

## Portability notes

- Written for bash 3.2 (macOS default) and works with Linux `stat`. There is no `timeout` command on macOS, so
  tests wait with `sleep` and `kill -0` instead.
- `gh` can silently switch its active account between calls in some setups. Repeated failures of a `gh`
  preset usually mean that, so check `gh auth status`.
- A laptop that sleeps or shuts down stops the watcher. `start` on the same name restarts it and reports what
  happened while it was down.
