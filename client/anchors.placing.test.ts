import * as fc from "fast-check";
import { expect, test } from "vitest";

import { squeezed } from "../test/comments";
import { lineText, uniqueLines } from "../test/line-texts";
import { placedIn } from "./anchors";
import type { Versions } from "./anchors";
import type { Anchor, CommentTarget } from "./comments";
import type { Side } from "./side-by-side";

const sides = fc.constantFrom<Side>("old", "new");

// What tells the line at the index of the lines apart from the others: its text, and those of up
// to three lines either side of it.
function anchorIn(lines: readonly string[], index: number): Anchor {
  return {
    text: lines[index] ?? "",
    before: lines.slice(Math.max(0, index - 3), index),
    after: lines.slice(index + 1, index + 4),
  };
}

// A comment on the line at the index of the lines, on the side, with what tells it apart there.
function commentOn(lines: readonly string[], index: number, side: Side = "new"): CommentTarget {
  return { path: "a.txt", side, line: index + 1, anchor: anchorIn(lines, index) };
}

// Versions of a file with the lines on the side, and none known on the other.
function versionsWith(lines: readonly string[], side: Side = "new"): Versions {
  return side === "new"
    ? { old: undefined, new: lines.map(squeezed) }
    : { old: lines.map(squeezed), new: undefined };
}

// A version's lines, each with text no other has, one of them commented on, and the lines added
// before and after each of them, and whether each is kept, as they're changed around it.
const changedAround = uniqueLines("line", { minLength: 1 }).chain((lines) =>
  fc.record({
    lines: fc.constant(lines),
    at: fc.nat(lines.length - 1),
    added: fc.array(uniqueLines("added", { maxLength: 3 }), {
      minLength: lines.length + 1,
      maxLength: lines.length + 1,
    }),
    kept: fc.array(fc.boolean(), { minLength: lines.length, maxLength: lines.length }),
    side: sides,
  }),
);

type ChangedAround = typeof changedAround extends fc.Arbitrary<infer Changed> ? Changed : never;

// The version's lines once lines are added and removed around the one commented on, and where the
// comment is then: on the line with its text, or on none, once that's removed.
function changedAndExpected({ lines, at, added, kept, side }: ChangedAround) {
  const changed = lines.flatMap((line, index) => [
    ...(added[index] ?? []).map((text) => `${String(index)} ${text}`),
    ...(kept[index] === true ? [line] : []),
  ]);

  const now = changed.indexOf(lines[at] ?? "");
  const comment = commentOn(lines, at, side);

  return {
    placed: placedIn(comment, versionsWith(changed, side)),
    expected: now === -1 ? undefined : { ...comment, line: now + 1 },
  };
}

test("a comment follows its line, whose text no other line has, as lines are added and removed around it, and while its line is removed it's on none", () => {
  fc.assert(
    fc.property(changedAround, (changed) => {
      const { placed, expected } = changedAndExpected(changed);

      expect(placed).toStrictEqual(expected);
    }),
  );
});

test("a comment on a line of the version it was made in is on its line, whatever the other lines say", () => {
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom("a", "b", "}", ""), { minLength: 1, maxLength: 12 }),
      fc.nat(),
      (lines, picked) => {
        const comment = commentOn(lines, picked % lines.length);

        expect(placedIn(comment, versionsWith(lines))).toBe(comment);
      },
    ),
  );
});

const onX = commentOn(["a", "x", "b"], 1);

test("a comment's line is told apart from others with its text by the lines next to it", () => {
  expect(placedIn(onX, versionsWith(["c", "x", "d", "a", "x", "b"]))?.line).toBe(5);
  expect(placedIn(onX, versionsWith(["c", "x", "d", "e", "a", "x", "c"]))?.line).toBe(6);
  expect(
    placedIn(
      commentOn(["a", "x", "b", "c", "a", "x", "b"], 5),
      versionsWith(["a", "x", "b", "c", "a", "x", "b"]),
    )?.line,
  ).toBe(6);
  expect(
    placedIn({ ...onX, line: 6 }, versionsWith(["a", "x", "b", "c", "c", "x", "d"]))?.line,
  ).toBe(2);
});

