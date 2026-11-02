import { join } from "node:path";

import { expect, test } from "vitest";

import { eachOnItsOwn, listingsOf } from "../test/batches";
import type { Group } from "../test/batches";
import { moveRefusedLater, tenLines } from "../test/renames";
import {
  commitAll,
  deleteFile,
  inRepository,
  makeUnreadable,
  runGit,
  writeFile,
} from "../test/repository";
import { withSubmodule } from "../test/submodules";
import { batchedChanges } from "./batches";
import type { Entry } from "./changes";
import type { Side } from "./diff";

test("leaves out a staged file in a directory that replaced a file, which the file's diff leaves out", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    writeFile(repository, "b", "b\n");
    commitAll(repository);
    deleteFile(repository, "a");
    writeFile(repository, "a/b", "c\n");
    writeFile(repository, "b", "c\n");
    runGit(repository, ["add", "--all"]);

    const listings = await listingsOf(repository, "staged");
    const batched = await batchedChanges(repository, listings, "staged");

    expect([...listings.keys()]).toStrictEqual(["a", "a/b", "b"]);
    expect(batched).toStrictEqual(await eachOnItsOwn(repository, listings, "staged", ["a", "b"]));
  });
});

test("reads none of the files of a diff of several where git can't read one of them", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    writeFile(repository, "b", "b\n");
    commitAll(repository);
    writeFile(repository, "a", "b\n");
    writeFile(repository, "b", "c\n");
    makeUnreadable(repository, "a");

    const listings = await listingsOf(repository, "modified");

    expect(listings.size).toBe(2);
    await expect(batchedChanges(repository, listings, "unstaged")).resolves.toStrictEqual(
      new Map(),
    );
  });
});

test("reads none of the files moved in the worktree where git won't add one of them intent-to-add", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", tenLines);
    writeFile(repository, "c", tenLines.replace("1\n", "x\n"));
    commitAll(repository);

    const refuse = moveRefusedLater(repository);

    deleteFile(repository, "c");
    writeFile(repository, "d", tenLines.replace("1\n", "x\n"));

    const listings = await listingsOf(repository, "modified");

    refuse();

    expect([...listings.keys()]).toStrictEqual(["d", "git~1/b"]);
    await expect(batchedChanges(repository, listings, "unstaged")).resolves.toStrictEqual(
      new Map(),
    );
  });
});

test("leaves out a file a diff of several renames from another path than git status named, as once renamed again", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", tenLines);
    writeFile(repository, "b", tenLines.replaceAll(/\d/gu, "x"));
    commitAll(repository);
    runGit(repository, ["mv", "a", "c"]);
    runGit(repository, ["mv", "b", "d"]);

    const listings = await listingsOf(repository, "staged");

    runGit(repository, ["mv", "c", "e"]);
    runGit(repository, ["mv", "d", "c"]);
    runGit(repository, ["mv", "e", "d"]);

    expect([...listings].map(([path, [entry]]) => [path, entry?.original])).toStrictEqual([
      ["c", "a"],
      ["d", "b"],
    ]);
    await expect(batchedChanges(repository, listings, "staged")).resolves.toStrictEqual(new Map());
  });
});

test("reads with renames off a deleted file and an added one that git status, with renames off, doesn't pair", async () => {
  await inRepository(async (repository) => {
    runGit(repository, ["config", "status.renames", "false"]);
    writeFile(repository, "a", tenLines);
    commitAll(repository);
    runGit(repository, ["mv", "a", "b"]);

    const listings = await listingsOf(repository, "staged");

    await expect(batchedChanges(repository, listings, "staged")).resolves.toStrictEqual(
      await eachOnItsOwn(repository, listings, "staged", ["a", "b"]),
    );
  });
});

// A file with merge conflicts, which git status lists, but not in a group: as if the conflicts came
// after git status.
const unmerged: Entry = {
  path: "b",
  untracked: false,
  intentToAdd: false,
  staged: true,
  modified: true,
  deleted: false,
  original: undefined,
};

// Each side, the group it's read for, and how new files beside the file with merge conflicts are
// added there.
test.each<[Side, Group, string[]]>([
  ["unstaged", "modified", ["add", "--intent-to-add", "a", "c"]],
  ["staged", "staged", ["add", "a", "c"]],
])(
  "leaves out a file with merge conflicts on the %s side, and reads the files beside it as their own diffs do",
  async (side, group, add) => {
    await inRepository(async (repository) => {
      writeFile(repository, "b", "a\n");
      commitAll(repository);
      runGit(repository, ["checkout", "--quiet", "-b", "other"]);
      writeFile(repository, "b", "b\n");
      commitAll(repository);
      runGit(repository, ["checkout", "--quiet", "-"]);
      writeFile(repository, "b", "c\n");
      commitAll(repository);

      expect(() => runGit(repository, ["merge", "--quiet", "other"])).toThrow("Command failed");

      writeFile(repository, "a", "a\n");
      writeFile(repository, "c", "c\n");
      runGit(repository, add);

      const listings = await listingsOf(repository, group);

      listings.set(unmerged.path, [unmerged]);

      await expect(batchedChanges(repository, listings, side)).resolves.toStrictEqual(
        await eachOnItsOwn(repository, listings, side, ["a", "c"]),
      );
    });
  },
);

// git prints a submodule's log without a line that starts a file's diff, so in a diff of several it
// would run on from the file before it, but the paths git diffs a file by leave a submodule out, as
// they leave out what's in a directory of the same name.
test("reads a file beside a submodule as its own diff does, though the user's config asks for a log of the submodule's commits", async () => {
  await withSubmodule(async (repository) => {
    writeFile(join(repository, "sub"), "s", "s\n");
    commitAll(join(repository, "sub"));
    writeFile(repository, "a", "a\n");
    runGit(repository, ["add", "--intent-to-add", "a"]);
    runGit(repository, ["config", "diff.submodule", "log"]);

    const listings = await listingsOf(repository, "modified");

    expect([...listings.keys()]).toStrictEqual(["a", "sub"]);
    await expect(batchedChanges(repository, listings, "unstaged")).resolves.toStrictEqual(
      await eachOnItsOwn(repository, listings, "unstaged", ["a"]),
    );
  });
});
