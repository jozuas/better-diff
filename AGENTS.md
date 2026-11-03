Paseo plugin: a Sublime Merge-style diff and staging view for a workspace's worktree. What it does: `SPEC.md`.

## Rules

- Never create summary documents.
- No comments restating code or its history, unless asked.
- Commit subjects: imperative.
- Don't get around a check: no `--no-verify`, no lint suppressions, severity changes or casts to silence a rule, no Knip ignores (delete the unused code), and never lower Stryker's `thresholds.break`. If a secret scanner fires, take the secret out of the commit, and ask if you think it's a false positive.
- Change the files that `.claude/settings.json` lists under `permissions.ask` with the Edit or Write tool, never from the shell, so the change comes to me for approval.
- Ask before adding a runtime dependency. Paseo supplies the SDK, React, React Native, TanStack Query and Zod.
- npm packages via `npm install`, Nix packages in `devenv.nix`. If `.npmrc` refuses an install (version under 7 days old, git or URL dependency, install script not in `allowScripts`), ask instead of working around it.

## Paseo plugin SDK

- Reference: the SDK's types in `node_modules/@getpaseo/plugin/dist` (`client/`, `client/ui`, `server/`) and `node_modules/@getpaseo/client/dist`. Docs: https://paseo.sh/docs/plugins, https://paseo.sh/docs/plugins/reference.
- `index.client.ts` and `client/` run in the app and render with React Native primitives through React Native Web. `index.server.ts` and `server/` run in a daemon subprocess. `shared/` runs in both.
- Git runs on the server side, through `git` from `server/git.ts`, the one module allowed to start processes. An option a command needs whatever the user's config says goes in its `commandOptions`, with a test that sets the config it overrides.

## Tests

- Property-test with fast-check wherever a property can be stated: round trips (staging then unstaging restores the index), invariants, agreement with git itself or with a simpler model. A property that computes the expected value the way the code does tests nothing. Use example tests for cases that matter on their own, such as an exact output format.
- Write a property as `fc.assert(fc.property(...))` inside Vitest's `test`. Not `@fast-check/vitest`: Oxlint's Vitest rules don't recognise its `test`.
- Generate what diffs break on: newlines, `\r`, tabs and non-ASCII. Generate file paths with `filePath` from `test/file-names.ts`.
- Test git operations against real git in a temporary repository (`inRepository` from `test/repository.ts`), not mocks.
- Code only tests use, such as shared generators and temporary repositories, goes in `test/`: it isn't shipped, and Stryker doesn't mutate it.
- Keep client logic, such as line selection and word highlighting, in `.ts` modules that don't import `react-native`: Vitest can't load it, and Stryker only mutates `.ts` modules.
- Every Stryker mutant must be killed, by a test of the behaviour it breaks, not one that restates the mutated code. Disable a mutant with a Stryker comment only if it can't change behaviour or its module can't load under Vitest.
- Under Stryker, fast-check runs with a fixed seed (`vitest.setup.ts`). If a property misses a mutant only because its generator rarely produces the case, generate it more often or add it to `examples`.
- End-to-end tests in `e2e/` drive Paseo's web UI with Playwright, against a daemon of their own. Write one for each behaviour in `SPEC.md` a user can see, named after it, and check what an action did to the repository with git, not only what the screen shows.
- Import `test` and `expect` from `e2e/fixtures.ts`. Its fixtures give a test a temporary repository, open the plugin's screens and workspaces, and fail a test whose page logs an error.
- Find elements by role and accessible name, so give every control `accessibilityRole` and `accessibilityLabel`.
- Keep `@playwright/test` at the version of nixpkgs' `playwright-driver`: devenv provides nixpkgs' Chromium, built for that version.

## Commands

- `npm run check:fast`: typecheck, lint, format check, tests and Knip, stopping at the first failure. Run it after each change. CI runs it, and only it, on pushes to main and on pull requests.
- `npm run mutate:changed`: mutation tests of the plugin's lines changed since `origin/main`, committed or not, and of its new files. Run it before committing a change to the plugin's code. It leaves out mutants that reach past the changed lines, and mutants in unchanged code that a changed test or test helper no longer kills.
- `npm run check`: `check:fast`, then mutation tests of all the plugin's code. It has the last word on what `mutate:changed` leaves out, and nothing runs it for you, CI included, so run it before pushing a change to the plugin's code and fix whatever it finds. The pre-commit hook only runs secret scanners and quick linters.
- `npm run mutate:rules`: mutation tests of the local Oxlint rules in `tools/oxlint/local/`. Nothing runs it for you, CI included, so run it after changing them.
- Run Stryker only through the `mutate` scripts. They take turns across all the repository's worktrees, and one that has to wait says so: runs side by side slow each other's tests until mutants time out, and Stryker counts those as killed.
- `npm run test:e2e`: the end-to-end tests. Nothing runs them for you, CI included, so run them after changing the plugin, the tests or their dependencies. A failure prints the paths of a screenshot, the page's accessibility tree (`error-context.md`), a trace and the plugin's logs.
- On their own: `npm run typecheck`, `npm run lint`, `npm run format` (also sorts imports), `npm test`, `npm run knip`, `npm run mutate` (prints surviving mutants as diffs, report in `reports/mutation/mutation.html`).
- Try it in Paseo: `paseo plugin add "$PWD" --id <id>` once, with `better-diff` as the `<id>` in the main checkout and `better-diff-<worktree name>` in a worktree. Then `paseo plugin reload <id>` after a change, and `paseo plugin logs <id>` for its output.
