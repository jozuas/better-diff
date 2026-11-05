import { expect, test } from "vitest";

import {
  highlightLines,
  highlightLinesKept,
  longestHighlighted,
  mostKept,
  newFile,
  wereKept,
} from "../test/highlights";
import { highlighted, highlightedTogether } from "./highlight";
import type { UnhighlightedDiff } from "./highlight";

let versionsMade = 0;

// A version of a file of one line, of the characters given, unlike any other.
function newVersion(characters: number): string[] {
  versionsMade += 1;

  return [String(versionsMade).padStart(characters, "a")];
}

async function kept(lines: string[]): Promise<boolean> {
  const read = await wereKept(lines, "a.ts");

  return read;
}

// Highlights as many versions of the most characters a version can have as it takes to forget every
// other version, which keeps ten of them, and gives the one of those highlighted least lately.
async function keepOnlyLongest(): Promise<string[]> {
  const leastLately = newVersion(longestHighlighted);

  const versions = [
    newVersion(longestHighlighted),
    leastLately,
    ...Array.from({ length: 9 }, () => newVersion(longestHighlighted)),
  ];

  await Promise.all(
    versions.map(async (version) => {
      await highlightLines(version, "a.ts");
    }),
  );

  return leastLately;
}

// The characters the versions kept can have in all besides those ten.
const room = mostKept - 10 * longestHighlighted;

test("highlights a version anew only if it wasn't lately, so highlighting it again finishes before the plugin's other work takes a turn, with the same runs", async () => {
  const version = ['const a = "é";', "// b"];
  const first = await highlightLinesKept(version, "a.ts");

  await expect(highlightLinesKept(version, "a.ts")).resolves.toStrictEqual({
    runs: first.runs,
    kept: true,
  });
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

test("of versions highlighted together that don't fit in 8 MiB characters, keeps the highlights of as many as fit, those highlighted first, as a group's view reads its files in the same order each time", async () => {
  const first = newVersion(longestHighlighted);
  const lastFitting = newVersion(longestHighlighted);
  const notFitting = newVersion(longestHighlighted);

  await highlightedTogether((highlight) =>
    [
      first,
      ...Array.from({ length: 8 }, () => newVersion(longestHighlighted)),
      lastFitting,
      notFitting,
    ].map(async (version) => {
      const read = await highlight(newFile(version), "a.ts", false);

      return read;
    }),
  );

  await expect(kept(first)).resolves.toBe(true);
  await expect(kept(lastFitting)).resolves.toBe(true);
  await expect(kept(notFitting)).resolves.toBe(false);
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
