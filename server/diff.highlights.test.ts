import { highlightCode } from "@getpaseo/highlight";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import { diffRpc } from "../shared/diff";
import { syntaxColorsRpc } from "../shared/syntax";
import { longestHighlighted, wereKept } from "../test/highlights";
import { commitAll, inRepository, runGit, timeout, writeFile } from "../test/repository";
import type { Diff } from "../test/staging";
import { readDiff } from "./diff";
import { readGroup } from "./groups";
import { syntaxColors } from "./highlight";

type Line = Diff["hunks"][number]["lines"][number];

type Runs = Line["runs"];

// Each of the diff's hunks' lines, as its kind, its text, and the first of its runs.
function firstRuns({ hunks }: Diff): [Line["kind"], string, Runs[number] | undefined][] {
  return hunks.flatMap(({ lines }) => lines.map(({ kind, text, runs }) => [kind, text, runs[0]]));
}

test("highlights a diff's removed lines as part of the old version, and its added and unchanged lines as part of the new one, as the diff's schema has them", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a.ts", "/*\nconst r = 1;\nconst c = 2;\n*/\n");
    commitAll(repository);
    writeFile(repository, "a.ts", "const c = 2;\nconst a = 3;\n");

    const diff = await readDiff({
      directory: repository,
      path: "a.ts",
      side: "unstaged",
      entire: true,
    });

    expect(firstRuns(diff)).toStrictEqual([
      ["removed", "/*", [2, "comment"]],
      ["removed", "const r = 1;", [12, "comment"]],
      ["context", "const c = 2;", [5, "keyword"]],
      ["removed", "*/", [2, "comment"]],
      ["added", "const a = 3;", [5, "keyword"]],
    ]);
    expect(diffRpc.output.parse(diff)).toStrictEqual(diff);
  });
});

test("the syntax colours are as their schema has them", () => {
  expect(syntaxColorsRpc.output.parse(syntaxColors())).toStrictEqual(syntaxColors());
});

test("highlights a renamed file's removed lines in the language of the path it was renamed from", async () => {
  await inRepository(async (repository) => {
    const code = Array.from({ length: 10 }, (_, index) => `const a${index} = ${index};\n`);

    writeFile(repository, "a.ts", code.join(""));
    commitAll(repository);
    runGit(repository, ["mv", "a.ts", "a.txt"]);
    writeFile(repository, "a.txt", ["const b = 0;\n", ...code.slice(1)].join(""));
    runGit(repository, ["add", "a.txt"]);

    const diff = await readDiff({ directory: repository, path: "a.txt", side: "staged" });

    expect(diff.renamedFrom).toBe("a.ts");
    expect(firstRuns(diff)).toStrictEqual([
      ["removed", "const a0 = 0;", [5, "keyword"]],
      ["added", "const b = 0;", undefined],
      ["context", "const a1 = 1;", undefined],
      ["context", "const a2 = 2;", undefined],
      ["context", "const a3 = 3;", undefined],
    ]);
  });
});

// Lines of TypeScript, each one the highlighter reads as a declaration.
function declarations(names: readonly string[]): string {
  return names.map((name) => `const ${name} = 0;\n`).join("");
}

const twenty = Array.from({ length: 20 }, (_, index) => `c${index}`);

test("highlights each of a group's files as its own diff is highlighted, without contents", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "c.ts", declarations(twenty));
    commitAll(repository);
    writeFile(repository, "a.ts", "const a = 1;\n");
    writeFile(repository, "b.py", "def b():\n  return 2\n");
    writeFile(repository, "c.ts", declarations(twenty.with(0, "changed")));

    async function own(path: string): Promise<Pick<Diff, "hunks" | "contents">> {
      const { hunks, contents } = await readDiff({ directory: repository, path, side: "unstaged" });

      return { hunks, contents };
    }

    const untracked = await readGroup({ directory: repository, group: "untracked" });
    const modified = await readGroup({ directory: repository, group: "modified" });

    expect(untracked.files).toMatchObject(await Promise.all(["a.ts", "b.py"].map(own)));
    expect(modified.files).toMatchObject([await own("c.ts")]);
  });
});