test("of lines with a comment's line's text and as many of the lines next to it, the comment's on the one nearest where it was, or the first of two as near", () => {
  const twice = versionsWith(["a", "x", "b", "c", "a", "x", "b"]);

  expect(placedIn(onX, versionsWith(["a", "x", "d", "c", "x", "b"]))?.line).toBe(2);
  expect(placedIn(onX, versionsWith(["a", "x", "c", "c", "a", "x", "c"]))?.line).toBe(2);
  expect(placedIn({ ...onX, line: 4 }, twice)?.line).toBe(2);
  expect(placedIn({ ...onX, line: 5 }, twice)?.line).toBe(6);
});

test("a comment whose line's text several lines have, none of them with any of the lines next to it, is on none, but on the one line with its text, whatever's next to it", () => {
  const comment = commentOn(["a", "}", "b"], 1);

  expect(placedIn(comment, versionsWith(["c", "}", "d", "}"]))).toBeUndefined();
  expect(placedIn(comment, versionsWith(["c", "d", "}"]))).toStrictEqual({ ...comment, line: 3 });
  expect(placedIn(comment, versionsWith(["c", "d"]))).toBeUndefined();
  expect(placedIn(commentOn(["a", "}"], 1), versionsWith(["c", "}", "d", "}"]))).toBeUndefined();
  expect(placedIn(commentOn(["}", "b"], 0), versionsWith(["c", "}", "d", "}"]))).toBeUndefined();
});

// A comment on the line at the index of the lines, started where none of the lines next to it
// showed, as on a line alone in its part of the diff: a file's last line, after its last hunk.
function commentAlone(lines: readonly string[], index: number): CommentTarget {
  return {
    path: "a.txt",
    side: "new",
    line: index + 1,
    anchor: { text: lines[index] ?? "", before: [], after: [] },
  };
}

test("a comment started where none of the lines next to its line showed is on its line of the version it was made in, whatever the other lines say", () => {
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom("a", "b", "}", ""), { minLength: 1, maxLength: 12 }),
      fc.nat(),
      (lines, picked) => {
        const comment = commentAlone(lines, picked % lines.length);

        expect(placedIn(comment, versionsWith(lines))).toBe(comment);
      },
    ),
    { examples: [[["a", "}", "b", "}"], 3]] },
  );
});

test("a comment started where none of the lines next to its line showed is on the line with its text nearest where it was, or the first of two as near, and on none while none has it", () => {
  const comment = commentAlone(["a", "b", "}"], 2);

  expect(placedIn(comment, versionsWith(["}", "a", "b", "}"]))?.line).toBe(4);
  expect(placedIn(comment, versionsWith(["}", "a", "b", "c", "}"]))?.line).toBe(1);
  expect(placedIn(comment, versionsWith(["a", "b"]))).toBeUndefined();
});

// A version's lines, each with text no other has, without whitespace, with whitespace around each.
function respaced(lines: readonly string[], space: string): [string[], string[]] {
  const unique = lines.map((text, at) => `${String(at)}:${text}`);

  return [unique, unique.map((text) => `${space}${squeezed(text)}${space}`)];
}

test("a comment follows its line though its whitespace, or that of the lines next to it, changes, as Hide whitespace has it unchanged", () => {
  fc.assert(
    fc.property(
      fc.array(lineText, { minLength: 1, maxLength: 8 }),
      fc.nat(),
      fc.constantFrom(" ", "\t", "\r"),
      (lines, picked, space) => {
        const [unique, spaced] = respaced(lines, space);
        const comment = commentOn(unique, picked % unique.length);

        expect(placedIn(comment, versionsWith(spaced))).toBe(comment);
      },
    ),
  );
});

test.each([
  ["a non-breaking space", "\u00A0"],
  ["an em space", "\u2003"],
  ["a vertical tab", "\v"],
  ["a form feed", "\f"],
])(
  "a comment is on no line once %s in its line becomes a space, as git's --ignore-all-space doesn't ignore it, so Hide whitespace has the line changed",
  (_, space) => {
    const comment = commentOn(["a", `x${space}y`, "b"], 1);

    expect(placedIn(comment, versionsWith(["a", "x y", "b"]))).toBeUndefined();
  },
);

const lines = ["a", "b", "c", "d"];

// A comment on the worktree's line with "c", from HEAD's with "a".
const onSeveral = {
  ...commentOn(lines, 2),
  start: { side: "old", line: 1, anchor: anchorIn(lines, 0) },
} as const;

