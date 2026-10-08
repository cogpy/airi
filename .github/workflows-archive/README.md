# Archived workflows

GitHub Actions only reads `.github/workflows/*.yml` and `*.yaml`. Files here are kept
for reference and do not run. To restore one, move it back into `.github/workflows/`.

## `autofix.yaml`

Archived because the **autofix.ci GitHub App is not installed on this fork**. The job
ran, did its work, and then failed at the point where it needs the app to push the
result:

```
Need to update 1 files.
...
500 autofix.ci app is not installed for this repository.
```

Upstream `moeru-ai/airi` has the app installed, so the workflow works there. On this
fork it can only ever fail, and it fails precisely when `pnpm run lint:fix` has
something to change — which is when a contributor most wants a green build. It passed
only while `main` happened to be lint-clean.

Installing the app is an admin action in the browser; there is no API for it. If that
happens, move this file back and delete this section.

Until then, `pnpm run lint:fix` locally and the `moeru-lint --fix` pre-commit hook
cover the same ground.