test("highlights a group's files together, so of a group too large for all their highlights to be kept, reading it again finds those of its first file kept", async () => {
  await inRepository(async (repository) => {
    const versions = Array.from({ length: 11 }, (_, index) =>
      String(index).padStart(longestHighlighted, "a"),
    );

    for (const [index, version] of versions.entries()) {
      writeFile(repository, `${index}.ts`, version);
    }

    await readGroup({ directory: repository, group: "untracked" });

    await expect(wereKept(versions.slice(0, 1), "0.ts")).resolves.toBe(true);
  });
});

// What changes each line of a version: nothing, its text, taking it out, or adding one before it.
type Change = "kept" | "changed" | "removed" | "added";

// Mostly kept, so that the diff has lines between and around its hunks, and at least one changed.
const changes = fc
  .array(
    fc.constantFrom<Change>("kept", "kept", "kept", "kept", "kept", "changed", "removed", "added"),
    { minLength: 1, maxLength: 40 },
  )
  .filter((lines) => lines.some((change) => change !== "kept"));

// The names lines declare, of a different length each, so that each line's runs tell it apart: an
// odd one for those of the version before the changes, and an even one for those the changes make.
function before(index: number): string {
  return "a".repeat(2 * index + 1);
}

function made(index: number): string {
  return "b".repeat(2 * index + 2);
}

// The names each line of the version before the changes and after them declares.
function namesBefore(lines: readonly Change[]): string[] {
  return lines.flatMap((change, index) => (change === "added" ? [] : [before(index)]));
}

const namesAfterChange: Record<Change, (index: number) => string[]> = {
  kept: (index) => [before(index)],
  changed: (index) => [made(index)],
  removed: () => [],
  added: (index) => [made(index), before(index)],
};

function namesAfter(lines: readonly Change[]): string[] {
  return lines.flatMap((change, index) => namesAfterChange[change](index));
}

// The lines of a version of a.ts, and their runs, as Paseo's highlighter highlights it whole.
interface Version {
  lines: string[];
  runs: Runs[];
}

function versionOf(code: string): Version {
  return {
    lines: code.split("\n").slice(0, -1),
    runs: highlightCode(code, "a.ts").map((tokens) =>
      tokens.flatMap(({ text, style }): Runs => (text.length > 0 ? [[text.length, style]] : [])),
    ),
  };
}

// The runs the line has in its version, a removed line in the old one and any other in the new one,
// found by its text, which no other line of the version has.
function runsIn(versions: Record<"old" | "new", Version>, { kind, text }: Line): Runs | undefined {
  const version = versions[kind === "removed" ? "old" : "new"];

  return version.runs[version.lines.indexOf(text)];
}

test(
  "each of a diff's hunks' lines has the runs it has in its version, highlighted whole, and a diff has every line of the new version, with its runs, only if it's asked for them",
  async () => {
    await fc.assert(
      fc.asyncProperty(changes, async (lines) => {
        await inRepository(async (repository) => {
          writeFile(repository, "a.ts", declarations(namesBefore(lines)));
          commitAll(repository);
          writeFile(repository, "a.ts", declarations(namesAfter(lines)));

          const versions = {
            old: versionOf(declarations(namesBefore(lines))),
            new: versionOf(declarations(namesAfter(lines))),
          };

          const read = { directory: repository, path: "a.ts", side: "unstaged" } as const;
          const entire = await readDiff({ ...read, entire: true });
          const hunkLines = entire.hunks.flatMap((hunk) => hunk.lines);

          expect(hunkLines.map(({ runs }) => runs)).toStrictEqual(
            hunkLines.map((line) => runsIn(versions, line)),
          );
          expect(entire.contents).toStrictEqual(
            versions.new.lines.map((text, index) => ({ text, runs: versions.new.runs[index] })),
          );
          await expect(readDiff(read)).resolves.toStrictEqual({ ...entire, contents: [] });
        });
      }),
      { numRuns: 20 },
    );
  },
  timeout,
);
