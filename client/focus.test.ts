import * as fc from "fast-check";
import { expect, test } from "vitest";

import { keyboardFocus } from "./focus";
import type { KeyboardFocus } from "./focus";
import type { GroupName } from "./groups";

type Place = readonly [number, number];

// A panel's keyboard focus, and what's been done to what it moves focus to, in order: each hunk's by
// its place, and each row's by its path.
function recorded() {
  const done: string[] = [];
  const focus = keyboardFocus();

  function hunk(place: Place, path = String(place[0]), group: GroupName = "modified") {
    return {
      file: { group, path },
      place,
      focus: () => {
        done.push(`focus ${place.join(",")}`);
      },
      show: () => {
        done.push(`show ${place.join(",")}`);
      },
    };
  }

  function add(...places: Place[]): (() => void)[] {
    return places.map((place) => focus.addHunk(hunk(place)));
  }

  return { done, focus, hunk, add };
}

// A row that's done what it's named once focus moves to it.
function rowOf(done: string[], name: string) {
  return {
    focus: () => {
      done.push(name);
    },
  };
}

function shown(place: Place): string[] {
  return [`focus ${place.join(",")}`, `show ${place.join(",")}`];
}

test("→ moves focus to the first hunk the view shows of the file, and shows it, whichever was added first", () => {
  const { done, focus, add } = recorded();

  add([1, 1], [0, 1], [1, 0], [0, 0]);
  focus.toHunks({ group: "modified", path: "1" });

  expect(done).toStrictEqual(shown([1, 0]));
});

test("→ moves focus nowhere from a file the view shows no hunk of, though it shows one in another group at its path", () => {
  const { done, focus, hunk } = recorded();

  focus.addHunk(hunk([0, 0], "a", "staged"));
  focus.toHunks({ group: "modified", path: "a" });
  focus.toHunks({ group: "staged", path: "b" });

  expect(done).toStrictEqual([]);
});

test("↓ and ↑ move focus to the next hunk or the one before, from one file's to the next's, and show it", () => {
  const { done, focus, add } = recorded();

  add([1, 0], [0, 1], [0, 0]);
  focus.toHunkBy([0, 1], 1);
  focus.toHunkBy([1, 0], -1);
  focus.toHunkBy([0, 1], -1);

  expect(done).toStrictEqual([...shown([1, 0]), ...shown([0, 1]), ...shown([0, 0])]);
});

test("↓ and ↑ move focus nowhere past either end, or from a hunk the view doesn't show", () => {
  const { done, focus, add } = recorded();

  add([0, 0], [1, 0]);
  focus.toHunkBy([1, 0], 1);
  focus.toHunkBy([0, 0], -1);
  focus.toHunkBy([0, 1], 1);
  focus.toHunkBy([1, 1], -1);

  expect(done).toStrictEqual([]);
});

// The places of a view's hunks, each a file's index and a hunk's, in the order they're added.
const places = fc.uniqueArray(fc.tuple(fc.nat(3), fc.nat(3)), {
  selector: (place) => place.join(","),
  minLength: 1,
});

// Whether the hunk at the place comes before the one at the other, in the view.
function before([file, hunk]: Place, [otherFile, otherHunk]: Place): boolean {
  return file < otherFile || (file === otherFile && hunk < otherHunk);
}

// The places of the hunks ↓ moves focus to from the hunk at the place each in turn, of those at the
// places added, until it moves it nowhere.
function walkedDown(added: readonly Place[], from: Place | undefined): Place[] {
  const { done, focus, add } = recorded();

  add(...added);

  function walk(place: Place | undefined): Place[] {
    if (place === undefined) {
      return [];
    }

    done.length = 0;
    focus.toHunkBy(place, 1);

    return [place, ...walk(added.find((other) => done.includes(`focus ${other.join(",")}`)))];
  }

  return walk(from);
}

// Those of the places that don't come after the one before them.
function outOfOrder(reached: readonly Place[]): Place[] {
  return reached.slice(1).filter((place, index) => {
    const previous = reached[index];

    return previous === undefined || !before(previous, place);
  });
}

test("↓ from the first hunk reaches each hunk the view shows once, each further down the view than the one before", () => {
  fc.assert(
    fc.property(places, (added) => {
      const top = added.find((place) => added.every((other) => !before(other, place)));
      const reached = walkedDown(added, top);

      expect(reached).toHaveLength(added.length);
      expect(outOfOrder(reached)).toStrictEqual([]);
    }),
  );
});

test("a hunk or row taken out of the view is no longer moved to, and the others still are", () => {
  const { done, focus, add, hunk } = recorded();
  const [removeFirst] = add([0, 0], [0, 1]);
  const removeRow = focus.addRow({ group: "modified", path: "a" }, rowOf(done, "a"));

  focus.addRow({ group: "modified", path: "b" }, rowOf(done, "b"));
  removeFirst?.();
  removeRow();
  focus.toHunks({ group: "modified", path: "0" });
  focus.toRow({ group: "modified", path: "a" });
  focus.toRow({ group: "modified", path: "b" });
  focus.addHunk(hunk([0, 0]));
  focus.toHunkBy([0, 0], 1);

  expect(done).toStrictEqual([...shown([0, 1]), "b", ...shown([0, 1])]);
});

test("← moves focus to the row of the hunk's file, as opened from its group", () => {
  const done: string[] = [];
  const focus = keyboardFocus();

  focus.addRow({ group: "modified", path: "a" }, rowOf(done, "modified a"));
  focus.addRow({ group: "staged", path: "a" }, rowOf(done, "staged a"));
  focus.toRow({ group: "staged", path: "a" });

  expect(done).toStrictEqual(["staged a"]);
});

// Holds the place of the hunk at the place among those at the places, as an action on it runs,
// then takes it out of the view, as the action does, unless `stays`.
function actedOn(focus: KeyboardFocus, add: (...places: Place[]) => (() => void)[]) {
  return (all: Place[], place: Place, stays = false): void => {
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

test("the place stays held while the view shows no hunk, as while the next file's diff is read", () => {
  const { done, focus, add } = recorded();

  actedOn(focus, add)([[0, 0]], [0, 0]);
  focus.settle(false, true);
  add([0, 0], [0, 1]);
  focus.settle(false, true);

  expect(done).toStrictEqual(["focus 0,0"]);
});

test("focus moves nowhere without a place held, or once the place held is one no hunk was at", () => {
  const { done, focus, add } = recorded();

  add([0, 0], [0, 1]);
  focus.settle(false, true);
  focus.hold([1, 0]);
  focus.settle(false, true);

  expect(done).toStrictEqual([]);
});
