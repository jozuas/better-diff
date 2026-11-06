import * as fc from "fast-check";
import { expect, test } from "vitest";

import { canCoexist, filePath } from "../test/file-names";
import { ignore, readPatterns, status, untracked } from "../test/ignoring";
import { commitAll, inRepository, runGit, timeout, writeFile } from "../test/repository";

// Whether a rule naming the path names the other path too: a rule can't have a newline or a
// carriage return, so `?` takes their place, and matches any byte but a `/` there.
function sameBut(path: string, other: string): boolean {
  const bytes = Buffer.from(path);
  const others = Buffer.from(other);

  return (
    bytes.length === others.length &&
    [...bytes].every((byte, at) =>
      byte === 0x0a || byte === 0x0d ? others[at] !== 0x2f : others[at] === byte,
    )
  );
}

// Whether a rule naming the path ignores the other path too, as it ignores what's in a directory it
// names.
function alsoNamed(path: string, other: string): boolean {
  const names = other.split("/");

  return names.some((_, index) => sameBut(path, names.slice(0, index + 1).join("/")));
}

// Untracked files, the one whose menu ignores it, and the directory it's in, or the root, whose
// .gitignore the rule goes in.
const files = fc
  .tuple(filePath, fc.array(filePath, { maxLength: 4 }), fc.nat())
  .filter(([file, others]) => canCoexist([file, ...others]))
  .map(([file, others, depth]) => {
    const directories = file.split("/").slice(0, -1);

    return {
      file,
      others,
      base: directories.slice(0, depth % (directories.length + 1)).join("/"),
    };
  });

// The .gitignore of the directory at the path, "" for the root.
function gitignoreIn(base: string): string {
  return base === "" ? ".gitignore" : `${base}/.gitignore`;
}

test(
  "the default a file's menu ignores it with in a .gitignore ignores it, and what differs from it only where a rule can't name it",
  async () => {
    await fc.assert(
      fc.asyncProperty(files, async ({ file, others, base }) => {
        await inRepository(async (repository) => {
          for (const path of [file, ...others]) {
            writeFile(repository, path, "");
          }

          const { default: rule } = await readPatterns({
            directory: repository,
            path: file,
            inDirectory: base,
          });

          expect(rule).toStrictEqual(expect.any(String));

          await ignore({
            directory: repository,
            place: { kind: "shared", inDirectory: base },
            rule: String(rule),
          });

          expect(untracked(repository)).toStrictEqual(
            others.filter((other) => !alsoNamed(file, other)).toSorted(),
          );
          expect(status(repository)).toContain(`staged ${gitignoreIn(base)}`);
        });
      }),
      {
        examples: [
          [{ file: "a\n", others: ["aB", "a"], base: "" }],
          [{ file: "\r", others: ["a/a"], base: "" }],
          [{ file: "a/b  ", others: ["a/b"], base: "a" }],
        ],
      },
    );
  },
  timeout,
);

// The default candidate for a rule ignoring the untracked file at the path, at the root.
async function defaultFor(repository: string, path: string): Promise<string | null> {
  const { default: rule } = await readPatterns({ directory: repository, path, inDirectory: "" });

  return rule;
}

test("a name is escaped where a pattern would read it as more than the name", async () => {
  await inRepository(async (repository) => {
    for (const path of ["a*b?[c]\\ d  ", "a\nb\r", "!#a b"]) {
      writeFile(repository, path, "");
    }

    await expect(defaultFor(repository, "a*b?[c]\\ d  ")).resolves.toBe(
      "/a\\*b\\?\\[c]\\\\ d\\ \\ ",
    );
    await expect(defaultFor(repository, "a\nb\r")).resolves.toBe("/a?b?");
    await expect(defaultFor(repository, "!#a b")).resolves.toBe("/!#a b");
  });
});

test("the candidates are Magit's: each path anchored, and each extension's globs, sorted by code point", async () => {
  await inRepository(async (repository) => {
    for (const path of [
      "README",
      "a.log",
      ".env",
      "trailing.",
      "x.tar.gz",
      "src/out/app.log",
      "src/out/b.log",
      "v1.2/notes",
      "\uFF01",
      "😀",
    ]) {
      writeFile(repository, path, "");
    }

    await expect(
      readPatterns({ directory: repository, path: "README", inDirectory: "" }),
    ).resolves.toStrictEqual({
      patterns: [
        "*.gz",
        "*.log",
        "/.env",
        "/README",
        "/a.log",
        "/src/",
        "/src/out/*.log",
        "/src/out/app.log",
        "/src/out/b.log",
        "/trailing.",
        "/v1.2/",
        "/v1.2/notes",
        "/x.tar.gz",
        "/\uFF01",
        "/😀",
      ],
      default: "/README",
    });
  });
});

test("a directory's candidates are of what's untracked in it, from it, with directories git status lists as untracked", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "src/tracked.txt", "");
    commitAll(repository);
    writeFile(repository, "src/out/app.log", "");
    writeFile(repository, "src/new/a.ts", "");
    writeFile(repository, "src/b.txt", "");
    writeFile(repository, "top.log", "");

    await expect(
      readPatterns({ directory: repository, path: "src/out/app.log", inDirectory: "src" }),
    ).resolves.toStrictEqual({
      patterns: [
        "*.log",
        "*.ts",
        "*.txt",
        "/b.txt",
        "/new/",
        "/new/*.ts",
        "/new/a.ts",
        "/out/",
        "/out/*.log",
        "/out/app.log",
      ],
      default: "/out/app.log",
    });

    await expect(
      readPatterns({ directory: repository, path: "top.log", inDirectory: "" }),
    ).resolves.toStrictEqual({
      patterns: [
        "*.log",
        "*.ts",
        "*.txt",
        "/src/*.txt",
        "/src/b.txt",
        "/src/new/",
        "/src/new/*.ts",
        "/src/new/a.ts",
        "/src/out/",
        "/src/out/*.log",
        "/src/out/app.log",
        "/top.log",
      ],
      default: "/top.log",
    });
  });
});

test("a file that's no longer untracked has no default", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a.log", "");
    writeFile(repository, "b.log", "");
    runGit(repository, ["add", "a.log"]);

    await expect(
      readPatterns({ directory: repository, path: "a.log", inDirectory: "" }),
    ).resolves.toStrictEqual({ patterns: ["*.log", "/b.log"], default: null });
  });
});

test("a file has candidates only from a directory it's in", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "ab/c", "");

    await expect(
      readPatterns({ directory: repository, path: "ab/c", inDirectory: "a" }),
    ).rejects.toThrow("ab/c isn't in a.");
  });
});
