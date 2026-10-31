---
name: paseo-ui
description: Try the plugin in Paseo's real UI in a headless browser, against a Paseo daemon of this checkout's own. Open its screens, click through them, read the page and take screenshots. Use after changing client code, before saying a UI change works, or when asked to check, try or screenshot the UI.
---

# Trying the plugin in Paseo's UI

Paseo's daemon can serve the app as a web page. `paseo-ui.sh` runs a daemon for this checkout alone, with this checkout's plugin installed, and `playwright-cli` drives a headless browser against it. The user's own Paseo isn't touched.

## Start it

```bash
.claude/skills/paseo-ui/paseo-ui.sh start
```

It prints the app's `url` and the daemon's `server` ID. Run it again after each change: it reloads the plugin, and an open page picks the change up without reloading.

`.claude/skills/paseo-ui/paseo-ui.sh paseo <command>` runs any `paseo` command against this daemon, such as `plugin logs better-diff` for the plugin's output. `.claude/skills/paseo-ui/paseo-ui.sh stop` stops it when you're done.

## Give it a repository

Make a git repository in a temporary directory with the state the screen needs: staged, unstaged and untracked changes, and the content diffs break on, such as a missing final newline, CRLF, non-UTF-8 bytes and awkward paths. Then open it as a workspace, which prints its ID:

```bash
.claude/skills/paseo-ui/paseo-ui.sh paseo workspace create --isolation local --path <repo> --json
```

## Drive it

```bash
# Load the app first: a fresh browser sent straight to a deep link lands on /open-project.
playwright-cli open <url>
playwright-cli goto <url>h/<server>/workspace/<workspace>
playwright-cli goto <url>h/<server>/plugin/better-diff/surface/<screen id>
# The page's accessibility tree, with a ref for each element.
playwright-cli snapshot
playwright-cli click "getByRole('button', { name: 'Stage hunk' })"
playwright-cli find "Hello, Paseo!"
# Then Read the file to look at it.
playwright-cli screenshot --filename=.playwright-cli/staged.png
playwright-cli console warning
playwright-cli close
```

A command returns as soon as it has acted, before the app re-renders. Wait for what you expect before checking for it:

```bash
playwright-cli run-code "async page => { await page.getByText('Hello, Paseo!').waitFor() }"
```

- Find elements by role and accessible name. React Native's `accessibilityRole` and `accessibilityLabel` become them, so give every control both. An element without them is also hard to pick out in a snapshot.
- Check what an action did to the repository, not only what the screen shows, such as `git -C <repo> diff --cached` after staging.
- Save screenshots under `.playwright-cli/`, which git ignores. A bare `--filename` lands in the current directory.
- The browser gets the light theme. For the dark one: `playwright-cli run-code "async page => { await page.emulateMedia({ colorScheme: 'dark' }) }"`.

The first line of `playwright-cli --help` names its full skill file, for anything this doesn't cover.
