# 1Password setup for a project that has nothing yet

Contents: accounts, install and app integration, two accounts, vaults and sharing, items and references,
loading methods, rotation, and a table of when to use each method.

Source: the official documentation at `https://www.1password.dev/` and hands-on use on macOS.
Anything the documentation does not state is marked "check the official docs". Each step says who does it:
**Person** or **AI**. An AI never signs in, approves a prompt or pastes a value.

## 1. Account (Person)

Use the invitation and the sign-in address an admin gave you, written here as `<your-team>.1password.com`.
The Secret Key and the password are yours. Do not paste them anywhere else.

The desktop app can hold several accounts, for example work and personal. Keep their vaults apart, and read
section 3 so `op` does not pick the wrong one.

## 2. Install the CLI and turn on the app integration

AI can run the install after the person says yes. Person turns on the integration.

| OS | Install | App integration |
|---|---|---|
| macOS | `brew install 1password-cli` | Settings, Developer, "Integrate with 1Password CLI". Touch ID is optional. |
| Windows | `winget install 1password-cli` in PowerShell | Turn on Windows Hello in the app first, then the same toggle. WSL is not supported: install on Windows and call `op.exe`. |
| Linux | Add 1Password's apt repository first (exact block on the official install page), then `sudo apt install 1password-cli` | Settings, Security, "Unlock using system authentication", then the toggle. Needs PolKit and a running PolKit authentication agent. Keep 1Password in the system tray. |

The integration lets `op` sign in through the app, so you approve with Touch ID (or the system equivalent)
and never type a password in the terminal.

Check it (AI runs these, Person approves the prompt, none of them prints a secret):

```bash
op --version
op account list
op whoami
op vault list
```

If the terminal asks for a Secret Key, an email or a password, the integration is off. Go back and turn
it on.

**Approvals are per terminal session.** After you approve, `op` keeps working for 10 minutes after its last
use, with a 12-hour hard limit. A new terminal window or tab asks again. There is no documented switch to
turn that off for interactive use. An AI agent starts every command in a fresh process, so each command
can raise its own prompt. `agent-cache-pattern.md` shows how to avoid that for non-production tokens.

## 3. Two accounts: set `OP_ACCOUNT`

```bash
export OP_ACCOUNT=<your-team>.1password.com
# or, per command
op vault list --account <your-team>.1password.com
```

`op account list` shows the addresses. Without `OP_ACCOUNT` or `--account`, `op` uses the account you signed
in to most recently. That can be the wrong one, and every account has its own
`Employee`-style vault, so the wrong account fails with a confusing "not found". The address is not a
secret. Set it where `op` itself runs: export `OP_ACCOUNT` in the shell or the project's start script, or
pass `--account`. A line inside the file you give to `op run --env-file` goes to the command that `op run`
starts, and the sources do not say that `op` uses it to pick its own account, so do not rely on that.

## 4. Vaults and sharing

A vault is a container of items with its own list of people who can open it. Each team member also has a
built-in `Employee` vault that only they use.

**Put shared secrets in a custom vault.** `op://Employee/...` resolves to each reader's own vault, which is
right for a per-person token and wrong for a team key. Service accounts cannot read the Personal, Private
or Employee vaults or the default Shared vault, so a custom vault also serves CI.

Create one vault per project and stage (Person, on 1Password.com):

1. Select Vaults, New Vault, choose Custom, name it (for example `myapp-dev`), select Create Vault.
2. Open the vault, select People or Groups, then Manage, type a team member or group, pick it, select Save.
   Use the ellipsis next to a person or group to change their permissions. Invited people must accept and
   be confirmed first.

By default every team member can create vaults. Admins can change that, so ask an admin if the button is
missing.

Permission levels depend on the plan:

| Plan | Permissions |
|---|---|
| Teams | Allow Viewing (view items and passwords, copy details). Allow Editing (create, edit, move, copy, print, archive, delete items). Allow Managing (grant and revoke access, change permissions, delete the vault) does not include viewing or editing. |
| Business | Granular: View Items, Create Items, Edit Items, Archive Items, Delete Items, plus client settings such as View and Copy Passwords, Import Items, Export Items. Manage Vault does not include viewing or editing. Custom groups exist only here. When a person has access individually and through a group, the most permissive applies. |

Developers who only run the project need to view items, so give them viewing and nothing more.

**Check the official docs, or ask an admin, before you promise any of these:**

- Whether a Teams account can share a vault with the built-in Team Members group.
- How vault sharing works on Individual and Families plans.
- Whether an administrator can see items in a member's Employee or Private vault.
- Whether a teammate resolves `op://<vault>/...` for a shared vault the same way you do. It follows from the
  reference syntax, but the documentation does not spell it out. Confirm it once with a new teammate.

