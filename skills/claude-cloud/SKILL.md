---
name: claude-cloud
description: 'Run Claude Code cloud sessions (claude.ai/code) in parallel, one per unit of work: launch with `claude --cloud`, wake a session from the web UI so it gets the claude.ai connectors, queue, watch, harvest, and the measured traps. Scripts: launch.sh, wake.sh, queue.sh, watch.sh, assemble.sh, worktree.sh. Requires CLAUDE_CLOUD_PLAYWRIGHT_PROFILE. Use for: cloud, "claude --cloud", "in the cloud", "cloud sessions", claude.ai/code, "cloud fleet", "launch in parallel in the cloud", cloud environment, "/remote-env", setup script, "stuck session", "relaunch the session", "wake the session", "waiting for connector", "launch worktree". Not for: work that needs a specific person''s browser login, secrets missing from the environment, a local Orca fleet (`agent-orchestration`), or a subagent in the current turn. Spanish triggers: nube, "en la nube", "flota en la nube", "sesión trabada", "despierta la sesión", "el conector no aparece".'
license: MIT
metadata:
  author: UPEX Galaxy
---

# claude-cloud: Claude Code sessions in the cloud

A Claude Code cloud session runs on an Anthropic VM, stays alive with your laptop closed, and you can
drive it from the terminal, the browser or a phone. This skill is the method for launching many at once,
one per unit of work, and bringing back through git only the light results (logs, delivery markers). Your
machine only coordinates. It does not render, compile, transcribe or store the heavy results.

This is the mechanics only, with no knowledge of what gets produced. Anything that depends on the goal
(what a unit produces, where it is delivered, which environment it needs) lives in your project or in a
domain skill of your own.

> **Rule: a fleet never ends with heavy files downloaded to the local machine.** Each session
> delivers from inside its container (a claude.ai connector, a bucket, a service), and only light results
> come back. What the local machine does keep is the session IDs (`sessions.txt`), so you can resume any
> session by hand. Git-chunked output and `assemble.sh` are used **only with the explicit approval of the
> person who owns the machine, case by case** (section 7). The reason is disk space: large files pulled back
> as git chunks stay in the history and grow the local `.git` by gigabytes. If a session is missing its
> connector, wake it from the web UI (`scripts/wake.sh`, section 5). Do not ask it to split the result.

The facts here come from real runs or from the official documentation:
https://code.claude.com/docs/en/cloud-environments and
https://code.claude.com/docs/en/claude-code-on-the-web. Facts from the documentation are marked "(doc)".
Product behaviour and limits change, so check the current pages.

## Required setup

`wake.sh` opens claude.ai in a real Chrome window to message a session. It needs a Playwright profile that
is logged into **the claude.ai account that owns your cloud sessions**. If you have more than one claude.ai
account (personal and work, say), each Claude profile needs its own Playwright profile. Without this, a
session would open with the wrong account and fail silently.

The scripts use `claude`, `git`, `playwright-cli`, Google Chrome and `python3`. They were tested on macOS.

1. Pick a directory for the Playwright profile, for example `~/.playwright-profiles/claude-ai`.
2. Set `CLAUDE_CLOUD_PLAYWRIGHT_PROFILE` to that absolute path in the `env` block of the `settings.json` of
   the Claude profile you use (`$CLAUDE_CONFIG_DIR/settings.json`, default `~/.claude/settings.json`):

   ```json
   { "env": { "CLAUDE_CLOUD_PLAYWRIGHT_PROFILE": "/absolute/path/to/.playwright-profiles/claude-ai" } }
   ```

3. Log in once by hand: open a headed Chrome window with that profile through Playwright
   (`mkdir -p ~/.claude-cloud && cd ~/.claude-cloud && playwright-cli -s="$(basename "$CLAUDE_CLOUD_PLAYWRIGHT_PROFILE")" open https://claude.ai/code --profile="$CLAUDE_CLOUD_PLAYWRIGHT_PROFILE" --headed --browser=chrome`),
   log in, and close it. The agent never types credentials. Headless does not work: Cloudflare stops it.
4. Confirm with `bash scripts/wake.sh --check` (exit 0).

The variable has no default. `wake.sh` exits with code 6 when it is unset or the directory does not exist,
and `launch.sh` and `queue.sh` fail the same way before they create any session (unless
`CLAUDE_CLOUD_WAKE=0`). The playwright-cli session name is the profile's basename, and the lock file is
`<profile>.lock` next to the profile.

**Agent rule.** Before launching or waking anything, run `printenv CLAUDE_CLOUD_PLAYWRIGHT_PROFILE`. If it is
empty, stop and ask the user to set it as above. Never fall back to any other profile, even one you know
exists: it may belong to a different claude.ai account.

