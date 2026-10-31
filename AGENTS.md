Paseo plugin: a Sublime Merge-style diff and staging view for a workspace's worktree. What it does: `SPEC.md`.

## Rules

- Never create summary documents.
- No comments restating code or its history, unless asked.
- Commit subjects: imperative.
- Don't get around a check: no `--no-verify`, no lint suppressions, severity changes or casts to silence a rule, no Knip ignores (delete the unused code), and never lower Stryker's `thresholds.break`. If a secret scanner fires, take the secret out of the commit, and ask if you think it's a false positive.
- Ask before adding a runtime dependency. Paseo supplies the SDK, React, React Native, TanStack Query and Zod.
- npm packages via `npm install`, Nix packages in `devenv.nix`. If `.npmrc` refuses an install (version under 7 days old, git or URL dependency, install script not in `allowScripts`), ask instead of working around it.

## Paseo plugin SDK

- Reference: the SDK's types in `node_modules/@getpaseo/plugin/dist` (`client/`, `client/ui`, `server/`) and `node_modules/@getpaseo/client/dist`. Docs: https://paseo.sh/docs/plugins, https://paseo.sh/docs/plugins/reference.
- `index.client.tsx` and `client/` run in the app and render with React Native primitives through React Native Web. `index.server.ts` and `server/` run in a daemon subprocess. `shared/` runs in both.
- Git runs on the server side, through `execCommand` from `@getpaseo/plugin/server`.

## Tests

- Property-test with fast-check wherever a property can be stated: round trips (staging then unstaging restores the index), invariants, agreement with git itself or with a simpler model. A property that computes the expected value the way the code does tests nothing. Use example tests for cases that matter on their own, such as an exact output format.
- Write a property as `fc.assert(fc.property(...))` inside Vitest's `test`. Not `@fast-check/vitest`: Oxlint's Vitest rules don't recognise its `test`.
- Generate what diffs break on: newlines, `\r`, tabs and non-ASCII.
- Test git operations against real git in a temporary repository, not mocks.
- Keep client logic, such as line selection and word highlighting, in `.ts` modules that don't import `react-native`: Vitest can't load it, and Stryker only mutates `.ts` modules in `client/`, `server/` and `shared/`.
- Every Stryker mutant must be killed, by a test of the behaviour it breaks, not one that restates the mutated code. Disable a mutant with a Stryker comment only if it can't change behaviour or its module can't load under Vitest.
- Under Stryker, fast-check runs with a fixed seed (`vitest.setup.ts`). If a property misses a mutant only because its generator rarely produces the case, generate it more often or add it to `examples`.

## Commands

- `npm run check`: typecheck, lint, format check, tests, Knip and mutation tests, stopping at the first failure. The pre-commit hook runs it along with secret scanners and other linters.
- On their own: `npm run typecheck`, `npm run lint`, `npm run format` (also sorts imports), `npm test`, `npm run knip`, `npm run mutate` (prints surviving mutants as diffs, report in `reports/mutation/mutation.html`).
- Try it in Paseo: `paseo plugin add "$PWD" --id <id>` once, with `better-diff` as the `<id>` in the main checkout and `better-diff-<worktree name>` in a worktree. Then `paseo plugin reload <id>` after a change, and `paseo plugin logs <id>` for its output.
