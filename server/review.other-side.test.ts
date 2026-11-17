import { expect, test } from "vitest";

import { inRepository, runGit, writeFile } from "../test/repository";
import { readStatus } from "./changes";
import { otherChanges, withOtherChanges } from "./review";

// A repository with the file `a` partly staged, `b` only changed in the worktree, `c` only staged,
// and `d` untracked.
function changed(repository: string): void {
  for (const path of ["a", "b", "c"]) {
    writeFile(repository, path, "1\n");
  }

  runGit(repository, ["add", "a", "b", "c"]);
  runGit(repository, ["commit", "--quiet", "--message", "Add"]);

  for (const path of ["a", "c"]) {
    writeFile(repository, path, "2\n");
  }

  runGit(repository, ["add", "a", "c"]);

  for (const path of ["a", "b", "d"]) {
    writeFile(repository, path, "3\n");
  }
}

test("a file has changes on the other side from one only where git status lists it in that side's groups too, and of a group's files, only those have their changes there read", async () => {
  await inRepository(async (repository) => {
    changed(repository);

    const entries = await readStatus(repository);

    function listingsOf(paths: readonly string[]) {
      return new Map(paths.map((path) => [path, entries.filter((entry) => entry.path === path)]));
    }

    const asked = [
      ["a", "unstaged"],
      ["a", "staged"],
      ["b", "unstaged"],
      ["c", "staged"],
      ["d", "unstaged"],
    ] as const;

    expect(
      asked.map(([path, side]) => withOtherChanges(listingsOf([path]), side).has(path)),
    ).toStrictEqual([true, true, false, false, false]);
    expect([...withOtherChanges(listingsOf(["a", "b", "d"]), "unstaged").keys()]).toStrictEqual([
      "a",
    ]);
    expect([...withOtherChanges(listingsOf(["a", "c"]), "staged").keys()]).toStrictEqual(["a"]);
  });
});

test("a file's changes on the other side are read where it has some there, and else there are none, without reading them", async () => {
  await inRepository(async (repository) => {
    changed(repository);

    const entries = await readStatus(repository);

    function listed(path: string) {
      return entries.filter((entry) => entry.path === path);
    }

    const [partly, unstaged] = await Promise.all([
      otherChanges(repository, listed("a"), "a", "unstaged"),
      otherChanges(repository, listed("b"), "b", "unstaged"),
    ]);

    expect(partly?.diff.toString()).toContain("+2");
    expect(unstaged).toBeUndefined();
  });
});
