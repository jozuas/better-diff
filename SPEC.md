## Minimal usable product

Desktop only: the mobile app isn't supported for now.

Better Diff is a workspace panel, with Lucide's git-compare-arrows as its icon.

Switching back to its tab from another, as from an agent's chat, shows it as it was at once, not for a moment with the file list narrower, the diff inline where it was side by side, or a group's hunk bar out of place under its file bar.

### Diff view

Replicates Sublime Merge as much as possible:

- Syntax highlighted, by Paseo's own highlighter, so in the languages it knows, by the file's extension. Removed lines are highlighted as part of the old version of the file, by the extension of the path it was renamed from if it was, and added and unchanged ones as part of the new, so a line inside a comment that starts lines above is a comment. Colours are those of Paseo's default syntax theme, One: One Light in a light Paseo theme, One Dark in a dark one, since plugins can't read the syntax theme chosen in Paseo's settings. A version of more than 768 × 1,024 characters isn't highlighted, as in Paseo's own diff. A version Paseo's highlighter fails on, as its Nix grammar fails on a file ending in a backslash, shows without highlighting rather than not at all.
- In a monospace font, as Paseo's own diff, though Paseo gives plugins' text its UI font.
- A tab reaches the next tab stop, as in a terminal: every 8 columns, unless the tab size in Better Diff's settings is changed, to a whole number from 1 to 16. One chosen is saved at once, for every client of the host.
- Diffs come from git itself (`git diff --no-ext-diff --no-textconv`), honouring the user's `diff.algorithm`, with three lines of context around each hunk whatever `diff.context` says.
- Changed words within a line are highlighted, as in Sublime Merge, in a stronger tint of the line's red or green, as [delta](https://github.com/dandavison/delta) highlights them. In each run of changes, each removed line in turn is paired with the first added line, after the last one paired, that's similar enough to it, and only paired lines have words highlighted: a line rewritten has none, as its tint says it all changed. Two lines are aligned word by word, a word being a run of letters, digits, combining marks and connector punctuation such as underscores, and any other character being one on its own, as is an emoji with its modifiers and the emoji joined to it, with what changed grouped together where that costs no more. They're similar enough if at most 60% of their text changed, counting the text they keep twice, once in each, and measuring text as a terminal shows it, but for a tab, which counts as one column, without whitespace at either end of each changed or kept piece. Whitespace both lines keep right after text both changed counts as changed too. A run stops pairing its lines once the tables aligning them would have more than a million cells together, which would take too long.
- The spaces and tabs an added line ends with are marked in the theme's red, as Magit marks trailing whitespace by default. Removed and unchanged lines' aren't, nor is a carriage return a Windows line ending leaves at the end of a line, nor are the spaces and tabs before it.
- Inline and side-by-side diffs, as the diff style in Better Diff's settings says: Auto, the default, shows a diff side by side where each side has room beside its line numbers for a line of the line length set there, 80 characters unless it's changed, and inline where it hasn't. Set it to the length the code wraps at. The room is in characters of the diff font size, beside line numbers as wide as it makes them, so a larger font needs a wider diff. A line length is a whole number from 20 to 400, and anything else says so and isn't saved. One typed is saved once typing pauses, or at once on leaving the page, for every client of the host: like Paseo's own settings, the page has no Save button. A style chosen is saved at once. A change of the panel's width that switches between inline and side by side keeps the line at the top of the view in place. In side-by-side, removals are on the left and additions on the right, as separate texts, each side numbering its lines in its own version. A removed line paired with an added line, as for changed words, is level with it, as delta lines them up, and every other removed or added line has a row of its own, the removed ones before the added ones up to the next pair.
- Diff is shown file by file instead of as one continuously scrollable diff, but in a group's or the selected files' view, which shows all their diffs (see File sidebar).
- The very top of a file's diff is a horizontal bar in the theme's greys (Sublime Merge's is deep blue, but some Paseo themes' accent colour is the green or red of added and removed lines). It shows the file's status (MODIFIED, UNTRACKED, STAGED), its full path, how many lines the diff adds and removes, as GitHub shows them after the path (+12 −3), even while it's collapsed, and the file actions on the right. A file shown without lines, such as a binary file or a new or deleted empty file, has no counts.
- Each hunk is delimited by a horizontal bar, as tall as the file's, in the diff's own background with a thin line across its middle, as Linear's PR review separates hunks, rather than in a colour of its own, which breaks the diff up more (Sublime Merge uses blue). The first hunk's bar has no line where the hunk starts the file, as only the file's bar is above it. While the unchanged lines before the hunk, after the hunk before it, are left out, the middle of the bar says how many, as "27 unchanged lines", with Linear's icon, arrows pointing out from a line, and pressing it shows them, as Linear's does, but all at once rather than a few at a time, leaving the hunk where it was. They stay shown while the hunk under them is in the diff, as hunks above it are staged, unstaged or discarded, or lines are added or removed above it, until "Show only modified hunks". The lines after the last hunk show only with the entire file. The bar has the hunk actions on the right. As in Sublime Merge, they show only while the pointer is over the hunk, its bar or its lines, focus is in its bar, or lines in it are selected. While they show, its left side shows a "Show entire file" / "Show only modified hunks" toggle, as Sublime Merge's icons: triangles pointing out from a line in a dotted frame, and pointing in to it in a solid one. "Show entire file" shows every unchanged line, though some already show, and "Show only modified hunks", while the entire file shows, none of them. Every file opens showing only modified hunks: neither the toggle nor the unchanged lines shown carry over to the next file.

