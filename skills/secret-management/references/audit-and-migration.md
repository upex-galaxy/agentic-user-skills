# Audit and migration

Contents: finding plaintext secrets, what to do with each, why an AI must not import a `.env`, what to do
when a value is already exposed, and a checklist for moving an existing project.

## Finding plaintext secrets in a repo

Start with names, never values.

```bash
# Which env-style files exist, tracked or not (names only)
git ls-files | grep -E '(^|/)\.env'
find . -name '.env*' -not -path './node_modules/*' -not -path './.git/*'

# Which env-style files were ever committed, from history (file names only)
git log --all --name-only --diff-filter=A --pretty=format: -- '.env*' '*.env' | sort -u
```

Then list `file:KEY` pairs that look like secrets with the bundled script. It prints key names and never
values:

```bash
bash <skill-dir>/scripts/scan-plaintext.sh <folder>     # <skill-dir> is the folder that holds SKILL.md
```

The script reads a fixed set of config-style files (`.env*`, `*.env`, `*.properties`, `*.ini`, `*.cfg`,
`*.conf`, `*.yml`, `*.yaml`, `*.toml`, `appsettings*.json`, `secrets*.json`). It flags a key whose name
looks like a secret and has a non-empty value, and a key whose value has the shape of a known token
prefix. It skips `op://` references, `${...}` placeholders and `.example`, `.sample`, `.template` files. It
misses secrets in source code and in other file types, and it can flag a harmless value. Treat the
output as a list to review, not as proof.

## Finding plaintext on a machine

- 1Password Watchtower can find plaintext `.env` files in common folders, import them into an Environment and
  remove the original file from disk. Values are never collected or revealed. The person does this in the
  app.
- Look for files that hold tokens outside repos: old config files in the home folder, exported keys, copies
  in a notes app. List names with `find`, and let the person open them.
- Check whether a shell history file holds values without printing it: use a count such as
  `grep -c -E 'KEY|TOKEN|SECRET' <history file>` and tell the person the count. Do not print matching lines.

## What to do with each finding

| Finding | Action |
|---|---|
| A `.env` with real values, not committed | The person imports it into the manager in the app, then deletes the file. Replace it with `.env.op` (references) and `.env.example` (names). |
| A `.env` that is committed | The value is leaked. Rotate it, then remove the file and add it to `.gitignore`. Rewriting history does not un-leak anything already pushed or cloned. |
| A value in source code or a config file | Move it to the manager, read it by reference, and rotate it if the file was ever shared or pushed. |
| A token in a CI file | Move it to the CI system's secret store, or to the manager (`ci.md`), and rotate it. |
| A value in a ticket, chat or document | Treat as exposed. Rotate it. Delete the message if you can, knowing a copy may remain. |
| A shared personal token | Replace it with one token per person or service, scoped to the least that works. |

## Why an AI must never import a `.env` itself

Importing means reading the file, so the AI sees every value and the values enter its context and
transcript. The 1Password Environments MCP server and the Claude Code plugin (beta) let an agent list
Environment names and variable names and never receive values, with one exception: the plugin's import
workflow reads the plaintext `.env` itself. Do the import yourself in the app. An AI may list the names
of the files and the keys, and may prepare the reference file from names alone.

## A value is already exposed

Follow this order. Do not repeat the value while you do.

1. **Stop using it as a secret.** Treat it as public from now on.
2. **Rotate at the provider.** Generate a new key, then revoke the old one. The old key is valid until the
   provider kills it, so this step is the one that closes the exposure.
3. **Put the new value in the manager through the app.** Edit the existing item.
4. **Refresh every cache** of the old value and update CI if it held a copy.
5. **Check what the old key could reach.** Many providers keep an access log. Look for use you do not
   recognize, and say what you found.
6. **Clean up the copies you can** (the message, the commit, the ticket), knowing that a copy may remain.

Words to use when it happens in chat: "That value is now in this conversation. Treat it as exposed and
rotate it at the provider. Put the new one in 1Password through the app. I will not repeat or use the
old one."

## Checklist: move an existing project

- [ ] List the variables the project needs, names only (`.env.example`, or the scan script's keys).
- [ ] Decide which are secrets and which are plain settings.
- [ ] Create a vault for the project and stage, and share it with the people who run the project.
- [ ] The person creates one item per secret in the app and pastes each value there.
- [ ] Write `.env.op` with references, keep `.env.example` with names, and gitignore `.env`.
- [ ] Run the project with `op run --env-file=.env.op -- <command>` and judge by exit code.
- [ ] The person deletes the old plaintext files.
- [ ] Rotate anything that was committed, pasted in chat or shared by file.
- [ ] Move CI to references or the CI secret store (`ci.md`).
- [ ] Tell the team the new way to start the project, and that nobody sends values again.
- [ ] Repeat the scan in a week and on a schedule after that.
