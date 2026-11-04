import { expect, test } from "vitest";

import {
  barHeight,
  fakePage,
  fileOf,
  lineHeight,
  offsetOfLine,
  rowsOf,
  scrolledTo,
  scrollToLine,
  viewOn,
} from "../test/kept-place";
import type { ShownFile } from "./place";

test("while an action runs, and as it ends, the view stays as the action leaves it", () => {
  const { page, render, change } = scrolledTo(["a", "b", "c"], "c");
  const scrollTop = page.scrollTop();

  render(true);
  change(["added", "a", "b", "c"]);
  render(true);

  expect(page.scrollTop()).toBe(scrollTop);

  change(["added", "again", "a", "b", "c"]);
  render(false);

  expect(page.scrollTop()).toBe(scrollTop);

  const changed = change(["new", "added", "again", "a", "b", "c"]);

  render(false);

  expect(offsetOfLine(page, changed, "a")).toBe(-5);
});

// A view showing a file's lines under a hunk's bar, with the element at the start of a second hunk
// before the line at the index, and the line `b` at its top, 5 pixels into it.
function heldIn(lines: readonly string[], second: number) {
  const page = fakePage();
  const view = viewOn(page);

  // Shows the lines instead, with the second hunk starting before the one at the index.
  function showing(shown: readonly string[], start: number): ShownFile {
    const file = fileOf("view:0", "a.txt", shown);

    page.rows = [
      { height: barHeight },
      ...file.ids.flatMap((id, index) => [
        ...(index === start ? [{ id: "hunk 1", height: 0 }] : []),
        { id, height: lineHeight },
      ]),
    ];
    view.kept.show("view:0", file);

    return file;
  }

  const file = showing(lines, second);

  view.render();
  scrollToLine(page, file, "b", 5);
  view.kept.scrolled();

  return { page, ...view, showing };
}

test("a place held is shown in the same place again once the diff shows something else, rather than what was at the top", () => {
  const { page, kept, render, showing } = heldIn(["a", "b", "c", "d"], 2);
  const offset = page.offsetOf("hunk 1");

  const scrollTop = page.scrollTop();

  kept.hold("view:0", "hunk 1");
  page.scrollBy(7);
  render();

  expect(page.scrollTop()).toBe(scrollTop + 7);

  showing(["above", "a", "b", "between", "c", "d"], 4);
  render();

  expect(page.offsetOf("hunk 1")).toBe(offset);

  const changed = showing(["new", "above", "a", "b", "between", "more", "c", "d"], 6);

  render();

  expect(offsetOfLine(page, changed, "between")).toBe(-5);
});

test("a place held while an action runs is shown in the same place each time the diff shows something else, until the action is done", () => {
  const { page, kept, render, showing } = heldIn(["a", "b", "c", "d"], 2);
  const offset = page.offsetOf("hunk 1");

  kept.hold("view:0", "hunk 1");
  render(true);
  showing(["a", "b", "d"], 2);
  render(true);

  expect(page.offsetOf("hunk 1")).toBe(offset);

  showing(["added", "a", "b", "d"], 3);
  render(true);

  expect(page.offsetOf("hunk 1")).toBe(offset);

  const scrollTop = page.scrollTop();

  page.scrollBy(7);
  render(true);

  expect(page.scrollTop()).toBe(scrollTop + 7);

  page.scrollBy(-7);
  render(false);

  const changed = showing(["new", "added", "a", "b", "more", "d"], 5);

  render();

  expect(offsetOfLine(page, changed, "b")).toBe(-5);
});

test("holding the place of an element not in the view holds none", () => {
  const { page, kept, render, showing } = heldIn(["a", "b", "c", "d"], 2);

  kept.hold("view:0", "hunk 7");

  const changed = showing(["added", "a", "b", "more", "c", "d"], 4);

  render();

  expect(offsetOfLine(page, changed, "b")).toBe(-5);
});

test("scrolling the view lets go of a place held", () => {
  const { page, kept, render, showing } = heldIn(["a", "b", "c", "d"], 2);

  kept.hold("view:0", "hunk 1");
  page.scrollBy(7);
  kept.scrolled();

  const changed = showing(["above", "a", "b", "between", "c", "d"], 4);

  render();

  expect(offsetOfLine(page, changed, "b")).toBe(-12);
});

test("while a place is held in a file's diff in a group's view, the line at its top stays in place as an agent's change adds lines to another file's above it", () => {
  const page = fakePage();
  const { kept, render } = viewOn(page);
  const above = fileOf("view:0", "a.txt", ["a"]);
  const file = fileOf("view:1", "b.txt", ["b", "c", "d"]);
  const changed = fileOf("view:0", "a.txt", ["a", "added"]);

  page.rows = [...rowsOf(above, "start:0"), ...rowsOf(file, "start:1")];
  kept.show("view:0", above);
  kept.show("view:1", file);
  kept.showStarts(
    new Map([
      ["a.txt", "start:0"],
      ["b.txt", "start:1"],
    ]),
  );
  render();
  scrollToLine(page, file, "c", 5);
  kept.scrolled();

  const offset = offsetOfLine(page, file, "b");

  kept.hold("view:1", "view:1:0");
  page.rows = [...rowsOf(changed, "start:0"), ...rowsOf(file, "start:1")];
  kept.show("view:0", changed);
  render();

  expect(offsetOfLine(page, file, "c")).toBe(-5);

  kept.scrolled();

  const moved = fileOf("view:1", "b.txt", ["b", "between", "c", "d"]);

  page.rows = [...rowsOf(changed, "start:0"), ...rowsOf(moved, "start:1")];
  kept.show("view:1", moved);
  render();

  expect(offsetOfLine(page, moved, "b")).toBe(offset);
});
