---
name: secret-management
description: Keep secrets out of chat, files and AI context. Use when a token, API key or password is pasted in chat, a .env holds real values, a project needs its secrets set up, teammates need the same variables, a key must be rotated, CI needs secrets, or someone asks how to stop an AI from reading secrets. Spanish triggers include "variables de entorno" with secrets, "gestionar secretos", "no pegues el token", "rotar la clave". 1Password is the worked tool, the principles fit any secret manager. Skip Docker, Python venv and other environment talk that involves no secret.
license: MIT
metadata:
  author: UPEX Galaxy
---

# secret-management

Secrets leak through copies. A value pasted in chat, written to a plain `.env` or copied to a second
machine is one more place it can escape from, and one more copy that goes stale at the next rotation.
The fix is one idea: the value lives in one place, and everything else holds a reference to it.

This skill has two jobs. It sets the rules a session follows whenever a secret is near. It also holds
a setup for projects that have nothing yet, with 1Password as the worked tool. The principles do not
depend on the tool.

## Rules that always apply

1. **Never print, paste, log or echo a secret value.** Not in chat, a commit, a ticket, a test report or a
   command argument (arguments land in shell history and can be visible to other processes).
2. **Work with references and names.** Use `op://<vault>/<item>/<field>` and variable names. A reference is
   safe to commit and to show. The value is not.
3. **Do not read a file that may hold values.** Do not open a real `.env`, a keystore export or a token file
   to check it. Read `.env.example` and the names in it. Prove a secret works by the exit code or by a
   command that prints an identity (a user name, a token name), never the secret.
4. **Stop at human steps.** Signing in, approving a prompt, creating or sharing a vault, pasting a value into
   the manager, and revoking a key at the provider belong to a person. Say what to do, end the turn, wait.
5. **One source of truth.** One item per secret in a manager. Copies are caches and are named as caches.
6. **Least privilege.** Scope every token to the resources it needs, read-only when reading is enough, one
   token per person or service, never a shared personal one.
7. **Rotate in one place, then revoke.** Edit the item, refresh any cache, update CI, and only then revoke the
   old key at the provider. Rotation is not done until the old key is dead.
8. **Keep production out of an agent's reach.** An agent that can run a CLI can use the token the CLI
   resolves. Production secrets stay in a vault that people and local tools used by agents cannot open.
9. **Deny rules are best-effort, not a control.** A rule that blocks `op read` matches only the start of the
   command, and a full path, `env op read` or a script that shells out gets around it. The real limits are
   non-production data and narrow scopes.

## Which situation, which reference

| Situation | Read |
|---|---|
| A value was pasted in chat, a log, a ticket or a commit | `references/audit-and-migration.md`, section "A value is already exposed" |
| New project, nothing set up yet, wants teammates and CI to share secrets | `references/1password-setup.md`, then `references/ai-handoff.md` |
| The developer wants their AI to do the setup | `references/ai-handoff.md` (a prompt and a checklist) |
| Existing project with `.env` files and copied keys | `references/audit-and-migration.md`, and `scripts/scan-plaintext.sh` |
| Every agent command asks for approval, or a CLI is slow because it re-reads a secret | `references/agent-cache-pattern.md` |
| Secrets for GitHub Actions or another CI | `references/ci.md` |
| "Why this way?", threat model, what an AI can and cannot do | `references/principles.md` |
| A concrete example of a CLI that resolves a token | `references/worked-example.md` |
| Rotating a key | `references/1password-setup.md`, section "Rotate", and rule 7 above |

Load only the file the row names. Do not load them all.

## When a value shows up in chat

Do not repeat it, even to confirm it. Say it is now exposed, treat it as leaked and ask the owner to rotate
it at the provider. Then move the new value into the manager through the app, not through chat. The
longer wording is in `references/audit-and-migration.md`.

## Words to use at a human step

Name the action, say where, and tell them what to reply. Examples:

- "Open the 1Password app, sign in, and reply 'done'."
- "Create the item in the app and paste the value there yourself. Do not paste it here."
- "Approve the 1Password prompt that is about to appear."
- "Generate the new key at the provider, edit the existing item, then reply 'done'. I will not see the value."

The full set, with the order, is in `references/ai-handoff.md`.

## Checking a secret without seeing it

| Want to know | Safe check |
|---|---|
| The tool is signed in | `op whoami`, `op vault list` (names only) |
| A token works | a command that prints who it belongs to, or the exit code of a read-only call |
| Which variables a project needs | read `.env.example`, or list names with `scripts/scan-plaintext.sh` |
| Whether a reference resolves | run the project with `op run --env-file=<file> -- <command>` and judge by exit code |

Do not use `op read`, `op run --no-masking`, `printenv`, `env` or `cat .env` to check. Each of them can put a
value in the conversation.

## Scope notes

- 1Password facts in the references come from its official documentation (`https://www.1password.dev/`)
  and from hands-on use on macOS. Plan-specific details are marked "check the official docs".
- The same principles apply to other managers and cloud key stores. Their commands are not covered here.
- Windows and Linux steps come from the documentation and were not tested.
