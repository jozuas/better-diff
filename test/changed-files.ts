import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import * as fc from "fast-check";

import { canCoexist, filePath } from "./file-names";
import { tenLines } from "./renames";
import { commitAll, deleteFile, runGit, writeFile, writeSymlink } from "./repository";

// What happens to a committed file after the commit.
const fates = [
  "kept",
  "changed",
  "staged",
  "staged and changed",
  "deleted",
  "deleted from the index",
  "renamed",
  "renamed and changed",
  "moved",
  "moved and changed",
  "moved and added intent-to-add",
  "made a symlink",
  "replaced by a directory",
  "replaced by a staged directory",
] as const;

type Fate = (typeof fates)[number];

export interface ChangedFile {
  path: string;
  // Where a file renamed or moved goes.
  to: string;
  fate: Fate;
  committed: string;
  // What a changed file has after the commit.
  changed: string;
}

// Ten lines, or ten with one of the first few changed, so a file is often similar enough to
// another for git to pair them as a rename, and often the same, which leaves git a choice of
// which to pair.
const content = fc.constantFrom(
  tenLines,
  ...["1", "2", "3"].map((line) => tenLines.replace(`${line}\n`, "x\n")),
);

// A few committed files, and what happens to each after the commit.
export const changedFiles: fc.Arbitrary<ChangedFile[]> = fc
  .uniqueArray(
    fc.record({
      path: filePath,
      to: filePath,
      fate: fc.constantFrom(...fates),
      committed: content,
      changed: content,
    }),
    { selector: ({ path }) => path, minLength: 1, maxLength: 5 },
  )
  .filter((files) => canCoexist(files.flatMap(({ path, to }) => [path, to])));

// Renames the file with git, into a directory git leaves to its caller to make.
function rename(repository: string, { path, to }: ChangedFile): void {
  mkdirSync(dirname(join(repository, to)), { recursive: true });
  runGit(repository, ["mv", "--", path, to]);
}

// What happens to the file in the worktree, and in the index too where that's staged.
const changes: Record<Fate, (repository: string, file: ChangedFile) => void> = {
  kept: () => {},
  changed: (repository, { path, changed }) => {
    writeFile(repository, path, changed);
  },
  staged: (repository, { path, changed }) => {
    writeFile(repository, path, changed);
    runGit(repository, ["add", "--", path]);
  },
  "staged and changed": (repository, { path, changed }) => {
    writeFile(repository, path, changed);
    runGit(repository, ["add", "--", path]);
    writeFile(repository, path, `${changed}y\n`);
  },
  deleted: (repository, { path }) => {
    deleteFile(repository, path);
  },
  "deleted from the index": (repository, { path }) => {
    runGit(repository, ["rm", "--cached", "--quiet", "--", path]);
  },
  renamed: rename,
  "renamed and changed": (repository, file) => {
    rename(repository, file);
    writeFile(repository, file.to, file.changed);
  },
  moved: (repository, { path, to, committed }) => {
    deleteFile(repository, path);
    writeFile(repository, to, committed);
  },
  "moved and changed": (repository, { path, to, changed }) => {
    deleteFile(repository, path);
    writeFile(repository, to, changed);
  },
  "moved and added intent-to-add": (repository, { path, to, changed }) => {
    deleteFile(repository, path);
    writeFile(repository, to, changed);
    runGit(repository, ["add", "--intent-to-add", "--", to]);
  },
  "made a symlink": (repository, { path }) => {
    deleteFile(repository, path);
    writeSymlink(repository, path, "target");
  },
  "replaced by a directory": (repository, { path, changed }) => {
    deleteFile(repository, path);
    writeFile(repository, `${path}/a`, changed);
  },
  "replaced by a staged directory": (repository, { path, changed }) => {
    deleteFile(repository, path);
    writeFile(repository, `${path}/a`, changed);
    runGit(repository, ["add", "--all", "--", path]);
  },
};

// Commits the files, and then changes each as its fate says.
export function changeFiles(repository: string, files: readonly ChangedFile[]): void {
  for (const { path, committed } of files) {
    writeFile(repository, path, committed);
  }

  commitAll(repository);

  for (const file of files) {
    changes[file.fate](repository, file);
  }
}
