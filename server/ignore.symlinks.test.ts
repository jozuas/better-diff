import {
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

import * as fc from "fast-check";
import { expect, test } from "vitest";

import { filePath } from "../test/file-names";
import { ignore, status } from "../test/ignoring";
import { inDirectory, inRepository, timeout, writeFile } from "../test/repository";

// What's in the directory, but its .git: each directory, each file with what it has, and each
// symlink with where it points, which isn't followed.
function contentsOf(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .map((entry) => {
      const path = relative(directory, join(entry.parentPath, entry.name));

      if (entry.isSymbolicLink()) {
        return `${path} -> ${readlinkSync(join(directory, path))}`;
      }

      return entry.isDirectory()
        ? `${path}/`
        : `${path}: ${readFileSync(join(directory, path), "utf8")}`;
    })
    .filter((entry) => !entry.startsWith(".git/"))
    .toSorted();
}

// A symlink on the way to the .gitignore a rule goes in.
interface Link {
  // The directory whose .gitignore it is, "" for the root.
  inDirectory: string;
  // The path of the symlink, from the root: the .gitignore's, or a directory's it's in.
  path: string;
  // Whether it's the .gitignore, and points to a file, or a directory, and points to one.
  isGitignore: boolean;
  // Whether what it points to is in the worktree, or outside it.
  inWorktree: boolean;
  // Whether what it points to is there.
  there: boolean;
}

const links: fc.Arbitrary<Link> = fc
  .record({
    inDirectory: fc.oneof(fc.constant(""), filePath),
    at: fc.nat(),
    inWorktree: fc.boolean(),
    there: fc.boolean(),
  })
  .map(({ inDirectory: directory, at, inWorktree, there }) => {
    const names = [...(directory === "" ? [] : directory.split("/")), ".gitignore"];
    const index = at % names.length;

    return {
      inDirectory: directory,
      path: names.slice(0, index + 1).join("/"),
      isGitignore: index === names.length - 1,
      inWorktree,
      there,
    };
  });

// Puts the symlink in the repository, to a `target` in it, or in the directory outside it, which
// is a file with something in it, or a directory, if it's there.
function putLink(repository: string, outside: string, link: Link): void {
  const target = join(link.inWorktree ? repository : outside, "target");

  if (link.there && link.isGitignore) {
    writeFileSync(target, "a");
  } else if (link.there) {
    mkdirSync(target);
  }

  mkdirSync(dirname(join(repository, link.path)), { recursive: true });
  symlinkSync(target, join(repository, link.path));
}

test(
  "a rule goes in no .gitignore that's a symlink, or is beyond one, wherever it points, which it names, and changes nothing",
  async () => {
    await fc.assert(
      fc.asyncProperty(links, async (link) => {
        await inRepository(async (repository) => {
          await inDirectory(async (outside) => {
            putLink(repository, outside, link);
            writeFile(repository, "file", "");

            const before = [contentsOf(repository), contentsOf(outside), status(repository)];

            await expect(
              ignore({
                directory: repository,
                place: { kind: "shared", inDirectory: link.inDirectory },
                rule: "/file",
              }),
            ).resolves.toStrictEqual({ status: "linked", link: link.path });

            expect([contentsOf(repository), contentsOf(outside), status(repository)]).toStrictEqual(
              before,
            );
          });
        });
      }),
      {
        examples: [
          [
            {
              inDirectory: "",
              path: ".gitignore",
              isGitignore: true,
              inWorktree: false,
              there: true,
            },
          ],
          [{ inDirectory: "a/B", path: "a", isGitignore: false, inWorktree: false, there: false }],
          [{ inDirectory: "a/B", path: "a/B", isGitignore: false, inWorktree: true, there: true }],
        ],
      },
    );
  },
  timeout,
);
