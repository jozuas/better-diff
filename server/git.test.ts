import { readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as fc from "fast-check";
import { expect, test } from "vitest";

import { canCoexist, filePath } from "../test/file-names";
import { inRepository, runGit, writeFile } from "../test/repository";
import { git } from "./git";

// With no paths, a command covers every file, so at least one is selected.
const files = fc
  .record({
    selected: fc.array(filePath, { minLength: 1 }),
    others: fc.array(filePath),
  })
  .filter(({ selected, others }) => canCoexist([...selected, ...others]));

test("selects exactly the files its paths name, whatever characters they hold", async () => {
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

        expect(status.split("\0").toSorted()).toStrictEqual(
          ["", ...selected.map((path) => `? ${path}`)].toSorted(),
        );
      });
    }),
    {
      examples: [[{ selected: ["*"], others: ["a"] }], [{ selected: ["-s"], others: ["a"] }]],
    },
  );
});

test.each([
  ["an external diff tool", "diff.external", "false"],
  ["a textconv filter", "diff.upper.textconv", "tr a-z A-Z <"],
  ["colour", "color.diff", "always"],
  ["no prefixes", "diff.noprefix", "true"],
  ["other prefixes", "diff.mnemonicPrefix", "true"],
  ["quoted names", "core.quotePath", "true"],
])("diffs as git does by default, though the user's config asks for %s", async (_, key, value) => {
  await inRepository(async (repository) => {
    // Gives every file the diff driver whose textconv filter one case sets.
    writeFileSync(join(repository, ".git", "info", "attributes"), "* diff=upper\n");
    writeFile(repository, "é", "x\n");
    runGit(repository, ["add", "--all"]);
    writeFile(repository, "é", "y\n");
    runGit(repository, ["config", key, value]);

    await expect(git(repository, "diff", [])).resolves.toBe(
      [
        "diff --git a/é b/é",
        "index 587be6b..975fbec 100644",
        "--- a/é",
        "+++ b/é",
        "@@ -1 +1 @@",
        "-x",
        "+y",
        "",
      ].join("\n"),
    );
  });
});

test("doesn't rewrite the index, so an agent's git command never finds it locked", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    runGit(repository, ["add", "--all"]);
    // A new modification time with the same content makes git refresh the index entry.
    utimesSync(join(repository, "a"), 0, 0);

    const index = readFileSync(join(repository, ".git", "index"));

    await git(repository, "status", []);

    expect(readFileSync(join(repository, ".git", "index"))).toStrictEqual(index);
  });
});

test("returns output longer than execFile's default limit of 1 MiB", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "");
    runGit(repository, ["add", "--all"]);
    writeFile(repository, "a", "a\n".repeat(2 ** 20));

    const diff = await git(repository, "diff", []);

    expect(diff.length).toBeGreaterThan(2 ** 21);
  });
});
