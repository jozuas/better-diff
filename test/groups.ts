import type { RpcInput } from "@getpaseo/plugin";
import * as fc from "fast-check";

import type { applyGroupRpc } from "../shared/diff";
import { fileVersions } from "./file-contents";
import { canCoexist, filePath } from "./file-names";
import { makeUnreadable, runGit, worktreeFile, writeFile } from "./repository";
import { file, writeVersion } from "./staging";
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

// A few files, and one written after them: often one of them, with other versions, or else a new
// one.
export const filesAndLater: fc.Arbitrary<[File[], File]> = files
  .chain((all) =>
    fc.tuple(
      fc.constant(all),
      fc.record({
        path: fc.oneof(fc.constantFrom(...all.map(({ path }) => path)), filePath),
        versions: fileVersions,
      }),
    ),
  )
  .filter(([all, later]) =>
    canCoexist([...all.flatMap(({ path }) => (path === later.path ? [] : [path])), later.path]),
  );

function fileA(head: string | undefined, index: string | undefined, worktree: string): File {
  return {
    path: "a",
    versions: {
      head: head === undefined ? undefined : Buffer.from(head),
      index: index === undefined ? undefined : Buffer.from(index),
      worktree: Buffer.from(worktree),
    },
  };
}

// Files, and a later file, whose diff changes while it stays in each group it's in: an untracked
// file, and a modified and staged one. The untracked file's size changes, which a filesystem that
// keeps times to the second can't miss.
export const diffChanges: [[File[], File]][] = [
  [[[fileA(undefined, undefined, "a\n")], fileA(undefined, undefined, "b\nc\n")]],
  [[[fileA("a\n", "b\n", "c\n")], fileA("a\n", "d\n", "e\n")]],
];

// Writes the file's index and worktree versions, and leaves the other files as they are.
export function writeLater(repository: string, { path, versions }: File): void {
  writeVersion(repository, path, versions.index);

  runGit(
    repository,
    versions.index === undefined
      ? ["rm", "--cached", "--quiet", "--ignore-unmatch", "--", path]
      : ["add", "--", path],
  );

  writeVersion(repository, path, versions.worktree);
}

// An untracked file `a` git can't read, without permission to, beside an untracked file `b`.
export function addUnreadableFile(repository: string): void {
  writeFile(repository, "a", "a\n");
  makeUnreadable(repository, "a");
  writeFile(repository, "b", "b\n");
}

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
