import { join } from "node:path";

import { commitAll, inRepository, runGit, writeFile } from "./repository";

// git clones a submodule from a repository on the same machine only where told it may.
export function submodule(repository: string, args: readonly string[]): void {
  runGit(repository, ["-c", "protocol.file.allow=always", "submodule", ...args]);
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
