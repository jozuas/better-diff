import * as fc from "fast-check";
import { expect, test } from "vitest";

import { places, recorded, shown } from "../test/keyboard-focus";
import { fileBar, modeBar } from "./focus";
import type { BarAt, KeyboardFocus } from "./focus";
import type { OpenFile } from "./groups";
import type { SidebarStop } from "./sidebar-stops";

// What opens a file keys move focus into, recording that it did.
function opening(done: string[]): () => void {
  return () => {
    done.push("open");
  };
}

// Has the view open the file the sidebar lists after a file, "next", or before it, "previous", as
// a view of one file does, with what it opens recorded.
function crossing(focus: KeyboardFocus, done: string[]): void {
  focus.addCrossing();
  focus.addListed({
    listed: ({ group }, step) => ({ group, path: step === 1 ? "next" : "previous" }),
    open: ({ path }) => {
      done.push(`open ${path}`);
    },
  });
}

test("→ moves focus to the first hunk the view shows of the file, and shows it, whichever was added first", () => {
  const { done, focus, add } = recorded();

  add([1, 1], [0, 1], [1, 0], [1, fileBar], [0, 0]);
  focus.toFile({ group: "modified", path: "1" }, opening(done));

  expect(done).toStrictEqual(shown([1, 0]));
});

test("→ moves focus to the file's bar while the view shows none of its hunks", () => {
  const { done, focus, add } = recorded();

  add([0, modeBar], [0, fileBar], [1, modeBar]);
  focus.toFile({ group: "modified", path: "0" }, opening(done));

  expect(done).toStrictEqual(shown([0, fileBar]));
});

test("→ opens a file the view shows none of the bars of, though it shows one in another group at its path, and moves focus to its first hunk once it shows", () => {
  const { done, focus, stop } = recorded();
  const file = { group: "modified", path: "a" } as const;

  focus.addStop(stop([0, 0], "a", "staged"));
  focus.toFile(file, opening(done));
  focus.addStop(stop([0, fileBar], "a"));
  focus.addStop(stop([0, 1], "a"));
  focus.shown({ group: "staged", path: "a" });

  expect(done).toStrictEqual(["open"]);

  focus.shown(file);
  focus.shown(file);

  expect(done).toStrictEqual(["open", ...shown([0, 1])]);
});

test("→ opens a file the view shows none of the bars of, and moves focus to its bar once it shows without hunks", () => {
  const { done, focus, stop } = recorded();
  const file = { group: "modified", path: "a" } as const;

  focus.toFile(file, opening(done));
  focus.addStop(stop([0, fileBar], "a"));
  focus.addStop(stop([0, modeBar], "a"));
  focus.shown(file);

  expect(done).toStrictEqual(["open", ...shown([0, fileBar])]);
});

test("a press of the pointer moves focus to the bar at the place, without showing it, and to none where there's none", () => {
  const { done, focus, add } = recorded();

  add([0, fileBar], [0, 0], [1, 0]);
  focus.toBarAt([1, 0]);
  focus.toBarAt([0, 1]);

  expect(done).toStrictEqual(["focus 1,0"]);
});

test("a press of the pointer gives up moving focus to a file keys opened once it shows", () => {
  const { done, focus, stop } = recorded();
  const file = { group: "modified", path: "a" } as const;

  focus.toFile(file, opening(done));
  focus.abandon();
  focus.addStop(stop([0, 0], "a"));
  focus.shown(file);

  expect(done).toStrictEqual(["open"]);
});

// Whether the bar at the place comes before the one at the other, in the view.
function before([file, bar]: BarAt, [otherFile, otherBar]: BarAt): boolean {
  return file < otherFile || (file === otherFile && bar < otherBar);
}

// The places of the bars a step moves focus to from the bar at the place each in turn, of those at
// the places added, until it moves it nowhere.
function walked(added: readonly BarAt[], from: BarAt | undefined, step: 1 | -1): BarAt[] {
  const { done, focus, add } = recorded();

  add(...added);

  function walk(place: BarAt | undefined): BarAt[] {
    if (place === undefined) {
      return [];
    }

    done.length = 0;
    focus.toBarBy(place, step);

    return [place, ...walk(added.find((other) => done.includes(`focus ${other.join(",")}`)))];
  }

  return walk(from);
}

