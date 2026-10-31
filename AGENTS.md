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

- Typecheck: `npm run typecheck`.
- Lint: `npm run lint` (Oxlint, type-aware; config in `.oxlintrc.json`). It also enforces the client/server/shared import boundaries.
- Format: `npm run format` (Oxfmt, which also sorts imports; config in `.oxfmtrc.json`). `npm run format:check` only checks.
- Test: `npm test` (Vitest; config in `vitest.config.mts`). Tests sit next to the code they cover, as `*.test.ts`.
- Try it in Paseo: `paseo plugin add "$PWD" --id <id>` once, with `better-diff` as the `<id>` in the main checkout and `better-diff-<worktree name>` in a worktree, so several can be installed side by side. Then `paseo plugin reload <id>` after a change, and `paseo plugin logs <id>` for its output.
- Nix packages go in `devenv.nix`; npm packages via `npm install`.
