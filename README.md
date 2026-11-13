# Better Diff

A [Paseo](https://paseo.sh) plugin: a Sublime Merge-style diff and staging view for a workspace's worktree, made for reviewing what agents change.

> [!WARNING]
> This project is completely vibe coded. It's checked by property tests against real git, mutation testing in which a test has to catch every mutant, end-to-end tests in Paseo's UI, and strict type checking and linting.

## Features

- Stage, unstage and discard whole files, hunks or selected lines.
- Inline or side-by-side diffs, picked by the panel's width or set in the settings.
- Syntax highlighting, with changed words highlighted within lines.
- Comments on lines, sent to an agent in the workspace as one review.
- Refreshes as agents change the worktree, without moving the view.
- Works from the keyboard as well as the pointer. Its page under Settings → Plugins lists the keys.
- Hide whitespace changes, find in the diff, and show unchanged lines around a hunk or the entire file.
- Handles renames, mode changes, binary files and symlinks. Generated files and large diffs are collapsed.
- Ignores untracked files in a `.gitignore`, `.git/info/exclude` or your global excludes file.

The full behaviour is in [SPEC.md](SPEC.md).

Syntax highlighting comes from Paseo's highlighter, [`@getpaseo/highlight`](https://github.com/getpaseo/paseo/tree/main/packages/highlight), and file icons from the set [Paseo's Changes tab](https://github.com/getpaseo/paseo/blob/main/packages/app/src/components/material-file-icons.ts) has. For a missing language or icon, open an issue with [Paseo](https://github.com/getpaseo/paseo/issues), not here.

Needs Paseo 0.14 or later.

```sh
paseo plugin add https://github.com/jozuas/better-diff
```

## Limitations

- Paseo's mobile app isn't supported.
- No history, branches or other git operations beyond staging: planned for v2. Commit from Paseo itself.
- No GitHub pull request reviews: planned for v3.
- Merge conflicts aren't handled: a conflicted file shows "Merge conflicts" instead of its diff.
- Submodules aren't supported.

## Inspiration / credits

Better Diff borrows heavily from these, and ports some of their code outright:

- [Sublime Merge](https://www.sublimemerge.com/)
- [Linear reviews](https://linear.app/docs/diffs)
- [Magit](https://magit.vc/)
- [lazygit](https://github.com/jesseduffield/lazygit)
- [delta](https://dandavison.github.io/delta/)
- [GitHub](https://github.com/)
- [VS Code](https://code.visualstudio.com/)

## Contributing

Pull requests aren't accepted. Please open an issue instead, well written and reproducible: the steps that cause the problem, what you expected, what happened, and your Paseo version.

## License

[MIT](LICENSE).
