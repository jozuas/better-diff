import { expect, test } from "vitest";

import { highlightLines } from "../test/highlights";
import { highlighted } from "./highlight";
import type { UnhighlightedDiff } from "./highlight";

// The most characters a version can have to be highlighted, and the most the versions whose
// highlights are kept can have in all.
const longest = 786_432;
const mostKept = 8_388_608;

let versionsMade = 0;

// A version of a file of one line, of the characters given, unlike any other.
function newVersion(characters: number): string[] {
  versionsMade += 1;

  return [String(versionsMade).padStart(characters, "a")];
}

// The highlights of the lines of a new file at a.ts, and whether highlighting them finished before
// other work waiting for its turn took it, as it does only where they were kept rather than
// highlighted anew: highlighting gives other work a turn at least once.
async function highlight(
  lines: string[],
): Promise<{ runs: Awaited<ReturnType<typeof highlightLines>>; kept: boolean }> {
  let finished = false;

  const otherWork = new Promise<boolean>((resolve) => {
    setImmediate(() => {
      resolve(finished);
    });
  });

  const highlighting = (async () => {
    const runs = await highlightLines(lines, "a.ts");

    finished = true;

    return runs;
  })();

  return { kept: await otherWork, runs: await highlighting };
}

async function kept(lines: string[]): Promise<boolean> {
  const highlighting = await highlight(lines);

  return highlighting.kept;
}

// Highlights as many versions of the most characters a version can have as it takes to forget every
// other version, which keeps ten of them, and gives the one of those highlighted least lately.
async function keepOnlyLongest(): Promise<string[]> {
  const leastLately = newVersion(longest);

  const versions = [
    newVersion(longest),
    leastLately,
    ...Array.from({ length: 9 }, () => newVersion(longest)),
  ];

  await Promise.all(
    versions.map(async (version) => {
      await highlightLines(version, "a.ts");
    }),
  );

  return leastLately;
}

// The characters the versions kept can have in all besides those ten.
const room = mostKept - 10 * longest;

test("highlights a version anew only if it wasn't lately, so highlighting it again finishes before the plugin's other work takes a turn, with the same runs", async () => {
  const version = ['const a = "é";', "// b"];
  const first = await highlight(version);

  await expect(highlight(version)).resolves.toStrictEqual({ runs: first.runs, kept: true });
  expect(first.kept).toBe(false);
});

test("keeps the highlights of versions of up to 8 MiB characters in all", async () => {
  const leastLately = await keepOnlyLongest();

  await highlightLines(newVersion(room), "a.ts");

  await expect(kept(leastLately)).resolves.toBe(true);
});

test("forgets the highlights of the version highlighted least lately once those kept have more than 8 MiB characters in all", async () => {
  const leastLately = await keepOnlyLongest();

  await highlightLines(newVersion(room + 1), "a.ts");

  await expect(kept(leastLately)).resolves.toBe(false);
});

test("counts highlighting a version again as highlighting it lately", async () => {
  const highlightedAgain = await keepOnlyLongest();

  await expect(kept(highlightedAgain)).resolves.toBe(true);

  await highlightLines(newVersion(room + 1), "a.ts");

  await expect(kept(highlightedAgain)).resolves.toBe(true);
});

test("keeps a version's highlights apart from those of the same code at another path, which may be in another language", async () => {
  await expect(highlightLines(["# a"], "a.py")).resolves.toStrictEqual([[[3, "comment"]]]);
  await expect(highlightLines(["# a"], "a.md")).resolves.toStrictEqual([
    [
      [1, "heading meta"],
      [2, "heading"],
    ],
  ]);
});

// The diff of a.ts from a version of one line to the line with another after it, or to the other in
// its place.
function diffFrom([line = ""]: readonly string[], replaces: boolean): UnhighlightedDiff {
  return {
    version: "",
    kind: "text",
    added: 1,
    removed: replaces ? 1 : 0,
    hunks: [
      {
        oldStart: 1,
        newStart: 1,
        lines: [
          { kind: replaces ? "removed" : "context", text: line, newline: true },
          { kind: "added", text: "b", newline: true },
        ],
      },
    ],
    contents: { old: [line], new: replaces ? ["b"] : [line, "b"] },
  };
}

test("highlights a diff's old version only where the diff removes lines, as only removed lines are shown from it", async () => {
  const followed = newVersion(1);
  const replaced = newVersion(1);

  // Telling whether a version is kept reads it as a new file's, whose old version has no lines:
  // kept from here on, so telling never waits on highlighting that.
  await highlightLines([], "a.ts");
  await highlighted(diffFrom(followed, false), "a.ts", false);
  await highlighted(diffFrom(replaced, true), "a.ts", false);

  await expect(kept(followed)).resolves.toBe(false);
  await expect(kept(replaced)).resolves.toBe(true);
});
