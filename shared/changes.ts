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

// Answers once the files changes.list lists, or their diffs, may have changed, so a view of them
// can refresh. It can answer when they haven't, as when a file is saved unchanged.
export const waitRpc = defineRpc({
  name: "changes.wait",
  input: z.object({
    directory: z.string(),
    // The version it last answered with. Any other, such as an empty one, has it answer as soon as
    // it has looked at the files again, which it does a second at most after it last did.
    version: z.string(),
    // How many milliseconds to wait before answering, with the same version, if nothing changes.
    // It can take a second more. The app gives up on an answer after a minute.
    timeout: z.int().nonnegative().max(50_000),
  }),
  output: z.object({ version: z.string() }),
});
