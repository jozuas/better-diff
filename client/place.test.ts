import * as fc from "fast-check";
import { expect, test } from "vitest";

import {
  barHeight,
  fakePage,
  fileOf,
  intoLine,
  lineHeight,
  offsetOfLine,
  rowsOf,
  scrolledTo,
  scrollToLine,
  viewOn,
} from "../test/kept-place";
import { lineText, uniqueLines } from "../test/line-texts";
import { unchangedLines } from "./lines";
import type { NumberedLine } from "./lines";
import { keptPlace, shownFileOf } from "./place";
import { lineId, unchangedLineId } from "./selection";

// The lines of a file a view shows and those it shows once they've changed, with lines removed,
// and others added, all around one it keeps: the one at the view's top.
const editedAround = fc
  .record({
    above: uniqueLines("above"),
    top: lineText,
    below: uniqueLines("below"),
    keptAbove: fc.array(fc.boolean(), { maxLength: 20 }),
    added: uniqueLines("added"),
    at: fc.nat(),
  })
  .map(({ above, top, below, keptAbove, added, at }) => {
    const kept = above.filter((_, index) => keptAbove[index] ?? true);
    const split = at % (kept.length + 1);

    return {
      before: [...above, `top: ${top}`, ...below],
      after: [...kept.slice(0, split), ...added, ...kept.slice(split), `top: ${top}`, ...below],
      top: `top: ${top}`,
    };
  });

test("the line at the top of a file's view stays in place as an agent's change adds lines above it and takes them away", () => {
  fc.assert(
    fc.property(editedAround, intoLine, ({ before, after, top }, pixels) => {
      const page = fakePage();
      const { kept, render } = viewOn(page);
      const shown = fileOf("view:0", "a.txt", before);
      const changed = fileOf("view:0", "a.txt", after);

      page.rows = rowsOf(shown);
      kept.show("view:0", shown);
      scrollToLine(page, shown, top, pixels);
      kept.scrolled();

      page.rows = rowsOf(changed);
      kept.show("view:0", changed);
      render();

      expect(offsetOfLine(page, changed, top)).toBe(0 - pixels);
    }),
  );
});

test("once the line at the top is gone, the line that takes its place is there instead", () => {
  const { page, render, change } = scrolledTo(["a", "b", "c", "d"], "c");
  const changed = change(["a", "added", "replaced", "d"]);

  render();

  expect(offsetOfLine(page, changed, "replaced")).toBe(-5);
});

test("a view at its very top keeps its first line where it is", () => {
  const { page, render, change } = scrolledTo(["a", "b"], "a", -barHeight);
  const changed = change(["added", "a", "b"]);

  render();

  expect(offsetOfLine(page, changed, "a")).toBe(barHeight);
});

test("the view stays where it is once its lines change too much to follow", () => {
  const lines = Array.from({ length: 1000 }, (_, index) => `line ${index}`);
  const { page, render, change } = scrolledTo([...lines, "top"], "top");
  const scrollTop = page.scrollTop();

  change(["added", ...lines.map((line) => `${line} changed`), "top"]);
  render();

  expect(page.scrollTop()).toBe(scrollTop);
});

test("a view scrolled since it found what's at its top isn't moved back to show it", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -50, max: 50 }).filter((distance) => distance !== 0),
      (distance) => {
        const { page, render, change } = scrolledTo(["a", "b", "c", "d"], "b");

        page.scrollBy(distance);
        change(["added", "a", "b", "c", "d"]);
        render();

        expect(page.scrollTop()).toBe(barHeight + lineHeight + 5 + distance);
      },
    ),
  );
});

test("a view scrolled down to its end since it found what's at its top isn't moved back to show it", () => {
  const { page, render, change } = scrolledTo(["a", "b", "c", "d"], "b");

  page.scrollBy(1000);

  const scrollTop = page.scrollTop();

  change(["a changed", "b", "c", "d"]);
  render();

  expect(page.scrollTop()).toBe(scrollTop);
});

test("a view scrolled up as far as it goes by lines taken away above what's at its top shows that in the same place", () => {
  const { page, render, change } = scrolledTo(["a", "b", "c", "d", "e"], "e");
  const changed = change(["d", "e"]);

  render();

  expect(offsetOfLine(page, changed, "e")).toBe(-5);
});

test("scrolling finds what's at the view's top again", () => {
  const { page, kept, render, change } = scrolledTo(["a", "b", "c", "d"], "b");

  page.scrollBy(lineHeight);
  kept.scrolled();

  const changed = change(["added", "a", "b", "c", "d"]);

  render();

  expect(offsetOfLine(page, changed, "c")).toBe(-5);
});

test("a file no longer shown keeps no place", () => {
  const page = fakePage();
  const { kept, render } = viewOn(page);
  const shown = fileOf("view:0", "a.txt", ["a", "b", "c"]);
  const stop = kept.show("view:0", shown);

  page.rows = rowsOf(shown);
  render();
  page.scrollBy(barHeight + lineHeight);
  kept.scrolled();
  stop();

  const scrollTop = page.scrollTop();

  page.rows = [{ height: lineHeight }, ...rowsOf(shown)];
  render();

  expect(page.scrollTop()).toBe(scrollTop);
});

test("a view that showed nothing when it was last scrolled keeps no place", () => {
  const page = fakePage();
  const { kept, render } = viewOn(page);
  const shown = fileOf("view:0", "a.txt", ["a", "b", "c"]);

  kept.scrolled();
  page.rows = [{ height: lineHeight }, ...rowsOf(shown)];
  kept.show("view:0", shown);
  render();

  expect(page.scrollTop()).toBe(0);
});

test("a view settles once for all that renders before it settles", () => {
  const tasks: (() => void)[] = [];

  const kept = keptPlace(fakePage(), (task) => {
    tasks.push(task);
  });

  kept.settle(false);
  kept.settle(true);

  expect(tasks).toHaveLength(1);

  tasks[0]?.();
  kept.settle(false);

  expect(tasks).toHaveLength(2);
});

// A line both versions have, with its number in each.
function unchangedLine(text: string, number: number): NumberedLine {
  return { kind: "context", text, newline: true, runs: [], oldNumber: number, newNumber: number };
}

test("a file shown is each hunk's lines, after the unchanged ones before it while the entire file shows, each with its element's id", () => {
  const diff = {
    hunks: [
      {
        oldStart: 2,
        newStart: 2,
        lines: [
          { kind: "removed" as const, text: "old", newline: true, runs: [] },
          { kind: "added" as const, text: "new", newline: true, runs: [] },
        ],
      },
      {
        oldStart: 3,
        newStart: 4,
        lines: [{ kind: "added" as const, text: "end", newline: true, runs: [] }],
      },
    ],
    contents: ["first", "new", "kept", "end"].map((text) => ({ text, runs: [] })),
  };

  expect(shownFileOf("a.txt", diff.hunks, unchangedLines(diff), "view:0")).toStrictEqual({
    path: "a.txt",
    lines: ["first", "old", "new", "kept", "end"],
    ids: [
      unchangedLineId("view:0", unchangedLine("first", 1)),
      lineId("view:0", 0, 0),
      lineId("view:0", 0, 1),
      unchangedLineId("view:0", unchangedLine("kept", 3)),
      lineId("view:0", 1, 0),
    ],
  });

  expect(shownFileOf("a.txt", diff.hunks, { before: [], after: [] }, "view:0")).toStrictEqual({
    path: "a.txt",
    lines: ["old", "new", "end"],
    ids: [lineId("view:0", 0, 0), lineId("view:0", 0, 1), lineId("view:0", 1, 0)],
  });
});
