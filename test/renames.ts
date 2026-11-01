import { commitAll, deleteFile, writeFile } from "./repository";

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