// Those of the places that don't come after the one before them.
function outOfOrder(reached: readonly BarAt[]): BarAt[] {
  return reached.slice(1).filter((place, index) => {
    const previous = reached[index];

    return previous === undefined || !before(previous, place);
  });
}

test("↓ from the first bar reaches each bar the view shows once, each further down the view than the one before, and ↑ from the last each going back up", () => {
  fc.assert(
    fc.property(places, (added) => {
      const top = added.find((place) => added.every((other) => !before(other, place)));
      const bottom = added.find((place) => added.every((other) => !before(place, other)));
      const down = walked(added, top, 1);

      expect(down).toHaveLength(added.length);
      expect(outOfOrder(down)).toStrictEqual([]);
      expect(walked(added, bottom, -1)).toStrictEqual(down.toReversed());
    }),
  );
});

test("↓ and ↑ move focus nowhere past either end of a view that doesn't cross files, or from a bar the view doesn't show", () => {
  const { done, focus, add } = recorded();

  focus.addListed({
    listed: (file) => file,
    open: () => {
      done.push("open");
    },
  });
  add([0, 0], [1, 0]);
  focus.toBarBy([1, 0], 1);
  focus.toBarBy([0, 0], -1);
  focus.toBarBy([0, 1], 1);
  focus.toBarBy([1, 1], -1);

  expect(done).toStrictEqual([]);
});

test("keys past the ends of a view that crosses files open nothing while the sidebar lists no file after its file or before it, nor from a bar the view doesn't show", () => {
  const { done, focus, stop } = recorded();
  const none: OpenFile[] = [];

  focus.addCrossing();
  focus.addListed({
    listed: () => none[0],
    open: () => {
      done.push("open");
    },
  });
  focus.addStop(stop([0, 0], "a"));
  focus.toBarBy([0, 0], 1);
  focus.toFileBy([0, 0], -1);

  const other = recorded();

  crossing(other.focus, other.done);
  other.focus.addStop(other.stop([0, 0], "a"));
  other.focus.toBarBy([5, 5], 1);

  expect([...done, ...other.done]).toStrictEqual([]);
});

test("past the last bar of a view that crosses files, ↓ opens the file the sidebar lists after its file, and focus moves to its bar once it's added", () => {
  const { done, focus, stop } = recorded();

  crossing(focus, done);
  focus.addStop(stop([0, 0], "a"));
  focus.toBarBy([0, 0], 1);
  focus.addStop(stop([0, 0], "next"));

  expect(done).toStrictEqual(["open next"]);

  focus.addStop(stop([0, fileBar], "next"));
  focus.addStop(stop([0, fileBar], "next"));

  expect(done).toStrictEqual(["open next", ...shown([0, fileBar])]);
});

test("before the first bar of a view that crosses files, ↑ opens the file the sidebar lists before its file, and focus moves to its last bar once the view of just that file shows", () => {
  const { done, focus, stop } = recorded();
  const previous: OpenFile = { group: "modified", path: "previous" };

  crossing(focus, done);
  focus.addStop(stop([0, fileBar], "a"));
  focus.toBarBy([0, fileBar], -1);
  focus.addStop(stop([0, fileBar], "previous"));
  focus.shown({ group: "staged", path: "previous" });
  focus.shown({ group: "modified" });
  focus.shown({ group: "modified", paths: ["a", "previous"] });
  focus.addStop(stop([0, 1], "previous"));
  focus.addStop(stop([0, 0], "previous"));

  expect(done).toStrictEqual(["open previous"]);

  focus.shown(previous);
  focus.shown(previous);

  expect(done).toStrictEqual(["open previous", ...shown([0, 1])]);
});

test("a file keys open no longer takes focus once keys move focus elsewhere before it shows", () => {
  const { done, focus, stop, named } = recorded();

  crossing(focus, done);
  focus.addRow({ group: "modified", path: "a" }, named("row a"));
  focus.addStop(stop([0, 0], "a"));
  focus.toBarBy([0, 0], 1);
  focus.toRow({ group: "modified", path: "a" });
  focus.addStop(stop([0, fileBar], "next"));

  expect(done).toStrictEqual(["open next", "row a"]);
});

