---
name: verify-package-public-api
description: Make a workspace package's declared public API real and prove it. Use when a package's exports, README imports, or test script do not work; when adding or changing a subpath export in packages/ or apps/; when `pnpm -F <package> test` crashes before any test runs; or when auditing a package whose documentation promises more than it ships.
---

# Verify a Package's Public API

A package's `exports` map, its README, and its `scripts` are promises to a consumer.
This skill covers the ways AIRI packages break those promises silently, and how to
prove a fix rather than assume one.

## Audit First, in This Order

Run these four checks against the package before changing anything. Each one has
bitten a package in this repo, and each fails quietly.

1. **Every `exports` subpath is built.** Compare the keys of `package.json`
   `exports` against the entries in `tsdown.config.ts`. A declared subpath with no
   matching entry resolves to a file that was never emitted: the import fails at
   runtime, and the build stays green. A package with no `tsdown.config.ts` at all
   builds `src/index.ts` alone, so every subpath but `.` is dead.
2. **Every module the README imports is exported.** Grep the README for
   `@proj-airi/<package>/` and check each subpath appears in `exports`. Docs
   routinely name a module that was never declared.
3. **The package's own `test` script runs.** See "The Vitest Config Every Package
   Needs" below.
4. **The version matches the monorepo.** Compare `package.json` `version` against
   the root `package.json`. A package left behind on an old version is the stale
   one — do not "fix" a version constant to match a package that is itself adrift.
   Bump both.

## The Vitest Config Every Package Needs

Without a local `vitest.config.ts`, `pnpm -F <package> test` inherits the ROOT
config and resolves its `projects` globs relative to the package directory. It dies
before any test runs:

```
Projects definition references a non-existing file or a directory: .../packages/<name>/server/apps/auth
```

This is not a broken test — it is a missing file. Add it:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@proj-airi/<package>',
    include: ['src/**/*.test.ts'],
  },
})
```

If the package has no `"test": "vitest run"` script, add that too, and add
`"vitest": "catalog:vitest"` to `devDependencies`. Re-run install so the lockfile
picks up the new dependency, then confirm with `pnpm install --frozen-lockfile`
that the lockfile is consistent.

## Prove the Exports Resolve

A successful build is not evidence that an import works. The build emits whatever
the config lists; the `exports` map points wherever it points. Load every target and
assert the symbols:

```bash
node .agents/skills/verify-package-public-api/scripts/check-exports.mjs packages/<name>
```

The script reads the package's `exports`, dynamically imports each `default` target,
and fails if any one cannot be resolved or exposes nothing. Run it after `build`, and
name the result when you report the work. Add expected symbol names as extra
arguments when a specific API must be present:

```bash
node .../check-exports.mjs packages/<name> ./atomspace=createAtomSpace ./attention=createECAN
```

## Verify Before You Commit

All of these, for the package you touched:

- `pnpm -F <package> typecheck`
- `pnpm -F <package> test` — state the test count
- `pnpm -F <package> build` — then list `dist/` and confirm each declared subpath
  emitted both `index.mjs` and `index.d.mts`
- `pnpm -F <package> examples`, when the package has that script
- `check-exports.mjs`, as above
- `npx --no-install moeru-lint <each file you touched>`

Report the real numbers. A dist file count that differs from what you expected is a
fact to state, not a discrepancy to smooth over — tsdown's chunk splitting varies.

## Stay Inside the Files You Touched

Packages here carry large pre-existing lint backlogs, and separate branches are often
mid-flight against them. Lint only the files your change touches. Fixing a package's
whole backlog because it is red invites a conflict with whoever already owns that
cleanup — check for an in-flight branch before taking one on.

The pre-commit hook runs `moeru-lint --fix` over staged files, so expect it to
reformat everything you stage, including parts of a file you did not edit. That
reformatting is expected, not a problem to avoid. Run `--fix` yourself first so you
review the result instead of discovering it in the commit.

## Documentation Counts as Code

The linter lints code blocks inside Markdown. When editing a README or a summary
document:

- use `console.info`, never `console.log`;
- sort named imports;
- fix pre-existing violations in files you edit — otherwise the hook fails the commit.

Update the README in the same change as the export it documents. A subpath that now
builds should be imported through its subpath in the docs, not through the root.