### Actions

| Diff shown          | File bar       | Hunk bar                 | Line actions               |
| ------------------- | -------------- | ------------------------ | -------------------------- |
| Modified (unstaged) | Discard, Stage | Discard Hunk, Stage Hunk | Discard Lines, Stage Lines |
| Untracked           | Delete, Stage  | Discard Hunk, Stage Hunk | Discard Lines, Stage Lines |
| Staged              | Unstage        | Unstage Hunk             | Unstage Lines              |

- Line actions are in the bar over the selected lines (see Selecting lines), while lines in a hunk are selected, rather than in the hunk's bar, so they're where the lines are.
- Staged changes can't be discarded, only unstaged.
- An untracked file's lines can be staged and discarded like a modified file's. Its one hunk is the whole file, so discarding that hunk, or all its lines, deletes the file, as Delete does.
- A partly staged file appears in both MODIFIED and STAGED. Opened from MODIFIED it shows the unstaged part, from STAGED the staged part.
- After a hunk action the view moves to the next hunk; after a file action, to the next file.
- While a file is open, the diff of the file a file action would move the view to is read too, so it shows at once after one.
- One action runs at a time: while one runs, the buttons that run actions are disabled, and a key that runs one does nothing.
- Once an action runs, the selection of lines is cleared, even if the action changed nothing.

### Selecting lines

- Click and drag selects text as usual, so it can still be copied. The lines the selection touches are the selected lines.
- Selected text is highlighted in a faint tint of the theme's text colour, rather than in the browser's own colour, which suits no theme in particular, and so are the selected lines' numbers, in the theme's text colour.
- A selection stays within one hunk.
- In side-by-side, the selection is in whichever side has focus: removals or additions.
- Right-clicking a diff's lines opens a menu in place of the page's own, which closes with Escape or a click outside it, as Linear's PR review has: while lines in their hunk are selected, those lines' actions, as the bar over them has them, and a line after them; then Comment, which starts a comment (see Review comments), and Copy, which copies the selected text, as copying it with the keyboard does, and is disabled while no text is selected. Discard Lines asks for confirmation in its place, as "Confirm discard?", and the menu stays open for it to be chosen again. It's the button the bar's Discard and Backspace press, so a press of any of them takes a press of another to confirm.
- Letting go of the pointer once it's selected text in a diff's lines shows a bar just above where it was let go, as Linear's PR review does, over the lines above, or just below it where that would cover the hunk's bar. It's over the lines of the hunk whose lines are selected, if any, as at their edge where the pointer was let go past them, in the next hunk or file, and as for a selection reaching into the hunk from the unchanged lines around it, and over all else in the view, the next hunk's or file's bar included, scrolling with the lines. Lines the keyboard selects show it too, just above the start of the text of the line the selection reaches, and it moves along as the keyboard moves the selection. It has, while lines in a hunk are selected, their actions, as the sidebar's icons, Discard as Lucide's undo-2 and Stage as plus, or Unstage as minus, and a line after them; then Comment, as a speech bubble, and Copy, as the menu's. Once the pointer rests on one for a second, its name shows above it, and for the lines' actions their key after it, as "Stage Lines ↩". Discard asks for confirmation as the sidebar's does, as "Confirm discard?" in its place, and it's the button Backspace presses with focus in the hunk's bar, so a press of either takes a press of the other to confirm. Pressing one leaves the selection, and focus, as they were. The bar goes once Comment is pressed, once the selection's cleared, as once a line action runs, or changes but as the keyboard moves it, or once the pointer is pressed in the lines again. Copy leaves it, as the lines are still selected.
- The keyboard selects lines too: see Keyboard.

### Keyboard

The panel works from the keyboard as it does with the pointer, but for review comments for now (see Later), in one way throughout: the arrows move focus from one place to the next, Enter and Backspace act on the place focus is in, and Shift widens what they act on to whole files. The keys work while focus is in the panel, and keep clear of Paseo's own: none takes Cmd or Ctrl but the find bar's ⌘F and ⌘G, or Ctrl+F elsewhere, which Paseo leaves free and other apps find with (see Find in diff), and Enter in a comment or the review's message, with Cmd or Ctrl or without, as in Paseo's agent chat input (see Review comments), and `?` shows Paseo's list of its own shortcuts. A letter's key works on any keyboard layout: on one that doesn't type Latin letters, as a Cyrillic one, it's the key where a US keyboard has the letter.

