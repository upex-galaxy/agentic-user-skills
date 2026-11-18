# Roster: <slug>

> Copy to `<scope path>/roster.md`. Owner: the conductor, sole writer. Update a row the moment a
> value is issued. This table resolves "the one on BK-123" into something addressable and recovers a
> session after a crash: no dispatch id, no address; no terminal handle, no steering; no name or
> resume command, no resume. In a same-checkout fleet it is the recovery record.

| Label | Key | Name | Task | Dispatch | Terminal | Worktree | Agent | Model | Mode | Launch id | Resume | Cost | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| W1 | <KEY> | `<label>--term_…` | `task_…` | `dispatch_…` | `term_…` | primary | claude | <full model id> | bypass | - | `<harness resume command>` | <out tok / ctx at close> | in-flight |
| W2 | <KEY> | `<label>--term_…` | `task_…` | - | `term_…` | <wt name> | claude | <full model id> | bypass | `<jitso launch id>` | `<harness resume command>` | - | waiting on claim |
| W3 | <KEY> | `<label>--term_…` (roster only: a harness whose `/rename` takes no argument) | `task_…` | `dispatch_…` | `term_…` | <wt name> | opencode | <provider/model> | bypass | - | `<harness resume command>` | <out tok / ctx> | done, released |

`Name` is the worker's one name, `<label>--<handle>`. `<label>` is `[<KEY>-]<slug>`, the token the
worker's prompt opens with; `<handle>` is the `Terminal` column, read back from the worker listing
after a native launch (gotcha G78). It is the session name and the tab title. Where the harness
cannot be renamed, mark it `(roster only)`. `Label` is the owner's short alias. `Mode` is the permission mode verified on
the worker's screen or argv at readiness, against the profile's `orchestration.permission_modes.worker`.
`Launch id` is filled only in jitso mode.

Fill `Cost` from the worker's status footer, read off the screen before you release it: no command
reports it and the number dies with the terminal (gotcha G54).

Status vocabulary, and nothing outside it: `queued` · `provisioning` · `launched` · `in-flight` ·
`waiting on claim` · `waiting on answer` · `blocked` · `done` · `done, released` · `kept-open` ·
`abandoned`.

## Notes per worker

- **W1**: <anything the table cannot hold: the alternative it took after a denied claim, the scope
  correction the conductor approved, the reason it is `kept-open` instead of released>

## Handle hygiene

If the runtime restarts, every terminal handle in this table goes stale while every session stays
alive (gotcha G22), and every tab title still carries the old handle. Re-discover with
`orca terminal list --worktree <selector> --json </dev/null`, match each terminal on its label (the
part of the title before the last `--term_`), rewrite the `Terminal` column, and re-issue each tab
rename with the new handle before steering anyone. Then rename each resumed session with the harness
rename verb (`references/session-identity.md`), rewrite the `Name` column, and keep the old name in
`## Notes per worker`: earlier reports and commits carry it.
