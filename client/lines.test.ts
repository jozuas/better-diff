import * as fc from "fast-check";
import { expect, test } from "vitest";

import { numberLines } from "./lines";

type Kind = "context" | "removed" | "added";

interface Line {
  kind: Kind;
  text: string;
  newline: boolean;
}

// The lines before a hunk in a version of the file, then the hunk's lines in that version.
function fileVersion(before: number, lines: readonly Line[], without: Kind): string[] {
  return [
    ...Array.from({ length: before }, () => "before"),
    ...lines.flatMap(({ kind, text }) => (kind === without ? [] : [text])),
  ];
}

// A hunk, the old and new versions of the file it's from, and each of its lines with the text the
// versions have where it is, or null for a version without it. Each of the hunk's lines has text no
// other line has, so a number can only find it where it is.
const hunkInFile = fc
  .record({
    oldBefore: fc.nat({ max: 20 }),
    newBefore: fc.nat({ max: 20 }),
    lines: fc.array(
      fc.record({
        kind: fc.constantFrom<Kind>("context", "removed", "added"),
        text: fc.string({ unit: "binary" }),
        newline: fc.boolean(),
      }),
      { minLength: 1 },
    ),
  })
  .map(({ oldBefore, newBefore, lines }) => {
    const unique = lines.map((line, index) => ({ ...line, text: `${index} ${line.text}` }));

    return {
      hunk: { oldStart: oldBefore + 1, newStart: newBefore + 1, lines: unique },
      oldVersion: fileVersion(oldBefore, unique, "added"),
      newVersion: fileVersion(newBefore, unique, "removed"),
      found: unique.map(({ kind, text, newline }) => ({
        kind,
        text,
        newline,
        old: kind === "added" ? null : text,
        new: kind === "removed" ? null : text,
      })),
    };
  });

// The version's line with the number, or null for no number.
function lineAt(version: readonly string[], number: number | undefined): string | null | undefined {
  return number === undefined ? null : version[number - 1];
}

test("numbers each line where it is in the old version of the file and the new one, unless it isn't in that version", () => {
  fc.assert(
    fc.property(hunkInFile, ({ hunk, oldVersion, newVersion, found }) => {
      expect(
        numberLines(hunk).map(({ kind, text, newline, oldNumber, newNumber }) => ({
          kind,
          text,
          newline,
          old: lineAt(oldVersion, oldNumber),
          new: lineAt(newVersion, newNumber),
        })),
      ).toStrictEqual(found);
    }),
  );
});
