import { join } from "node:path";

import * as fc from "fast-check";
import { expect, test } from "vitest";

import { canCoexist, filePath } from "../test/file-names";
import {
  commitAll,
  deleteFile,
  inRepository,
  runGit,
  timeout,
  writeFile,
  writeSymlink,
} from "../test/repository";
import { git } from "./git";

// With no paths, a command covers every file, so at least one is selected.
const files = fc
  .record({
    selected: fc.array(filePath, { minLength: 1 }),
    others: fc.array(filePath),
  })
  .filter(({ selected, others }) => canCoexist([...selected, ...others]));

test(
  "selects exactly the files its paths name, whatever characters they hold",
  async () => {
    await fc.assert(
      fc.asyncProperty(files, async ({ selected, others }) => {
        await inRepository(async (repository) => {
          for (const path of [...selected, ...others]) {
            writeFile(repository, path, "");
          }

          const status = await git(
            repository,
            "status",
            ["--porcelain=v2", "--untracked-files=all"],
            selected,
          );

          expect(status.toString().split("\0").toSorted()).toStrictEqual(
            ["", ...selected.map((path) => `? ${path}`)].toSorted(),
          );
        });
      }),
      {
        examples: [[{ selected: ["*"], others: ["a"] }], [{ selected: ["-s"], others: ["a"] }]],
      },
    );
  },
  timeout,
);

// A file, or a symlink to what the git directory has at the target: a file, a directory or nothing.
interface Entry {
  path: string;
  target: string | undefined;
}

const entry: fc.Arbitrary<Entry> = fc.record({
  path: filePath,
  target: fc.constantFrom(undefined, "HEAD", "objects", "nothing"),
});

const entries = fc
  .record({ selected: fc.array(entry, { minLength: 1 }), others: fc.array(entry) })
  .filter(({ selected, others }) => canCoexist([...selected, ...others].map(({ path }) => path)));

function writeEntry(repository: string, { path, target }: Entry): void {
  if (target === undefined) {
    writeFile(repository, path, "");
  } else {
    writeSymlink(repository, path, join(repository, ".git", target));
  }
}

// The mode git stages the entry with.
function modeOf({ target }: Entry): string {
  return target === undefined ? "100644" : "120000";
}

test(
  "adds exactly the files its paths name, though git add won't take a pathspec beyond a symlink",
  async () => {
    await fc.assert(
      fc.asyncProperty(entries, async ({ selected, others }) => {
        await inRepository(async (repository) => {
          for (const added of [...selected, ...others]) {
            writeEntry(repository, added);
          }

          await git(
            repository,
            "add",
            [],
            selected.map(({ path }) => path),
          );

          expect(
            runGit(repository, ["ls-files", "-z", "--format=%(objectmode) %(path)"])
              .split("\0")
              .toSorted(),
          ).toStrictEqual(
            ["", ...selected.map((added) => `${modeOf(added)} ${added.path}`)].toSorted(),
          );
        });
      }),
      { examples: [[{ selected: [{ path: "a", target: "objects" }], others: [] }]] },
    );
  },
  timeout,
);

test("selects a file, and none of the files in a directory that replaced it", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    commitAll(repository);
    deleteFile(repository, "a");
    writeFile(repository, "a/x", "x\n");

    const status = await git(repository, "status", ["--porcelain", "--untracked-files=all"], ["a"]);

    expect(status.toString()).toBe(" D a\0");
  });
});

test("selects a symlink, and none of the files of a directory it replaced", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a/x", "x\n");
    commitAll(repository);
    runGit(repository, ["rm", "--quiet", "-r", "a"]);
    writeSymlink(repository, "a", "b");
    runGit(repository, ["add", "--all"]);

    const diff = await git(repository, "diff", ["--cached", "--name-status"], ["a"]);

    expect(diff.toString()).toBe("A\ta\n");
  });
});

test("adds a repository inside the repository, which git status names with a `/`", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "inner/a", "a\n");
    runGit(join(repository, "inner"), ["init", "--quiet"]);
    commitAll(join(repository, "inner"));

    await git(repository, "add", [], ["inner/"]);

    expect(runGit(repository, ["ls-files", "--stage"])).toMatch(/^160000 \w+ 0\tinner\n$/u);
  });
});
