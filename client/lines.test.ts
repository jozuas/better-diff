import * as fc from "fast-check";
import { expect, test } from "vitest";

import { hunkLines } from "../test/hunk-lines";
import { aboveHunks, lineKey, numberLines, unchangedLines } from "./lines";
import type { NumberedLine, RunShown } from "./lines";

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
    const unique = lines.map((line, index) => ({
      ...line,
      text: `${index} ${line.text}`,
      runs: [],
    }));

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

// A line of a file as a diff with every line of context has it, with its runs: in the hunk at an
// index, or else unchanged, in the gap at an index, which is before the hunk with that index, or
// after the last.
interface FileLine extends Line {
  runs: NumberedLine["runs"];
  hunk: number | undefined;
  gap: number | undefined;
}

const lineText = fc.string({ unit: "binary" });

const hunkLine = fc.record({
  kind: fc.constantFrom<Kind>("context", "removed", "added"),
  text: lineText,
  newline: fc.boolean(),
});

function gapLines(texts: readonly string[], gap: number): Omit<FileLine, "runs">[] {
  return texts.map((text) => ({ kind: "context", text, newline: true, hunk: undefined, gap }));
}

// Where a hunk starts in a version, with `before` of its lines before it and `count` in it: git
// starts one without any at the line before it.
function startOf(before: number, count: number): number {
  return count > 0 ? before + 1 : before;
}

// How many of the lines are in a version.
function countIn(lines: readonly FileLine[], without: Kind): number {
  return lines.filter(({ kind }) => kind !== without).length;
}

// The gap's lines, each with the text of each version where it is.
function foundIn(lines: readonly FileLine[], gap: number): unknown[] {
  return lines.flatMap((line) =>
    line.gap === gap
      ? [
          {
            kind: "context",
            text: line.text,
            newline: true,
            runs: line.runs,
            old: line.text,
            new: line.text,
          },
        ]
      : [],
  );
}

// A file's lines, some in hunks and the rest unchanged, around them, the diff of the file, its
// versions, the unchanged lines before the first hunk and after each one, each with the text of
// each version where it is, and whether any of the file's lines are above each hunk. Each line has
// text no other line has, so a number can only find it where it is, and runs no other line has.
// Hunks often have none of a version's lines, as where they only add or remove lines.
const fileInHunks = fc
  .record({
    sections: fc.array(
      fc.record({
        unchanged: fc.array(lineText, { maxLength: 4 }),
        hunk: fc.array(hunkLine, { minLength: 1, maxLength: 4 }),
      }),
      { maxLength: 4 },
    ),
    end: fc.array(lineText, { maxLength: 4 }),
  })
  .map(({ sections, end }) => {
    const lines = [
      ...sections.flatMap((section, hunk) => [
        ...gapLines(section.unchanged, hunk),
        ...section.hunk.map(({ kind, text, newline }) => ({
          kind,
          text,
          newline,
          hunk,
          gap: undefined,
        })),
      ]),
      ...gapLines(end, sections.length),
    ].map(({ kind, text, newline, hunk, gap }, index): FileLine => ({
      kind,
      text: `${index} ${text}`,
      newline,
      runs: [[index + 1, null]],
      hunk,
      gap,
    }));

    const hunks = sections.map((_, hunk) => {
      const before = lines.slice(
        0,
        lines.findIndex((line) => line.hunk === hunk),
      );

      const inHunk = lines.filter((line) => line.hunk === hunk);

      return {
        oldStart: startOf(countIn(before, "added"), countIn(inHunk, "added")),
        newStart: startOf(countIn(before, "removed"), countIn(inHunk, "removed")),
        lines: inHunk.map(({ kind, text, newline, runs }) => ({ kind, text, newline, runs })),
      };
    });

    return {
      diff: {
        hunks,
        contents: lines.flatMap(({ kind, text, runs }) =>
          kind === "removed" ? [] : [{ text, runs }],
        ),
      },
      versions: {
        old: lines.flatMap((line) => (line.kind === "added" ? [] : [line.text])),
        new: lines.flatMap((line) => (line.kind === "removed" ? [] : [line.text])),
      },
      found: {
        before: foundIn(lines, 0),
        after: sections.map((_, hunk) => foundIn(lines, hunk + 1)),
      },
      above: sections.map((_, hunk) => lines.findIndex((line) => line.hunk === hunk) > 0),
    };
  });

// The lines, each with the text each version has where its numbers say it is.
function read(
  versions: { old: string[]; new: string[] },
  lines: readonly NumberedLine[],
): unknown[] {
  return lines.map(({ kind, text, newline, runs, oldNumber, newNumber }) => ({
    kind,
    text,
    newline,
    runs,
    old: lineAt(versions.old, oldNumber),
    new: lineAt(versions.new, newNumber),
  }));
}

test("the unchanged lines are those of both versions before the first hunk and after each one, each numbered where it is in them, with its runs", () => {
  fc.assert(
    fc.property(fileInHunks, ({ diff, versions, found }) => {
      const { before, after } = unchangedLines(diff);

      expect({
        before: read(versions, before),
        after: after.map((lines) => read(versions, lines)),
      }).toStrictEqual(found);
    }),
  );
});

// How each run of unchanged lines above a hunk shows, by the hunk's index, round the array.
const runsShown = fc
  .array(fc.constantFrom<RunShown>("kept", "open", "hidden"), { minLength: 1 })
  .map((shown) => (index: number) => shown[index % shown.length] ?? "hidden");

test("a hunk's bar says how many unchanged lines are above it, between it and the hunk before it, or the start of the file, how they show, and separates it from any of the file's lines above it, shown or not", () => {
  fc.assert(
    fc.property(fileInHunks, runsShown, ({ diff, found, above }, shows) => {
      const gaps = [found.before, ...found.after].slice(0, diff.hunks.length);

      expect(aboveHunks(diff.hunks, shows)).toStrictEqual(
        gaps.map((lines, index) => ({
          hunk: diff.hunks[index],
          unchanged: lines.length,
          shown: shows(index),
          separates: above[index],
        })),
      );
    }),
  );
});

// The keys of the lines the old version has.
function oldKeys(lines: readonly NumberedLine[]): string[] {
  return lines.flatMap((line) => (line.kind === "added" ? [] : [lineKey(line)]));
}

test("each of a hunk's lines has a key none of its other lines has", () => {
  fc.assert(
    fc.property(hunkLines, (lines) => {
      const keys = lines.map(lineKey);

      expect(new Set(keys).size).toBe(keys.length);
    }),
  );
});

test("the keys of a hunk's unchanged and removed lines stay as lines are added or removed above it in the new version", () => {
  fc.assert(
    fc.property(hunkLines, fc.integer({ min: 2, max: 20 }), (lines, newStart) => {
      expect(oldKeys(numberLines({ oldStart: 1, newStart, lines }))).toStrictEqual(oldKeys(lines));
    }),
  );
});
