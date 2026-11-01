import type { RpcInput } from "@getpaseo/plugin";
import * as fc from "fast-check";

import type { applyGroupRpc } from "../shared/diff";
import { canCoexist } from "./file-names";
import { runGit, worktreeFile } from "./repository";
import { file } from "./staging";
import type { File } from "./staging";

// Each group, with an operation its files can have.
type Paired<T> = T extends { group: unknown; operation: unknown }
  ? Pick<T, "group" | "operation">
  : never;

export type GroupAction = Paired<RpcInput<typeof applyGroupRpc>>;

// Each action each group's context menu offers.
export const groupActions: GroupAction[] = [
  { group: "modified", operation: "stage" },
  { group: "modified", operation: "discard" },
  { group: "untracked", operation: "stage" },
  { group: "untracked", operation: "discard" },
  { group: "staged", operation: "unstage" },
];

// A few files, which between them are often in each group, and some in more than one.
export const files: fc.Arbitrary<File[]> = fc
  .uniqueArray(file, { selector: ({ path }) => path, minLength: 1, maxLength: 4 })
  .filter((all) => canCoexist(all.map(({ path }) => path)));

export interface RepositoryState {
  // Each file's mode, blob and path, and git status, which also says which are intent-to-add.
  index: string;
  status: string;
  worktree: (Buffer | undefined)[];
}

export function repositoryState(repository: string, paths: readonly string[]): RepositoryState {
  return {
    index: runGit(repository, ["ls-files", "--stage", "-z"]),
    status: runGit(repository, ["status", "--porcelain=v2", "--untracked-files=all", "-z"]),
    worktree: paths.map((path) => worktreeFile(repository, path)),
  };
}
