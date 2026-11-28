# The agent cache pattern

Contents: the problem, the pattern, the lookup order, per-OS support, traps, how to check it, and what
this does not protect.

There is no code sketch in this file on purpose. A correct one needs a real secret manager and a real
OS secret store to test, and this skill was written without running either. Build it from the steps below
and test it yourself with a throwaway item and a fake value.

## The problem

1Password authorizes its CLI **once per terminal session** (10 minutes after last use, 12-hour hard limit).
Every command an AI agent runs is a new process in a new session. A CLI that runs `op read` on each call
therefore prompts on each call, and a fleet of parallel workers raises a pile of prompts at once.

## The pattern

1. The reference to the secret lives in a config file or variable (`op://<vault>/<item>/<field>`). It is not
   a secret.
2. One command (call it `refresh`) reads the value once, through the manager. The person approves one
   prompt.
3. `refresh` **validates the value** against the real service before it stores anything. A typo or a revoked
   key then fails loudly at refresh time and never becomes a cached bad value.
4. `refresh` writes a copy into the operating system's secret store, under an item name your tool owns.
5. Later commands read the copy from the store. No prompt, no call to the manager.
6. The manager stays the original. The store is a cache of it.
7. To rotate, edit the item in the manager and run `refresh` again on each machine that cached the old value.

Build this into the CLI itself rather than scripting it by hand around the tool.

## Lookup order

Pick one order, write it down and print it from a status command. The order that worked:

| # | Source | Set by | Notes |
|---|---|---|---|
| 1 | Environment variable | CI, or a shell that exports it | Wins over everything else |
| 2 | OS secure store | `refresh` or a login command | One per OS user, shared by every checkout. Read without a prompt |
| 3 | `op://` reference | A config file on a developer machine | The tool runs `op read` itself, once per process, and the manager asks for approval each time |
| 4 | Old plain config file | Older versions | Legacy. Warn when it is the source |

Give the status command two jobs: say which source answered, and never print any part of the value. Give
the CLI a `whoami`-style command that prints the token's **name** (what the provider's token list shows),
never its value. That one is safe to paste in a log or a ticket.

## Where a store exists

| System | Store | Note |
|---|---|---|
| macOS | Keychain, through the `security` tool | `security` receives the value as an argument, so it is visible to `ps` for a few milliseconds to the same user |
| Linux desktop | Secret Service (GNOME Keyring, KWallet), through `secret-tool` | Needs the `libsecret-tools` package and a running secret service. `secret-tool` reads the value from stdin, so it never shows in a process list. Covered by tests with a fake `secret-tool`, not run against a real keyring |
| Windows | none | Say so before bothering the manager |
| Linux server, headless | none | One prompt per command, or use a 1Password service account (an admin creates it) |
| CI | none needed | The workflow sets the environment variable from the CI secret store |

When there is no store, the refresh command should say so plainly and stop. It should not fall back to a
plain file without being asked.

## The leftover-variable trap

An environment variable wins over the store. If a project still has an old line such as
`MYTOOL_API_TOKEN=...` in `.env`, that line keeps being used and goes stale at the next rotation. After
the revoke, every command fails with a 401 even though `refresh` printed success.

- Delete any such line when you adopt the cache.
- Have `refresh`, `login` and `status` warn when they see one.
- Do not name the reference variable after the value variable. A tool that loads `.env` as plain text will
  send the literal text `op://...` as the secret.

## The 401 after a rotation

Someone rotated the token in the manager and this machine still holds the old copy. Make the error message
say so: when the source was the store, tell the user the stored copy may be stale and name the refresh
command. Parallel workers on that machine then all fail together, with a message that tells them what to run.

## Check it on your machine

- Fill the cache, then set the `op://` reference to a deliberately broken value.
- Run the identity command several times, one after another and then in parallel. Every run should succeed
  with no prompt, which shows that none of them touched 1Password.
- Restore the reference.

A 1Password Environment mounted as `.env` is not a safe substitute for the cache: a runtime can ignore the
named pipe, or get empty variables on some parallel reads with no error (`1password-setup.md`, section 6).
A silent empty read is worse than a prompt.

## What the cache does not protect

- It is a second copy of the value on the machine. Use it for non-production, narrowly scoped tokens only.
- On macOS, a Keychain item made by `security` with no trusted-application list can be read by
  `/usr/bin/security` without a prompt. The CLI relies on that, so limiting the item to one binary would
  not help.
- A session that can run the CLI can use the token. A determined one can find a way to print it. Deny rules
  on `op read` and on the store readers are a speed bump (see `principles.md`).

## Checklist for adopting it

- [ ] The reference variable has its own name, distinct from the value variable.
- [ ] `refresh` validates before it stores, and says when no store exists.
- [ ] The status command names the source and prints no part of the value.
- [ ] An identity command prints the token name.
- [ ] Leftover plain variables and legacy files produce a warning.
- [ ] The 401 message names the refresh command.
- [ ] The token is non-production and scoped to the least that works.
