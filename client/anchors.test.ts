import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { diffRpc } from "../shared/diff";
import { asNumbered, partlyStaged, squeezed } from "../test/comments";
import { hunkLines } from "../test/hunk-lines";
import { anchored, versionsOf } from "./anchors";
import type { Versions } from "./anchors";
import type { Anchor } from "./comments";
import { numberLines } from "./lines";
import type { IndexedLine, NumberedLine } from "./lines";
import { numbered } from "./numbering";
import type { Numbering } from "./numbering";
import type { Side } from "./side-by-side";

type Diff = RpcOutput<typeof diffRpc>;

const sides = fc.constantFrom<Side>("old", "new");

// How the review numbers lines, but for those of the numbers on each side, which its version
// hasn't, as a line only the index has.
const leavingOut = fc
  .record({ old: fc.uniqueArray(fc.nat(20)), new: fc.uniqueArray(fc.nat(20)) })
  .map((missing): Numbering => ({
    old: (number) => (missing.old.includes(number) ? undefined : number),
    new: (number) => (missing.new.includes(number) ? undefined : number),
  }));

// What tells the line with the number on the side apart, as a simpler model has it: of every line
// the review numbers on the side, by its number, the texts of those numbered one after another
// before it and after it, up to three, as far as the lines have them.
function anchorModel(
  lines: readonly NumberedLine[],
  side: Side,
  numbering: Numbering,
  number: number,
  text: string,
): Anchor {
  const texts = new Map(
    lines.flatMap((line): [number, string][] => {
      const each = numbered(line, side, numbering);

      return each === undefined ? [] : [[each, line.text]];
    }),
  );

  function run(step: -1 | 1): string[] {
    const found: string[] = [];

    for (let at = number + step; found.length < 3 && texts.has(at); at += step) {
      found.push(texts.get(at) ?? "");
    }

    return step === 1 ? found : found.toReversed();
  }

  return { text, before: run(-1), after: run(1) };
}

// A comment started on the line picked of those the review numbers on the side, and as the model
// has it, or neither, where the review numbers none of them there.
function startedAndModelled(
  lines: readonly NumberedLine[],
  side: Side,
  numbering: Numbering,
  picked: number,
): [unknown, unknown] {
  const on = lines.flatMap((line, index) => {
    const number = numbered(line, side, numbering);

    return number === undefined ? [] : [{ index, line, number }];
  });

  const chosen = on[picked % Math.max(1, on.length)];

  if (chosen === undefined) {
    return [undefined, undefined];
  }

  const { index, line, number } = chosen;
  const target = { path: "a.txt", side, line: number };

  return [
    anchored(target, { index, line }, lines, numbering),
    { ...target, anchor: anchorModel(lines, side, numbering, number, line.text) },
  ];
}

test("a comment started on a line has the line's text, and those of up to three lines either side of it that its version has, one after another", () => {
  fc.assert(
    fc.property(hunkLines, sides, leavingOut, fc.nat(), (lines, side, numbering, picked) => {
      const [started, modelled] = startedAndModelled(lines, side, numbering, picked);

      expect(started).toStrictEqual(modelled);
    }),
  );
});

// A hunk's lines of the kinds, from line 3 of the old version and line 5 of the new one, each
// saying its kind and where it is.
function linesOf(kinds: readonly NumberedLine["kind"][]): NumberedLine[] {
  return numberLines({
    oldStart: 3,
    newStart: 5,
    lines: kinds.map((kind, at) => ({
      kind,
      text: `${kind} ${String(at)}`,
      newline: true,
      runs: [],
    })),
  });
}

// The line at the index of the lines.
function shownAt(lines: readonly NumberedLine[], index: number): IndexedLine {
  const line = lines[index];

  if (line === undefined) {
    throw new Error(`The lines have none at ${String(index)}.`);
  }

  return { index, line };
}

const mixed = linesOf(["context", "removed", "added", "context", "added", "context"]);

