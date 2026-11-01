import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const index = z.int().nonnegative();

export const diffRpc = defineRpc({
  name: "diff.read",
  input: z.object({
    directory: z.string(),
    path: z.string(),
    // Unstaged: from the index to the worktree, where an untracked file is new. Staged: from HEAD
    // to the index.
    side: z.enum(["unstaged", "staged"]),
  }),
  output: z.object({
    // Changes whenever the diff does, so an action can tell the diff it was chosen from is out of
    // date.
    version: z.string(),
    // Text, which has hunks unless the file is new or deleted and empty, or a change shown without
    // lines: none, a staged rename, a symlink's, a binary file's, a mode change on its own, or a
    // file with merge conflicts. A file that became a symlink, or stopped being one, is a symlink's.
    kind: z.enum(["text", "unchanged", "renamed", "symlink", "binary", "mode", "unmerged"]),
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
