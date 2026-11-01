import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const changesRpc = defineRpc({
  name: "changes.list",
  input: z.object({ directory: z.string() }),
  output: z.object({
    // A file moved in the worktree is listed here by its new path, as renamed, not as a deleted file
    // and an untracked one.
    modified: z.array(z.string()),
    untracked: z.array(z.string()),
    staged: z.array(z.string()),
  }),
});