Keep `-prod` in a separate vault that developers and local tools cannot open. That is a recommendation,
not a documented requirement.

## 5. Items and references

Create one item per secret **in the app** (Person), and paste the value there, once. Name items without
spaces (`postgres`, `mailer`) so the reference needs no quotes. Never create an item with a value in a
command: command arguments land in shell history and can be visible to other processes, per the CLI
documentation.

A secret reference points at one field:

```text
op://<vault>/<item>/[<section>/]<field>
```

**A reference is not a secret**, so it can live in a committed file. Example reference file, `.env.op`:

```bash
# .env.op (committed: references only, never values)
DB_PASSWORD=op://myapp-dev/postgres/password
MAILER_API_KEY=op://myapp-dev/mailer/api-key
LOG_LEVEL=Information
```

With two accounts, start the project as `OP_ACCOUNT=<your-team>.1password.com op run --env-file=.env.op -- <command>`
or export the variable first (section 3). Lines without an `op://` reference, such as `LOG_LEVEL`, load as plain settings. Keep `.env` in
`.gitignore` and keep a `.env.example` with names only.

**Do not put a reference under a variable name your tool reads as the value.** A tool that loads `.env` as
plain text will send the literal text `op://...` as the secret. Use a separate name such as
`MYTOOL_API_TOKEN_OP_REF`, and have the tool resolve it.

## 6. Loading methods

| Method | Use it when | Watch out |
|---|---|---|
| `op run --env-file=.env.op -- <command>` | The app reads environment variables. Start here. | Values exist only in that process and printed output is masked (`<concealed by 1Password>`, `--no-masking` turns it off). Each new terminal session asks for approval. |
| `op inject --in-file x.tpl --out-file x` | A tool needs a config file with values in it. | It writes a plaintext file. Gitignore it and delete it when done. |
| 1Password Environment | You want the values stored as a set, not as vault items. | `op run --environment <environment-id> -- <command>` works. Mounting it as `.env` does not work with every tool (below). Connect does not support Environments. |
| Secure-store cache | An AI agent or a parallel worker runs your CLI all day. | One approval, then no prompts. You hold a second copy of the value on the machine. See `agent-cache-pattern.md`. |

`op run` details:

- Precedence, highest first: 1Password Environments, env files, shell variables.
- A shell that expands `$VAR` on the same line as `op run` expands it first, before 1Password loads
  anything. Expand inside a subshell: `op run --env-file=.env.op -- sh -c 'your-command "$VAR"'`.
- `op read <reference>` prints one value. Do not use it from an AI session.

Environments:

- An Environment is a container of key-value secrets for one project or stage, separate from vaults. It
  stores its own values and does not reference vault items. It is created in the desktop app (Developer,
  View Environments), is not available in the mobile apps, and an Owner or Administrator turns the policy
  on. Access is granted per Environment: allow viewing, allow editing, allow managing.
- `op run --environment <environment-id>` needs CLI 2.41.0 or later. Service accounts can read Environments,
  read-only.
- `op environment read` and the SDK `get_variables()` were deprecated on 2026-11-17 and are removed on
  2027-01-20. Use `op environment secret list` (CLI 2.42.0 or later) and the SDK `list_secrets()`.
- A local `.env` destination mounts an Environment as a UNIX named pipe that is never stored on disk. Reading
  it triggers an authorization prompt, and once approved every process can read it until 1Password locks.
  Mac and Linux only, up to 25 per device, not designed for concurrent access.
- Not every tool reads the pipe reliably. With Bun, automatic `.env` loading can ignore it (nothing loaded,
  no prompt), and `bun --env-file=<path>` reads it, but some parallel reads can get no variables, with no
  error. Your tool may behave differently, so test parallel reads before relying on it.

## 7. Rotate

1. Person generates the new key at the provider.
2. Person edits the field in the existing item. Do not create a second item. Every reader gets the new
   value the next time they resolve the reference.
3. Refresh every cache of the old value (`agent-cache-pattern.md`), update the CI secret if it holds one,
   and restart running processes.
4. Only then does the person revoke the old key at the provider.
5. When someone leaves, an admin removes their access. Recommended: rotate the secrets they could read,
   because they may hold copies.

## 8. Find plaintext you already have (Person)

Watchtower can find plaintext `.env` files in common folders, import them into an Environment and remove
the original from disk. It never collects or reveals values. Do this yourself in the app, not through an
AI. More in `audit-and-migration.md`.

## 9. Personal projects

The same steps work for a personal account. Use one vault per project and stage, set `OP_ACCOUNT` to the
personal address for those projects (in the shell or the start script, section 3) so `op` never reads the
work account, and keep work secrets in work
vaults only. The built-in Private vault works for you alone (`op://Private/<item>/<field>`). A service
account cannot read it, so give CI a custom vault. Whether a given feature exists on a personal plan:
check the official docs.
