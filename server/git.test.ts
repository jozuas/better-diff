import { readFileSync, utimesSync } from "node:fs";
import { join } from "node:path";

import * as fc from "fast-check";
import { expect, test } from "vitest";

import { canCoexist, filePath } from "../test/file-names";
import { inRepository, runGit, timeout, writeFile } from "../test/repository";
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

test.each([
  ["an external diff tool", "diff.external", "false"],
  ["a textconv filter", "diff.upper.textconv", "tr a-z A-Z <"],
  ["colour", "color.diff", "always"],
  ["no prefixes", "diff.noprefix", "true"],
  ["other prefixes", "diff.mnemonicPrefix", "true"],
  ["quoted names", "core.quotePath", "true"],
  ["no context", "diff.context", "0"],
  ["no space before an empty line", "diff.suppressBlankEmpty", "true"],
])("diffs as git does by default, though the user's config asks for %s", async (_, key, value) => {
  await inRepository(async (repository) => {
    // Gives every file the diff driver whose textconv filter one case sets.
    writeFile(repository, ".git/info/attributes", "* diff=upper\n");
    writeFile(repository, "é", "\nx\n");
    runGit(repository, ["add", "--all"]);
    writeFile(repository, "é", "\ny\n");
    runGit(repository, ["config", key, value]);

    const diff = await git(repository, "diff", []);

    expect(diff.toString()).toBe(
      [
        "diff --git a/é b/é",
        "index 5f6a263..8cb8bae 100644",
        "--- a/é",
        "+++ b/é",
        "@@ -1,2 +1,2 @@",
        " ",
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

test.each(["fix", "error"])(
  "applies a patch as it is, though the user's config says to %s trailing whitespace",
  async (action) => {
    await inRepository(async (repository) => {
      writeFile(repository, "a", "a\n");
      runGit(repository, ["add", "--all"]);
      runGit(repository, ["config", "apply.whitespace", action]);

      await git(
        repository,
        "apply",
        ["--cached"],
        [],
        Buffer.from("diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1,2 @@\n a\n+b \r\n"),
      );

      expect(runGit(repository, ["show", ":a"])).toBe("a\nb \r\n");
    });
  },
);

test("rejects with what git says when it fails", async () => {
  await inRepository(async (repository) => {
    await expect(
      git(repository, "apply", ["--cached"], [], Buffer.from("not a patch\n")),
    ).rejects.toThrow("git apply failed: error: No valid patches in input");
  });
});

test("ignores input a command doesn't read", async () => {
  await inRepository(async (repository) => {
    // Writing input to a command that has exited fails. An error event nothing listens to is
    // thrown where no caller catches it, which would take the daemon down while the call succeeds.
    const uncaught: Error[] = [];

    function record(error: Error): void {
      uncaught.push(error);
    }

    process.on("uncaughtException", record);

    try {
      const status = await git(repository, "status", [], [], Buffer.alloc(2 ** 24));

      expect(status.toString()).toBe("");
    } finally {
      process.off("uncaughtException", record);
    }

    expect(uncaught).toStrictEqual([]);
  });
});

test("returns git diff --no-index's diff, which exits with 1 when the files differ", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");

    const diff = await git(repository, "diff", ["--no-index"], ["/dev/null", "a"]);

    expect(diff.toString()).toContain("\n@@ -0,0 +1 @@\n+a\n");
  });
});

test("returns an empty diff from git diff --no-index for a file that's gone", async () => {
  await inRepository(async (repository) => {
    const diff = await git(repository, "diff", ["--no-index"], ["/dev/null", "a"]);

    expect(diff.toString()).toBe("");
  });
});

test.each([
  ["with --exit-code, which exits with 1 for differences", ["--exit-code"], []],
  ["with --no-index, for too many paths", ["--no-index"], ["/dev/null", "a", "b"]],
])("rejects git diff exiting with other than 0 %s", async (_, options, paths) => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    runGit(repository, ["add", "--all"]);
    writeFile(repository, "a", "b\n");

    await expect(git(repository, "diff", options, paths)).rejects.toThrow("git diff failed");
  });
});
