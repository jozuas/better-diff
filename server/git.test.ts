import { readFileSync, utimesSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { inRepository, makeExecutable, runGit, worktreeFile, writeFile } from "../test/repository";
import { git } from "./git";

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

      await git(repository, "apply", ["--cached"], [], {
        input: Buffer.from("diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1,2 @@\n a\n+b \r\n"),
      });

      expect(runGit(repository, ["show", ":a"])).toBe("a\nb \r\n");
    });
  },
);

test("rejects with what git says when it fails", async () => {
  await inRepository(async (repository) => {
    await expect(
      git(repository, "apply", ["--cached"], [], { input: Buffer.from("not a patch\n") }),
    ).rejects.toThrow("git apply failed: error: No valid patches in input");
  });
});

test("stops a command once told to, as git status that waits on a file system monitor", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "monitor", "#!/bin/sh\nsleep 5\n");
    makeExecutable(repository, "monitor");
    runGit(repository, ["config", "core.fsmonitor", join(repository, "monitor")]);

    const started = performance.now();
    const status = git(repository, "status", [], [], { signal: AbortSignal.timeout(100) });

    await expect(status).rejects.toThrow("aborted");
    expect(performance.now() - started).toBeLessThan(4000);
  });
});

test("prints the paths git ignores of those it reads, and nothing where it ignores none", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, ".gitignore", "*.log\n");

    const ignored = await Promise.all(
      [["a.log", "b"], ["b"]].map(async (paths) => {
        const output = await git(repository, "check-ignore", [], [], {
          input: Buffer.from(paths.map((path) => `${path}\0`).join("")),
        });

        return output.toString();
      }),
    );

    expect(ignored).toStrictEqual(["a.log\0", ""]);
  });
});

test("rejects git check-ignore failing, as for a path outside the repository", async () => {
  await inRepository(async (repository) => {
    await expect(
      git(repository, "check-ignore", [], [], { input: Buffer.from("../a\0") }),
    ).rejects.toThrow("git check-ignore failed");
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
      const status = await git(repository, "status", [], [], { input: Buffer.alloc(2 ** 24) });

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

test("runs a command with the index file it's given, in place of the repository's own", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    runGit(repository, ["add", "--all"]);

    const status = await git(repository, "status", ["--porcelain"], [], {
      index: join(repository, "other-index"),
    });

    expect(status.toString()).toBe("?? a\0");
  });
});

// git runs post-index-change whenever a command writes an index.
test.each<[string, (repository: string) => { index?: string }, string | undefined]>([
  ["its own index", () => ({}), "hook\n"],
  [
    "another index file",
    (repository) => ({ index: join(repository, ".git", "other-index") }),
    undefined,
  ],
])(
  "runs the repository's hooks only for a command on its own index: %s",
  async (_, extrasIn, hooked) => {
    await inRepository(async (repository) => {
      writeFile(
        repository,
        ".git/hooks/post-index-change",
        "#!/bin/sh\necho hook >> .git/hooked\n",
      );
      makeExecutable(repository, ".git/hooks/post-index-change");
      writeFile(repository, "a", "a\n");

      await git(repository, "add", [], ["a"], extrasIn(repository));

      expect(worktreeFile(repository, ".git/hooked")?.toString()).toBe(hooked);
    });
  },
);

// Runs the action with the variable set in the environment, as the daemon's could have it.
async function withVariable<T>(name: string, value: string, action: () => Promise<T>): Promise<T> {
  const environment = process.env;

  process.env = { ...environment, [name]: value };

  try {
    const result = await action();

    return result;
  } finally {
    process.env = environment;
  }
}

// Each variable, the path that selects a file `a`, and what git status then prints.
test.each([
  ["are literal", "GIT_LITERAL_PATHSPECS", "a", "?? a\0"],
  ["ignore case", "GIT_ICASE_PATHSPECS", "A", ""],
])(
  "selects exactly the files its paths name, though the user's environment says pathspecs %s",
  async (_, variable, path, selected) => {
    await inRepository(async (repository) => {
      writeFile(repository, "a", "");

      const status = await withVariable(variable, "1", async () => {
        const printed = await git(repository, "status", ["--porcelain"], [path]);

        return printed;
      });

      expect(status.toString()).toBe(selected);
    });
  },
);

// Each variable, as a git hook's environment could set it, and how it would point git at another
// repository, or at its parts: its index, its worktree, whose file differs, or where it keeps its
// objects, which already hold the file's.
test.each<[string, (other: string) => string]>([
  ["GIT_DIR", (other) => join(other, ".git")],
  ["GIT_WORK_TREE", (other) => other],
  ["GIT_COMMON_DIR", (other) => join(other, ".git")],
  ["GIT_OBJECT_DIRECTORY", (other) => join(other, ".git", "objects")],
  ["GIT_ALTERNATE_OBJECT_DIRECTORIES", (other) => join(other, ".git", "objects")],
])(
  "stages a file in the directory's repository, though the user's environment's %s names another's",
  async (variable, valueIn) => {
    await inRepository(async (other) => {
      writeFile(other, "a", "a\n");
      runGit(other, ["add", "a"]);
      writeFile(other, "a", "b\n");

      await inRepository(async (repository) => {
        writeFile(repository, "a", "a\n");

        await withVariable(variable, valueIn(other), async () => {
          await git(repository, "add", [], ["a"]);
        });

        expect(runGit(repository, ["show", ":a"])).toBe("a\n");
      });
    });
  },
);
