## Minimal usable product

Desktop only: the mobile app isn't supported for now.

### Diff view

Replicates Sublime Merge as much as possible:

- Syntax highlighted, by Paseo's own highlighter, so in the languages it knows, by the file's extension. Removed lines are highlighted as part of the old version of the file, and added and unchanged ones as part of the new, so a line inside a comment that starts lines above is a comment. Colours are those of Paseo's default syntax theme, One: One Light in a light Paseo theme, One Dark in a dark one, since plugins can't read the syntax theme chosen in Paseo's settings. A version of more than 768 KiB characters isn't highlighted, as in Paseo's own diff. A version Paseo's highlighter fails on, as its Nix grammar fails on a file ending in a backslash, shows without highlighting rather than not at all.
- In a monospace font, as Paseo's own diff, though Paseo gives plugins' text its UI font.
- Diffs come from git itself (`git diff --no-ext-diff`), honouring the user's `diff.algorithm`.
- Changed words within a line are highlighted, as in Sublime Merge, in a stronger tint of the line's red or green, as [delta](https://github.com/dandavison/delta) highlights them. In each run of changes, each removed line in turn is paired with the first added line, after the last one paired, that's similar enough to it, and only paired lines have words highlighted: a line rewritten has none, as its tint says it all changed. Two lines are aligned word by word, a word being a run of letters, digits and underscores, and any other character being one on its own, as is an emoji with its modifiers and the emoji joined to it, with what changed grouped together where that costs no more. They're similar enough if at most 60% of their text changed, counting the text they keep twice, once in each, and measuring text as a terminal shows it, without whitespace at either end of each changed or kept piece. Whitespace both lines keep right after text both changed counts as changed too. A run stops pairing its lines once the tables aligning them would have more than a million cells together, which would take too long.
- Inline and side-by-side diffs, as the diff style in Better Diff's settings says: Auto, the default, shows a diff side by side where each side has room beside its line numbers for a line of the line length set there, 80 characters unless it's changed, and inline where it hasn't. Set it to the length the code wraps at. The room is in characters of the diff font size, beside line numbers as wide as it makes them, so a larger font needs a wider diff. A line length is a whole number from 20 to 400, and anything else says so and isn't saved. One typed is saved once typing pauses, or at once on leaving the page, for every client of the host: like Paseo's own settings, the page has no Save button. In side-by-side, removals and additions are separate texts.
- Diff is shown file by file instead of as one continuously scrollable diff.
- The very top of a file's diff is a horizontal bar in the theme's greys (Sublime Merge's is deep blue, but some Paseo themes' accent colour is the green or red of added and removed lines). It shows the file's status (MODIFIED, UNTRACKED, STAGED), its full path, how many lines the diff adds and removes, as GitHub shows them after the path (+12 −3), even while it's collapsed, and the file actions on the right. A file shown without lines, such as a binary file, has no counts.
- Each hunk is delimited by a horizontal bar, as tall as the file's and fainter (Sublime Merge uses blue), with the hunk actions on the right. As in Sublime Merge, they show only while the pointer is over the hunk, its bar or its lines, focus is in its bar, or lines in it are selected. On hover, its left side shows a "Show entire file" / "Show only modified hunks" toggle, as Sublime Merge's icons: triangles pointing out from a line in a dotted frame, and pointing in to it in a solid one. Every file opens showing only modified hunks: the toggle doesn't carry over to the next file.

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
- With focus in a hunk's bar, ↓ and ↑ move focus to the next hunk or the one before, in a group's view from one file's diff to the next's, and the view shows that hunk from its start. Focus lands on its Stage Hunk button, or Unstage Hunk, so Enter stages or unstages it. ← moves focus back to its file's row in the sidebar.
- With focus in a hunk's bar, Backspace discards the hunk, or unstages it in STAGED, and Shift+Enter and Shift+Backspace stage and discard, or unstage, its whole file, as the file bar's buttons do. They do that with focus in the file bar too. Enter on its own presses the button with focus, as it does anywhere.
- Once an action on a hunk or its lines runs with focus in the hunk's bar, focus moves on to the hunk the view moves to: the one that takes its place, or else the last, or the next file's first once the file has none left. So Enter stages one hunk after another. Once an action on its file runs from there, focus moves to the next file's first hunk.

### Selecting lines

- Click and drag selects text as usual, so it can still be copied. The lines the selection touches are the selected lines.
- A selection stays within one hunk.
- In side-by-side, the selection is in whichever side has focus: removals or additions.

### Refreshing

