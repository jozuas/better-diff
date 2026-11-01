import { appendFileSync } from "node:fs";
import { join } from "node:path";

import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";

import type { applyLinesRpc, diffRpc } from "../shared/diff";
import { fileVersions } from "./file-contents";
import type { FileVersions } from "./file-contents";
import { filePath } from "./file-names";
import { deleteFile, indexFile, runGit, worktreeFile, writeFile } from "./repository";

export type Operation = RpcInput<typeof applyLinesRpc>["operation"];

export type Side = RpcInput<typeof diffRpc>["side"];

export type Diff = RpcOutput<typeof diffRpc>;

export type Selection = RpcInput<typeof applyLinesRpc>["lines"];

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

// Writes the file, or deletes it for a version without it.
export function writeVersion(repository: string, path: string, version: Buffer | undefined): void {
  if (version === undefined) {
    deleteFile(repository, path);
  } else {
    writeFile(repository, path, version);
  }
}

// Commits each file's HEAD version, stages its index version and leaves its worktree version.
export function setUp(repository: string, files: readonly File[], algorithm: string): void {
  // As `git config diff.algorithm` would, in a fraction of the time.
  appendFileSync(join(repository, ".git", "config"), `[diff]\n\talgorithm = ${algorithm}\n`);

  for (const { path, versions } of files) {
    writeVersion(repository, path, versions.head);
  }

  runGit(repository, ["add", "--all"]);
  // Empty when HEAD has none of the files.
  runGit(repository, ["commit", "--quiet", "--allow-empty", "--message", "Commit"]);

  for (const { path, versions } of files) {
    writeVersion(repository, path, versions.index);
  }

  runGit(repository, ["add", "--all"]);

  for (const { path, versions } of files) {
    writeVersion(repository, path, versions.worktree);
  }
}

// Undefined for a version without the file.
export interface FileState {
  index: Buffer | undefined;
  worktree: Buffer | undefined;
}

// The version of the file each operation changes.
export const targets: Record<Operation, keyof FileState> = {
  stage: "index",
  unstage: "index",
  discard: "worktree",
};

// The version whose file each operation puts in its target.
export const sources: Record<Operation, keyof FileVersions> = {
  stage: "worktree",
  unstage: "head",
  discard: "index",
};

export function fileState(repository: string, path: string): FileState {
  return { index: indexFile(repository, path), worktree: worktreeFile(repository, path) };
}

export function selectedLines(
  diff: Diff,
  isSelected: (hunk: number, line: number) => boolean,
): Selection {
  return diff.hunks.flatMap(({ lines }, hunk) =>
    lines.flatMap((_, line) => (isSelected(hunk, line) ? [{ hunk, line }] : [])),
  );
}

// Every line of the hunks `isPicked` picks, by its index.
export function linesOf(diff: Diff, isPicked: (hunk: number) => boolean): Selection {
  return diff.hunks.flatMap(({ lines }, hunk) =>
    isPicked(hunk) ? lines.map((_, line) => ({ hunk, line })) : [],
  );
}
