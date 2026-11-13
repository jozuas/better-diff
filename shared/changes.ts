import { defineRpc } from "@getpaseo/plugin";
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
    // The version changes.wait answers with while the files are as listed.
    version: z.string(),
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

// The version changes.wait answers with while the files are as they are now, found at once.
export const versionRpc = defineRpc({
  name: "changes.version",
  input: z.object({ directory: z.string() }),
  output: z.object({ version: z.string() }),
});

// Answers the directory's waits from the version at once, with it, as though they were over: a view
// that no longer shows the changes can't stop the wait it asked for.
export const releaseRpc = defineRpc({
  name: "changes.release",
  input: z.object({ directory: z.string(), version: z.string() }),
  output: z.object({}),
});