- The view refreshes as the worktree and the index change, as an agent changes them, within a second or so, whether or not Paseo's window has focus.
- A change nothing tells of, as to a file outside the worktree that git reads, such as `core.excludesFile`, shows once Paseo's window regains focus, or within half a minute.
- Once the open file leaves its group, the view moves on to the next file in it.
- A selection of lines is cleared once their diff changes, since it can cover other lines then. In a group's view, a change to another file's diff leaves it.
- An action on a diff that changed since it was shown changes nothing, says so, and reloads the diff.
- A diff or file list that can't be read again stays shown, under why it couldn't be, as it may be out of date.

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
- Opening Better Diff opens the first file the sidebar lists, without a click: the first modified file, or else the first untracked one, or else the first staged one. With no changes it opens none, and a file changed after that waits for a click.
- Once Paseo reloads, each Better Diff tab shows what it showed: the open file or group, or the selected files as far as their group still lists them, or else the first file, as on opening Better Diff; the groups collapsed; the filter; and the file list's width.
- Group headings are in the theme's text colour, and files' paths dimmed from it as Paseo's Changes tab dims its file names, except on the open file's row, the selected files' rows, and one under the pointer or with focus in it.
- A triangle left of each group's heading collapses the group, hiding its files, and expands it again: it points right while the group is collapsed and down while it's expanded. Groups start expanded.
- Clicking a group shows the diffs of all its files in one scrollable view, instead of file by file. Each file's bar is a sticky header, so you always know which file you're looking at, and each hunk's bar stays under it while the hunk's lines scroll under them both, as it stays at the top of a file's own view. While the filter hides some of the group's files, it shows only those it lists.
- Each file's row starts with the icon Paseo's Changes tab shows the file with in its tree: Material Icon Theme's icon for its extension, in colours as muted as Paseo's, and a plain file icon for an extension Paseo has none for.
- Each file's row has its file bar's actions as icons at its end (Stage +, Unstage −, Discard ↺, Delete 🗑), over the end of its path. They show while the pointer is over the row or focus is in it, and always on the open file's row, whose actions act on the diff shown.
- Each group's heading has the actions on all its files the same way:
  - MODIFIED: Stage All, Discard All
  - UNTRACKED: Stage All, Delete All
  - STAGED: Unstage All

  They're left out while the filter hides some of the group's files, and an action on a group changes nothing, and says so, if a file has joined or left the group since it was listed.

- Shift-clicking a file selects the files from the open one to it, as in Sublime Merge, and shift-clicking another selects from the same file again. Shift+↓ and Shift+↑, with focus in a file's row, select one more file or one fewer, and focus moves along with them. A selection stays within one group: shift-clicking a file in another group opens just that file.
- ↓ and ↑, with focus in a file's row, open the next file the sidebar lists or the one before, from the last file of one group to the first of the next, and focus moves along with them. → moves focus into the file's diff, to its first hunk.
- The selected files' diffs show in one view, as a group's do, whatever the filter. Their rows show their actions always, acting on all of them as a group's actions act on all its files:
  - MODIFIED: Stage Selected, Discard Selected
  - UNTRACKED: Stage Selected, Delete Selected
  - STAGED: Unstage Selected

  An action on them changes nothing, and says so, if one has left the group since they were selected. Once some leave the group, as after staging one from its file bar, the rest stay selected.

- "Filter files..." input to quickly find a file.
- Dragging the separator between the file list and the diff resizes the file list, no narrower than 160 pixels, and leaving the diff no narrower than 240, and double-clicking it fits the list to its paths. With focus on it, → widens the list by 10 pixels and ← narrows it by 10, or by 50 with Shift.
- Right-clicking a file's row opens its menu, which closes with Escape or a click outside it:
  - Copy full path
  - Copy relative path: from the repository's root, as git status lists it.
  - Copy filename
  - Copy file contents: the file as it is in the worktree, whichever group lists it. A binary file, or one gone from the worktree, copies nothing, and says so.

### Confirmation

These ask for confirmation: discard hunk, discard lines, discard mode change, discard file, discard selected, discard all, and deleting untracked files. Stage and unstage never ask, since nothing is lost.

Confirming takes no mouse movement: the clicked button turns into "Confirm discard?" (or "Confirm delete?") for about three seconds, and a second click runs it. A key that runs the action asks the same way: its button turns into the question, and the key pressed again runs it. A key held down runs its action once, so holding Backspace doesn't confirm a discard.

### Pointer

- A button is tinted in the colour of its text or icon while the pointer is over it, and more while it's pressed. A sidebar button's icon brightens too.
- A button that asks for confirmation shows the danger colour while the pointer is over it.
- A group's triangle brightens while the pointer is over it.
- The separator between the file list and the diff shows its line in the accent colour while the pointer is over it, as it does while it's dragged or has focus.
- Once the pointer rests on a button with a keyboard shortcut for a second, the shortcut shows under it, to teach it: Enter or Backspace under a hunk's bar's buttons, Shift+Enter or Shift+Backspace under a file's bar's. On a Mac, in its symbols: ↩, ⌫, ⇧↩ and ⇧⌫.

### Font sizes

Plugins can't read Paseo's own font size settings, so the plugin has two of its own, on its page in Paseo's settings, in its menu under Settings → Plugins. They take the sizes Paseo's do:

- Diff font size, 9 to 22, 13 by default, as Paseo's code size: the diff's lines and their numbers, each line half as tall again as the font, as in Paseo's own diff.
- Panel font size, 10 to 21, 13 by default, as Paseo's interface size: the rest of the panel, its smaller text, such as buttons and headings, scaled with it as Paseo scales its own, and the files' icons in the sidebar too, as large as in Paseo's Changes tab at 14.
- A size chosen is saved at once, for every client of the host, and Better Diff panels already open follow it.
- Paseo's own sizes, under Appearance, don't change Better Diff, though its code size says it sizes diffs, while zooming Paseo in or out scales all of it, Better Diff included. So the page says so, in the info tip by its font sizes' heading.

### Later

- Sending line comments to an agent.
- Show/hide whitespace changes.
- Keyboard shortcuts for the other actions: on lines, mode changes, and in the sidebar.
- The actions of a file's and a group's buttons in right-click menus too.
- Mobile.

### Out of scope

- Merge conflicts.
- Submodules.

### Open questions

- Refreshing: does the view keep its scroll position when an agent's change moves the lines it shows?
- Syntax highlighting: which languages must work? Elixir and HEEx at least. Highlight the full old and new files, so hunks inside multi-line `~H"""` blocks are coloured correctly.
- Commit, history, branches, stash and push: confirm they're out of scope? (Paseo already has commit built in.)
