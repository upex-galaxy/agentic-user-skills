# Runbook: <what one unit does>, end to end in the cloud

<!-- claude-cloud template. Copy this file to each unit's branch (or to the base branch before you cut the
branches), replace everything between <>, delete this comment, and test it with ONE pilot before you launch
the rest. -->

A Claude Code cloud session reads this runbook (environment `<environment name>`, Ubuntu, ~4 vCPU, 16 GB).
The coordinating session is `<coordinating session name>`. **Nobody will answer questions.** If something
blocks you, write it in the log, commit what you have, push, and stop.

## What you get

You are on branch `<prefix><unit>`. If you started on a `claude/*` branch, switch to yours before you touch
anything (`git switch <prefix><unit>`). Both point at the same commit. The branch contains:

- `<input 1>`: <what it is>. <What NOT to do with it, for example "do not regenerate it">.
- `<input 2>`: <what it is>.

**If the branch already has work from an earlier session** (commits after the inputs), continue from
there. Read its log and resume at the first step it did not finish. If another session pushed while you
were working, do not overwrite its files. Put yours in `<folder>/session-2/` and say so in the log.

## What you produce

<The result, its format and the expected quality. If there is an approved reference, its path.>

## Steps

Time every step. At the start, run `date -u +%FT%TZ > /tmp/t0`, and write in `<folder>/cloud-log.md` the
start and end time of each step (UTC), plus any problem with the literal error.

0. **Install.** <Whatever the setup script does not leave ready: `bun install`, or `npm ci` if bun fails
   behind the proxy.> Check the versions of <tools>. Write down the times.
1. **<Step 1>.** <Exact command.> Measured in the pilot: <duration>. If it takes more than 10 min, run it
   in the background (`nohup`, or `run_in_background`) and wait for it with a foreground `sleep` loop.
   If you end your turn while it runs, the session stops pushing.
2. **<Step 2>.** <...>
3. **Checkpoint commit.** Commit and push what you have so far (`<files>`). The machine can pause or be
   recycled, and when it comes back it does not recover background processes. This commit is where
   another session resumes, and the push is the sign of life the queue watches.
4. **<Heavy step>.** <Command, in the background.> Measured in the pilot: <duration>.
5. **Check the result's content, not only that it exists.** <How to verify the content: samples at
   several points, a test run, a diff against the reference.> Fix and repeat, two rounds at most.
6. **Output.** <Where the result goes: a file on the branch, a report, an external service through a
   claude.ai connector or with an environment variable.>

   **If the output needs a claude.ai connector and it does not appear** (look for it by name with
   ToolSearch), **do not split the result into chunks**:
   a. Write `<time> · waiting for connector` in the log (that exact phrase: the queue looks for it to wake
      you from the web UI), then commit and push the log.
   b. Leave the result in the container. Do not delete it or generate it again.
   c. Retry ToolSearch every 2 min (`sleep 120` in the foreground between attempts) for up to 60 min.
      Meanwhile the coordinator writes to you from the web UI, and that message is what attaches the
      connector. When it appears, write `<time> · connector appeared: <names>`, push the log and go on.
   d. If it is still missing after 60 min, write `<time> · connector missing after 60 min, result in the
      container`, push the log and end your turn. The coordinator will wake you and you resume here.

   **Git output in chunks: only if the coordinator asks for it** in a message that says the machine's
   owner approved it for your unit. GitHub rejects files over 100 MB:
   a. Reduce the size if you can (<the delivery version>).
   b. Run `split -b 90m -d <file> <folder>/delivery/<name>.part-` and
      `sha256sum <file> > <folder>/delivery/<name>.sha256`. Check that
      `cat <folder>/delivery/<name>.part-* | sha256sum` gives the same hash.
7. **Delivery marker.** Write `<folder>/delivery.json` with what you delivered (`{"unit","output","duration_min"}`
   plus whatever your coordinator needs). It is the proof the queue looks for (`CLAUDE_CLOUD_DELIVERY_PATTERN`,
   default `(^|/)(delivery|entrega)\.json$`). If your fleet uses another marker, the fleet's runbook names
   it here.
8. **Commit and push to your branch** (never to the base branch): <file list>, the log, `delivery.json`,
   and `delivery/` only if the coordinator asked for chunks. Add files that `.gitignore` excludes with
   `git add -f`. One commit and one push per chunk; if one fails, write it down and go on with the rest.
   Run `git push origin HEAD`. Write the message in English, in the present tense, and end it **exactly**
   with the trailers the repo asks for (no `Co-Authored-By`, no `Claude-Session`, no mention of Claude or AI):

   ```
   Worktree: cloud
   Session: <coordinating session name> · <your session id>
   ```

   Your session id: `echo "${CLAUDE_CODE_REMOTE_SESSION_ID/#cse_/session_}"`.

## Rules

- Do not touch any file outside `<folder>/`.
- Do not open a PR (`gh pr` does not work in the cloud).
- If a step fails the same way twice, write it in the log with the literal error, commit what you have,
  push, and stop.
- <Rules of the job itself: language, copy, what must not be said.>

## Final report

Your last message is a table of times per step (start, end, duration), plus the size of the result, where
it ended up (path, id, or "waiting for connector" and since when; or how many chunks, if you were asked for
them), when the connector appeared and under what name if one was needed, what you checked in the content
and how, and the problems you hit.
