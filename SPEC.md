## Minimal usable product

Desktop only: the mobile app isn't supported for now.

### Diff view

Replicates Sublime Merge as much as possible:

- Syntax highlighted.
- Diffs come from git itself (`git diff --no-ext-diff`), honouring the user's `diff.algorithm`.
- Changed words within a line are highlighted, as in Sublime Merge.
- Inline and side-by-side diffs (+ a button). In side-by-side, removals and additions are separate texts.
- Diff is shown file by file instead of as one continuously scrollable diff.
- The very top of a file's diff is a horizontal coloured bar (Sublime Merge uses deep blue). It shows the file's status (MODIFIED, UNTRACKED, STAGED), its full path, how many lines the diff adds and removes, as GitHub shows them after the path (+12 −3), even while it's collapsed, and the file actions on the right. A file shown without lines, such as a binary file, has no counts.
- Each hunk is delimited by a horizontal coloured bar (Sublime Merge uses blue), with the hunk actions on the right. As in Sublime Merge, they show only while the pointer is over the hunk, its bar or its lines, focus is in its bar, or lines in it are selected. On hover, its left side shows a "Show entire file" / "Show only modified hunks" toggle. Every file opens showing only modified hunks: the toggle doesn't carry over to the next file.

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
- Mode change (e.g. `chmod +x`): handled as Magit handles it. A bar like a hunk's, under the file bar, shows the old and new mode, with its own actions: Discard Mode Change and Stage Mode Change, or Unstage Mode Change. Hunk and line actions leave the mode change alone, as in Magit and lazygit, and file actions include it. A file whose only change is its mode shows just that bar.
- Renamed file: the file bar shows the path it was renamed from, and the diff shows its other changes, or "Renamed" if it has none. Its lines can be staged, unstaged and discarded like any file's; staging one stages the rename too. Unstaging the file unstages only the new file, and leaves the old one's deletion staged.
- A file moved without git (a plain `mv`) is a renamed file in MODIFIED, as `git status` shows it once the new file is added with `--intent-to-add`, not a deleted file plus an untracked one. Discarding it deletes the new file and restores the old one.
- A file added with `git add --intent-to-add` is in MODIFIED. Discarding it deletes it, as deleting an untracked file does, and restores the file it was renamed from, if any.
- Deleted file: show the whole old file as removed lines.
- Generated file, and a diff of more than 1,000 changed lines: collapsed, as GitHub collapses them, to "Generated file" or "Large diff" and a "Show diff" button. Its file actions work while it's collapsed. A file is generated if its `linguist-generated` attribute is set, as on GitHub, or, where the attribute isn't specified, if it's a lockfile such as `package-lock.json` or `mix.lock`.

### File sidebar (left)

- Changed files grouped as "MODIFIED FILES (17)", "UNTRACKED FILES (11)", "STAGED FILES (0)", with the number of files in each group in brackets.
- A triangle left of each group's heading collapses the group, hiding its files, and expands it again: it points right while the group is collapsed and down while it's expanded. Groups start expanded.
- Clicking a group shows the diffs of all its files in one scrollable view, instead of file by file. Each file's coloured bar is a sticky header, so you always know which file you're looking at. While the filter hides some of the group's files, it shows only those it lists.
- Each file's row has its file bar's actions as icons at its end (Stage +, Unstage −, Discard ↺, Delete 🗑), over the end of its path. They show while the pointer is over the row or focus is in it, and always on the open file's row, whose actions act on the diff shown.
- Each group's heading has the actions on all its files the same way:
  - MODIFIED: Stage All, Discard All
  - UNTRACKED: Stage All, Delete All
  - STAGED: Unstage All

  They're left out while the filter hides some of the group's files, and an action on a group changes nothing, and says so, if a file has joined or left the group since it was listed.

- "Filter files..." input to quickly find a file.
- Right-clicking a file's row opens its menu, which closes with Escape or a click outside it:
  - Copy full path
  - Copy relative path: from the repository's root, as git status lists it.
  - Copy filename
  - Copy file contents: the file as it is in the worktree, whichever group lists it. A binary file, or one gone from the worktree, copies nothing, and says so.

### Confirmation

These ask for confirmation: discard hunk, discard lines, discard mode change, discard file, discard all, and deleting untracked files. Stage and unstage never ask, since nothing is lost.

Confirming takes no mouse movement: the clicked button turns into "Confirm discard?" (or "Confirm delete?") for about three seconds, and a second click runs it.

### Later

- Sending line comments to an agent.
- Show/hide whitespace changes.
- Keyboard shortcuts.
- The actions of a file's and a group's buttons in right-click menus too.
- Mobile.

### Out of scope

- Merge conflicts.
- Submodules.

### Open questions

- Refreshing: the agent edits the worktree while you stage. When does the view refresh, does it keep scroll position and selection, and what happens when an action targets a diff that has changed since it was shown? (Suggestion: fail and refresh, never apply a stale patch.)
- Syntax highlighting: which languages must work? Elixir and HEEx at least. Highlight the full old and new files, so hunks inside multi-line `~H"""` blocks are coloured correctly.
- Commit, history, branches, stash and push: confirm they're out of scope? (Paseo already has commit built in.)
