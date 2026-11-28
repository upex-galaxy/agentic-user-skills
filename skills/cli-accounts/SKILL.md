---
name: cli-accounts
description: Personal and work accounts for command-line tools on this machine, selected by folder with direnv. Use when a CLI needs a second account or a first work login, when a new repo, clone or worktree folder must resolve to the work account, when a command ran as the wrong account, or when asked to review which account a folder uses. Spanish triggers include "cuenta de trabajo", "cuenta personal", "está usando la otra cuenta", "iniciar sesión en el CLI", "revisa mis autenticaciones". For secret values (tokens, API keys, rotation, .env files) use secret-management.
license: MIT
metadata:
  author: UPEX Galaxy
---

# cli-accounts

**The folder picks the account.** Each CLI keeps its default config dir for the personal account.
Work folders export a variable that points the CLI at a second dir holding only the work account.
The variable lives in each process, so agents in different repos run at the same time without
switching anything.

## Setup

The paths differ per machine. Keep them in `~/.cli-accounts/config`, one `KEY=VALUE` per line. A leading `~/`
or `$HOME/` is expanded, the file is read as text and never executed, and an environment variable of the same
name wins over the file.

| Key | Placeholder below | Default |
|---|---|---|
| `CLI_ACCOUNTS_WORK_DIR` | `<work-dir>`, the folder that holds the work repos and the profile | `~/Desktop/projects/work` |
| `ORCA_ROOT` | `<orca-root>`, where Orca puts worktrees | `~/orca/workspaces` |
| `CLI_ACCOUNTS_GITCONFIG` | `<work-gitconfig>` | `~/.gitconfig-work` |
| `CLI_ACCOUNTS_CLAUDE_DIR` | `<work-claude-dir>`, a second Claude Code config dir | `~/.claude-work` |

```bash
# ~/.cli-accounts/config
CLI_ACCOUNTS_WORK_DIR=~/Desktop/projects/work
```

**Run `bash <this skill's folder>/scripts/audit.sh --config` first** and put the values it prints where this
file shows a placeholder.

First run on a machine with no profile: install `direnv` and its shell hook, create `<work-dir>/.envrc` with
mode `600`, then follow "Add a CLI" for each tool and run `direnv allow` on the folder.

## Layout

| Piece | Role |
|---|---|
| `<work-dir>/.envrc` | The work profile and single source. Read it to see which CLIs are covered. |
| `<orca-root>/<repo>/.envrc` | One per work repo, because worktrees sit outside the work folder. |
| `~/.gitconfig` `includeIf` to `<work-gitconfig>` | Commit identity, signing key and `git push` account. |

Each Orca file holds this line, with the real work folder written out:

```bash
source_env "<work-dir>/.envrc"
```

## Review

Run `bash <this skill's folder>/scripts/audit.sh`. It checks that every work repo, worktree and
Orca folder resolves the same variables as the profile, and that `$HOME` resolves none. Then ask
each CLI who it is, from one work folder and one personal folder:
`direnv exec <folder> gh api user -q .login`, `direnv exec <folder> slack auth list`.

Done when the audit exits 0 and every CLI names the expected account in both folders.

## Add a CLI

1. Find the variable that moves its config or credential dir: `--help`, then the official docs, then
   its source. Prove it with an empty dir: the CLI reports no session and writes its files there.
   With no such variable, tell the owner what the CLI offers instead (a per-command flag, a token
   variable) before building anything.
2. Find where the token is stored. A keychain entry keyed by account name is shared by every config
   dir, so a logout in one dir can delete the other's token.
3. Create the work dir with mode `700` and add the `export` to the work profile, with a comment
   saying why.
4. Move the existing work session into it, or have the owner log in from a work folder. Ask before
   moving or logging out. Move the credential file only: a copy leaves two holders of one rotating
   refresh token. Keep one account per dir, so the CLI never has to ask which one.
5. Run the review.

## Add a work repo

A repo inside the work folder is already covered. Create `<orca-root>/<repo>/.envrc` with the
line above, run `direnv allow` on that folder, then run the review. A work repo cloned anywhere else
gets neither the profile nor the git identity, so move it inside.

## Traps

- A process keeps the variables it started with. An agent launched in a personal folder that `cd`s
  into a work repo stays personal. Launch it in the right folder, or run
  `direnv exec <folder> <command>`. Restart open sessions after changing the profile.
- Non-interactive shells, cron jobs and GUI apps skip the direnv hook. Use `direnv exec` there.
- A `.envrc` inside a repo or worktree replaces the profile unless it calls `source_up`.
- An edited `.envrc` stays blocked until `direnv allow`.
- The default `gh` dir also lists the work account, so `gh auth switch` there changes which account
  personal folders use.
- Slack: `SLACK_CONFIG_DIR` is missing from `--help` and beats `--config-dir`. `slack api` ignores
  the login and needs a token.
- With a second Claude Code config dir, link a new user skill from `~/.agents/skills/` into both
  `~/.claude/skills/` and `<work-claude-dir>/skills/`.
- Inspect credential files by key names only (`jq 'map_values(keys)'`), so no token reaches the chat.

## With nobody at the keyboard

Run the review and report each failure with its fix. Logins, logouts and moved credentials wait for
the owner.
