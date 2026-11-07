import * as fc from "fast-check";
import { expect, test } from "vitest";

import { hunksAndUnchanged, sectionLinesOf } from "../test/find";
import type { Hunks } from "../test/find";
import { collapsedFile, findableLines, sectionsOf } from "./find";
import type { FindableFile, LinePage } from "./find";
import type { Unchanged } from "./lines";
import { shownFileOf } from "./place";

// What a fake page is asked to do: show a line, or render the entire file's lines around one.
type PageEvent = ["reveal", string, number] | ["around", number, string];

// The diff's lines as a file the find bar finds in, on a page that has the lines at the ids, at
// their offsets, and what the page is asked to do.
function onPage(
  hunks: Hunks,
  unchanged: Unchanged,
  offsets: ReadonlyMap<string, number>,
  margin: number,
) {
  const events: PageEvent[] = [];

  const page: LinePage = {
    reveal: (id, at) => {
      events.push(["reveal", id, at]);

      return offsets.has(id);
    },
    offsetOf: (id) => offsets.get(id),
  };

  const file = findableLines({
    container: "view:1",
    view: "view",
    index: 1,
    sections: sectionsOf(hunks, unchanged),
    now: () => ({ unchanged, margin }),
    showAround: (line, id) => {
      events.push(["around", line, id]);
    },
    page,
  });

  return { file, events };
}

// A line of a diff, by its section and its index there, with its id, and if it's unchanged, its
// number in the new version.
interface LineOnPage {
  section: number;
  line: number;
  id: string;
  newNumber: number | undefined;
}

// A diff's lines, the margin bars stuck at the view's top take, and the offsets of the lines the
// page has.
const linesOnPage = hunksAndUnchanged.chain(({ hunks, unchanged }) =>
  fc
    .tuple(fc.array(fc.boolean(), { maxLength: 60 }), fc.integer({ min: 0, max: 60 }))
    .map(([rendered, margin]) => {
      const { ids } = shownFileOf("a.txt", hunks, unchanged, "view:1");

      const lines: LineOnPage[] = sectionLinesOf(hunks, unchanged)
        .flatMap((sectionLines, section) =>
          sectionLines.map((numbered, line) => ({ section, line, newNumber: numbered?.newNumber })),
        )
        .map((line, at) => Object.assign(line, { id: ids[at] ?? "" }));

      const offsets = new Map(
        ids.flatMap((id, at) => ((rendered[at] ?? true) ? [[id, 20 * at] as const] : [])),
      );

      return { hunks, unchanged, margin, offsets, lines };
    }),
);

// What showing the line on a page that has the lines at the offsets does: shows it, and if the page
// hasn't it but it's one of the entire file's, has the lines around it rendered.
function eventsOf(
  { id, newNumber }: LineOnPage,
  offsets: ReadonlyMap<string, number>,
  margin: number,
): PageEvent[] {
  const around: PageEvent[] =
    offsets.has(id) || newNumber === undefined ? [] : [["around", newNumber, id]];

  return [["reveal", id, margin], ...around];
}

// How far below what stays at the top of the view the line is, if the page has it.
function belowMargin(
  { id }: LineOnPage,
  offsets: ReadonlyMap<string, number>,
  margin: number,
): number | undefined {
  const offset = offsets.get(id);

  return offset === undefined ? undefined : offset - margin;
}

test("the find bar shows a line of a diff on the page, or once the entire file has rendered the lines around it, if the page hasn't it yet", () => {
  fc.assert(
    fc.property(linesOnPage, ({ hunks, unchanged, margin, offsets, lines }) => {
      const { file, events } = onPage(hunks, unchanged, offsets, margin);

      for (const { section, line } of lines) {
        file.reveal(section, line);
      }

      expect(events).toStrictEqual(lines.flatMap((line) => eventsOf(line, offsets, margin)));
    }),
  );
});

test("a line of a diff is as far below what stays at the top of the view as the page has it below the view's top, less the bars stuck there", () => {
  fc.assert(
    fc.property(linesOnPage, ({ hunks, unchanged, margin, offsets, lines }) => {
      const { file } = onPage(hunks, unchanged, offsets, margin);

      expect(lines.map(({ section, line }) => file.offsetOf(section, line))).toStrictEqual(
        lines.map((line) => belowMargin(line, offsets, margin)),
      );
    }),
  );
});

// The offsets the file gives the lines, by section and index, where it gives any.
function offsetsOf(file: FindableFile, lines: readonly [number, number][]): number[] {
  return lines.flatMap(([section, line]) => file.offsetOf(section, line) ?? []);
}

// The index past the last line of each section of unchanged lines.
function pastTheEnds(hunks: Hunks, unchanged: Unchanged): [number, number][] {
  return sectionLinesOf(hunks, unchanged).flatMap((sectionLines, section): [number, number][] =>
    section % 2 === 0 ? [[section, sectionLines.length]] : [],
  );
}

test("past the last line of a section of unchanged lines, there's nothing to show nor be below the view's top", () => {
  fc.assert(
    fc.property(linesOnPage, ({ hunks, unchanged, margin, offsets }) => {
      const { file, events } = onPage(hunks, unchanged, offsets, margin);
      const ends = pastTheEnds(hunks, unchanged);

      for (const [section, line] of ends) {
        file.reveal(section, line);
      }

      expect(events).toStrictEqual([]);
      expect(offsetsOf(file, ends)).toStrictEqual([]);
    }),
  );
});

test("a diff's lines are a file the find bar finds in, at its index in its view, and a collapsed diff one it counts and doesn't find in", () => {
  const { file } = onPage([], { before: [], after: [] }, new Map(), 0);
  const collapsed = collapsedFile("view", 2);

  expect(file).toMatchObject({ view: "view", index: 1, sections: [[]], collapsed: false });
  expect(collapsed).toMatchObject({ view: "view", index: 2, sections: [], collapsed: true });
  expect(collapsed.offsetOf(0, 0)).toBeUndefined();
  expect(() => {
    collapsed.reveal(0, 0);
  }).not.toThrow();
});