Tab reaches nothing in the panel: every action has a key of its own, and Tab moves focus on out of the panel.

#### Where focus goes

- In the sidebar: the filter, each group's heading, and each file's row while its group is expanded.
- In the diff: for each file it shows, its file bar, its mode change's bar if it has one, and each hunk's bar, so a file shown without hunks, such as a binary or collapsed one, still has its bar to go to. Focus is on the bar itself, rather than on one of its buttons.
- In a hunk: its lines, as a selection of one line or more.

#### Moving

- ↓ and ↑ move focus to the next place or the one before in the pane it's in: in the sidebar from one group to the next, and in the diff from one file to the next. Alt+↓ and Alt+↑ take bigger steps: to the next group's heading or the one before, or to the next file's bar or the one before.
- ↓ or ↑ moving focus to a file's row opens the file. Focus reaching a group's heading opens nothing: Enter opens the group.
- Holding ↓ or ↑ in the sidebar moves focus on without opening each file it passes: the file of the row focus stops at opens once the key is let go.
- Shift+↓ and Shift+↑ in a file's row select one more file or one fewer, and focus moves along with them. Escape in a selected file's row opens just that file.
- Focus reaching a bar shows it from its start: the view scrolls to the top of its hunk's lines, or of its file's diff.
- In one file's view, ↓ on the file's last bar opens the next file the sidebar lists, with focus on its file bar, and ↑ on the file bar opens the file before, with focus on its last bar. Alt+↓, and Alt+↑ on the file bar, open the next file or the one before, with focus on its file bar.
- → moves focus from a file's row into its diff, to its first hunk, or its file bar if it has none, opening the file first if the view doesn't show it, and ← from any of a file's bars back to its row, leaving a group's or the selected files' view open.
- On a group's heading, ← collapses the group and → expands it again. → on an expanded heading opens the group, with focus on its first file's first hunk, or that file's bar if it has none, once the group's view shows.
- ↑ on the first heading moves focus to the filter, and `/` does from anywhere in the panel but a text field, where it's typed. In the filter, ↓ and Enter move focus to the first file it lists, opening it, and Escape clears it, or once it's empty moves focus to the open file's row, or the open group's heading.

#### Acting

- Enter and Backspace act on the place with focus as its buttons do: Enter stages, or unstages in STAGED, and Backspace discards, or unstages in STAGED. In a hunk's bar they act on the hunk, or on its selected lines while it has any; in a mode change's bar, on the mode change; and in a file's bar, on the file.
- Shift+Enter and Shift+Backspace act on whole files: in any of a file's bars or lines, on the file, as its file bar's buttons do; in a file's row, as the row's buttons do, on the file, or on the selected files in one of their rows; and in a group's heading, as its buttons do, on all its files.
- Enter in a row or heading opens its file or group.
- Once an action on a hunk, its lines or its mode change runs with focus in its bar, focus moves on to the hunk the view moves to: the one that takes its place, or else the last, or the next file's first once the file has none left, or that file's bar if it has no hunks. So Enter stages one hunk after another. Once an action on a file runs from one of its bars, focus moves the same way to the next file's first hunk. Once one runs from a row or a heading, focus moves to the row of the file the view moves on to, or while it moves on to none, as once no file is left or in a group's view, which stays on its group, to the row or heading that takes its place in the sidebar.
- A discard asks for confirmation as its button does (see Confirmation), and Escape takes the question back.

#### Lines

- → on a hunk's bar selects the hunk's first changed line, on the side it's on, side by side.
- ↓ and ↑ then select the next line or the one before instead, and past either end of the hunk, the first line of the next hunk or the last of the one before. Shift+↓ and Shift+↑ select one more line or one fewer, within the hunk. The view scrolls to show the line moved to.
- Side by side, → and ← move the selection to the line level with it on the other side, or the nearest one there.
- ←, from the removals' side or inline, and Escape clear the selection and move focus back to the hunk's bar.
- Pressing the pointer on a hunk's lines moves focus to the hunk's bar once it's let go, and so does selecting lines with it, to their hunk's bar, so the keys act on the hunk, or on the lines. Once the pointer clears the selection, the keys act on the hunk again.

#### Showing more

- E in a hunk's bar or lines shows the entire file, or only the modified hunks again, as the hunk's toggle does. In a collapsed file's bar it shows the diff, as Show diff does.

#### Menus

- The menu key, or Shift+F10, opens the menu of the file whose row has focus. ↓ and ↑ move between its items, Enter chooses one, and Escape closes it. Either way, focus goes back to the row.

#### Getting there, and learning the keys

