# CI

Contents: the documented pattern for GitHub Actions, the service account, rate limits, and what is not
documented.

Source: the 1Password documentation for service accounts and GitHub Actions
(`https://www.1password.dev/ci-cd/github-actions`) and the README of `1password/load-secrets-action`.
This file covers GitHub Actions only. For another CI system, check the official docs.

## The pattern

One repository secret, `OP_SERVICE_ACCOUNT_TOKEN`, plus the action `1password/load-secrets-action`. The
action turns `op://` references into values, as step outputs (`export-env: false`, the form the README
calls recommended) or as environment variables (`export-env: true`). Values that appear in logs are masked.
When a secret rotates in 1Password, nothing changes in GitHub.

```yaml
# .github/workflows/test.yml
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Load secrets
        id: load_secrets
        uses: 1password/load-secrets-action@v5
        env:
          OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
          DB_PASSWORD: op://myapp-ci/postgres/password
      - name: Run tests
        run: ./run-tests.sh
        env:
          DB_PASSWORD: ${{ steps.load_secrets.outputs.DB_PASSWORD }}
```

The README shows `@v5` and the documentation page shows `@v4`. Pin the tag your team tested.

## The service account

| Fact | Detail |
|---|---|
| Who creates it | Owners and administrators by default. Up to 100 per account. |
| What it cannot read | The built-in Personal, Private and Employee vaults, and the default Shared vault. Put CI secrets in a custom vault, for example `myapp-ci`. |
| Permissions | Can be read-only. Vault access and permissions are **immutable** after creation. To change them, create another service account. |
| Environments | Can read Environments, read-only. |
| CLI | Needs 1Password CLI 2.18.0 or later for service accounts. |
| Visibility | A usage report shows what each service account accessed. |

Creation route: on 1Password.com use the service account wizard (Developer, Directory, Other under
Infrastructure Secrets Management, Create a Service Account), pick the vaults and the permission per
vault, and save the token in 1Password right away. It is shown once. The CLI route:

```bash
op service-account create "myapp-ci" --expires-in 90d --vault myapp-ci:read_items
```

`90d` is an illustrative duration. The flag syntax comes from the documentation. The person runs this,
and the token it prints never goes into chat.

## Rate limits

| Limit | Teams | Business |
|---|---|---|
| Reads per hour, per service-account token | 1,000 | 10,000 |
| Writes per hour, per service-account token | 100 | 1,000 |
| Per day, per account (reads and writes together) | 5,000 | 50,000 |

Going over returns HTTP 429. Load fewer references per run, or wait for the window to reset.

## Rules for CI

- Give the token only to the job that needs it, not to the whole workflow.
- Give CI its own vault with the fewest items and read-only access. Do not reuse a developer vault.
- Never put the service account token in chat or in a file. It goes in the CI secret store.
- A token expiry (`--expires-in`) means you will have to rotate it on a date. Write the date down.
- Treat any job that runs untrusted code (for example from a pull request) as able to read what its
  environment holds. That is general CI reasoning, not a statement from the 1Password documentation.

## Not documented, so do not rely on it

1Password does not document, in the pages used for this skill, whether the action installs the `op` binary,
what the default of `export-env` is, whether each secret counts against the rate limit, or how pull
requests from forks behave. Test those on a throwaway workflow before you depend on them.
