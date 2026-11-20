import { defineRpc, defineSubscription } from "@getpaseo/plugin";
import { z } from "zod";

import { repositoryKinds } from "./diff";

// A group's files that are submodules, or repositories inside the worktree, each by its path, with
// what its diff on the group's side is of.
const repositories = z.array(z.tuple([z.string(), z.enum(repositoryKinds)]));

export const changesRpc = defineRpc({
  name: "changes.list",
  input: z.object({ directory: z.string() }),
  output: z.object({
    // A file moved in the worktree is listed here by its new path, as renamed, not as a deleted file
    // and an untracked one.
    modified: z.array(z.string()),
    untracked: z.array(z.string()),
    staged: z.array(z.string()),
    // A path can be a submodule in one group and an ordinary file in another, as where a file has
    // replaced a submodule the index no longer has.
    repositories: z.object({
      modified: repositories,
      untracked: repositories,
      staged: repositories,
    }),
    // The version changes.watch tells of while the files are as listed.
    version: z.string(),
  }),
});

// Tells of the version once it has looked at the files, which it does for a new subscriber a second
// at most after it last did, and then of each other one it finds, as the files changes.list lists,
// or their diffs, may have changed, so a view of them can refresh. It can tell of another when they
// haven't, as when a file is saved unchanged.
export const watchRpc = defineSubscription({
  name: "changes.watch",
  input: z.object({ directory: z.string() }),
  event: z.object({ version: z.string() }),
});

// The version changes.watch tells of while the files are as they are now, found at once.
export const versionRpc = defineRpc({
  name: "changes.version",
  input: z.object({ directory: z.string() }),
  output: z.object({ version: z.string() }),
});
