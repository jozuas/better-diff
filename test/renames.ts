import { commitAll, deleteFile, runGit, writeFile } from "./repository";

// Ten lines, so changing one leaves a file similar enough to its original for a rename.
export const tenLines = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n";

export function commitTenLines(repository: string): void {
  writeFile(repository, "a", tenLines);
  commitAll(repository);
}

// Moves `a` to `b` without git, as `mv` does.
export function move(repository: string): void {
  deleteFile(repository, "a");
  writeFile(repository, "b", tenLines);
}

// Has git run `b` through a clean filter that notes its path in `.git/cleaned` each time. Pairing
// files hashes each untracked one, which runs it through the filter first.
export function noteCleaned(repository: string): void {
  writeFile(repository, ".git/info/attributes", "b filter=note\n");
  runGit(repository, [
    "config",
    "filter.note.clean",
    "sh -c 'echo \"$0\" >> .git/cleaned; cat' %f",
  ]);
}

// Moves `a` to `b`, which git reads through a clean filter as it is until the returned function
// runs, and as `b\n` after. The renames git status finds stand while the files don't change, so it's
// as if `b` changed just after git status paired it with `a`.
export function moveChangingLater(repository: string): () => void {
  writeFile(repository, ".git/info/attributes", "b filter=later\n");
  runGit(repository, [
    "config",
    "filter.later.clean",
    "sh -c 'if [ -e .git/changed ]; then echo b; else cat; fi'",
  ]);
  move(repository);

  return () => {
    writeFile(repository, ".git/changed", "");
  };
}

// Moves `a` to `git~1/b`, a path git won't have in the index once the returned function runs: it
// turns core.protectNTFS back on, which keeps out a path Windows takes for the short name of
// `.git`. The renames git status finds stand while the files don't change, so it's as if the file
// went just after git status paired it with `a`.
export function moveRefusedLater(repository: string): () => void {
  runGit(repository, ["config", "core.protectNTFS", "false"]);
  deleteFile(repository, "a");
  writeFile(repository, "git~1/b", tenLines);

  return () => {
    runGit(repository, ["config", "core.protectNTFS", "true"]);
  };
}
