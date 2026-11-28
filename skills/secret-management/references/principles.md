# Principles and threat model

Contents: where secrets leak, the practices that follow, what an AI session can and cannot do, and the limits
you should state honestly.

## Where secrets leak

| Place | Why it is a problem |
|---|---|
| Chat messages | A pasted key stays in the history, shows up in search and reaches everyone who can read the channel. Nobody can take it back. |
| Plain files | git ignores a `.env`, but any process you run can read it: a script, a plugin, an AI assistant. Any of them can print it into a log. |
| Copies between machines | Each copy is a place to leak from and goes stale at the next rotation. Nobody knows who holds which version. |
| Command arguments | They land in shell history and can be visible to other processes. The 1Password CLI documentation warns about this for item creation. |
| A running process | Environment variables are visible to other processes the same user runs, and any program that receives a value can print it. |
| Logs and transcripts | Anything printed in a terminal an AI reads, or in a CI log, is kept. Masking hides values only where the tool applies it. |
| An AI's context | A value an assistant reads enters its context and its transcript. Assume it is stored wherever the session is stored. |
| Git history | Deleting a file in a later commit does not remove it from earlier ones. Treat a committed secret as leaked. |

The last two rows are reasoning from how these tools work, not a quoted source.

## Practices that follow

1. **One source of truth.** Keep each secret in one item in a secret manager. Everything else holds a
   reference (a line of text that is safe to commit) or a cache you can name.
2. **Names in the repo, values elsewhere.** Commit `.env.example` (names only) and a reference file such as
   `.env.op`. Gitignore the real `.env`.
3. **Least privilege.** A token reaches the few resources it needs, and is read-only when reading is enough.
   A smaller token is a smaller loss if it leaks.
4. **One token per person or service.** Shared personal tokens make rotation a group message and revocation
   impossible to attribute.
5. **Separate by environment.** A vault per project and stage, such as `<project>-dev`. Keep production in a
   vault developers and local tools cannot open.
6. **Never type a value into a command.** Create items in the manager's app so the value never enters shell
   history.
7. **Rotate in one place, then revoke.** Edit the existing item (do not create a second one), refresh any
   cache, update CI, and then revoke the old key at the provider. Editing the item only changes what
   readers get. The old key stays valid until the provider kills it.
8. **Expect exposure and plan for it.** When a value is exposed, rotate it. Do not spend the effort on
   hiding the exposure.
9. **Find what you already have.** Search repos and machines for plaintext secrets on a schedule, and move
   them yourself, not through an AI (see `audit-and-migration.md`).

## What an AI session can and cannot do

It can run a CLI, write a reference file and use a token by running your tools. It cannot sign you in,
approve a prompt, create or share a vault, or paste a value for you, and it should not try.

The honest limit: **an AI that can run a CLI can use the token that CLI resolves**, and a determined one
can find a way to print it. Two controls do real work:

- The value is non-production and narrowly scoped, so the worst case is small.
- Production secrets are not on the machine, or not in any vault the local tools can open.

Deny rules in a tool's settings, such as blocking `op read` or `security find-generic-password`, are a
speed bump. They match only the literal start of a command. A full path, `env op read`, `security -q ...` or
a script that shells out to either tool gets around them. Use them to catch mistakes, never as the
reason a secret is safe. A stronger step, if one is ever needed, is a pre-execution hook that blocks any
command containing the tool names or the cache item name. That is a design suggestion, not something this
skill provides.

## Masking is not protection

`op run` hides values in its own output, which helps with accidental prints. It does not stop a program
from sending a value somewhere, writing it to a file, or encoding it in a way the mask does not match.

## What this skill does not solve

- A value in a running process is exposed to that process and to other processes of the same user.
- Anything held locally is only as safe as the machine.
- The manager protects the stored value. It does not protect what you do with it after you read it.
- A leaked key stays valid until you revoke it at the provider.

## Tool-agnostic checklist

- [ ] Every secret has exactly one home, in a manager.
- [ ] The repo holds names and references, never values.
- [ ] Each token has the narrowest scope that works and an owner.
- [ ] Development and production secrets are in different vaults.
- [ ] Rotation steps are written down and end with revoking the old key.
- [ ] CI reads secrets from the manager or from the CI system's own secret store, never from a file.
- [ ] A person, not an AI, imported any existing `.env` files.
