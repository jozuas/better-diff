Paseo plugin: a Sublime Merge-style diff and staging view for a workspace's worktree. What it does: `SPEC.md`.

## General

- Never create summary documents.
- No comments restating code or its history, unless asked.
- Commit subjects: imperative, sentence case, no period or `feat:` prefix.

## Paseo plugin SDK

- The SDK's own types are the reference: `node_modules/@getpaseo/plugin/dist` (`client/`, `client/ui`, `server/`) and `node_modules/@getpaseo/client/dist`. Docs: https://paseo.sh/docs/plugins, https://paseo.sh/docs/plugins/reference.
- `index.client.tsx` and `client/` run in the app, `index.server.ts` and `server/` in a daemon subprocess, `shared/` in both. Crossing these boundaries is a compile error.
- Client code renders with React Native primitives through React Native Web: no DOM APIs or HTML elements.
- Paseo supplies the SDK, React, React Native, TanStack Query and Zod at runtime. Ask before adding any other runtime dependency.
- Git runs on the server side, through `execCommand` from `@getpaseo/plugin/server`.

## Commands

- Check: `npm run check` runs the typecheck, lint, format check, tests and Knip, stopping at the first failure. A pre-commit hook runs it against the staged changes, along with nixfmt on `.nix` files (`git-hooks` in `devenv.nix`, installed when the devenv shell starts); don't bypass it with `--no-verify`. CI (`.github/workflows/check.yml`) runs it on pushes to `main` and on PRs.
- Typecheck: `npm run typecheck` (`tsc -b` over `tsconfig.json`, which references one project per runtime: `tsconfig.{client,server,shared}.json`, plus `tsconfig.test.json` for tests and `tsconfig.node.json` for everything else; shared options in `tsconfig.base.json`).
- Lint: `npm run lint` (Oxlint, type-aware; config in `.oxlintrc.json`). It also enforces the client/server/shared import boundaries and runs the vendored anti-slop rules in `tools/oxlint/anti-slop/` (provenance in its `UPSTREAM.md`). Fix findings in the code; don't suppress rules, lower their severity, or add casts to get past them.
- Format: `npm run format` (Oxfmt, which also sorts imports; config in `.oxfmtrc.json`). `npm run format:check` only checks.
- Test: `npm test` (Vitest; config in `vitest.config.mts`). Tests sit next to the code they cover, as `*.test.ts`.
- Unused code: `npm run knip` (Knip; config in `knip.json`). It reports unused files, exports and dependencies, then rechecks without tests, so code only tests use counts as unused. Delete what it finds instead of adding ignores.
- Try it in Paseo: `paseo plugin add "$PWD" --id <id>` once, with `better-diff` as the `<id>` in the main checkout and `better-diff-<worktree name>` in a worktree, so several can be installed side by side. Then `paseo plugin reload <id>` after a change, and `paseo plugin logs <id>` for its output.
- Nix packages go in `devenv.nix`; npm packages via `npm install`.
