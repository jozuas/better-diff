import * as fc from "fast-check";
import { expect, test } from "vitest";

import { filePath } from "../test/file-names";
import {
  barHeight,
  fakePage,
  fileOf,
  intoLine,
  offsetOfLine,
  rowsOf,
  scrollToElement,
  scrollToLine,
  showGroup,
  viewOn,
} from "../test/kept-place";
import { uniqueLines } from "../test/line-texts";

// A group's files by their paths and lines, before and after an agent's change to the files above
// the one whose line is at the top of its view, which can add a file among them.
const filesAbove = fc
  .record({
    paths: fc.uniqueArray(filePath, { minLength: 3, maxLength: 3 }),
    before: uniqueLines("before"),
    after: uniqueLines("after"),
    added: fc.option(uniqueLines("added"), { nil: undefined }),
    lines: uniqueLines("top", { minLength: 1 }),
    index: fc.nat(),
  })
  .map(({ paths: [above = "", path = "", joining = ""], before, after, added, lines, index }) => ({
    shown: [
      [above, before],
      [path, lines],
    ] as const,
    changed: [
      [above, after] as const,
      ...(added === undefined ? [] : [[joining, added] as const]),
      [path, lines] as const,
    ],
    top: lines[index % lines.length] ?? "",
  }));

test("in a group's view, the line at its top stays in place as an agent's change to the files above it adds lines or a file, or takes them away", () => {
  fc.assert(
    fc.property(filesAbove, intoLine, ({ shown, changed, top }, pixels) => {
      const page = fakePage();
      const view = viewOn(page);
      const [, file] = showGroup(page, view, shown);

      view.render();
      scrollToLine(page, file, top, pixels);
      view.kept.scrolled();

      const moved = showGroup(page, view, changed).at(-1);

      view.render();

      expect(offsetOfLine(page, moved, top)).toBe(0 - pixels);
    }),
  );
});

// A group's files by their paths and lines, before and after an agent's change that takes away the
// one whose line is at the top of its view, with those after it up to the next, and adds lines to the
// one above it.
const fileLeaving = fc
  .record({
    paths: fc.uniqueArray(filePath, { minLength: 5, maxLength: 5 }),
    before: uniqueLines("before"),
    after: uniqueLines("after"),
    lines: uniqueLines("top", { minLength: 1 }),
    index: fc.nat(),
    leaving: fc.array(uniqueLines("leaving", { minLength: 1 }), { maxLength: 2 }),
    next: uniqueLines("next"),
  })
  .map(
    ({ paths: [above = "", path = "", ...others], before, after, lines, index, leaving, next }) => {
      const nextPath = others.at(-1) ?? "";

      return {
        shown: [
          [above, before] as const,
          [path, lines] as const,
          ...leaving.map((leavingLines, file) => [others[file] ?? "", leavingLines] as const),
          [nextPath, next] as const,
        ],
        changed: [[above, after] as const, [nextPath, next] as const],
        top: lines[index % lines.length] ?? "",
      };
    },
  );

test("in a group's view, once the file at its top leaves it, the start of the next file's diff still there takes its place", () => {
  fc.assert(
    fc.property(fileLeaving, intoLine, ({ shown, changed, top }, pixels) => {
      const page = fakePage();
      const view = viewOn(page);
      const [, file] = showGroup(page, view, shown);

      view.render();
      scrollToLine(page, file, top, pixels);
      view.kept.scrolled();
      showGroup(page, view, changed);
      view.render();

      expect(page.offsetOf("start:1")).toBe(0 - pixels);
    }),
  );
});

test("in a group's view, once the view shows none of the lines of the file at its top, the start of its diff takes their place", () => {
  const page = fakePage();
  const { kept, render } = viewOn(page);
  const above = fileOf("view:0", "a.txt", ["a"]);
  const file = fileOf("view:1", "b.txt", ["b", "c"]);
  const changed = fileOf("view:0", "a.txt", ["a", "added"]);

  page.rows = [...rowsOf(above, "start:0"), ...rowsOf(file, "start:1")];
  kept.show("view:0", above);

  const stop = kept.show("view:1", file);

  kept.showStarts(
    new Map([
      ["a.txt", "start:0"],
      ["b.txt", "start:1"],
    ]),
  );
  render();
  scrollToLine(page, file, "c", 5);
  kept.scrolled();

  page.rows = [
    ...rowsOf(changed, "start:0"),
    { height: barHeight },
    { id: "start:1", height: 0 },
    { height: 1000 },
  ];
  kept.show("view:0", changed);
  stop();
  render();

  expect(page.offsetOf("start:1")).toBe(-5);
});

test("in a group's view, the start of a file's diff at its top stays in place as an agent's change adds lines above it", () => {
  const page = fakePage();
  const view = viewOn(page);

  showGroup(page, view, [
    ["a.txt", ["a"]],
    ["b.txt", ["b"]],
    ["c.txt", ["c"]],
  ]);
  view.render();
  scrollToElement(page, "start:1", 10);
  view.kept.scrolled();
  showGroup(page, view, [
    ["a.txt", ["a", "added"]],
    ["b.txt", ["b"]],
    ["c.txt", ["c"]],
  ]);
  view.render();

  expect(page.offsetOf("start:1")).toBe(-10);
});

test("in a group's view, the start of a file without lines at its top stays in place as an agent's change adds lines above it", () => {
  const page = fakePage();
  const { kept, render } = viewOn(page);
  const binary = [{ height: barHeight }, { id: "start:1", height: 0 }, { height: 1000 }];
  const shown = fileOf("view:0", "a.txt", ["a", "b", "c"]);
  const changed = fileOf("view:0", "a.txt", ["a", "b", "c", "added"]);

  page.rows = rowsOf(shown, "start:0");
  kept.show("view:0", shown);
  kept.showStarts(new Map([["a.txt", "start:0"]]));
  render();

  page.rows.push(...binary);
  kept.showStarts(
    new Map([
      ["a.txt", "start:0"],
      ["b.bin", "start:1"],
    ]),
  );
  render();
  scrollToElement(page, "start:1", 10);
  kept.scrolled();

  page.rows = [...rowsOf(changed, "start:0"), ...binary];
  kept.show("view:0", changed);
  render();

  expect(page.offsetOf("start:1")).toBe(-10);
});
