import { expect, test } from "vitest";

import { applyLinesRpc, diffRpc } from "../shared/diff";
import { commitTenLines, tenLines } from "../test/renames";
import {
  commitAll,
  deleteFile,
  indexFile,
  inRepository,
  makeExecutable,
  runGit,
  writeFile,
  writeSymlink,
} from "../test/repository";
import { applyFile, applyLines, applyMode, readDiff } from "./diff";

// Twenty numbered lines, but for those at the indices, which are replaced.
function twentyLines(replaced: Record<number, string> = {}): string {
  return Array.from({ length: 20 }, (_, index) => `${replaced[index] ?? `line ${index}`}\n`).join(
    "",
  );
}

const indented = "a\n  b\nc\nd\n";

test("with whitespace changes hidden, a line whose only change is to whitespace is unchanged, as the new version has it, and a hunk of only such lines is left out", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", twentyLines());
    commitAll(repository);
    writeFile(repository, "a", twentyLines({ 1: "\tline 1", 3: "changed", 18: "  line 18" }));

    const read = { directory: repository, path: "a", side: "unstaged" } as const;
    const shown = await readDiff(read);
    const diff = await readDiff({ ...read, hideWhitespace: true });

    expect(shown.hunks).toHaveLength(2);
    expect(diff).toMatchObject({ kind: "text", added: 1, removed: 1 });
    expect(diff.hunks).toStrictEqual([
      {
        oldStart: 1,
        newStart: 1,
        lines: [
          { kind: "context", text: "line 0", newline: true, runs: [] },
          { kind: "context", text: "\tline 1", newline: true, runs: [] },
          { kind: "context", text: "line 2", newline: true, runs: [] },
          { kind: "removed", text: "line 3", newline: true, runs: [] },
          { kind: "added", text: "changed", newline: true, runs: [] },
          { kind: "context", text: "line 4", newline: true, runs: [] },
          { kind: "context", text: "line 5", newline: true, runs: [] },
          { kind: "context", text: "line 6", newline: true, runs: [] },
        ],
      },
    ]);
  });
});

test("with whitespace changes hidden, a file whose changes are all to whitespace has no lines or counts, and staging the file stages them", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", indented);
    commitAll(repository);
    writeFile(repository, "a", "a\n\tb\nc\nd\r\n");

    const read = {
      directory: repository,
      path: "a",
      side: "unstaged",
      hideWhitespace: true,
    } as const;

    const diff = await readDiff(read);

    expect(diffRpc.output.parse(diff)).toMatchObject({
      kind: "whitespace",
      added: 0,
      removed: 0,
      hunks: [],
      contents: [],
    });
    await expect(
      applyFile({ ...read, operation: "stage", version: diff.version }),
    ).resolves.toStrictEqual({ status: "applied" });
    expect(indexFile(repository, "a")?.toString()).toBe("a\n\tb\nc\nd\r\n");
  });
});

test("with whitespace changes hidden, a file made executable whose other changes are all to whitespace has its mode change, and staging that leaves them", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", indented);
    commitAll(repository);
    writeFile(repository, "a", "a\n\tb\nc\nd\n");
    makeExecutable(repository, "a");

    const read = {
      directory: repository,
      path: "a",
      side: "unstaged",
      hideWhitespace: true,
    } as const;

    const diff = await readDiff(read);

    expect(diff).toMatchObject({ kind: "whitespace", mode: { old: "100644", new: "100755" } });
    await expect(
      applyMode({ ...read, operation: "stage", version: diff.version }),
    ).resolves.toStrictEqual({ status: "applied" });
    expect(runGit(repository, ["diff", "--cached", "--name-status"])).toBe("M\ta\n");
    expect(indexFile(repository, "a")?.toString()).toBe(indented);
  });
});

test("with whitespace changes hidden, a new empty file is an empty text file's diff", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "");
    runGit(repository, ["add", "--", "a"]);

    await expect(
      readDiff({ directory: repository, path: "a", side: "staged", hideWhitespace: true }),
    ).resolves.toMatchObject({ kind: "text", hunks: [] });
  });
});

test("with whitespace changes hidden, an untracked file shows all of its lines", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "  a\n");

    const diff = await readDiff({
      directory: repository,
      path: "a",
      side: "unstaged",
      hideWhitespace: true,
    });

    expect(diff).toMatchObject({
      kind: "text",
      hunks: [{ lines: [{ kind: "added", text: "  a", newline: true, runs: [] }] }],
    });
  });
});

// Moves `a` to `b` without git, as `mv` does, and indents one of its lines.
function moveIndenting(repository: string): void {
  commitTenLines(repository);
  deleteFile(repository, "a");
  writeFile(repository, "b", tenLines.replace("2\n", " 2\n"));
}

test("with whitespace changes hidden, a file renamed and staged whose other changes are all to whitespace has no lines, and shows the rename", async () => {
  await inRepository(async (repository) => {
    moveIndenting(repository);
    runGit(repository, ["add", "--all"]);

    await expect(
      readDiff({ directory: repository, path: "b", side: "staged", hideWhitespace: true }),
    ).resolves.toMatchObject({ kind: "whitespace", renamedFrom: "a", hunks: [] });
  });
});

test("with whitespace changes hidden, a file moved without git whose other changes are all to whitespace has no lines, and shows the rename", async () => {
  await inRepository(async (repository) => {
    moveIndenting(repository);

    await expect(
      readDiff({ directory: repository, path: "b", side: "unstaged", hideWhitespace: true }),
    ).resolves.toMatchObject({ kind: "whitespace", renamedFrom: "a", hunks: [] });
  });
});

test("with whitespace changes hidden, a symlink whose target changes only in whitespace is a symlink's diff", async () => {
  await inRepository(async (repository) => {
    writeSymlink(repository, "a", "target");
    commitAll(repository);
    deleteFile(repository, "a");
    writeSymlink(repository, "a", "target ");

    await expect(
      readDiff({ directory: repository, path: "a", side: "unstaged", hideWhitespace: true }),
    ).resolves.toMatchObject({ kind: "symlink" });
  });
});

test("an action on a diff read with whitespace changes hidden is stale once they show, and the other way round", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");
    commitAll(repository);
    writeFile(repository, "a", "b\n");

    const action = { directory: repository, path: "a", operation: "stage" } as const;
    const read = { directory: repository, path: "a", side: "unstaged" } as const;
    const shown = await readDiff(read);
    const hiding = await readDiff({ ...read, hideWhitespace: true });

    expect(hiding.version).not.toBe(shown.version);
    await expect(applyFile({ ...action, version: hiding.version })).resolves.toStrictEqual({
      status: "stale",
    });
    await expect(
      applyFile({ ...action, version: shown.version, hideWhitespace: true }),
    ).resolves.toStrictEqual({ status: "stale" });
    expect(indexFile(repository, "a")?.toString()).toBe("a\n");
  });
});

test("an action on a diff read with whitespace changes hidden is stale once they change, though they don't show", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\nb\n");
    commitAll(repository);
    writeFile(repository, "a", "a\nc\n");

    const read = {
      directory: repository,
      path: "a",
      side: "unstaged",
      hideWhitespace: true,
    } as const;

    const { version } = await readDiff(read);

    writeFile(repository, "a", " a\nc\n");

    const answer = await applyLines({
      ...read,
      operation: "stage",
      version,
      lines: [{ hunk: 0, line: 1 }],
    });

    expect(applyLinesRpc.output.parse(answer)).toStrictEqual({ status: "stale" });
    expect(indexFile(repository, "a")?.toString()).toBe("a\nb\n");
  });
});
