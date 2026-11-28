# AI hand-off: a prompt and a checklist

Contents: how to use this, the prompt to copy, the checklist with the words to say, and what to do when a
value appears in chat.

A developer gives the block below to their own AI assistant. The assistant does every step it can do
safely and stops at each step that needs a person. It works from references and never prints a value.

Placeholders in angle brackets are filled by the assistant from the project, not by the person.

## The prompt (copy this block)

```text
Help me set up 1Password for this project so it loads its secrets by reference. Follow the checklist below.

Rules.
(1) Never print, paste, log or echo a secret value, and never ask me to paste one into this chat.
(2) Work only with references (op://vault/item/field) and with item and variable names.
(3) Never run `op read`, `op run --no-masking`, or any command that would show a value, not even to check that a secret works. Never create an item with a value in a command.
(4) Never open, read or import a .env file or any file that may hold values. You may read .env.example and the names in it.
(5) Ask me before you touch any file outside this project.
(6) Do the steps marked "AI does it". At each step marked "STOP: human step", say the words given, then end your turn and wait for me to reply "done".
```

## The checklist

1. **AI does it.** Run `op --version`. If `op` is missing, tell the person the install command for their
   system and run it only after they say yes (macOS `brew install 1password-cli`, Windows
   `winget install 1password-cli`, Linux: follow the official page).
2. **STOP: human step.** Say: "Open the 1Password app, sign in with your company account, and reply 'done'."
3. **STOP: human step.** Say: "In the 1Password app open Settings, then Developer, and turn on 'Integrate
   with 1Password CLI'. On Windows turn on Windows Hello first. On Linux turn on 'Unlock using system
   authentication' under Security first. Reply 'done'."
4. **AI does it.** Warn: "A 1Password approval prompt will appear. Approve it." Then run `op account list`,
   `op whoami` and `op vault list`. If there are two accounts, ask which one is the work account and use
   `OP_ACCOUNT=<address>` or `--account <address>` from then on. If `op` asks for a Secret Key, an email or a
   password, go back to step 3.
5. **AI does it.** Read `.env.example` (never `.env`) and list the variable names the project needs. Mark
   which are secrets and which are plain settings. Propose a vault name such as `<project>-dev` and item
   names without spaces. Show a table of names only.
6. **STOP: human step.** Say: "In 1Password.com select Vaults, New Vault, Custom, name it `<vault>` and select
   Create Vault. Then open it, select People or Groups, then Manage, add the teammates (view-only is enough
   to run the project) and select Save. If you cannot create or share vaults, ask your admin. Reply 'done'."
7. **STOP: human step.** Say: "In the 1Password app create these items in `<vault>`, one per secret, and paste
   each value there yourself: `<item and field names from step 5>`. Do not paste any value here. Reply 'done'."
8. **AI does it.** Write `.env.op` with one `op://` reference per secret and plain lines for non-secret
   settings. Make sure `.env` is in `.gitignore`. Do not create `.env`. Show the file.
9. **AI does it.** Say: "This starts the project with real secrets. A 1Password prompt will appear. Approve
   it." Then run the project with `op run --env-file=.env.op -- <command>`. Judge success by the exit code
   and the app's behaviour, never by printing values.
10. **AI does it.** List the names, not the contents, of any `.env*` file other than `.env.example`, for
    example with `git ls-files` and `find . -name '.env*' -not -path './node_modules/*'`. Then say: "These
    files may hold plaintext secrets. I did not open them. Import them into 1Password yourself in the app,
    then delete them. Reply 'done'."
11. **STOP: human step.** Only if the project has CI. Say: "Ask a 1Password owner or administrator to create a
    read-only service account for `<ci-vault>`, save its token in 1Password, and add it as the repository
    secret `OP_SERVICE_ACCOUNT_TOKEN`. Do not paste the token here. Reply 'done'." Then add the workflow step
    with references only (`ci.md`).
12. **AI does it.** Summarise the files you changed, the vault and items that must exist, and what is still
    waiting on the person. Include no values.

## What the session can and cannot do

It can run the CLI, write the reference file and use a token by running tools. It cannot sign the person in,
approve the prompt, create or share the vault, or paste a value for them, and it should not try. If it asks
the person to paste a value in chat, stop and do it in the 1Password app instead.

## Rotation as a hand-off

Use the same shape when a key must be rotated:

1. **STOP: human step.** "Generate the new key at the provider. Do not paste it here. Reply 'done'."
2. **STOP: human step.** "Edit the existing item in 1Password and replace the field value. Do not create a
   second item. Reply 'done'."
3. **AI does it.** Run the refresh command of any cache (`agent-cache-pattern.md`), then run the project
   and judge by exit code or by an identity command.
4. **STOP: human step.** "Update the CI secret if CI holds a copy, then revoke the old key at the provider.
   Reply 'done'."

## If a value appears in chat

Do not repeat it, quote it or save it anywhere. Say: "That value is now in this conversation. Treat it as
exposed: rotate it at the provider. Put the new one in 1Password through the app and do not paste it
here." Then continue with the rotation hand-off. More in `audit-and-migration.md`.