- Better Diff in Paseo's command center opens the panel with focus in the open file's row, or the open group's heading, and so does opening the panel some other way, unless focus is in a text field then, as in a message being written, or already in the panel.
- Once the pointer rests on a button for a second, its key shows under it, to teach it: Enter under a hunk's or a mode change's Stage or Unstage, and Backspace under their Discard, and above the selected lines' after their names, in the bar over them (see Selecting lines), Shift+Enter or Shift+Backspace likewise under a file's or a group's, and E under the hunk's toggle and a collapsed diff's Show diff. On a Mac, in its symbols: ↩, ⌫, ⇧↩ and ⇧⌫. Only the pointer shows them, not focus resting on a bar.
- Better Diff's settings page lists the keys, but Enter in a row or a heading and Enter and Escape in a file's menu, which work as they do on any button and menu, and a comment's and the review's keys.

### Find in diff

Paseo's desktop app has no find of its own, and a browser's would search the whole page, and not the lines the view hasn't rendered yet, so the panel has one.

- ⌘F on a Mac, Ctrl+F elsewhere, with focus anywhere in the panel, as after a click in it, the filter included, opens a find bar under the diff, with focus in its "Find in diff" input. Pressed while it's open, it moves focus back to the input and selects what's typed.
- It finds what's typed in the text of the lines the view shows: the open file's diff, or in a group's or the selected files' view, all of their diffs, in the order they show. Not in line numbers, bars or labels. While a file shows only its modified hunks, only the hunks' lines and the unchanged lines shown around them, and while it shows the entire file, all of them. A collapsed diff's lines aren't searched until "Show diff" shows them, and the bar says how many collapsed files it left out: "1 collapsed file not searched".
- Smart case, as in ripgrep: what's typed matches whatever the case, unless it has a capital letter, when it matches only that case. The bar's "Aa" button, Match case, or Alt+C in the find bar, makes it match only the case typed, capital letters or not. What's typed and Match case stay as they are as other files and groups open.
- Each match is highlighted in the theme's warning colour, and the current one more strongly. The bar shows which match is current, of how many: "3 of 17", or "No results".
- Typing makes the current match the first at or after the one that was, while it's in view, so refining what's typed stays where it is. Otherwise, as with none, or once it's scrolled out of view, it's the first at or after the line at the top of the view, so typing finds where the view is.
- Enter and Shift+Enter in the find bar, its ↓ and ↑ buttons, and ⌘G and ⇧⌘G on a Mac, F3 and Shift+F3 elsewhere, with focus anywhere in the panel while the find bar is open, move to the next match or the one before, from the last round to the first. A match that becomes current scrolls to the middle of the view, unless it's shown already, and the file shows more of its entire file first if it has to.
- Escape in the find bar, or its × button, closes it and clears the highlights, and focus goes back where it was before it opened. What's typed stays: opened again, the bar shows it selected, and the current match is the first at or after the line at the top of the view.
- Keys in the find bar only find: Enter doesn't stage there, nor Backspace discard. Its buttons' keys show under them once the pointer rests on them, as other buttons' do, and Better Diff's settings page lists them with the others.
- As the diff changes, its highlights follow, and the current match is the first at or after where it was, without scrolling the view. Once another file or group opens, its first match is current.

### Review comments

As in Paseo's own diff, lines are commented on, and the comments sent to an agent in the workspace. Like a GitHub review's, a comment is pending until the review is sent, and the review is looked over, as GitHub's "Finish your review" does, before it is.

