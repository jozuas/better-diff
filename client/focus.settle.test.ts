import { expect, test } from "vitest";

import { recorded } from "../test/keyboard-focus";
import { fileBar, modeBar } from "./focus";
import type { BarAt, KeyboardFocus } from "./focus";

// Holds the place of the bar at the place among those at the places, as an action on it runs, then
// takes it out of the view, as the action does, unless `stays`.
function actedOn(focus: KeyboardFocus, add: (...places: BarAt[]) => (() => void)[]) {
  return (all: BarAt[], place: BarAt, stays = false): void => {
    const removals = add(...all);

    focus.hold(place);

    if (!stays) {
      removals[all.findIndex((other) => other.join(",") === place.join(","))]?.();
    }
  };
}

test("once an action is done, focus moves to the hunk that takes the place of the one it ran on, without showing it, and only once", () => {
  const { done, focus, add } = recorded();

  actedOn(focus, add)(
    [
      [0, 0],
      [0, 1],
      [1, fileBar],
      [1, 0],
    ],
    [0, 1],
  );
  focus.settle(false, true);
  focus.settle(false, true);

  expect(done).toStrictEqual(["focus 1,0"]);
});

test("focus moves nowhere while the action is busy, though the hunk is still shown", () => {
  const { done, focus, add } = recorded();

  actedOn(focus, add)(
    [
      [0, 0],
      [0, 1],
    ],
    [0, 0],
    true,
  );
  focus.settle(true, true);

  expect(done).toStrictEqual([]);

  focus.settle(false, true);

  expect(done).toStrictEqual(["focus 0,0"]);
});

test("once the action was on the last hunk, focus moves to the one now last", () => {
  const { done, focus, add } = recorded();

  actedOn(focus, add)(
    [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
    [0, 2],
  );
  focus.settle(false, true);

  expect(done).toStrictEqual(["focus 0,1"]);
});

test("once an action runs from a file's bar or its mode change's, focus moves to the first hunk of the file that takes its place, or the bar of one shown without hunks", () => {
  const { done, focus, add, stop } = recorded();

  add([0, fileBar], [0, modeBar], [0, 0]);
  focus.hold([0, modeBar]);
  focus.settle(false, true);
  focus.hold([0, fileBar]);
  focus.addStop({ ...stop([1, fileBar]), bare: true });
  focus.settle(false, true);

  expect(done).toStrictEqual(["focus 0,0", "focus 0,0"]);
});

test("focus moves on to the bar of a file shown without hunks, and not to that of a file whose diff isn't read yet", () => {
  const { done, focus, stop } = recorded();

  focus.addStop({ ...stop([0, fileBar]), bare: false });
  focus.addStop({ ...stop([1, fileBar]), bare: true });
  focus.hold([0, 0]);
  focus.settle(false, true);

  expect(done).toStrictEqual(["focus 1,-2"]);
});

test("focus stays where it is once something has it, and the place is let go", () => {
  const { done, focus, add } = recorded();

  actedOn(focus, add)(
    [
      [0, 0],
      [0, 1],
    ],
    [0, 0],
  );
  focus.settle(false, false);
  focus.settle(false, true);

  expect(done).toStrictEqual([]);
});

test("the place stays held while the view shows no hunk, nor bar of a file shown without hunks, as while the next file's diff is read", () => {
  const { done, focus, add } = recorded();

  actedOn(focus, add)([[0, 0]], [0, 0]);
  add([0, fileBar]);
  focus.settle(false, true);
  add([0, 0], [0, 1]);
  focus.settle(false, true);

  expect(done).toStrictEqual(["focus 0,0"]);
});

test("focus moves nowhere without a place held", () => {
  const { done, focus, add } = recorded();

  add([0, 0], [0, 1]);
  focus.settle(false, true);

  expect(done).toStrictEqual([]);
});

test("a place after every hunk holds the last", () => {
  const { done, focus, add } = recorded();

  add([0, 0], [0, 1]);
  focus.hold([1, 0]);
  focus.settle(false, true);

  expect(done).toStrictEqual(["focus 0,1"]);
});