## Renamed scripts and variables

The scripts and variables used to have Spanish names. The old names still work: each old script is a thin
alias that prints `deprecated: <old>.sh is now <new>.sh` and runs the new one, and `defaults.sh` maps each
old `CF_*` variable that is set (and whose new name is unset) to its new name, with one deprecation line.

| Old | New |
|---|---|
| `lanzar.sh` | `launch.sh` |
| `despertar.sh` (`--comprobar`) | `wake.sh` (`--check`; `--comprobar` still works) |
| `cola.sh` | `queue.sh` |
| `vigilar.sh` | `watch.sh` |
| `armar.sh` | `assemble.sh` |
| `CF_ESTADO` | `CLAUDE_CLOUD_STATE_DIR` |
| `CF_RUNBOOK` | `CLAUDE_CLOUD_RUNBOOK` |
| `CF_WORKTREE` | `CLAUDE_CLOUD_WORKTREE` |
| `CF_ROOT` | `CLAUDE_CLOUD_REPO_ROOT` |
| `CF_REPO` | `CLAUDE_CLOUD_REPO` |
| `CF_PREFIJO` | `CLAUDE_CLOUD_BRANCH_PREFIX` |
| `CF_VOLVER` | `CLAUDE_CLOUD_RETURN_REF` |
| `CF_TAREA` | `CLAUDE_CLOUD_TASK` |
| `CF_EXTRA` | `CLAUDE_CLOUD_EXTRA` |
| `CF_PROMPT` | `CLAUDE_CLOUD_PROMPT_FILE` |
| `CF_MODO` | `CLAUDE_CLOUD_PERMISSION_MODE` |
| `CF_DESPERTAR` | `CLAUDE_CLOUD_WAKE` |
| `CF_DESPERTAR_MSG` | `CLAUDE_CLOUD_WAKE_MESSAGE` |
| `CF_DESPERTAR_DESAFIO_SEG` | `CLAUDE_CLOUD_WAKE_CHALLENGE_SEC` |
| `CF_DESPERTAR_COMPOSER_SEG` | `CLAUDE_CLOUD_WAKE_COMPOSER_SEC` |
| `CF_DESPERTAR_CANDADO_SEG` | `CLAUDE_CLOUD_WAKE_LOCK_SEC` |
| `CF_DESPERTAR_COMPOSER` | `CLAUDE_CLOUD_WAKE_COMPOSER` |
| `CF_DESPERTAR_TECLA` | `CLAUDE_CLOUD_WAKE_KEY` |
| `CF_DESPERTAR_PERFIL` | removed, ignored with a warning; use `CLAUDE_CLOUD_PLAYWRIGHT_PROFILE` |
| `CF_MAX` | `CLAUDE_CLOUD_MAX_SESSIONS` |
| `CF_TRABADA_MIN` | `CLAUDE_CLOUD_STUCK_MIN` |
| `CF_GRACIA_MIN` | `CLAUDE_CLOUD_GRACE_MIN` |
| `CF_ABANDONO_MIN` | `CLAUDE_CLOUD_ABANDON_MIN` |
| `CF_PATRON` | `CLAUDE_CLOUD_DELIVERY_PATTERN` |
| `CF_ESPERA` | `CLAUDE_CLOUD_POLL_SEC` |
| `CF_VUELTAS` | `CLAUDE_CLOUD_MAX_POLLS` |
| `CF_RELANZAR` | `CLAUDE_CLOUD_RELAUNCH` |
| `CF_MENSAJE` | `CLAUDE_CLOUD_STUCK_MESSAGE` |
| `CF_ESPERA_CONECTOR` | `CLAUDE_CLOUD_CONNECTOR_WAIT_PATTERN` |
| `CF_PAUSA_LOGIN_MIN` | `CLAUDE_CLOUD_LOGIN_PAUSE_MIN` |

State files and markers also have English names now, and every reader still accepts the old ones:

| Old | New | Compatibility |
|---|---|---|
| `sesiones.txt`, `cola.log`, `mensajes.txt`, `despertares.txt`, `lanzamientos/`, `despertar.log`, `despertar/` | `sessions.txt`, `queue.log`, `messages.txt`, `wakes.txt`, `launches/`, `wake.log`, `wake/` | A state dir that already holds `sesiones.txt` keeps all its old names |
| `entrega.json`, `entrega/` | `delivery.json`, `delivery/` | The default delivery pattern matches both marker names |
| `nube-log.md`, "esperando conector" | `cloud-log.md`, "waiting for connector" | The queue reads both log names and both phrases |
| `{UNIDAD}`, `{RAMA}` placeholders | `{UNIT}`, `{BRANCH}` | Both are replaced |
| earlier custom paths for the state dir and the launch worktree | `~/.claude-cloud/state`, `~/.claude-cloud/worktrees/<repo>` | Set `CLAUDE_CLOUD_STATE_DIR` or `CLAUDE_CLOUD_WORKTREE` to keep an old path |

