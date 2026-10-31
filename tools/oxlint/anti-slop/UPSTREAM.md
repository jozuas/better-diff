# anti-slop provenance

- Source: https://github.com/dmmulroy/anti-slop
- Commit: `13909c9e07590f5a85d93c62712259fe14a883f7`
- Copied from `skills/install-anti-slop/assets/anti-slop/`, identical to upstream `src/` without the `*.test.ts` files.
- Generic plugin: `tools/oxlint/anti-slop/index.ts`, registered as `anti-slop` in `.oxlintrc.json` with every generic rule at `error`.

## Local deviations

- The Effect plugin (`effect/index.ts`) is copied but not registered: the project doesn't depend on Effect.
- `oxc/no-accumulating-spread` is enabled through Oxlint's `perf` category rather than listed by name.
- The upstream RuleTester tests are not vendored.
- Typechecked by `tools/oxlint/tsconfig.json` (Bundler resolution) instead of upstream's root `tsconfig.json` (NodeNext); `tools/oxlint/package.json` marks the code as ES modules for Node.
