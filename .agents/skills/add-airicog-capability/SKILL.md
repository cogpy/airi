---
name: add-airicog-capability
description: Add or change a cognitive or autonomy capability for the AIRI character — the Neuro-sama-style behaviours (speaking unprompted during a lull, turn-taking and yielding the floor, barge-in, mood and affect, episodic memory, attention) whose decision logic lives in the @proj-airi/cognitive-airicog package and is wired into the character through stage-ui. Use this whenever work touches packages/cognitive-airicog, adds a module or subpath export there, wires an airicog module into a stage-ui store or lib, or asks to make the AIRI character more autonomous, present, proactive, or "alive" — even if cognitive-airicog is never named. Also use it to verify such a change or to fix red CI (Type Check, lint, unit tests) on one.
---

# Add a cognitive capability to AIRI

Anything the character does beyond "answer the message" is split across two
places. The **decision** — should she speak now, has she been interrupted, how
does she feel, what does she remember — lives in `packages/cognitive-airicog`,
framework-free and tested in isolation. The **wiring** that feeds it live state
and acts on its answer lives in `packages/stage-ui`. This skill covers adding to
both without leaving something half-built, and proving it works before CI does.

The two costliest mistakes made while building this package were both
verification gaps, not design errors: subpaths that were declared but never
built, and a type imported from the wrong module that turned CI red on five
commits while every test passed. Most of what follows exists to stop those.

## 1. Find the code, and confirm the gap is real

**Check which branch has the package.** `cognitive-airicog` has at times existed
only on a feature branch, not on `main` — a merged PR did not guarantee it. Check
the tree, not the history:

```bash
git ls-tree --name-only origin/main packages/cognitive-airicog
```

Empty output means it is not on `main`; as of 2026-09 it lived on
`claude/implement-opencog-airicog-01HuyLCBqKmfErW6UU2B2W48`. Tree checks are
reliable in a shallow clone; `git merge-base --is-ancestor` is not — it reports
false negatives past the depth boundary. Deepen with a bounded
`git fetch --depth=600 origin <branch>` before trusting ancestry.

**Confirm nothing already does it.** Search before building:

```bash
grep -rniE "idle|proactive|spontaneous|initiative|autonomous" packages/ apps/ --include=*.ts --include=*.vue -l | grep -v -e node_modules -e dist
```

Read what turns up. When initiative was built, `spark-notify` and
`artistry-autonomous` already existed and looked like autonomy — but both start
from something the other party did. The real gap was acting when nothing had
happened. Build the missing primitive, not a parallel copy of an existing one,
and finish one capability rather than starting three.

## 2. Shape the module: a pure decision and a thin adapter

Every module here — `initiative`, `yielding`, `affect` (mood), `memory` — follows
the same shape, and new ones should too:

- **State in, decision out.** The caller passes the clock and the candidates as
  arguments; the function never calls `Date.now()` or reaches into a live
  `ECAN`. The same state always gives the same answer, so it is testable without
  an AtomSpace and debuggable from a log line.
- **Return a discriminated union that carries its reasons**, e.g.
  `{ act: false, reason: 'refractory' | 'no-candidates' | 'below-threshold', urge }`
  or `{ act: true, topicAtomId, urge, silencePressure, salience, novelty }`. The
  runtime can then show *why* the character did something, which is most of what
  you need when tuning behaviour.
- **Config as `Partial<XConfig>` over `createDefaultXConfig()`**, with every field
  carrying a `@default` and a sentence on what raising or lowering it does to the
  character.
- **Sanitize at the boundary.** Non-finite input becomes 0; out-of-range values
  are clamped; a clock that ran backwards is not elapsed time.
- **One named adapter onto live state**, kept separate —
  `candidatesFromFocus(ecan)` reads ECAN's focus as candidates. It is the only
  function that touches a live economy.