- While the pointer is over a hunk's line, or an unchanged line outside the hunks while it shows, a button at the start of its numbers, a speech bubble, as Lucide's message-circle, which Linear's PR review has rather than GitHub's +, starts a comment on it, clear of its text, where a selection starts. So does Comment in the menu the lines' right click opens, on the line right-clicked, and Comment in that menu or in the bar a selection shows starts one on the selected lines while some of the hunk's are selected: from the first of them that can be commented on to the last, under which it's written, as Linear and GitHub write a comment on several lines. Inline, it starts on the side the last is on where the first has that side, as an unchanged line does, and else on the first's own, so a comment from a removed line to an added one starts in HEAD and ends in the worktree, as GitHub's can. Where that's one line, as for text selected in one, it's a comment on that line. Comment is disabled in the menu, and isn't in the bar, where that's no line that can be commented on, as for a selection only of unchanged lines outside the hunks, which a selection leaves out of the lines it selects, and starting a comment from either clears the selection. The comment is on the line as the review the agent reads numbers it (see below): in HEAD for a removed line, and in the worktree for any other, or side by side, in HEAD on the old side and in the worktree on the new one. Inline, an unchanged line the worktree hasn't, as one staged and then removed, is commented on in HEAD. A line only the index has, staged and then changed in the worktree, has no comment button, and nor has a side of a line, side by side, that the review's version of that side hasn't: the agent couldn't find it. The comment is written in a box under the line, and saved with Comment, or Enter, with Cmd or Ctrl or without, as Paseo's agent chat input sends a message, unless it's only whitespace, or left with Cancel or Escape. Shift+Enter starts a new line, and Enter that picks what an input method composes, as for Japanese, only picks it. Paseo's Send shortcut setting doesn't change this, as plugins can't read it. One comment is written at a time. What's written of it stays as its file changes, under the line that then has its number.
- A press in a comment, or under a line among its comments, is theirs rather than the lines': focus stays in a box a comment is written in, rather than moving to the hunk's bar, and a right click opens the page's own menu, which pastes, rather than the lines' menu.
- A comment saved is pending: it shows under its line, marked Pending, with buttons that edit it and delete it. One on several lines says which they are before Pending, and while it's written, as Linear does: "Lines 45–51", numbered as the review the agent reads numbers them, or with each one's side where the first and last are on different sides, as GitHub writes "Lines −44 to +51". A line can have several. Inline, an unchanged line shows the comments made on either of its sides side by side.
- Staging and unstaging change neither HEAD nor the worktree, so a comment stays on its line as its file's hunks are staged and unstaged, by Better Diff or anything else, and shows under it in whichever of the file's diffs has it: MODIFIED's or STAGED's, or both.
- A run of unchanged lines outside the hunks with a line commented on, or one being written under, shows whether or not it's been asked to, as once Paseo reloads, or the file's opened again, so the comment shows under its line, and the review can show it there. Showing only the hunks again leaves it shown.
- Each file's row in the sidebar says how many comments are pending on the file, after its path, in MODIFIED and STAGED alike for a partly staged file.
- Pending comments, and the review's message, are kept in the tab, as what it shows is once Paseo reloads, and while any comments are, the tab shows it has unsaved work, and asks before it's closed.
- While comments are pending, a bar under the diff has Review, with how many are pending, as "Review (3)", which opens the review above it, until it's closed, with Escape or a click outside it. Escape in a comment being edited in it leaves the comment, and the review stays open. In it:
  - A message for the agent, empty at first, which the review asks the agent instead of "Please address this code review.", as Paseo's own diff asks it, while it says anything. Enter in it does what Send feedback does, and Shift+Enter starts a new line, as in a comment.
  - The comments pending, under the files they're on, each by path, and each file's in the order of their lines in its unstaged diff and then in its staged one, as they are now: where both have a line, the one that changes it, and last those whose line neither has now. Each shows its line's number there, marked as removed or added, or for one on several lines, their numbers as it says them, and as staged if it's the staged diff, and the line it's under, or that neither diff has it now, and what the comment says, with buttons that edit it there and delete it. A comment whose line a diff has, of a file a group lists, closes the review and opens that diff when pressed, which scrolls to show it, and it stands out for a moment.
  - Send feedback, which asks which agent to send the review to, from a menu above it of the workspace's agents as they are when it opens, rather than sending it to one the review picks, as an agent at work on something else would get it in the middle of what it's doing. Those not at work come first, each with how long ago it was last active, as "Just now" under a minute, and else in whole minutes, hours or days, as "5m ago", "3h ago" or "2d ago", or marked Error where its last turn failed. Then, after a line, those taking a turn, marked Working, or Needs permission while the turn waits for permission to go on, and last, after a line, those whose provider is unavailable, marked Unavailable, which can't be chosen. Each section is in the order they were last active, most recently first, each agent by its title, or its provider while it has none, cut short where the menu hasn't room for it. Last, after a line, New agent, with the provider and model it starts with, as Paseo writes them, as "claude/opus", starts a new agent in the workspace and sends it the review, as its first message. It starts as the agent last active in the workspace was started, or else the one last active on the host, of those whose provider is available: with its provider and model, its mode and its thinking option. Focus goes to the first, ↓ and ↑ move it, Enter chooses one, and Escape leaves the menu for the review. The workspace's agents are those not archived, other than Paseo's own internal ones: plugins can't tell which have tabs open, as Paseo's own diff does. Without an agent in the workspace, New agent is the menu's only item, and without one on the host either, the review says to start one, and can't be sent.
  - The review goes to the agent chosen as Paseo's own diff sends it: the message with a review attachment, of each comment with its file, side, line number and the lines of its hunk up to three either side, from the diffs as they are then. The comments are in the order the review lists them, rather than the order they were made in, so the agent reads each file's together, in the order of their lines, and the comments it numbers are in the order they were looked over in. The attachment has a comment on one line, so one on several is sent on the last of them, the one marked among the lines sent with it, with its hunk's lines from three before the first to three after the last, and what it says is sent after which lines it's on, as "Lines 45–51: Why both?". Where that diff's hunk hasn't the first before the last, as once the file's changed, it's sent with the lines around the last. An agent at work gets it in the turn it's taking, without the turn being stopped, as Paseo's own diff gives it by default. While it's being sent, Send feedback reads "Sending feedback", it and Discard review are disabled, and Enter does nothing, though the review is closed and opened again.
  - Discard review, which deletes the comments pending, and the message, and asks for confirmation as discarding changes does.
