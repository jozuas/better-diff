import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";

import type { applyRpc, diffRpc } from "../shared/diff";
import { fileVersions } from "./file-contents";
import type { FileVersions } from "./file-contents";
import { filePath } from "./file-names";
import { indexFile, runGit, worktreeFile, writeFile } from "./repository";

export type Operation = RpcInput<typeof applyRpc>["operation"];

export type Side = RpcInput<typeof diffRpc>["side"];

export type Diff = RpcOutput<typeof diffRpc>;

export type Selection = RpcInput<typeof applyRpc>["lines"];

export interface File {
  path: string;
  versions: FileVersions;
}

export const operations: Operation[] = ["stage", "unstage", "discard"];

// The diff each operation acts on.
export const sides: Record<Operation, Side> = {
  stage: "unstaged",
  unstage: "staged",
  discard: "unstaged",
};

// The arguments for each side's `git diff`.
export const diffCommands: Record<Side, string[]> = {
  unstaged: ["diff"],
  staged: ["diff", "--cached"],
};

export const file: fc.Arbitrary<File> = fc.record({ path: filePath, versions: fileVersions });

export const diffAlgorithm = fc.constantFrom("myers", "minimal", "patience", "histogram");

// Commits each file's HEAD version, stages its index version and leaves its worktree version.
export function setUp(repository: string, files: readonly File[], algorithm: string): void {
  runGit(repository, ["config", "diff.algorithm", algorithm]);

  for (const { path, versions } of files) {
    writeFile(repository, path, versions.head);
  }

  runGit(repository, ["add", "--all"]);
  runGit(repository, ["commit", "--quiet", "--message", "Commit"]);

  for (const { path, versions } of files) {
    writeFile(repository, path, versions.index);
  }

  runGit(repository, ["add", "--all"]);

  for (const { path, versions } of files) {
    writeFile(repository, path, versions.worktree);
  }
}

export interface FileState {
  index: Buffer;
  worktree: Buffer;
}

// The version of the file each operation changes.
export const targets: Record<Operation, keyof FileState> = {
  stage: "index",
  unstage: "index",
  discard: "worktree",
};

export function fileState(repository: string, path: string): FileState {
  return { index: indexFile(repository, path), worktree: worktreeFile(repository, path) };
}

// Every line of the hunks `isPicked` picks, by its index.
export function linesOf(diff: Diff, isPicked: (hunk: number) => boolean): Selection {
  return diff.hunks.flatMap(({ lines }, hunk) =>
    isPicked(hunk) ? lines.map((_, line) => ({ hunk, line })) : [],
  );
}