test("a comment on several lines is on the lines its first and last are", () => {
  expect(placedIn(onSeveral, { old: ["z", ...lines], new: ["y", "y", ...lines] })).toStrictEqual({
    ...onSeveral,
    line: 5,
    start: { ...onSeveral.start, line: 2 },
  });
  expect(placedIn(onSeveral, { old: lines, new: lines })).toBe(onSeveral);
  expect(placedIn(onSeveral, { old: ["z", ...lines], new: lines })).toStrictEqual({
    ...onSeveral,
    start: { ...onSeveral.start, line: 2 },
  });
});

test("a comment on several lines is on the line its last is, though its first hasn't moved", () => {
  expect(placedIn(onSeveral, { old: lines, new: ["y", ...lines] })).toStrictEqual({
    ...onSeveral,
    line: 4,
  });
});

test("a comment on several lines is on none while its first or its last is removed", () => {
  expect(placedIn(onSeveral, { old: ["b", "c", "d"], new: lines })).toBeUndefined();
  expect(placedIn(onSeveral, { old: lines, new: ["a", "b", "d"] })).toBeUndefined();
});

// A comment on the worktree's lines from the one at the index `from` of the lines to the one at the
// index `to`, each with what tells it apart there.
function commentFrom(texts: readonly string[], from: number, to: number): CommentTarget {
  return {
    ...commentOn(texts, to),
    start: { side: "new", line: from + 1, anchor: anchorIn(texts, from) },
  };
}

test("a comment on several lines of one version follows them, its first before its last", () => {
  const comment = commentFrom(lines, 1, 2);

  expect(placedIn(comment, versionsWith(["y", ...lines]))).toStrictEqual({
    ...comment,
    line: 4,
    start: { ...comment.start, line: 3 },
  });
});

test("a comment on several lines of one version is on none while its first is no longer before its last, as once its last is removed, and the one line with its text is before its first, or is its first", () => {
  expect(placedIn(commentFrom(["y", "x", "y"], 1, 2), versionsWith(["y", "x"]))).toBeUndefined();
  expect(placedIn(commentFrom(["}", "a", "}"], 0, 2), versionsWith(["a", "}"]))).toBeUndefined();
});

const fewTexts = fc.constantFrom("x", "y", "}");

// A version's lines, few texts among them, so that several lines have the same, a later one of them
// to comment on up to, and an earlier one from, as `from` has it, and the version's lines once
// they're changed.
const severalChanged = fc.array(fewTexts, { minLength: 2, maxLength: 6 }).chain((texts) =>
  fc.record({
    texts: fc.constant(texts),
    from: fc.nat(),
    to: fc.integer({ min: 1, max: texts.length - 1 }),
    changed: fc.array(fewTexts, { maxLength: 6 }),
  }),
);

// Whether the comment is on lines whose first isn't before its last.
function isOutOfOrder(placed: CommentTarget | undefined): boolean {
  return placed?.start !== undefined && placed.start.line >= placed.line;
}

test("a comment on several lines of one version is never on lines whose first isn't before its last, however the version changes", () => {
  fc.assert(
    fc.property(severalChanged, ({ texts, from, to, changed }) => {
      const placed = placedIn(commentFrom(texts, from % to, to), versionsWith(changed));

      expect(isOutOfOrder(placed)).toBe(false);
    }),
    { examples: [[{ texts: ["y", "x", "y"], from: 1, to: 2, changed: ["y", "x"] }]] },
  );
});

test("a comment from a line of HEAD to one of the worktree is on them whichever's number is greater, as lines of different versions come in no order", () => {
  const comment = {
    ...commentOn(["p", "q", "r", "s", "t"], 4),
    start: { side: "old", line: 4, anchor: anchorIn(lines, 3) },
  } as const;

  expect(placedIn(comment, { old: lines, new: ["s", "t"] })).toStrictEqual({ ...comment, line: 2 });
});

const plain: CommentTarget = {
  path: "a.txt",
  side: "new",
  line: 3,
  start: { side: "old", line: 1 },
};

test("a comment kept from before comments had what tells their lines apart, or on a version whose lines aren't known, stays on its line", () => {
  const comment = commentOn(["a", "b"], 1, "old");

  expect(placedIn(plain, versionsWith(["x"]))).toBe(plain);
  expect(placedIn(comment, versionsWith(["x"], "new"))).toBe(comment);
});

// No versions, as while a file's diffs aren't both read.
function notKnown(): Versions | undefined {
  return undefined;
}

test("no comment is known to be on any line until its file's versions are", () => {
  expect(placedIn(plain, notKnown())).toBeUndefined();
  expect(placedIn(commentOn(["a", "b"], 1), notKnown())).toBeUndefined();
});
