import * as fc from "fast-check";
import { expect, test } from "vitest";

import { places, recorded, shown } from "../test/keyboard-focus";
import { fileBar } from "./focus";
import type { BarAt, KeyboardFocus } from "./focus";

// What moving focus into a group's view with bars at the places does: moves focus to its first
// file's first hunk, or that file's bar if it shows none of its hunks, and shows it.
function entered(added: readonly BarAt[]): string[] {
  const first = Math.min(...added.map(([file]) => file));
  const bars = added.flatMap(([file, bar]) => (file === first ? [bar] : []));
  const hunks = bars.filter((bar) => bar >= 0);

  if (hunks.length > 0) {
    return shown([first, Math.min(...hunks)]);
  }

  return bars.includes(fileBar) ? shown([first, fileBar]) : [];
}

test("→ on a group's expanded heading moves focus to the first hunk its view shows of its first file, or that file's bar if it shows none of its hunks, and shows it: at once while the group is open, or else once its view shows", () => {
  fc.assert(
    fc.property(places, (added) => {
      const open = recorded();
      const opening = recorded();

      open.add(...added);
      open.focus.toGroup("modified", true);
      opening.focus.toGroup("modified", false);
      opening.add(...added);

      const before = [...opening.done];

      opening.focus.shown({ group: "modified" });

      expect(open.done).toStrictEqual(entered(added));
      expect([before, opening.done]).toStrictEqual([[], entered(added)]);
    }),
  );
});

test("→ on the heading of a group whose view shows no bars moves focus nowhere", () => {
  const { done, focus } = recorded();

  focus.toGroup("staged", true);
  focus.toGroup("staged", false);
  focus.shown({ group: "staged" });

  expect(done).toStrictEqual([]);
});

test("a group keys open takes focus once the view of all of it shows, not of a file or files selected in it, nor of another group, and only once", () => {
  const { done, focus, add } = recorded();

  focus.toGroup("modified", false);
  add([1, 0], [0, 1], [0, 0]);
  focus.shown({ group: "modified", path: "0" });
  focus.shown({ group: "modified", paths: ["0", "1"] });
  focus.shown({ group: "staged" });

  expect(done).toStrictEqual([]);

  focus.shown({ group: "modified" });
  focus.shown({ group: "modified" });

  expect(done).toStrictEqual(shown([0, 0]));
});

// Moves of focus elsewhere: to a row, a heading, the filter, a file, a bar, a file's bar or a hunk's
// lines, or into another group's view, or into the group's at once, or a press of the pointer.
const moves: ((focus: KeyboardFocus) => void)[] = [
  (focus) => {
    focus.toRow({ group: "modified", path: "1" });
  },
  (focus) => {
    focus.toHeading("staged");
  },
  (focus) => {
    focus.toStop({ group: "untracked" });
  },
  (focus) => {
    focus.toFilter();
  },
  (focus) => {
    focus.toFile({ group: "modified", path: "1" }, () => {});
  },
  (focus) => {
    focus.toBarBy([0, 0], 1);
  },
  (focus) => {
    focus.toFileBy([1, fileBar], -1);
  },
  (focus) => {
    focus.toLinesBy([0, 0], 1);
  },
  (focus) => {
    focus.toGroup("staged", false);
  },
  (focus) => {
    focus.toGroup("modified", true);
  },
  (focus) => {
    focus.toBarAt([0, 0]);
  },
  (focus) => {
    focus.abandon();
  },
];

// What's done once focus moves elsewhere, and the view of the group "modified" shows, in a view
// with bars at the places, after keys open the group or not.
function movedElsewhere(
  added: readonly BarAt[],
  move: (focus: KeyboardFocus) => void,
  opened: boolean,
): string[] {
  const { done, focus, add, named } = recorded();

  add(...added);
  focus.addRow({ group: "modified", path: "1" }, named("row"));
  focus.addHeading("staged", named("staged"));
  focus.addHeading("untracked", named("untracked"));
  focus.addFilter(named("filter"));

  if (opened) {
    focus.toGroup("modified", false);
  }

  move(focus);
  focus.shown({ group: "modified" });

  return done;
}

test("a group keys open no longer takes focus once keys move focus elsewhere before its view shows", () => {
  fc.assert(
    fc.property(places, fc.constantFrom(...moves), (added, move) => {
      expect(movedElsewhere(added, move, true)).toStrictEqual(movedElsewhere(added, move, false));
    }),
  );
});