- The review sent is of the worktree's uncommitted changes, as Paseo's own diff's is, from HEAD to the worktree, so its lines are numbered as HEAD and the worktree number them, not as the index does. While Hide whitespace is on, the diffs the review lists and sends hide whitespace changes too, as the panel's do. A partly staged file's staged diff goes to the index and its unstaged diff from it, so a line there is numbered as its other diff has it in HEAD or the worktree, and so is its hunk's header. A comment's line is sent with the lines around it in the diff that changes it, where both diffs have it. A comment on an unchanged line outside the hunks is sent with up to three of the unchanged lines either side of it, of those between the hunks around it, under a header of those lines, as git writes a hunk's, so the review lists and sends the diffs with every line of their files.
- Comments sent are no longer pending, and the message is empty again, unless it was changed while they were sent. One edited while it was sent stays pending, as what it says now wasn't sent, and so does one made then.
- Once a review's sent, the bar under the diff has Restore sent review, beside Review while comments are still pending, until another comment's started, or Paseo reloads. It makes the comments sent pending again, after any pending, and the message they were sent with the review's message again, unless that says something now, so the review can be sent to another agent, as when it went to the wrong one.
- A comment isn't sent, and stays pending, whose line neither of its file's diffs has now, or whose file's diffs can't be read. The message that says who the others were sent to says how many weren't, and why. Without one to send, nothing is sent, and it says so, and why.

### Whitespace changes

- A "Hide whitespace" switch in Better Diff's settings hides changes only to whitespace, as `git diff --ignore-all-space` hides them, and as lazygit does: a line whose only change is to whitespace shows unchanged, as the new version has it, and a hunk with no other changes doesn't show. The counts on the file bar are of the lines shown.
- It's off by default. Switched, it's saved at once, for every client of the host, and Better Diff panels already open follow it, keeping the line at the top of the view where it was, or the next line the diff still shows.
- Hunk and line actions act only on the changes shown, as in lazygit and Magit: changes only to whitespace stay as they are. File actions, and actions on a group or on the selected files, act on all of each file's changes, as they include a mode change.
- Where hiding whitespace changes lines the versions up differently from git's full diff, so that acting on a hunk or the selected lines would make other changes than the ones shown, the action changes nothing, and says to turn off Hide whitespace in Better Diff's settings to act on those lines.
- A file whose only changes are to whitespace shows "Only whitespace changes" instead of its diff, and its file actions stage, unstage or discard them.

### Refreshing

- The view refreshes as the worktree and the index change, as an agent changes them, within a second or so, whether or not Paseo's window has focus. While changes keep coming, `git status` runs a tenth of the time at most, so where it's slow, the view refreshes less often.
- A change nothing tells of, as to a file outside the worktree that git reads, such as `core.excludesFile`, shows once Paseo's window regains focus, or within half a minute, or where `git status` is slow, within a minute.
- Once the open file leaves its group, the view moves on to the next file in it, or once it was the last, to the one before it. Only to one the filter shows, but whether the group is collapsed or not: the filter picks the files being worked on, while collapsing only tidies the sidebar. With none left, it moves on to the first file the sidebar lists in a group below, so staging one file after another goes on from MODIFIED to UNTRACKED and then to STAGED, or else to the first file it lists, as on opening Better Diff, and once it lists none, to none.
- As an agent's change adds or removes lines above the line at the top of the view, in its file's diff or, in a group's view, in the diffs and files above it, that line stays in place. Once that line is gone, the line that takes its place is there instead: as many lines into those that replace the lines around it, or else the next line. A change of more than 1,000 lines added and removed at once isn't followed.
- A selection of lines is cleared once their diff changes, since it can cover other lines then. In a group's view, a change to another file's diff leaves it.
- An action on a diff that changed since it was shown changes nothing, says so, and reloads the diff.
- A diff or file list that can't be read again stays shown, under why it couldn't be, as it may be out of date.

### Special file states

- No changes: show "No changes".
- Binary file, symlink, or a file that's become a symlink or stopped being one: show "Binary file" or "Symlink" instead of the diff.
- Mode change (e.g. `chmod +x`): handled as Magit handles it. A bar like a hunk's, under the file bar, shows the old and new mode, with its own actions: Discard Mode Change and Stage Mode Change, or Unstage Mode Change. Hunk and line actions leave the mode change alone, as in Magit and lazygit, and file actions include it. A file whose only change is its mode shows just that bar.
- Renamed file: the file bar shows the path it was renamed from, and the diff shows its other changes, or "Renamed" if it has none. Its lines can be staged, unstaged and discarded like any file's; staging one, or its mode change, stages the rename too. Unstaging the file unstages only the new file, and leaves the old one's deletion staged, while Unstage All and Unstage Selected unstage both.
- A file moved without git (a plain `mv`) is a renamed file in MODIFIED, as `git status` shows it once the new file is added with `--intent-to-add`, not a deleted file plus an untracked one. Discarding it deletes the new file and restores the old one.
- A file added with `git add --intent-to-add` is in MODIFIED. Discarding it deletes it, as deleting an untracked file does, and restores the file it was renamed from, if any.
- Deleted file: show the whole old file as removed lines.
- New or deleted empty file: show "Empty file".
- A file in a directory that's become a symlink is a deleted file, as `git status` shows it: git never looks beyond a symlink. The symlink in the directory's place is an untracked file until it's staged. It can be staged and unstaged, whole or in part. Discarding it puts the directory back in place of the symlink, as `git restore` does. Discarding a hunk or lines changes nothing, and says why: git won't write a file beyond a symlink, so `git restore -p` and Magit refuse to as well.
- Generated file, and a diff of more than 1,000 changed lines: collapsed, as GitHub collapses them, to "Generated file" or "Large diff" and a "Show diff" button. Its file actions work while it's collapsed. A file is generated if its `linguist-generated` attribute is set, as on GitHub, or, where the attribute isn't specified, if it's a lockfile such as `package-lock.json` or `mix.lock`.

