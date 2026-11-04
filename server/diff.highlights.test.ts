import * as fc from "fast-check";
import { expect, test } from "vitest";

import { diffRpc } from "../shared/diff";
import { syntaxColorsRpc } from "../shared/syntax";
import { commitAll, inRepository, runGit, timeout, writeFile } from "../test/repository";
import type { Diff } from "../test/staging";
import { readDiff } from "./diff";
import { readGroup } from "./groups";
import { syntaxColors } from "./highlight";

test("highlights a diff's removed lines as part of the old version, and its added and unchanged lines as part of the new one, as the diff's schema has them", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a.ts", "/*\nconst a = 1;\n*/\nconst b = 2;\n");
    commitAll(repository);
    writeFile(repository, "a.ts", "const a = 1;\nconst b = 2;\n");

    const diff = await readDiff({ directory: repository, path: "a.ts", side: "unstaged" });
    const { highlights } = diff;

    expect(highlights.old[1]).toStrictEqual([[12, "comment"]]);
    expect([highlights.new[0]?.[0], highlights.new[1]?.[0]]).toStrictEqual([
      [5, "keyword"],
      [5, "keyword"],
    ]);
    expect(diffRpc.output.parse(diff)).toStrictEqual(diff);
  });
});

test("the syntax colours are as their schema has them", () => {
  expect(syntaxColorsRpc.output.parse(syntaxColors())).toStrictEqual(syntaxColors());
});

test("highlights a renamed file's old version in the language of the path it was renamed from", async () => {
  await inRepository(async (repository) => {
    const code = Array.from({ length: 10 }, (_, index) => `const a${index} = ${index};\n`);

    writeFile(repository, "a.ts", code.join(""));
    commitAll(repository);
    runGit(repository, ["mv", "a.ts", "a.txt"]);
    writeFile(repository, "a.txt", ["const b = 0;\n", ...code.slice(1)].join(""));
    runGit(repository, ["add", "a.txt"]);

    const { renamedFrom, highlights } = await readDiff({
      directory: repository,
      path: "a.txt",
      side: "staged",
      entire: true,
    });

    expect(renamedFrom).toBe("a.ts");
    expect(highlights.old.map((runs) => runs[0])).toStrictEqual(
      Array.from({ length: 10 }, () => [5, "keyword"]),
    );
    expect(highlights.new).toStrictEqual([]);
  });
});

// Lines of TypeScript, each one the highlighter reads as a declaration.
function declarations(names: readonly string[]): string {
  return names.map((name) => `const ${name} = 0;\n`).join("");
}

const twenty = Array.from({ length: 20 }, (_, index) => `c${index}`);

test("highlights each of a group's files as its own diff is highlighted, without every line of the versions", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "c.ts", declarations(twenty));
    commitAll(repository);
    writeFile(repository, "a.ts", "const a = 1;\n");
    writeFile(repository, "b.py", "def b():\n  return 2\n");
    writeFile(repository, "c.ts", declarations(twenty.with(0, "changed")));

    async function own(path: string): Promise<Pick<Diff, "highlights" | "contents">> {
      const { highlights, contents } = await readDiff({
        directory: repository,
        path,
        side: "unstaged",
      });

      return { highlights, contents };
    }

    const untracked = await readGroup({ directory: repository, group: "untracked" });
    const modified = await readGroup({ directory: repository, group: "modified" });

    expect(untracked.files).toMatchObject(await Promise.all(["a.ts", "b.py"].map(own)));
    expect(modified.files).toMatchObject([await own("c.ts")]);
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

// The names each line of the version before the changes and after them declares.
function namesBefore(lines: readonly Change[]): string[] {
  return lines.flatMap((change, index) => (change === "added" ? [] : [`a${index}`]));
}

const namesAfterChange: Record<Change, (index: number) => string[]> = {
  kept: (index) => [`a${index}`],
  changed: (index) => [`b${index}`],
  removed: () => [],
  added: (index) => [`added${index}`, `a${index}`],
};

function namesAfter(lines: readonly Change[]): string[] {
  return lines.flatMap((change, index) => namesAfterChange[change](index));
}

// The numbers of the lines of each version git's hunks have, from their headers.
interface HunkLineNumbers {
  old: Set<number>;
  new: Set<number>;
}

function numbersFrom(start: string | undefined, count: string | undefined): number[] {
  return Array.from({ length: Number(count ?? "1") }, (_, line) => Number(start) + line);
}

function hunkLineNumbers(repository: string, path: string): HunkLineNumbers {
  const numbers: HunkLineNumbers = { old: new Set(), new: new Set() };

  const headers = runGit(repository, ["diff", "--", path]).matchAll(
    /^@@ -(?<oldStart>\d+)(?:,(?<oldCount>\d+))? \+(?<newStart>\d+)(?:,(?<newCount>\d+))? @@/gmu,
  );

  for (const { groups } of headers) {
    for (const number of numbersFrom(groups?.["oldStart"], groups?.["oldCount"])) {
      numbers.old.add(number);
    }

    for (const number of numbersFrom(groups?.["newStart"], groups?.["newCount"])) {
      numbers.new.add(number);
    }
  }

  return numbers;
}

type Runs = Diff["highlights"]["old"];

// The version's highlights as a diff without every line of it has them: those of the lines git's
// hunks have, and none of the others before the last of those.
function hunksHighlights(every: Runs, numbers: ReadonlySet<number>): Runs {
  return every
    .slice(0, Math.max(0, ...numbers))
    .map((runs, index) => (numbers.has(index + 1) ? runs : []));
}

test(
  "a diff has the highlights of its hunks' lines as it has them with every line of the versions, and no others, nor the versions' lines, unless it's asked for them",
  async () => {
    await fc.assert(
      fc.asyncProperty(changes, async (lines) => {
        await inRepository(async (repository) => {
          writeFile(repository, "a.ts", declarations(namesBefore(lines)));
          commitAll(repository);
          writeFile(repository, "a.ts", declarations(namesAfter(lines)));

          const read = { directory: repository, path: "a.ts", side: "unstaged" } as const;
          const entire = await readDiff({ ...read, entire: true });
          const numbers = hunkLineNumbers(repository, "a.ts");

          await expect(readDiff(read)).resolves.toStrictEqual({
            ...entire,
            contents: { old: [], new: [] },
            highlights: {
              old: hunksHighlights(entire.highlights.old, numbers.old),
              new: hunksHighlights(entire.highlights.new, numbers.new),
            },
          });
          expect(entire.contents).toStrictEqual({
            old: declarations(namesBefore(lines)).split("\n").slice(0, -1),
            new: declarations(namesAfter(lines)).split("\n").slice(0, -1),
          });
        });
      }),
      { numRuns: 20 },
    );
  },
  timeout,
);