test("with Alt, ↓ and ↑ move focus to the next file's bar after the place, or the one before it, and show it", () => {
  const { done, focus, add } = recorded();

  add([0, fileBar], [0, 0], [0, 1], [1, fileBar], [1, modeBar], [1, 0]);
  focus.toFileBy([0, 0], 1);
  focus.toFileBy([1, 0], -1);
  focus.toFileBy([1, fileBar], -1);
  focus.toFileBy([1, fileBar], 1);
  focus.toFileBy([0, fileBar], -1);

  expect(done).toStrictEqual([
    ...shown([1, fileBar]),
    ...shown([1, fileBar]),
    ...shown([0, fileBar]),
  ]);
});

test("past the last file's bar, or before the first, with Alt, ↓ and ↑ open the next file or the one before, with focus on its bar, in a view that crosses files", () => {
  const { done, focus, stop } = recorded();

  crossing(focus, done);
  focus.addStop(stop([0, fileBar], "a"));
  focus.addStop(stop([0, 0], "a"));
  focus.toFileBy([0, fileBar], -1);
  focus.toFileBy([0, 0], 1);
  focus.addStop(stop([0, fileBar], "next"));

  expect(done).toStrictEqual(["open previous", "open next", ...shown([0, fileBar])]);
});

test("moving a selection of lines on past a hunk selects the next hunk's first line, or the last line of the one before, passing bars that aren't hunks', and nothing past either end", () => {
  const { done, focus, add } = recorded();

  add([0, 0], [1, fileBar], [1, modeBar], [1, 0], [0, fileBar]);
  focus.toLinesBy([0, 0], 1);
  focus.toLinesBy([1, 0], -1);
  focus.toLinesBy([1, 0], 1);
  focus.toLinesBy([0, 0], -1);
  focus.toLinesBy([2, 0], 1);

  expect(done).toStrictEqual(["focus 1,0", "enter 1,0 first", "focus 0,0", "enter 0,0 last"]);
});

test("moving a selection of lines on to a hunk whose bar can't select its lines only moves focus there", () => {
  const { done, focus, add, stop } = recorded();
  const { enter, ...noLines } = stop([1, 0]);

  add([0, 0]);
  focus.addStop(noLines);
  focus.toLinesBy([0, 0], 1);

  expect(enter).toBeDefined();
  expect(done).toStrictEqual(["focus 1,0"]);
});

test("a bar, row, heading or filter taken out of the panel is no longer moved to, and the others still are", () => {
  const { done, focus, add, named } = recorded();
  const [removeFirst] = add([0, 0], [0, 1]);
  const a = { group: "modified", path: "a" } as const;
  const removeRow = focus.addRow(a, named("a"));
  const removeHeading = focus.addHeading("staged", named("staged"));
  const removeFilter = focus.addFilter(named("filter"));
  const none: SidebarStop[] = [];

  focus.addRow({ group: "modified", path: "b" }, named("b"));
  focus.addHeading("untracked", named("untracked"));
  focus.addFilter(named("other filter"));
  removeFirst?.();
  removeRow();
  removeHeading();
  removeFilter();
  focus.toFile({ group: "modified", path: "0" }, opening(done));
  focus.toRow(a);
  focus.toStop({ group: "modified", path: "b" });
  focus.toHeading("staged");
  focus.toStop({ group: "untracked" });
  focus.toStop(none[0]);
  focus.toFilter();

  expect(done).toStrictEqual([...shown([0, 1]), "b", "untracked", "other filter"]);
});

test("← moves focus to the row of the bar's file, as opened from its group", () => {
  const { done, focus, named } = recorded();

  focus.addRow({ group: "modified", path: "a" }, named("modified a"));
  focus.addRow({ group: "staged", path: "a" }, named("staged a"));
  focus.toRow({ group: "staged", path: "a" });

  expect(done).toStrictEqual(["staged a"]);
});