For scoring, when any one factor should be able to veto (a subject just raised,
nothing attending to it, a silence barely begun), **multiply factors on [0, 1]**
rather than summing them. Put hard gates such as a refractory period *before*
scoring, so a burst of salience can't argue past them. Saturating curves
(`1 - exp(-elapsed / scale)`) suit quantities that should climb fast and then
flatten.

## 3. Register the module — every one of these places

A module isn't usable until all of these agree:

1. `src/<module>/<name>.ts` and `src/<module>/<name>.test.ts`
2. `src/<module>/index.ts` — a barrel: `export * from './<name>'`
3. `tsdown.config.ts` — add `'./src/<module>/index.ts'` to `entry`
4. `package.json` `exports`:
   ```json
   "./<module>": {
     "types": "./dist/<module>/index.d.mts",
     "default": "./dist/<module>/index.mjs"
   }
   ```
5. `src/index.ts` — named re-exports, values and `type` exports both
6. `README.md` — a row in the module table and a short usage section

Step 3 is the one that silently fails. Without an entry, tsdown builds only
`src/index.ts`: the subpath is declared, documented, and backed by a barrel file,
yet resolves to a file that was never emitted. Tests import source, so they pass
regardless. Only loading the built output catches it — see step 5.

The package also needs its own `vitest.config.ts` (it has one; keep it). Without
it, `vitest run` inside the package inherits the root config and crashes with
`Projects definition references a non-existing file or a directory: …/packages/cognitive-airicog/server/apps/auth`.

## 4. Wire it into stage-ui

- **Pure mappings go in `packages/stage-ui/src/libs/<area>/`** —
  `libs/affect/mood-prompt.ts` maps the display emotion the character already
  picks per reply onto a mood event, with no extra model call.
  `libs/speech/barge-in.ts` sits the same way.
- **Stateful loops go in `packages/stage-ui/src/stores/modules/<name>.ts`** as a
  Pinia setup store (`stores/modules/initiative.ts` runs the character's own
  turn-taking). The store owns its timer: start it explicitly, clear it on stop,
  and never let two run at once.
- **Import every type from the subpath that exports it.** The initiative store
  once imported `Episode` from `@proj-airi/cognitive-airicog/initiative`, but it
  lives in `/memory`. The import resolved to nothing, `episodes` quietly became
  `any[]`, and the error only surfaced as an implicit-any on a filter callback —
  in CI, after 60 store tests had passed locally.
- **Let the character card decide, and default to off.** A behaviour that changes
  how the character acts on her own (e.g. whether she speaks first) reads its
  settings from the card — the initiative store types them as
  `NonNullable<AiriExtension['modules']['initiative']>` and treats a missing
  `enabled` as `false`. A card that never asked for the behaviour doesn't get it.
- stage-ui depends on the package as `"@proj-airi/cognitive-airicog": "workspace:^"`.
  After adding or changing a dependency, `CI=true pnpm install --no-frozen-lockfile`.

## 5. Verify, in this order

**Tests are not a type check.** Vitest strips types without checking them, so a
green test run says nothing about whether CI's Type Check job will pass. Run all
of this, and don't skip the slow steps — the slow ones are the ones that were
skipped when CI went red.

```bash
# the package itself
pnpm -F @proj-airi/cognitive-airicog typecheck
pnpm -F @proj-airi/cognitive-airicog test
pnpm -F @proj-airi/cognitive-airicog build
node .agents/skills/verify-package-public-api/scripts/check-exports.mjs \
  packages/cognitive-airicog ./<module>=<yourMainExport>

# the consumer — vue-tsc, several minutes, and the step that catches wrong-subpath imports
pnpm -F @proj-airi/stage-ui typecheck
pnpm -F @proj-airi/stage-ui exec vitest run src/stores/modules/<name>.test.ts

# lint exactly the files you touched (README code blocks are linted too)
npx --no-install moeru-lint <files…>

# what CI's typecheck job actually runs, across the whole monorepo
pnpm run typecheck
```