## 1. When to use it and when not

**Use it** when there are N **independent** units (none reads what another produces) and each one is
**heavy**: CPU (a render, a build, whisper) or many hours of agent time (an audit per module, a test
battery). The gain is parallelism: units that would run one after another on your machine run side by
side.

**Do not use it** when:

- The unit needs **a browser session of a specific person** (LinkedIn, a personal account, Jira with
  their login). The VM has no local Playwright profiles and cannot open a window. Do that locally, in a
  batch, at the end. The cloud can talk to the **claude.ai connectors** the account already connected (no
  cookies or credentials in the environment: claude.ai handles the connection). For the session to get
  them, wake it from the web UI (section 5).
- It needs **secrets that are not in the environment**. The `.env` file does not travel (it is not in
  git). Anyone who uses an environment can read its variables (doc). Pro and Max plans have "network
  secrets" that the proxy adds to requests without the session seeing the key (doc). If the secret is in
  neither place, the unit does not run in the cloud.
- The units depend on each other, or the task fits in one turn. That is a local subagent.
- It is a fleet that writes repo code and needs supervision and integration. That is `agent-orchestration`.

**The cloud gives no extra tokens.** The sessions share your plan's limits with everything else that uses
them, and more sessions in parallel spend them faster (doc: "Running multiple tasks in parallel consumes
more rate limits proportionately"). Check your plan's limits before sizing a fleet. The VM itself costs
nothing extra (doc).

## 2. Splitting the load: what goes where

Before launching anything, split the work by what each piece consumes:

| Kind of load | Where | Why |
|---|---|---|
| Text and tokens (scripts, analysis, writing) | Local subagents, or inside the cloud session if it belongs to the unit | It uses no CPU; the cost is plan quota, which is the same on both sides |
| APIs with no CPU (voice, Jira, Slack, local MCP connectors) | Local | Fast, and the credentials are at hand; the light result travels in the branch |
| Heavy CPU (render, whisper, builds, long suites) | **Cloud** | This is what freezes the local machine |
| Uploading the result to a service with a claude.ai connector or a key in the environment | **Cloud**, at the end of the unit | The local machine only gets the id or the path |
| Anything that needs a specific person's browser session | Local, in a batch, at the end | The VM has no local profiles |

## 3. The cloud environment

Every session runs in an **environment**: network, variables and a setup script (doc). You create it at
[claude.ai/code](https://claude.ai/code): environment selector above the message box, "Add cloud
environment". A person creates it from the web UI. The agent cannot (`/remote-env` only selects; it does
not create or edit, doc).

| Field | What to set | Note |
|---|---|---|
| Name | One per kind of work | |
| Network | **Full** if you need binaries from domains outside the Trusted list; **Custom** if your own list is enough; **Trusted** (default) covers npm, PyPI, GitHub and the common registries | claude.ai MCP connectors and GitHub traffic do not go through this list (doc) |
| Variables | `BASH_DEFAULT_TIMEOUT_MS=1800000` and `BASH_MAX_TIMEOUT_MS=7200000` | Without them, a foreground command waits 2 min (up to 10) and a backgrounded one dies 30 min later (doc). A job longer than that does not fit |
| Setup script | Whatever the work needs that the image lacks | It is cached only if it finishes in **~5 min** (doc). The cache is a disk snapshot, expires after ~7 days and is rebuilt if you change the script or the network (doc) |

**Set the default once.** `/remote-env` in a local Claude Code session opens the environment list and saves
the choice in `remote.defaultEnvironmentId` of the user settings (doc). It applies to every `claude --cloud`
on that machine. The `--environment` flag only works for self-hosted environments (`ccpool_…`); it
rejects an Anthropic `env_…` (doc).

**Which repo the session uses** depends on the git remote of the directory you run `claude --cloud` from
(and its branch), not on the environment. Launching from another repo changes the session's repo.

The image already has Python 3, Node 20/21/22, bun, gcc/clang/cmake, Docker, PostgreSQL 16, Redis 7, git,
`gh`, jq and ripgrep (doc). Resources: **4 vCPU, 16 GB RAM, 30 GB disk** (doc).

To set the subagent model too, add `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` and
`CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` to the environment variables (section 5, auto mode).

## 4. The method, in eight steps

1. **Pilot one unit and measure it.** Launch one, with the final runbook, and read its timing log before
   launching the rest. A pilot is where limits show up (an output over the 500 MiB cap of `SendUserFile`,
   for example) while the runbook can still be fixed. Without a pilot, you pay for that mistake once per
   unit.
2. **One git branch per unit, with its inputs.** The session clones the remote on the branch your
   checkout is on (doc), so everything the unit needs must be committed and pushed on its branch. Add what
   `.gitignore` excludes with `git add -f`. Use a common prefix (`fleet/<unit>` by default), because the
   scripts count by prefix.
3. **A versioned runbook** that the session reads from its own branch. Start from `templates/runbook.md`:
   timed steps, a checkpoint commit, output, delivery marker, final report. The session cannot ask
   anything (nobody will answer), so the runbook says what to do when something fails.
4. **Launch** with `scripts/launch.sh` (section 5). It creates the session, writes its URL to
   `sessions.txt` and immediately wakes it from the web UI with `scripts/wake.sh` so it gets the
   connectors. Before the pilot, `scripts/wake.sh --check` confirms the Playwright profile is logged in
   (exit 0).
5. **A queue** that keeps ~10 running. `scripts/queue.sh` launches up to `CLAUDE_CLOUD_MAX_SESSIONS`, counts
   delivered, running and stuck sessions every 3 min, and fills the free slots. The default is 10; check
   your plan's limits and lower it if needed. A session that is stuck, or that wrote "waiting for
   connector" in its log, gets woken from the web UI (once per reason) before any CLI message. The queue
   never assembles or downloads deliveries.
6. **A push watcher.** `scripts/watch.sh <n>` exits as soon as more than `n` units have delivered. Use it to
   wake the coordinating session without checking by hand.
7. **The output and the delivery marker.** The queue and the watcher count a branch as delivered when it
   has a file that matches `CLAUDE_CLOUD_DELIVERY_PATTERN` (default `(^|/)(delivery|entrega)\.json$`; the
   template's last step writes `delivery.json`). The marker must be something the session pushes to its
   branch **and that does not exist on the base branch**. Anything that is not heavy (a report, a log,
   code) goes out through normal git. If the output needs a connector that does not appear, the session
   **does not split the result**. It writes "waiting for connector" in its log, pushes it, leaves the
   result in its container and retries ToolSearch every 2 min for up to 60 min, while the queue (or you,
   with `wake.sh`) wakes it from the web UI. Git chunks (section 7) only if the coordinator asks for them
   with the machine owner's approval.
   **Use a new branch prefix per fleet.** `queue.sh` and `watch.sh` fetch `refs/heads/<prefix>*` with an
   explicit refspec, which bypasses a negative refspec in `.git/config` (section 6), and reusing the prefix
   of an old fleet with heavy branches downloads them again.
8. **Close and clean up.** Collect the delivery markers without switching branches
   (`git show "origin/<branch>:<path>/delivery.json"`) and load each id where it belongs. Always keep
   `sessions.txt`: it is the record for resuming any session from claude.ai/code. `assemble.sh` is not part
   of closing. Use it only if the machine's owner approves downloading one specific unit, and then
   assemble that file only when you are about to use it and delete it afterwards. Delete the branches at
   the end, **after asking the user first** (`git push origin --delete <branch>`): they hold the log, the
   intermediate files and, if there were chunks, the only copy.

### The launch worktree exists only while a fleet runs

Rule: `launch.sh`, `queue.sh` and `watch.sh` work on a detached worktree that switches
branches. Create that worktree when the fleet starts and remove it when it ends. Never leave one idle: it
takes disk space and sits on an old tip. `scripts/worktree.sh` handles it:

```bash
SK=~/.agents/skills/claude-cloud/scripts
(cd <main checkout> && git pull --rebase && git push)   # branches are cut from the pushed tip
eval "$(bash $SK/worktree.sh up | grep ^export)"        # before launching: creates or refreshes; exports CLAUDE_CLOUD_WORKTREE and CLAUDE_CLOUD_RETURN_REF
# ... launch.sh, queue.sh, watch.sh, harvest ...
bash $SK/worktree.sh down                               # when closing (section 4, step 8): refuses if dirty or if queue/watch are still running
bash $SK/worktree.sh status                             # exists? commit? size?
```

Routine check (the coordinating session does it at the end of the day): if `status` says `exists` and no
fleet is running, run `down`. Defaults: `CLAUDE_CLOUD_REPO_ROOT` is the main checkout of the current
directory's repo, `CLAUDE_CLOUD_WORKTREE` is `$HOME/.claude-cloud/worktrees/<repo>`, and
`CLAUDE_CLOUD_RETURN_REF` is the remote default branch (`origin/HEAD`, or `origin/main`). A repo with other
paths sets them by variable (or with its own wrapper that exports them and calls this script).

## 5. Launching and correcting a running session

`claude --cloud "<prompt>"` creates a new session on the repository and branch of the current directory
(doc). **It needs a TTY** (measured): it does not start from a script or from an agent's Bash tool. The
form that worked on macOS:

```bash
cd <worktree on the unit's branch>
script -q <log> claude --permission-mode auto --cloud "<prompt>" </dev/null >/dev/null 2>&1 &
```

**Auto mode.** No environment variable or environment setting fixes the permission
mode of a cloud session, and the repo's `permissions.defaultMode` does not apply there. What works is
`--permission-mode auto` placed **before** `--cloud` (`--cloud` needs the text right after it:
`claude --cloud --permission-mode auto "…"` gives "--cloud requires a description"). `launch.sh` sets it by
default (`CLAUDE_CLOUD_PERMISSION_MODE`). `--dangerously-skip-permissions`, `--model` and `--effort` do not
reach the cloud. Force the subagent model with `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` and
`CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` in the environment variables.

`script` provides the TTY and leaves the output in `<log>`. The CLI prints `Created cloud session …` with
`View: https://claude.ai/code/session_…` and exits; the session keeps running in the cloud.
`scripts/launch.sh` does this for every unit: it switches the worktree to the branch, launches, waits up to
90 s for the URL and writes it to `sessions.txt`.

The default prompt that `launch.sh` builds says:

- the branch and the runbook (read all of it and follow it to the letter);
- "commit and push ONLY to this branch (switch to it if you start on another one)";
- the runbook's exact trailers, with no `Co-Authored-By` and no attribution to Claude;
- "work without asking questions: nobody will answer".

**Correcting a running session**:

```bash
script -q <log> claude -p "<message>" --cloud <session_id>
```

It answers "Sent to cloud session." and exits. The message waits in a queue until the session
reads it (doc). Without `-p` it fails with "Attaching to an existing cloud session is not enabled" (doc).
An archived session receives no messages (doc). **That message does not give it the connectors.** The next
step does.

**Waking a session from the web UI** (`scripts/wake.sh <session_url> [message]`). A session created with
`claude --cloud` from the terminal does not get the tools of the claude.ai connectors (Loom, for example):
repeated ToolSearch calls over hours find nothing, and a `claude -p … --cloud` does not bring them either.
A message written in the web UI does. It is a known Claude Code cloud bug. The workaround that works: the
Playwright profile in `CLAUDE_CLOUD_PLAYWRIGHT_PROFILE` (logged into the
account that owns the session) opens the session URL **in a window**, writes in the composer and sends. The
session then gets the connectors and carries on alone. The script's sequence:

1. A `noclobber` lock in `<profile>.lock`: one browser at a time on the profile (waits up to 5 min; an
   orphan lock is cleaned up on its own).
2. `playwright-cli -s=<profile basename> open "$URL" --profile=… --headed --browser=chrome`. Headless does
   not pass: Cloudflare leaves it on "Just a moment...".
3. `--raw eval "document.title"` every 5 s until it is no longer the challenge (60 s at most).
4. `--raw eval "location.href"`. If it lands on `/login`, the profile lost its login. It stops, and the
   user logs in once inside a headed Chrome window opened with that profile.
5. `fill` the composer (by role, with fallback locators, because the ref changes on every load), read the
   text back and compare it.
6. Send with ⌘↵ (`CLAUDE_CLOUD_WAKE_KEY`), which queues the message: if the session is mid-turn, the
   message goes in when the current step ends, without interrupting it.
7. `screenshot` (in `<state>/wake/`) and `close`.

Exit codes: 0 sent, 1 usage error or the browser did not open, 2 not logged in (the user logs in), 3
challenge not passed in 60 s, 4 no composer or the composer holds other text, 5 lock busy, 6
`CLAUDE_CLOUD_PLAYWRIGHT_PROFILE` unset or missing. Everything goes to `<state>/wake.log`. The default
message (neutral; `CLAUDE_CLOUD_WAKE_MESSAGE` replaces it) asks the session to look for the connector its
runbook names with ToolSearch, write it in the log its runbook names, push and carry on.
`wake.sh --check [url]` opens a page (default `https://claude.ai/code`), checks Cloudflare and the login, and
closes without writing anything.

`launch.sh` calls it right after creating each session (`CLAUDE_CLOUD_WAKE=0` turns that off), and
`queue.sh` calls it when a session gets stuck or writes "waiting for connector". The window shows on your
screen briefly for each session. It is the only profile that works headed, and that is accepted for this
purpose.

## 6. Measured traps

| Trap | What happens | What to do |
|---|---|---|
| The session starts on a `claude/*` branch | A session can start on `claude/<unit>-cloud-…`, at the same commit as the unit's branch | The prompt tells it to switch to its own branch before committing |
| A session gets stuck silently | A session stops pushing for hours. **Stuck is not dead**: after "the session process restarted" it can sit idle a long time, then resume alone and push. If it was relaunched in the meantime, both push to the same branch and collide, and the second one leaves its version in `session-2/` | `queue.sh` marks it stuck after **60 min with no delivery and no push** (it counts from the last push, so the runbook pushes the log at the start of each long step), wakes it from the web UI with `wake.sh` and sends it **one** automatic message (`claude -p … --cloud <session_id>`, id from `sessions.txt`) so it resumes from its branch and pushes its log; this goes to `queue.log` and `messages.txt`. The stuck session keeps its slot until `CLAUDE_CLOUD_ABANDON_MIN` (240). `CLAUDE_CLOUD_RELAUNCH=1` relaunches once per unit, only if there was no push `CLAUDE_CLOUD_GRACE_MIN` (30) after the message; if you relaunch, archive the old one in claude.ai/code |
| Delivered is not correct | The queue counts a branch with the marker as delivered. A unit can leave a perfect marker with wrong content (segments in the wrong order, for example) | In the pilot, check the content (samples at several points, not only the start) before launching the rest, and put that check in the runbook |
| An inherited delivery counts as the unit's own | Branches cut from a base that already has a merged delivery marker are counted as delivered in the queue's first round | Cut every branch BEFORE merging any delivery, or set a `CLAUDE_CLOUD_DELIVERY_PATTERN` that matches only this fleet's own markers (`(^\|/)delivery/B[0-9]+\.sha256$`). Test the pattern with `git ls-tree -r --name-only origin/<branch> \| grep -E "<pattern>"` on a delivered branch and on an undelivered one before starting the queue |
| The machine pauses or is recycled | An idle session loses its VM; when you reopen it the conversation comes back but background processes do not (doc) | Checkpoint commits before delivering. The runbook says "if the branch already has work, continue from there" |
| 4 vCPU | CPU-heavy steps (transcription with a large model, video rendering) can run many times slower than on a recent laptop | Measure in the pilot and put the numbers in the runbook, so the session runs anything over 10 min in the background |
| The turn ends with a background process running | The session stops pushing and a CLI message takes a long time to land | The runbook says to wait in a foreground `sleep` loop, not to end the turn |
| `gh pr` does not work | The GitHub proxy rejects subcommands that use GraphQL (`gh pr`, `gh issue`); `gh api` (REST) works (doc) | The output is a push to the branch; if a PR is needed, open it locally |
| Ignored files do not travel | The session starts from a clone: no `.env`, no `.mcp.json` (if it is in `.gitignore`), no local `~/.agents/skills` (doc) | claude.ai connectors do arrive (their traffic goes through Anthropic, doc). Anything the session needs goes committed on the branch |
| Connectors do not reach a session created from the terminal | `claude --cloud` creates sessions without the claude.ai connector tools: ToolSearch does not find them, however often it retries, and a `claude -p … --cloud` does not bring them. A session that needs one cannot deliver | `wake.sh`: a message written from the web UI with the Playwright profile attaches them. `launch.sh` does it when it creates each session and `queue.sh` when one gets stuck or waits for the connector |
| A prefixed branch under a negative refspec does not update locally | If `.git/config` has a negative refspec (`^refs/heads/<prefix>/*`), a `git fetch origin +refs/heads/<prefix>/<x>:refs/remotes/origin/<prefix>/<x>` can exit with no error and bring nothing: the local machine does not see the delivery marker while the session waits | Check the remote with `git ls-remote origin refs/heads/<prefix>/<x>` and fetch that sha with `git fetch origin <sha>`; for `queue.sh` and `watch.sh`, use a new prefix that no negative refspec covers (section 4, step 7) |
| `wake.sh` cannot find the composer | The claude.ai UI changes: the message box label can differ from "Instrucciones" (the older Spanish UI; it can read "↵ to send, ⌘↵ to queue"), and a "turn on notifications" dialog can appear on top. With no matching composer the script exits with 4 | The script closes the dialog (Spanish or English button labels), tries several composer locators (`CLAUDE_CLOUD_WAKE_COMPOSER` forces one) and sends with ⌘↵ (`CLAUDE_CLOUD_WAKE_KEY`), which **queues** the message; with Enter, a session mid-turn gets interrupted. If it fails, look at the screenshot in `<state>/wake/` |
| Cloudflare stops headless | With the Playwright profile in headless mode, claude.ai stays on "Just a moment..." | `--headed --browser=chrome`, only for this profile. The window shows on screen for a few seconds |
| Two browsers on the same account | Two windows with the same profile at once collide, and two sessions of the same account can drop the login | One browser at a time: `wake.sh` takes a lock (`<profile>.lock`) and exits with 5 if it is not released |
| `SendUserFile` has a cap | An upload over the 500 MiB limit is rejected | The output goes to a service or a connector from the cloud (section 4, step 7); git chunks only with the machine owner's approval (section 7) |
| Automatic attribution | The doc says commits made in the cloud carry `Claude-Session: <url>` (turned off with `attribution.sessionUrl: false`). A prompt that forbids it has kept both it and `Co-Authored-By` out of the commits | Forbid it in the prompt and in the runbook, and check `git log` on one branch before integrating anything |
| zsh and colons | zsh reads `"$B:path"` as a modifier | Write `"${B}:path"` in `git show` and similar |
| `queue.sh` with a state dir from an earlier wave | It counts the old units in `sessions.txt` as stuck and sends them automatic messages, which wakes sessions from the earlier wave | A new `CLAUDE_CLOUD_STATE_DIR` per wave, or a `launch.sh` loop. Copy the old `sessions.txt` to an archive before launching |
| `launch.sh` in the background keeps launching | With several units and `nohup`, the "finished" notice can arrive before the last launch; relaunching the missing ones by hand then duplicates sessions | Count the URLs per unit in `sessions.txt` before relaunching anything, and never launch the same list twice in parallel |
| `timeout` does not exist on macOS | A macOS script that uses it fails | The scripts in this skill wait with `sleep` loops |

## 7. Large-file output (only with the machine owner's approval)

- **By default nothing is split.** The result goes out through a connector or a service from the cloud
  (section 4, step 7) and the file stays in the container. Splitting it and reassembling it locally fills
  the local disk. A session without its connector waits and gets woken (section 5). Chunks only happen if
  the machine's owner approves them for that unit, and then the coordinator asks the session by message.
- GitHub rejects files over 100 MB: **90 MB chunks** with `split -b 90m -d <file> <file>.part-` and a
  `<file>.sha256` next to them. One commit and one push per chunk; if one fails, write it down and go on
  with the rest.
- Reduce the size before splitting if you can (the delivery version, not the working one).
- Reassemble locally, with the same approval: `scripts/assemble.sh <unit> <destination>` (or by hand,
  `cat <file>.part-* > <file> && shasum -a 256 <file>` against the hash in `.sha256`). Assemble each file
  only when you are about to use it, and delete it afterwards.

## 8. Scripts

They are bash, with no `timeout`, configured through environment variables (prefix `CLAUDE_CLOUD_`). The
defaults are neutral and documented in each script's header; change them by variable, not by editing the
script. The others load `defaults.sh`, which maps the deprecated names, computes the worktree and return
ref of the repo you are in, checks the Playwright profile and resolves the state file names.

| Script | What it does | Main variables |
|---|---|---|
| `scripts/launch.sh <unit>…` | One session per unit, from the worktree on `<prefix><unit>`; writes `unit url epoch` to `<state>/sessions.txt` (the durable record: never delete it) and wakes the session with `wake.sh` | `CLAUDE_CLOUD_STATE_DIR` (required), `CLAUDE_CLOUD_RUNBOOK` (required), `CLAUDE_CLOUD_PLAYWRIGHT_PROFILE` (required while waking), `CLAUDE_CLOUD_WORKTREE`, `CLAUDE_CLOUD_BRANCH_PREFIX` (`fleet/`), `CLAUDE_CLOUD_RETURN_REF`, `CLAUDE_CLOUD_TASK`, `CLAUDE_CLOUD_EXTRA`, `CLAUDE_CLOUD_PROMPT_FILE`, `CLAUDE_CLOUD_PERMISSION_MODE` (auto), `CLAUDE_CLOUD_WAKE` (1), `CLAUDE_CLOUD_WAKE_MESSAGE` |
| `scripts/wake.sh <session_url> [message]` | Writes to the session from the claude.ai web UI with the Playwright profile (headed), so it gets the connectors; `--check` only verifies the login | `CLAUDE_CLOUD_PLAYWRIGHT_PROFILE` (required), `CLAUDE_CLOUD_STATE_DIR` (log and screenshots; default `~/.claude-cloud/state`), `CLAUDE_CLOUD_WAKE_MESSAGE`, `CLAUDE_CLOUD_WAKE_CHALLENGE_SEC` (60), `CLAUDE_CLOUD_WAKE_COMPOSER_SEC` (30), `CLAUDE_CLOUD_WAKE_LOCK_SEC` (300), `CLAUDE_CLOUD_WAKE_COMPOSER`, `CLAUDE_CLOUD_WAKE_KEY` |
| `scripts/queue.sh <unit>…` | Keeps `CLAUDE_CLOUD_MAX_SESSIONS` running until the queue is empty; wakes each stuck session, and each session that writes "waiting for connector", from the web UI (once per reason, in `wakes.txt`); also sends a stuck session a CLI message and, with `CLAUDE_CLOUD_RELAUNCH=1`, relaunches it once. Never assembles deliveries | `CLAUDE_CLOUD_MAX_SESSIONS` (10), `CLAUDE_CLOUD_STUCK_MIN` (60), `CLAUDE_CLOUD_GRACE_MIN` (30), `CLAUDE_CLOUD_ABANDON_MIN` (240), `CLAUDE_CLOUD_DELIVERY_PATTERN`, `CLAUDE_CLOUD_POLL_SEC` (180 s), `CLAUDE_CLOUD_RELAUNCH` (0), `CLAUDE_CLOUD_STUCK_MESSAGE`, `CLAUDE_CLOUD_WAKE` (1), `CLAUDE_CLOUD_CONNECTOR_WAIT_PATTERN`, `CLAUDE_CLOUD_LOGIN_PAUSE_MIN` (30) |
| `scripts/watch.sh <already_delivered>` | Exits when the branches with a delivery go above that number | `CLAUDE_CLOUD_BRANCH_PREFIX`, `CLAUDE_CLOUD_DELIVERY_PATTERN`, `CLAUDE_CLOUD_POLL_SEC`, `CLAUDE_CLOUD_MAX_POLLS` (100) |
| `scripts/worktree.sh up\|down\|status` | Creates, refreshes and removes the launch worktree (section 4) | `CLAUDE_CLOUD_REPO_ROOT`, `CLAUDE_CLOUD_WORKTREE`, `CLAUDE_CLOUD_RETURN_REF` |
| `scripts/assemble.sh <unit> <destination>` | Reassembles the chunks from the remote branch and checks the sha256. **Only with the machine owner's explicit approval** for that unit | `CLAUDE_CLOUD_BRANCH_PREFIX`, `CLAUDE_CLOUD_REPO` |

Minimal example (a generic fleet, from the repo's checkout):

```bash
SK=~/.agents/skills/claude-cloud/scripts
printenv CLAUDE_CLOUD_PLAYWRIGHT_PROFILE                     # empty? stop and set it (Required setup)
eval "$(bash $SK/worktree.sh up | grep ^export)"            # detached worktree at the remote tip
export CLAUDE_CLOUD_STATE_DIR=$HOME/.claude-cloud/state/<fleet>   # outside the worktree; a new folder per fleet
export CLAUDE_CLOUD_RUNBOOK=<runbook path inside the branch>
bash $SK/wake.sh --check                                     # the Playwright profile is logged in (exit 0)
bash $SK/launch.sh <pilot-unit>                              # the pilot, alone
bash $SK/queue.sh <units…> &                                 # the rest, 10 at a time, in the background
bash $SK/watch.sh 0 &                                        # wakes you on the first delivery
bash $SK/worktree.sh down                                    # when the fleet closes
# assemble.sh is NOT part of the flow: only if the machine's owner approves downloading one unit (section 7)
```

Run `queue.sh` and `watch.sh` in the background (the Bash tool kills a foreground command after 10 min).
The fleet state lives in `CLAUDE_CLOUD_STATE_DIR`: keep it outside the worktree that switches branches.
State data (`sessions.txt`, `queue.log`, `wakes.txt`) is not a skill. `~/.claude-cloud/state` is only the
default for `wake.sh`.

`wake.sh` runs `playwright-cli` from `~/.claude-cloud`, so its `.playwright-cli/` snapshots land there and never
in a repository or in the skill folder. Those snapshots and the screenshots in `<state>/wake/` show your
signed-in claude.ai pages, including the names of your other sessions: keep them private, never commit them,
and delete them when the fleet closes.

## 9. Related

- `agent-orchestration`: the **local** fleet, one session per worktree on the machine, supervised with a
  mailbox. If the unit needs the local machine (a login, local files) or you need to talk with each
  worker, use that one.
