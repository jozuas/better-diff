## Minimal usable product

Desktop only: the mobile app isn't supported for now.

### Diff view

Replicates Sublime Merge as much as possible:

- Syntax highlighted.
- Diffs come from git itself (`git diff --no-ext-diff`), honouring the user's `diff.algorithm`.
- Changed words within a line are highlighted, as in Sublime Merge.
- Inline and side-by-side diffs (+ a button). In side-by-side, removals and additions are separate texts.
- Diff is shown file by file instead of as one continuously scrollable diff.
- The very top of a file's diff is a horizontal coloured bar (Sublime Merge uses deep blue). It shows the file's status (MODIFIED, UNTRACKED, STAGED), its full path, and the file actions on the right.
- Each hunk is delimited by a horizontal coloured bar (Sublime Merge uses blue), with the hunk actions on the right. On hover, its left side shows a "Show entire file" / "Show only modified hunks" toggle. Every file opens showing only modified hunks: the toggle doesn't carry over to the next file.

### Actions

| Diff shown          | File bar       | Hunk bar                 | Line actions               |
| ------------------- | -------------- | ------------------------ | -------------------------- |
| Modified (unstaged) | Discard, Stage | Discard Hunk, Stage Hunk | Discard Lines, Stage Lines |
| Untracked           | Delete, Stage  | Discard Hunk, Stage Hunk | Discard Lines, Stage Lines |
| Staged              | Unstage        | Unstage Hunk             | Unstage Lines              |

- Line actions appear only while lines in that hunk are selected.
- Staged changes can't be discarded, only unstaged.
- An untracked file's lines can be staged and discarded like a modified file's. Its one hunk is the whole file, so discarding that hunk, or all its lines, deletes the file, as Delete does.
- A partly staged file appears in both MODIFIED and STAGED. Opened from MODIFIED it shows the unstaged part, from STAGED the staged part.
- After a hunk action the view moves to the next hunk; after a file action, to the next file.

### Selecting lines

- Click and drag selects text as usual, so it can still be copied. The lines the selection touches are the selected lines.
- A selection stays within one hunk.
- In side-by-side, the selection is in whichever side has focus: removals or additions.

### Special file states

- No changes: show "No changes".
- Binary file, symlink: show "Binary file" or "Symlink" instead of the diff.
- Renamed file: the file bar shows the path it was renamed from, and the diff shows its other changes, or "Renamed" if it has none. Its lines can be staged, unstaged and discarded like any file's; staging one stages the rename too. Unstaging the file unstages only the new file, and leaves the old one's deletion staged.
- A file moved without git (a plain `mv`) is a renamed file in MODIFIED, as `git status` shows it once the new file is added with `--intent-to-add`, not a deleted file plus an untracked one. Discarding it deletes the new file and restores the old one.
- A file added with `git add --intent-to-add` is in MODIFIED. Discarding it deletes it, as deleting an untracked file does, and restores the file it was renamed from, if any.
- Deleted file: show the whole old file as removed lines.

### File sidebar (left)

- Changed files grouped as "MODIFIED FILES (17)", "UNTRACKED FILES (11)", "STAGED FILES (0)", with the number of files in each group in brackets.
- Clicking a group shows the diffs of all its files in one scrollable view, instead of file by file. Each file's coloured bar is a sticky header, so you always know which file you're looking at.
- Right-clicking a group offers:
  - MODIFIED: Stage all, Discard all
  - UNTRACKED: Stage all, Delete all
  - STAGED: Unstage all
- Right-clicking a file offers the same actions as its file bar.
- "Filter files..." input to quickly find a file.

### Confirmation

These ask for confirmation: discard hunk, discard lines, discard file, discard all, and deleting untracked files. Stage and unstage never ask, since nothing is lost.

Confirming takes no mouse movement: the clicked button turns into "Confirm discard?" (or "Confirm delete?") for about three seconds, and a second click runs it.

### Later

- Sending line comments to an agent.
- Show/hide whitespace changes.
- Keyboard shortcuts.
- Mobile.

### Out of scope

- Merge conflicts.
- Submodules.

### Open questions

- Refreshing: the agent edits the worktree while you stage. When does the view refresh, does it keep scroll position and selection, and what happens when an action targets a diff that has changed since it was shown? (Suggestion: fail and refresh, never apply a stale patch.)
- Right-click: plugins can't use DOM events directly. If right-click can't be caught, use a "⋯" button on each file and group instead?
- Mode-only changes (e.g. `chmod +x`) and huge or generated files such as lockfiles: a plain label like "Binary file", or collapsed?
- Syntax highlighting: which languages must work? Elixir and HEEx at least. Highlight the full old and new files, so hunks inside multi-line `~H"""` blocks are coloured correctly.
- Commit, history, branches, stash and push: confirm they're out of scope? (Paseo already has commit built in.)