`check-exports.mjs` belongs to the
[`verify-package-public-api`](../verify-package-public-api/SKILL.md) skill: it
loads every entry in `package.json` `exports` from `dist/`, and a
`./<subpath>=<symbol>` argument pins an export that must be there. Run it after
every build that touches exports. That skill covers exports, tsdown entries and
package test scripts in general; this one only adds what is specific to airicog.

When the behaviour depends on live state, also drive it once end to end through
the built bundle — import from `dist/`, stimulate a real `ECAN`, and check the
decision flips the way it should (quiet 500 ms after being spoken to; speaks
after a long silence). It is a two-minute check that catches wiring the unit
tests mock around.

Use generous timeouts: stage-ui typecheck and the repo-wide typecheck each take
minutes. In a fresh container `node_modules` may be empty — install first with
`CI=true pnpm install`, which takes about four minutes.

## 6. Commit

- **The pre-commit hook runs `moeru-lint --fix` on staged files** and reformats
  the whole file, not just your lines. Run lint `--fix` yourself first and
  re-run the tests, so the hook never changes code you didn't verify.
- Markdown code blocks are linted: use `console.info`, not `console.log`.
- A regex used only with `.test()` wants non-capturing groups — `/\b(?:a|b)\b/` —
  or `regexp/no-unused-capturing-group` fires.
- Don't mass-fix pre-existing lint in files you didn't otherwise touch; other
  branches may be doing that cleanup and you'll collide.
- Conventional Commits: `feat(cognitive-airicog): …`, `fix(stage-ui): …`. The body
  should say what the character couldn't do before and why the design is
  shaped the way it is, not restate the diff.

## 7. Know where to stop

Some of what "make her like Neuro-sama" needs isn't unlocked by writing more
code, and saying so is part of doing the job well:

- **A choice that belongs to the user.** Anything that picks a library, runtime,
  or model (in-browser WebGPU inference, for one) — AGENTS.md says to lay out the
  options and ask before choosing.
- **Behaviour only validated by hearing or seeing it.** Turn-taking timing,
  barge-in, and voice feel can pass every test and still be wrong. Tests check
  the arithmetic, not the conversation. Say plainly what has only been verified
  as arithmetic.
- **A seam that doesn't exist yet.** If the pieces you need are never in scope
  together (voice activity and the playback manager, for barge-in), propose where
  the seam should go rather than forcing one in blind.

When you finish, report three things separately: what shipped and was verified,
what is implemented but only verified as arithmetic, and what is blocked and on
what.

## Pitfalls already hit

| What you see | Cause | Fix |
|---|---|---|
| A subpath import fails at runtime; all tests pass | No tsdown `entry` for it | Add the entry; run `check-exports.mjs` |
| CI Type Check red, local tests and lint green | Type imported from a subpath that doesn't export it, so it became `any` | Run the consumer's typecheck (`vue-tsc` for stage-ui) |
| `vitest run` in the package: "Projects definition references a non-existing file…" | Package has no `vitest.config.ts`; root config's `projects` resolve from the wrong cwd | Add a local `vitest.config.ts` with `name` and `include` |
| Commit diff far larger than the change | Pre-commit `moeru-lint --fix` reformatted whole files | Lint-fix before committing, re-run tests |
| `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` | Non-interactive shell | `CI=true pnpm install` |
| `ERR_PNPM_OUTDATED_LOCKFILE` after adding a dependency | Frozen lockfile in CI mode | `--no-frozen-lockfile` |
| `pnpm run …` hangs with no output in a fresh container | Dependencies not installed; pnpm fetching before `run` | `CI=true pnpm install` first; if corepack itself hangs behind a proxy, set `NODE_USE_ENV_PROXY=1` |
| A commit you know was merged "isn't in main" | Shallow clone, or it genuinely isn't | `git ls-tree` the tip; deepen with `--depth` before trusting ancestry |
