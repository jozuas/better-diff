import { join } from "node:path";

import { commitAll, inRepository, runGit, writeFile } from "./repository";

// git clones a submodule from a repository on the same machine only where told it may.
export function submodule(repository: string, args: readonly string[]): void {
  runGit(repository, ["-c", "protocol.file.allow=always", "submodule", ...args]);
}

// Makes an untracked repository inside the repository, at the path, with its file `null` committed:
// diffed as a new file, with `git diff --no-index /dev/null`, the directory would be read as that
// file.
export function nestRepository(repository: string, path: string): void {
  const nested = join(repository, path);

  runGit(repository, ["init", "--quiet", path]);
  writeFile(nested, "null", "n\n");
  commitAll(nested);
}

// Runs the test in a repository with the submodule `sub`, which has the file `d/s`.
export async function withSubmodule(use: (repository: string) => Promise<void>): Promise<void> {
  await inRepository(async (source) => {
    writeFile(source, join("d", "s"), "s\n");
    commitAll(source);

    await inRepository(async (repository) => {
      submodule(repository, ["add", "--quiet", source, "sub"]);
      commitAll(repository);
      await use(repository);
    });
  });
}