// How the review numbers lines, but the new version's sixth, which it hasn't.
const leavingOutSix: Numbering = {
  ...asNumbered,
  new: (number) => (number === 6 ? undefined : number),
};

test("what tells a line apart passes over lines of the other version among its own, and stops at a line its version hasn't", () => {
  const added = shownAt(mixed, 4);

  expect(anchored({ side: "new", line: 8 }, added, mixed, asNumbered).anchor).toStrictEqual({
    text: "added 4",
    before: ["context 0", "added 2", "context 3"],
    after: ["context 5"],
  });
  expect(anchored({ side: "new", line: 8 }, added, mixed, leavingOutSix).anchor).toStrictEqual({
    text: "added 4",
    before: ["context 3"],
    after: ["context 5"],
  });
  expect(
    anchored({ side: "old", line: 4 }, shownAt(mixed, 1), mixed, asNumbered).anchor,
  ).toStrictEqual({ text: "removed 1", before: ["context 0"], after: ["context 3", "context 5"] });
});

test("what tells a line apart has three lines either side of it at most", () => {
  const lines = linesOf(Array.from({ length: 9 }, () => "context"));

  expect(
    anchored({ side: "old", line: 7 }, shownAt(lines, 4), lines, asNumbered).anchor,
  ).toStrictEqual({
    text: "context 4",
    before: ["context 1", "context 2", "context 3"],
    after: ["context 5", "context 6", "context 7"],
  });
});

function contentsOf(lines: readonly string[]): Diff["contents"] {
  return lines.map((text) => ({ text, runs: [] }));
}

type PartlyStaged = typeof partlyStaged extends fc.Arbitrary<infer File> ? File : never;

// The versions of the file, as its diffs read with every line have them: HEAD's lines and the
// worktree's, without whitespace, or none known where it has none.
function versionsExpected({ head, index, worktree }: PartlyStaged["versions"]): Versions {
  return [head, index, worktree].every((lines) => lines.length === 0)
    ? { old: undefined, new: undefined }
    : { old: head.map(squeezed), new: worktree.map(squeezed) };
}

test("a file's versions are HEAD's lines and the worktree's, as its two diffs, read with every line, have them, without whitespace, unless neither diff has a line, as of a file without any", () => {
  fc.assert(
    fc.property(partlyStaged, ({ versions, diffs }) => {
      const unstaged = { ...diffs.unstaged, contents: contentsOf(versions.worktree) };
      const staged = { ...diffs.staged, contents: contentsOf(versions.index) };

      expect(versionsOf(unstaged, staged)).toStrictEqual(versionsExpected(versions));
    }),
  );
});

// A diff of a version with the lines, from an empty one.
function adding(lines: readonly string[]): Pick<Diff, "hunks" | "contents"> {
  return {
    hunks: [
      {
        oldStart: 0,
        newStart: 1,
        lines: lines.map((text) => ({ kind: "added", text, newline: true, runs: [] })),
      },
    ],
    contents: contentsOf(lines),
  };
}

// A diff without lines, as of a file with no changes, or only renamed, or with its mode changed.
const noLines = { hunks: [], contents: [] };

const unknown = { old: undefined, new: undefined };

test("where one of a file's diffs has no lines, the version it would have is the index, as the other diff has it", () => {
  expect(versionsOf(adding(["a", "b c"]), noLines)).toStrictEqual({ old: [], new: ["a", "bc"] });
  expect(versionsOf(noLines, adding(["a", "b c"]))).toStrictEqual({ old: [], new: ["a", "bc"] });
  expect(versionsOf(noLines, noLines)).toStrictEqual(unknown);
  expect(versionsOf({ hunks: [] }, noLines)).toStrictEqual(unknown);
});

// A diff not read yet.
function notRead(): Pick<Diff, "hunks"> | undefined {
  return undefined;
}

test("a file's versions aren't known until both its diffs are read", () => {
  expect(versionsOf(notRead(), noLines)).toBeUndefined();
  expect(versionsOf(noLines, notRead())).toBeUndefined();
});
