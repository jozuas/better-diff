import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const index = z.int().nonnegative();

export const diffRpc = defineRpc({
  name: "diff.read",
  input: z.object({
    directory: z.string(),
    path: z.string(),
    // Unstaged: from the index to the worktree. Staged: from HEAD to the index.
    side: z.enum(["unstaged", "staged"]),
  }),
  output: z.object({
    // Changes whenever the diff does, so an action can tell the diff it was chosen from is out of
    // date.
    version: z.string(),
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

export const applyRpc = defineRpc({
  name: "diff.apply",
  input: z.object({
    directory: z.string(),
    path: z.string(),
    // Stage and discard act on the unstaged diff, unstage on the staged one.
    operation: z.enum(["stage", "unstage", "discard"]),
    version: z.string(),
    // Each line by its hunk's index in the diff and its own index in the hunk. Unchanged lines
    // don't count.
    lines: z.array(z.object({ hunk: index, line: index })),
  }),
  output: z.object({}),
});
