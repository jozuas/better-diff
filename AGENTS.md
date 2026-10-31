Paseo plugin: a Sublime Merge-style diff and staging view for a workspace's worktree. What it does: `SPEC.md`.

## General

- Never create summary documents.
- No comments restating code or its history, unless asked.
- Commit subjects: imperative.

## Paseo plugin SDK

- The SDK's own types are the reference: `node_modules/@getpaseo/plugin/dist` (`client/`, `client/ui`, `server/`) and `node_modules/@getpaseo/client/dist`. Docs: https://paseo.sh/docs/plugins, https://paseo.sh/docs/plugins/reference.
- `index.client.tsx` and `client/` run in the app, `index.server.ts` and `server/` in a daemon subprocess, `shared/` in both. Crossing these boundaries is a compile error.
- Client code renders with React Native primitives through React Native Web: no DOM APIs or HTML elements.
- Paseo supplies the SDK, React, React Native, TanStack Query and Zod at runtime. Ask before adding any other runtime dependency.
- Git runs on the server side, through `execCommand` from `@getpaseo/plugin/server`.

## Tests

- Property-test with fast-check wherever a property can be stated: round trips (staging then unstaging restores the index), invariants, agreement with git itself or with a simpler model. Use example tests for cases that matter on their own, such as an exact output format. A property that computes the expected value the way the code does tests nothing.
- Write a property as `fc.assert(fc.property(...))` inside Vitest's `test`, with `import * as fc from "fast-check"`, and assert with `expect` instead of returning a boolean: Vitest fails tests that make no assertions. Not `@fast-check/vitest`: Oxlint doesn't recognise its `test`, so the Vitest lint rules would skip those tests.
- `fc.string()` generates only printable ASCII: no newlines, `\r`, tabs or other Unicode, which is where diffs break. Pass a `unit` such as `"binary"`, or build the lines yourself.
- Test git operations against real git in a temporary repository, not mocks.
- A failing property prints its `seed`, `path` and shrunk counterexample; pass `{ seed, path }` to `fc.assert` to replay it. After the fix, keep the counterexample in `fc.assert`'s `examples` so every run checks it.
- Vitest can't load `react-native`, so keep client logic such as line selection and word highlighting in modules that don't import it.

## Commands

- Check: `npm run check` runs the typecheck, lint, format check, tests and Knip, stopping at the first failure. A pre-commit hook runs it against the staged changes, along with nixfmt, actionlint, zizmor, and the gitleaks and detect-private-keys secret scanners, and a commit-msg hook runs gitlint (config in `.gitlint`). Both are `git-hooks` in `devenv.nix`, installed when the devenv shell starts; don't bypass them with `--no-verify`. If a scanner flags a secret, take it out of the commit instead of allowlisting it, and ask if you think it's a false positive. CI (`.github/workflows/check.yml`) runs the check on pushes to `main` and on PRs.
- Typecheck: `npm run typecheck` (`tsc -b` over `tsconfig.json`, which references one project per runtime: `tsconfig.{client,server,shared}.json`, plus `tsconfig.test.json` for tests and `tsconfig.node.json` for everything else; shared options in `tsconfig.base.json`).
- Lint: `npm run lint` (Oxlint, type-aware; config in `.oxlintrc.json`). It also enforces the client/server/shared import boundaries and runs the vendored anti-slop rules in `tools/oxlint/anti-slop/` (provenance in its `UPSTREAM.md`) and this project's own rules in `tools/oxlint/local/`. Fix findings in the code; don't suppress rules, lower their severity, or add casts to get past them.
- Format: `npm run format` (Oxfmt, which also sorts imports; config in `.oxfmtrc.json`). `npm run format:check` only checks.
- Test: `npm test` (Vitest; config in `vitest.config.mts`). Tests sit next to the code they cover, as `*.test.ts`.
- Unused code: `npm run knip` (Knip; config in `knip.json`). It reports unused files, exports and dependencies, then rechecks without tests, so code only tests use counts as unused. Delete what it finds instead of adding ignores.
- Try it in Paseo: `paseo plugin add "$PWD" --id <id>` once, with `better-diff` as the `<id>` in the main checkout and `better-diff-<worktree name>` in a worktree, so several can be installed side by side. Then `paseo plugin reload <id>` after a change, and `paseo plugin logs <id>` for its output.
- Nix packages go in `devenv.nix`; npm packages via `npm install`.
- `.npmrc` refuses package versions under 7 days old, git and URL dependencies, and install scripts not listed in `package.json`'s `allowScripts`. If an install fails on one of these, ask instead of getting around it with `npm install-scripts approve`, `--dangerously-allow-all-scripts` or `min-release-age-exclude`.