### File sidebar (left)

- Changed files grouped as "MODIFIED FILES (17)", "UNTRACKED FILES (11)", "STAGED FILES (0)", with the number of files in each group in brackets, and while the filter hides some of a group's files, how many it lists of them: "MODIFIED FILES (2 of 17)". A group without files shows "No changes" when it's opened.
- Opening Better Diff opens the first file the sidebar lists, without a click: the first modified file, or else the first untracked one, or else the first staged one. With no changes it opens none, and a file changed after that waits for a click.
- Once Paseo reloads, each Better Diff tab shows what it showed: the open file or group, or the selected files as far as their group still lists them, or else the first file the sidebar lists, as on opening Better Diff, under the filter it kept and but for the groups it kept collapsed, and none while it lists none; the groups collapsed; the filter; and the file list's width.
- Group headings are in the theme's text colour, and files' paths dimmed from it as Paseo's Changes tab dims its file names, except on the open file's row, the selected files' rows, and one under the pointer or with focus in it.
- A triangle left of each group's heading collapses the group, hiding its files, and expands it again: it points right while the group is collapsed and down while it's expanded. Groups start expanded.
- Clicking a group shows the diffs of all its files in one scrollable view, instead of file by file. Each file's bar is a sticky header, so you always know which file you're looking at, and each hunk's bar stays under it while the hunk's lines scroll under them both, as it stays at the top of a file's own view. While the filter hides some of the group's files, it shows only those it lists.
- Each file's row starts with the icon Paseo's Changes tab shows the file with in its tree: Material Icon Theme's icon for its extension, in colours as muted as Paseo's, and a plain file icon for an extension Paseo has none for.
- Each file's row has its file bar's actions as icons at its end (Stage +, Unstage −, Discard ↺, Delete 🗑), over the end of its path. They show while the pointer is over the row or focus is in it, and always on the open file's row, whose actions act on the diff shown.
- Each group's heading has the actions on all its files the same way:
  - MODIFIED: Discard All, Stage All
  - UNTRACKED: Delete All, Stage All
  - STAGED: Unstage All

  They're left out while the filter hides some of the group's files, or it has none, and an action on a group changes nothing, and says so, if a file has joined or left the group since it was listed.

- Shift-clicking a file selects the files from the open one to it, as in Sublime Merge, and shift-clicking another selects from the same file again. A selection stays within one group: shift-clicking a file in another group opens just that file.
- The selected files' diffs show in one view, as a group's do, whatever the filter. Their rows' actions act on all of them, as a group's actions act on all its files:
  - MODIFIED: Discard Selected, Stage Selected
  - UNTRACKED: Delete Selected, Stage Selected
  - STAGED: Unstage Selected

  As in VS Code's Source Control view, they show always only on the row of the file the selection reaches, the one shift-clicked or reached with Shift+↓ or Shift+↑, and on another selected file's row while the pointer is over it or focus is in it. An action on them changes nothing, and says so, if one has left the group since they were selected. Once some leave the group, as after staging one from its file bar, the rest stay selected.

- "Filter files..." input to quickly find a file: it lists only the files whose paths have what's typed in them, whatever its case, and a × button clears it.
- Dragging the separator between the file list and the diff resizes the file list, no narrower than 160 pixels, and leaving the diff no narrower than 240, and double-clicking it fits the list to its rows and headings, with room for the buttons beside them.
- Right-clicking a file's row opens its menu, which closes with Escape or a click outside it. Each item has an icon before it, and a line parts the copy items from the ignore items:
  - Copy full path
  - Copy relative path: from the repository's root, as git status lists it.
  - Copy filename
  - Copy file contents: the file as it is in the worktree, whichever group lists it, and of a symlink, the path it points to, as git stores it. A binary file, one larger than 10 MB, or one gone from the worktree, copies nothing, and says so.

  An untracked file's menu also has the places a rule ignoring it can go: see Ignoring files.

### Ignoring files

As in Magit's gitignore menu (`i`), an untracked file's menu has the places a rule ignoring it can go:

