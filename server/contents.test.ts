import { join, relative } from "node:path";

import * as fc from "fast-check";
import { expect, test } from "vitest";

import { contentsRpc, largestContents } from "../shared/contents";
import { filePath } from "../test/file-names";
import {
  commitAll,
  deleteFile,
  diffNoIndex,
  indexFile,
  inRepository,
  makeUnreadable,
  runGit,
  timeout,
  writeFile,
  writeSymlink,
} from "../test/repository";
import { readContents } from "./contents";
import { readDiff } from "./diff";

// Reads the file at the path in the repository as the RPC's schemas take and give it.
async function read(repository: string, path: string): ReturnType<typeof readContents> {
  const contents = await readContents(contentsRpc.input.parse({ directory: repository, path }));

  return contentsRpc.output.parse(contents);
}

// Text as diffs break on it: newlines, `\r`, tabs and non-ASCII.
const text = fc.string({
  unit: fc.constantFrom("a", " ", "\n", "\r", "\t", "é", "中", "😀"),
  maxLength: 40,
});

test(
  "reads a file's text as it is in the worktree",
  async () => {
    await fc.assert(
      fc.asyncProperty(filePath, text, async (path, written) => {
        await inRepository(async (repository) => {
          writeFile(repository, path, written);

          await expect(read(repository, path)).resolves.toStrictEqual({
            status: "read",
            text: written,
          });
        });
      }),
      { numRuns: 30 },
    );
  },
  timeout,
);

test("decodes bytes that aren't UTF-8 as the diff's lines do", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", Buffer.from([0x61, 0xff, 0xc3, 0x0a, 0xc3, 0xa9]));

    const { contents } = await readDiff({
      directory: repository,
      path: "a",
      side: "unstaged",
      entire: true,
    });

    await expect(read(repository, "a")).resolves.toStrictEqual({
      status: "read",
      text: contents.map((line) => line.text).join("\n"),
    });
  });
});

// Bytes with a NUL now and then, often near the 8,000th byte, where git stops looking for one.
const bytes = fc
  .record({
    length: fc.oneof(fc.integer({ min: 0, max: 20 }), fc.integer({ min: 7990, max: 8010 })),
    nul: fc.option(fc.oneof(fc.integer({ min: 0, max: 20 }), fc.integer({ min: 7990, max: 8010 }))),
  })
  .map(({ length, nul }) => {
    const content = Buffer.alloc(length, "a");

    if (nul !== null && nul < length) {
      content[nul] = 0;
    }

    return content;
  });

test(
  "refuses a file git takes for binary",
  async () => {
    await fc.assert(
      fc.asyncProperty(bytes, async (content) => {
        await inRepository(async (repository) => {
          writeFile(repository, "a", content);

          // git's diff of a binary file says it differs in place of its lines.
          const binary = diffNoIndex(repository, "/dev/null", "a").toString().includes("Binary");
          const contents = await read(repository, "a");

          expect(contents.status === "binary").toBe(binary);
        });
      }),
      {
        numRuns: 40,
        examples: [
          [Buffer.concat([Buffer.alloc(7999, "a"), Buffer.from([0, 0x61])])],
          [Buffer.concat([Buffer.alloc(8000, "a"), Buffer.from([0])])],
        ],
      },
    );
  },
  timeout,
);

test("reads a file of the largest size it reads", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", Buffer.alloc(largestContents, "a"));

    const contents = await read(repository, "a");

    expect(contents.status).toBe("read");
  });
});

test("refuses a larger file without reading it", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", Buffer.alloc(largestContents + 1, "a"));
    makeUnreadable(repository, "a");

    await expect(read(repository, "a")).resolves.toStrictEqual({ status: "large" });
  });
});

// Where a symlink points: into the worktree, out of it, or by an absolute path, to nothing there.
const target = fc
  .tuple(fc.constantFrom("", "../", "/"), filePath)
  .map(([start, path]) => `${start}${path}`);

test(
  "reads a symlink as the path it points to, as git stores it",
  async () => {
    await fc.assert(
      fc.asyncProperty(filePath, target, async (path, pointsTo) => {
        await inRepository(async (repository) => {
          writeSymlink(repository, path, pointsTo);
          runGit(repository, ["add", "--", path]);

          await expect(read(repository, path)).resolves.toStrictEqual({
            status: "read",
            text: indexFile(repository, path)?.toString("utf8"),
          });
        });
      }),
      { numRuns: 30 },
    );
  },
  timeout,
);

test("reads a symlink to a file outside the directory as the path, not the file", async () => {
  await inRepository(async (repository) => {
    await inRepository(async (outside) => {
      const secret = join(outside, "secret");

      writeFile(outside, "secret", "secret\n");
      writeSymlink(repository, "link", secret);

      await expect(read(repository, "link")).resolves.toStrictEqual({
        status: "read",
        text: secret,
      });
    });
  });
});

test.each([
  ["deleted", "gone"],
  ["a directory, as a repository inside the repository is", "inner/"],
  ["under a file", "file/a"],
])("finds no file at a path that's %s", async (_, path) => {
  await inRepository(async (repository) => {
    writeFile(repository, "gone", "gone\n");
    writeFile(repository, "file", "file\n");
    commitAll(repository);
    deleteFile(repository, "gone");
    writeFile(repository, "inner/a", "a\n");
    runGit(join(repository, "inner"), ["init", "--quiet"]);

    await expect(read(repository, path)).resolves.toStrictEqual({
      status: "absent",
    });
  });
});

test("finds no file outside the directory, though there is one", async () => {
  await inRepository(async (repository) => {
    await inRepository(async (outside) => {
      writeFile(outside, "secret", "secret\n");

      const secret = join(outside, "secret");

      await expect(read(repository, relative(repository, secret))).resolves.toStrictEqual({
        status: "absent",
      });
      await expect(read(repository, secret)).resolves.toStrictEqual({
        status: "absent",
      });
    });
  });
});

test("fails to read a file it has no permission to read", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    makeUnreadable(repository, "a");

    await expect(read(repository, "a")).rejects.toThrow(/EACCES/u);
  });
});
