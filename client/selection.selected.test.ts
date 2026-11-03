import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { ShownFiles } from "./selection";
import { selectedLines, stillSelected } from "./selection";

// What a view of three files shows of each, as their paths and versions name it, or nothing.
const shownFiles = fc.array(fc.option(fc.constantFrom("a 1", "a 2", "b 1"), { nil: undefined }), {
  minLength: 3,
  maxLength: 3,
});

const selectedIn = fc.record({
  file: fc.integer({ min: 0, max: 2 }),
  hunk: fc.nat(3),
  first: fc.nat(3),
  last: fc.nat(3),
});

function shownBy(files: readonly (string | undefined)[]): ShownFiles {
  return (file) => files[file];
}

test("lines stay selected while the file they're in shows what it did when they were, whatever the view's other files show", () => {
  fc.assert(
    fc.property(selectedIn, shownFiles, shownFiles, (lines, before, after) => {
      const now = after.with(lines.file, before[lines.file]);

      expect(stillSelected(selectedLines(undefined, lines, shownBy(before)), shownBy(now))).toBe(
        lines,
      );
    }),
  );
});

test("lines are no longer selected once the file they're in shows something else", () => {
  fc.assert(
    fc.property(selectedIn, shownFiles, shownFiles, (lines, before, after) => {
      fc.pre(after[lines.file] !== before[lines.file]);

      expect(
        stillSelected(selectedLines(undefined, lines, shownBy(before)), shownBy(after)),
      ).toBeUndefined();
    }),
  );
});

test("nothing is selected while the selection touches no line", () => {
  fc.assert(
    fc.property(selectedIn, shownFiles, (lines, files) => {
      const shown = shownBy(files);

      expect(
        selectedLines(selectedLines(undefined, lines, shown), undefined, shown),
      ).toBeUndefined();
      expect(stillSelected(undefined, shown)).toBeUndefined();
    }),
  );
});

test("what's selected stays the same while the selection touches the same lines of a file that shows the same", () => {
  fc.assert(
    fc.property(selectedIn, shownFiles, shownFiles, (lines, before, after) => {
      const selected = selectedLines(undefined, lines, shownBy(before));
      const now = after.with(lines.file, before[lines.file]);

      expect(selectedLines(selected, { ...lines }, shownBy(now))).toBe(selected);
    }),
  );
});

// A selection, and one after it, of other lines or of a file that then shows something else, with
// what the view showed of its files for each.
const changedSelection = fc
  .tuple(selectedIn, selectedIn, shownFiles, shownFiles)
  .filter(
    ([lines, next, before, after]) =>
      JSON.stringify(lines) !== JSON.stringify(next) || after[next.file] !== before[lines.file],
  );

test("what's selected is read anew once the selection touches other lines, or the file they're in shows something else", () => {
  fc.assert(
    fc.property(changedSelection, ([lines, next, before, after]) => {
      expect(
        selectedLines(selectedLines(undefined, lines, shownBy(before)), next, shownBy(after)),
      ).toStrictEqual({ range: next, shown: after[next.file] });
    }),
    {
      examples: [
        [
          [
            { file: 0, hunk: 0, first: 0, last: 0 },
            { file: 0, hunk: 0, first: 0, last: 0 },
            ["a 1", undefined, undefined],
            ["a 2", undefined, undefined],
          ],
        ],
      ],
    },
  );
});
