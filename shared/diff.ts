import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const index = z.int().nonnegative();

const diff = z.object({
  // Changes whenever the diff does, so an action can tell the diff it was chosen from is out of
  // date.
  version: z.string(),
  // Text, which has hunks unless the file is new or deleted and empty, or a change shown without
  // lines: none, a rename on its own, a symlink's, a binary file's, a mode change on its own, or a
  // file with merge conflicts. A file that became a symlink, or stopped being one, is a symlink's.
  // A renamed file with other changes is what they are.
  kind: z.enum(["text", "unchanged", "renamed", "symlink", "binary", "mode", "unmerged"]),
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
        }),
      ),
    }),
  ),
  // Every line of the versions a text diff goes between, the hunks' and the unchanged ones
  // around them, as the hunks' lines have them. None for a diff of another kind, or a version
  // without the file.
  contents: z.object({ old: z.array(z.string()), new: z.array(z.string()) }),
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
  }),
  output: diff,
});

// The groups changes.list lists files in.
const group = z.enum(["modified", "untracked", "staged"]);

export const groupRpc = defineRpc({
  name: "diff.read-group",
  input: z.object({ directory: z.string(), group }),
  output: z.object({
    // Changes whenever a file joins or leaves the group, or its diff, or why it can't be read,
    // changes.
    version: z.string(),
    // The group's files, in the order changes.list lists them, each with its diff, collapsed as
    // diff.read collapses it: the staged one for a staged file, the unstaged one for the others. A
    // file whose diff can't be read, such as one git can't open, has why in its place.
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
};

// Stale, and nothing changed, if the diff has changed since it was read.
const status = z.object({ status: z.enum(["applied", "stale"]) });

export const applyLinesRpc = defineRpc({
  name: "diff.apply-lines",
  input: z.object({
    ...action,
    // Each line by its hunk's index in the diff and its own index in the hunk, unchanged lines
    // included. Selecting an unchanged line changes nothing.
    lines: z.array(z.object({ hunk: index, line: index })),
  }),
  output: status,
});

// All of the file's changes, of any kind.
export const applyFileRpc = defineRpc({
  name: "diff.apply-file",
  input: z.object(action),
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
  // The group's. The action is stale, and changes nothing, if a file has joined or left the group
  // or its diff has changed since it was read.
  version: z.string(),
};

// All of the changes of each of the group's files, as applying them to each file would. Modified
// and untracked files can be staged or discarded, and staged ones unstaged. A file whose diff can't
// be read is left as it is.
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
