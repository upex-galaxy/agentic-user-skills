# Worked example: a CLI that resolves a token through 1Password and caches it

**This is one example, not the only shape.** Every name below is invented. Replace `mytool`,
`MYTOOL_API_TOKEN`, the vault and the item with yours.

Contents: the situation, the setup, how the CLI finds the token, rotating, the AI's part, and
troubleshooting.

## The situation

A command-line tool, `mytool`, calls a provider's API with a personal token. Each developer creates their
own token, so the item lives in their own `Employee` vault and everyone writes the same reference. Agents
run `mytool` all day, often in parallel.

The token is created at the provider with the narrowest scope that works (select the resources it needs
instead of all content, and leave unrelated permissions off). The person pastes it straight into a
1Password item of type "API Credential" titled `MyToolToken` (one word, so the reference has no
quotes). Nothing else holds it in plain text.

## Setup

1. Install the 1Password CLI and turn on Settings, Developer, "Integrate with 1Password CLI".
2. Put the reference in `.env`. None of these lines is a secret:

   ```bash
   MYTOOL_API_TOKEN_OP_REF=op://<vault>/MyToolToken/credential
   OP_ACCOUNT=<your-team>.1password.com
   MYTOOL_RESOURCE_ID=<resource id>
   ```

   `OP_ACCOUNT` matters when the app holds more than one account, because `op` reads that variable from its
   own environment. Putting it in `.env` works here only if `mytool` loads `.env` into its own environment
   before it runs `op` (a runtime that autoloads `.env` does this). If yours does not, export it in the shell
   or pass `--account`.
3. Cache it once: `mytool auth refresh`. 1Password asks for approval once. The command validates the token
   against the provider before it stores anything.
4. Check it: `mytool auth status` names where the token comes from and prints no part of it.
   `mytool auth whoami` proves it works and prints the token's **name**, never its value.
5. **Delete any `MYTOOL_API_TOKEN=` line from `.env`.** The environment wins over the store, so that line
   keeps being used and fails with a 401 after the next rotation.

Do not name the reference `MYTOOL_API_TOKEN`: a tool that loads `.env` as plain text would send the
literal text `op://...` as the token.

## How the CLI finds the token

First hit wins.

| # | Source | Set by |
|---|---|---|
| 1 | `MYTOOL_API_TOKEN` environment variable | CI, from the repository secret |
| 2 | OS secure store, item `mytool-cli` | `mytool auth refresh` or `mytool auth login` |
| 3 | `MYTOOL_API_TOKEN_OP_REF` | `.env`; the CLI runs `op read` itself, once per process |
| 4 | `~/.mytool/config.json`, key `api_token` | Older versions, legacy, `auth status` warns |

Choose by machine:

| Machine | 1Password | Do this |
|---|---|---|
| macOS, or Linux desktop with `secret-tool` | yes | Reference in `.env`, run `mytool auth refresh` |
| macOS, or Linux desktop with `secret-tool` | no | Create the token at the provider, then pipe it in: `pbpaste \| mytool auth login --stdin` (Linux: `xclip -o -selection clipboard` or `wl-paste`). The token travels on stdin, so it stays out of shell history and the process list |
| Linux server without a secret service, or Windows | yes | Reference in `.env`. No store exists, so 1Password asks on every command. A service account avoids that |
| CI | n/a | The workflow sets `MYTOOL_API_TOKEN` from the repository secret |

Why the store exists, and how to check it: `agent-cache-pattern.md`.

## Rotating

1. Create the new token at the provider and edit the existing 1Password item.
2. Run `mytool auth refresh` on every machine that cached the old token. Until it does, that machine gets
   a 401 whose message says the stored copy may be stale and names this command.
3. Update the CI repository secret.
4. Only then revoke the old token at the provider and run `mytool auth whoami` again.

## What the AI does here

It runs `mytool auth status` and `mytool auth whoami`, because neither prints a secret. It does not run
`op read` or a store reader, and it does not open `.env`. A session that can run `mytool` can use the
token, so the token is scoped to a few resources and everything held locally is non-production.

## Troubleshooting

| What you see | Why | Fix |
|---|---|---|
| "No token" | No source has a value | `mytool auth refresh`, or pipe a token into `auth login --stdin`, or set `MYTOOL_API_TOKEN` |
| "No secure store on this system" | Windows, or Linux without `secret-tool` | Install `libsecret-tools` and a secret service, or use the environment variable, or accept one prompt per command |
| "Could not read the token from 1Password" | The message ends with `op`'s own reason: not signed in, item or vault not found, or `op` not installed | Run `op vault list` yourself, check the app integration and `OP_ACCOUNT` |
| 401 | Token revoked or expired, a stale cached copy, or a leftover environment variable | Rotate, or run `mytool auth refresh`, or delete the leftover `MYTOOL_API_TOKEN` line |
| 403 | The token is scoped and the target is outside its scope | Use a target the token covers, or create a token with the scope you need |