- Ignore in .gitignore: the `.gitignore` at the repository's root, which other clones share.
- Ignore in a subdirectory's .gitignore: that of one of the directories the file is in, which other clones share, picked next under "Limit rule to files in", the file's own directory first. A file at the root has none.
- Ignore privately (.git/info/exclude): this clone's, which all of its worktrees read.
- Ignore in all repositories: the file `core.excludesFile` names, which the item shows. While it isn't set, the item is disabled and says so.

Picking one asks for the file or pattern to ignore, as Magit does. Enter or the Ignore button adds the rule, and Escape, Cancel or a click outside closes it without adding one:

- Under the field are the candidates Magit offers, from the rule's directory, sorted: each untracked file under it as `/path`, each directory under it git status lists as untracked, which has no tracked files, as `/dir/`, and for each file with an extension, `*.ext`, and `/dir/*.ext` for one in a subdirectory. Typing shows only those with what's typed in them. At most 100 show, and then how many more there are. Clicking one adds it.
- With nothing typed, Enter adds the default, which the field shows as its placeholder: the file, as `/path`.
- A candidate escapes what a pattern would read as more than the name, as `*`, `?`, `[`, `\`, and spaces at its end, so it ignores the name it shows, and only that. A newline or carriage return, which a rule can't have, is `?`. What's typed goes in as it is. (Magit adds paths as they are, and doubles the backslashes in a rule.)
- The rule goes on a line of its own at the end of the file, which is made, with its directories, if it isn't there. A `.gitignore` is then staged, as Magit stages it, unless it's ignored itself, which git won't stage.
- The view refreshes at once.

### Confirmation

These ask for confirmation: discard hunk, discard lines, discard mode change, discard file, discard selected, discard all, deleting untracked files, and discard review. Stage and unstage never ask, since nothing is lost.

Confirming takes no mouse movement: the clicked button turns into "Confirm discard?" (or "Confirm delete?") for about three seconds, and a second click runs it. A key that runs the action asks the same way: its button turns into the question, and the key pressed again runs it. A key held down runs its action once, so holding Backspace doesn't confirm a discard. Pressing another action's button in the diff or the sidebar takes the question back.

### Pointer

- A button is tinted in the colour of its text or icon while the pointer is over it, and more while it's pressed. A button with text in the theme's own text colour is tinted faintly even while the pointer isn't over it, as Paseo fills its buttons. An icon button's icon brightens too.
- A button that asks for confirmation shows the danger colour while the pointer is over it, and is filled with it while it asks.
- A group's triangle brightens while the pointer is over it.
- The separator between the file list and the diff shows its line in the accent colour while the pointer is over it, as it does while it's dragged.

### Font sizes

Plugins can't read Paseo's own font size settings, so the plugin has two of its own, on its page in Paseo's settings, in its menu under Settings → Plugins. They take the sizes Paseo's do:

- Diff font size, 9 to 22, 13 by default, as Paseo's code size: the diff's lines and their numbers, each line half as tall again as the font, as in Paseo's own diff, and what comments say, under their lines, in the review and while they're written: a little larger, 14 at 13, as Paseo's interface font's letters are narrower than the diff's monospace ones, so they look as large.
- Panel font size, 10 to 21, 13 by default, as Paseo's interface size: the rest of the panel, its smaller text, such as buttons and headings, scaled with it as Paseo scales its own, and the files' icons in the sidebar too, as large as in Paseo's Changes tab at 14.
- Buttons, the sidebar's rows, menus' items and text boxes scale with the panel font size too, roomier than Paseo's own, as Linear sizes its, so they're easy to hit and read. At 14, a button is 28 pixels tall, with 12 either side of its label, or square, with an icon of 16, and a row 32. A menu's item is highlighted short of the menu's edges.
- A line's comment button is as tall as the line, its speech bubble as large to the diff font size as a button's icon is to the panel font size, so the two match at the same sizes. A comment's Pending mark, a pill, and the lines it's on are as large as a button's label, and the count of comments after a file's path in the sidebar as large as the path, with an icon as large as a button's.
- A size chosen is saved at once, for every client of the host, and Better Diff panels already open follow it.
- Paseo's own sizes, under Appearance, don't change Better Diff, though its code size says it sizes diffs, while zooming Paseo in or out scales all of it, Better Diff included. So the page says so, in the info tip by its font sizes' heading.

### Later

- Keys for review comments: starting one on a line, editing and deleting one, and opening, sending and discarding the review. Writing one has its keys already (see Review comments).
- Mobile.

### Out of scope

- Merge conflicts: a file with them shows "Merge conflicts" instead of its diff.
- Submodules.

### Open questions

- HEEx: Paseo's highlighter knows Elixir (`.ex`, `.exs`) but not HEEx, so a `.heex` file shows without highlighting.
- Commit, history, branches, stash and push: confirm they're out of scope? (Paseo already has commit built in.)
