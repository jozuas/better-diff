import { highlightCode } from "@getpaseo/highlight";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import { filePath } from "../test/file-names";
import { highlightLines } from "../test/highlights";
import { highlighted, syntaxColors } from "./highlight";

// Pieces of code that start and end what highlighters tell apart, such as strings and comments, and
// what diffs break on: `\r`, tabs and non-ASCII.
const piece = fc.constantFrom(
  "const",
  "def",
  " ",
  "a",
  "1",
  "=",
  '"',
  "'",
  "`",
  "/*",
  "*/",
  "//",
  "#",
  "<a>",
  "{",
  "}",
  "\\",
  "\r",
  "\t",
  "é",
  "中",
  "😀",
);

const lines = fc.array(fc.string({ unit: piece, maxLength: 8 }), { maxLength: 12 });

// A path in one of the languages the highlighter knows, by its extension.
const knownPath = fc
  .tuple(filePath, fc.constantFrom("ts", "tsx", "py", "md", "json", "html", "rs", "nix", "swift"))
  .map(([path, extension]) => `${path}.${extension}`);

// Whether Paseo's highlighter highlights the lines of a version of the file at the path, rather than
// failing on them.
function highlightable(version: readonly string[], path: string): boolean {
  try {
    highlightCode(version.join("\n"), path);

    return true;
  } catch {
    return false;
  }
}

function sum(numbers: readonly number[]): number {
  let total = 0;

  for (const number of numbers) {
    total += number;
  }

  return total;
}

test("each line's runs, each a character or more, make up the line, where Paseo's highlighter highlights it", async () => {
  await fc.assert(
    fc.asyncProperty(lines, knownPath, async (code, path) => {
      fc.pre(highlightable(code, path));

      const highlights = await highlightLines(code, path);

      expect(highlights.map((runs) => sum(runs.map(([length]) => length)))).toStrictEqual(
        code.map((line) => line.length),
      );
      expect(highlights.flat().filter(([length]) => length < 1)).toStrictEqual([]);
    }),
  );
});

test("gives each run the style of Paseo's highlighter, or none", async () => {
  await expect(highlightLines(['const a = "é";'], "a.ts")).resolves.toStrictEqual([
    [
      [5, "keyword"],
      [1, null],
      [1, "definition"],
      [1, null],
      [1, "operator"],
      [1, null],
      [3, "string"],
      [1, "punctuation"],
    ],
  ]);
});

test("highlights each line as part of the whole version, so a line inside a comment an earlier line starts is a comment", async () => {
  const highlights = await highlightLines(["/*", "const a = 1;", "*/", "const b = 2;"], "a.ts");

  expect(highlights[1]).toStrictEqual([[12, "comment"]]);
  expect(highlights[3]?.[0]).toStrictEqual([5, "keyword"]);
});

test.each(["a.txt", "Makefile", "a.ts.orig"])(
  "leaves the lines of a version in a language the highlighter doesn't know, such as %s's, without runs",
  async (path) => {
    await expect(highlightLines(["const a = 1;", "const b = 2;"], path)).resolves.toStrictEqual([
      [],
      [],
    ]);
  },
);

test("leaves the lines of a version Paseo's highlighter fails on, as its Nix grammar fails on a file ending in a backslash, without runs, and still highlights the other version", async () => {
  const { hunks } = await highlighted(
    {
      version: "",
      kind: "text",
      added: 1,
      removed: 1,
      hunks: [
        {
          oldStart: 1,
          newStart: 1,
          lines: [
            { kind: "removed", text: "const{\\", newline: true },
            { kind: "added", text: "const a = 1;", newline: true },
          ],
        },
      ],
      contents: { old: ["const{\\"], new: ["const a = 1;"] },
      renamedFrom: "a.nix",
    },
    "a.ts",
    false,
  );

  expect(hunks[0]?.lines.map(({ runs }) => runs[0])).toStrictEqual([undefined, [5, "keyword"]]);
});

test("gives a version without lines, as of a file it doesn't have, no runs", async () => {
  await expect(highlightLines([], "a.ts")).resolves.toStrictEqual([]);
});

test("highlights a version of up to 786,432 characters, as Paseo's own diff does, and leaves a longer one's lines without runs", async () => {
  await expect(highlightLines(["a".repeat(786_432)], "a.ts")).resolves.toStrictEqual([
    [[786_432, "variable"]],
  ]);
  await expect(highlightLines(["a".repeat(786_433)], "a.ts")).resolves.toStrictEqual([[]]);
});

test("lets the plugin's other work take turns with highlighting", async () => {
  let finished = false;

  const highlighting = (async () => {
    await highlightLines(
      Array.from({ length: 500 }, (_, index) => `const a${index} = ${index};`),
      "a.ts",
    );
    finished = true;
  })();

  const finishedBeforeOtherWork = await new Promise<boolean>((resolve) => {
    setImmediate(() => {
      resolve(finished);
    });
  });

  await highlighting;

  expect(finishedBeforeOtherWork).toBe(false);
});

test("colours each style as Paseo's default syntax theme, One, does: as One Light for a light Paseo theme, and One Dark for a dark one", () => {
  const { light, dark } = syntaxColors();

  expect([light["keyword"], light["string"]]).toStrictEqual(["#a626a4", "#50a14f"]);
  expect([dark["keyword"], dark["string"]]).toStrictEqual(["#c678dd", "#98c379"]);
});
