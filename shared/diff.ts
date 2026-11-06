import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const index = z.int().nonnegative();

// Characters of a line that Paseo's syntax highlighter gives one style, such as "keyword", or none:
// how many, as JavaScript counts a string's length, and the style.
const run = z.tuple([z.int().positive(), z.string().nullable()]);

// The runs that make up a line, highlighted as part of the whole version it's in: for a removed line
// the version the diff goes from, and for any other the one it goes to. None for a version in a
// language the highlighter doesn't know, or too long to highlight.
const runs = z.array(run);

// Whether to hide changes only to whitespace, as `git diff --ignore-all-space` hides them: a line
// whose only change is to whitespace is unchanged, as the new version has it.
const hideWhitespace = z.boolean().optional();

const diff = z.object({
  // Changes whenever the diff does, so an action can tell the diff it was chosen from is out of
  // date, and with whitespace changes hidden or shown, which shows other lines.
  version: z.string(),
  // Text, which has hunks unless the file is new or deleted and empty, or a change shown without
  // lines: none, a rename on its own, a symlink's, a binary file's, a mode change on its own, or a
  // file with merge conflicts. A file that became a symlink, or stopped being one, is a symlink's.
  // A renamed file with other changes is what they are. With whitespace changes hidden, a text diff
  // whose changes to lines are all to whitespace is a whitespace one, without lines.
  kind: z.enum([
    "text",
    "unchanged",
    "renamed",
    "symlink",
    "binary",
    "mode",
    "unmerged",
    "whitespace",
  ]),
  // The path the file had before the side's changes, if they rename it. On the unstaged side,
  // that's a deleted file git pairs with an untracked one, which isn't then listed as untracked.
  renamedFrom: z.string().optional(),
  // The file's mode before and after the side's changes, if they change it, as git prints them,
  // such as 100644 and 100755 for a file made executable.
  mode: z.object({ old: z.string(), new: z.string() }).optional(),
  // Why a text diff's hunks and contents are left out, as GitHub leaves them out: the file is
  // generated, such as a lockfile, or the diff changes more lines than a view shows quickly.
  collapsed: z.enum(["generated", "large"]).optional(),
  // How many lines the hunks add and remove, as `git diff --numstat` counts them, collapsed or
  // not.
  added: index,
  removed: index,
  hunks: z.array(
    z.object({
      oldStart: index,
      newStart: index,
      lines: z.array(
        z.object({
          kind: z.enum(["context", "removed", "added"]),
          text: z.string(),
          // False only for a file's last line, when the file doesn't end with a newline.
          newline: z.boolean(),
          runs,
        }),
      ),
    }),
  ),
  // Every line of the version a text diff goes to, the hunks' and the unchanged ones around them,
  // as the hunks' lines have them, where they're asked for. None for a diff of another kind, or a
  // version without the file. Only removed lines are shown from the version the diff goes from,
  // and the hunks have them all.
  contents: z.array(z.object({ text: z.string(), runs })),
});

export const diffRpc = defineRpc({
  name: "diff.read",
  input: z.object({
    directory: z.string(),
    path: z.string(),
    // Unstaged: from the index to the worktree, where an untracked file is new. Staged: from HEAD
    // to the index.
    side: z.enum(["unstaged", "staged"]),
    // Whether to send a diff's hunks and contents though it would be collapsed.
    expand: z.boolean().optional(),
    // Whether to send every line of the version, in contents, as showing the entire file takes,
    // rather than only what showing the hunks takes. The hunks of a large file are a small part of
    // it.
    entire: z.boolean().optional(),
    hideWhitespace,
  }),
  output: diff,
});

// The groups changes.list lists files in.
const group = z.enum(["modified", "untracked", "staged"]);

// Only those of the group's files at these paths, rather than all of them: the files selected in
// it.
const paths = z.array(z.string()).readonly().optional();

export const groupRpc = defineRpc({
  name: "diff.read-group",
  input: z.object({ directory: z.string(), group, paths, hideWhitespace }),
  output: z.object({
    // The group's files, or those of them at the paths, in the order changes.list lists them, each
    // with its diff as diff.read reads it, collapsed as it collapses it, and without contents: the
    // staged one for a staged file, the unstaged one for the others. A file whose diff can't be
    // read, such as one git can't open, has why in its place.
    files: z.array(
      z.union([
        diff.extend({ path: z.string() }),
        z.object({ path: z.string(), error: z.string() }),
      ]),
    ),
  }),
});

const action = {
  directory: z.string(),
  path: z.string(),
  // Stage and discard act on the unstaged diff, unstage on the staged one.
  operation: z.enum(["stage", "unstage", "discard"]),
  version: z.string(),
  // As the diff the action was chosen from was read.
  hideWhitespace,
};

// Stale, and nothing changed, if the diff has changed since it was read.
const status = z.object({ status: z.enum(["applied", "stale"]) });

export const applyLinesRpc = defineRpc({
  name: "diff.apply-lines",
  input: z.object({
    ...action,
    // Each line by its hunk's index in the diff and its own index in the hunk, unchanged lines
    // included. Selecting an unchanged line changes nothing. With whitespace changes hidden, the
    // changes the lines are in the diff that shows them all are acted on, and changes only to
    // whitespace are left as they are.
    lines: z.array(z.object({ hunk: index, line: index })),
  }),
  // Misaligned, and nothing changed, where acting on the changes in the diff that shows them all
  // would leave other lines than the diff with whitespace changes hidden shows, as where hiding
  // them lines the versions up differently. Unwritable, and nothing changed, where discarding them
  // would write a file beyond a symlink, as where a directory it's in became one, which git won't.
  output: z.object({ status: z.enum(["applied", "stale", "misaligned", "unwritable"]) }),
});

// All of the file's changes, of any kind.
export const applyFileRpc = defineRpc({
  name: "diff.apply-file",
  input: z.object({
    ...action,
    // Or null, for a file whose diff isn't shown, to act on it as it is, which is never stale.
    version: z.string().nullable(),
  }),
  output: status,
});

// Only the file's mode change, which acting on its lines leaves alone, as Magit acts on it. Staging
// it stages the file's rename too, as staging its lines does.
export const applyModeRpc = defineRpc({
  name: "diff.apply-mode",
  input: z.object(action),
  output: status,
});

const groupAction = {
  directory: z.string(),
  // The group's files as changes.list listed them, or the files selected in it. The action is
  // stale, and changes nothing, if a file has joined or left the group since they were listed, or
  // one selected has left it.
  paths: z.array(z.string()).readonly(),
  // Whether the paths are the files selected in the group, rather than all of its files.
  selected: z.boolean().optional(),
};

// All of the changes of each of the files at the paths, as applying them to each file would.
// Modified and untracked files can be staged or discarded, and staged ones unstaged. A file whose
// diff can't be read is left as it is.
export const applyGroupRpc = defineRpc({
  name: "diff.apply-group",
  input: z.discriminatedUnion("group", [
    z.object({
      ...groupAction,
      group: z.literal("modified"),
      operation: z.enum(["stage", "discard"]),
    }),
    z.object({
      ...groupAction,
      group: z.literal("untracked"),
      operation: z.enum(["stage", "discard"]),
    }),
    z.object({ ...groupAction, group: z.literal("staged"), operation: z.literal("unstage") }),
  ]),
  output: status,
});
