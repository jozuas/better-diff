import * as fc from "fast-check";
import { expect, test } from "vitest";

import {
  currentOf,
  firstAtTop,
  firstFrom,
  firstOf,
  foundIn,
  lineAt,
  linesOf,
  placesIn,
  scrolledFiles,
  searched,
  sectionsIn,
  shownFiles,
  stepTimes,
  storeText,
  testView,
  withOffsets,
} from "../test/find";

test("the find bar finds the text in the files shown, in the order they show, and moves from each match to the next, round from the last to the first, showing each", () => {
  fc.assert(
    fc.property(shownFiles, storeText, (files, text) => {
      const { find, revealed } = searched(files, text);
      const places = placesIn(files, text);

      expect(find.state()).toMatchObject({
        open: true,
        text,
        count: places.length,
        current: firstOf(places),
      });
      expect(revealed.splice(0)).toStrictEqual(lineAt(places, firstOf(places)));

      const currents = places.map(() => {
        find.step(1);

        return find.state().current;
      });

      expect(revealed).toStrictEqual(linesOf([...places.slice(1), ...places.slice(0, 1)]));
      expect(currents).toStrictEqual(places.map((_, index) => (index + 1) % places.length));
    }),
  );
});

test("the find bar moves from each match to the one before, round from the first to the last", () => {
  fc.assert(
    fc.property(shownFiles, storeText, (files, text) => {
      const { find, revealed } = searched(files, text);
      const places = placesIn(files, text);

      revealed.length = 0;

      const currents = places.map(() => {
        find.step(-1);

        return find.state().current;
      });

      expect(revealed).toStrictEqual(linesOf(places.toReversed()));
      expect(currents).toStrictEqual(places.map((_, index) => places.length - 1 - index));
    }),
  );
});

test("each line's matches are where the text is in it, and only the current match is marked current", () => {
  fc.assert(
    fc.property(shownFiles, storeText, fc.nat(), (files, text, steps) => {
      const { find } = searched(files, text);
      const places = placesIn(files, text);

      stepTimes(find, 1, steps % (places.length + 1));

      expect(
        sectionsIn(files).map(([container, section]) => find.foundIn(container, section)),
      ).toStrictEqual(foundIn(files, text, currentOf(find, places)));
      expect(
        files.map(({ index, sections }) => find.foundIn(`view:${String(index)}`, sections.length)),
      ).toStrictEqual(files.map(() => new Map()));
      expect(find.foundIn("view:4", 0)).toStrictEqual(new Map());
    }),
    {
      examples: [
        [
          [
            { index: 0, sections: [["a"], ["a"]] },
            { index: 1, sections: [["a"], ["a"]] },
          ],
          "a",
          3,
        ],
      ],
    },
  );
});

test("closed, the find bar finds nothing and counts no collapsed files, and opened, finds what's typed from the top of the view", () => {
  fc.assert(
    fc.property(shownFiles, storeText, (files, text) => {
      const { find, revealed, add } = testView();

      for (const file of [...files, { index: files.length, sections: [], collapsed: true }]) {
        add(file);
      }

      find.search(text);

      const places = placesIn(files, text);
      const closed = { open: false, text, count: 0, current: undefined, collapsed: 0 };
      const nothing = sectionsIn(files).map(() => new Map());

      function found() {
        return sectionsIn(files).map(([container, section]) => find.foundIn(container, section));
      }

      expect([find.state(), revealed, found()]).toMatchObject([closed, [], nothing]);

      find.open();

      expect([find.state(), revealed]).toMatchObject([
        { open: true, count: places.length, current: firstOf(places), collapsed: 1 },
        lineAt(places, firstOf(places)),
      ]);

      find.close();

      expect([find.state(), revealed, found()]).toMatchObject([
        closed,
        lineAt(places, firstOf(places)),
        nothing,
      ]);
    }),
  );
});

test("typing makes the current match the first at or after the one that was, or else the first, and shows it", () => {
  fc.assert(
    fc.property(shownFiles, storeText, storeText, fc.nat(), (files, first, then, steps) => {
      const { find, revealed } = searched(files, first);
      const firstPlaces = placesIn(files, first);

      stepTimes(find, 1, steps % (firstPlaces.length + 1));

      const was = currentOf(find, firstPlaces);

      revealed.length = 0;
      find.search(then);

      const places = placesIn(files, then);
      const expected = firstFrom(places, was);

      expect(find.state().current).toBe(expected);
      expect(revealed).toStrictEqual(lineAt(places, expected));
    }),
    {
      examples: [
        [[{ index: 0, sections: [["ab ab"]] }], "b", "a", 1],
        [[{ index: 0, sections: [["a b"], ["b"]] }], "b", "a", 1],
      ],
    },
  );
});

test("with no current match, typing makes current the first match at or after the top of the view, or else the first, as does opening the find bar again", () => {
  fc.assert(
    fc.property(scrolledFiles, storeText, fc.nat(), ({ files, scroll, rendered }, text, steps) => {
      const scrolled = withOffsets(files, scroll, rendered, 20);
      const { find, revealed } = searched(scrolled, text);
      const places = placesIn(files, text);
      const expected = firstAtTop(scrolled, places);

      expect(find.state().current).toBe(expected);

      stepTimes(find, 1, steps % (places.length + 1));
      find.close();
      revealed.length = 0;
      find.open();

      expect(find.state().current).toBe(expected);
      expect(revealed).toStrictEqual(lineAt(places, expected));
    }),
    {
      examples: [
        [{ files: [{ index: 0, sections: [["a", "a", "a"]] }], scroll: 20, rendered: [] }, "a", 0],
        [
          {
            files: [{ index: 0, sections: [["a", "a", "a"]] }],
            scroll: 0,
            rendered: [false, false, true],
          },
          "a",
          0,
        ],
        [{ files: [{ index: 0, sections: [["a", "b", "b"]] }], scroll: 30, rendered: [] }, "a", 0],
      ],
    },
  );
});

test("as the files shown change, the current match is the first at or after where it was, or else the first, and the view stays where it is", () => {
  fc.assert(
    fc.property(shownFiles, shownFiles, storeText, fc.nat(), (files, changed, text, steps) => {
      const { find, revealed, add } = testView();
      const removers = files.map((file) => add(file));

      find.open();
      find.search(text);

      const places = placesIn(files, text);

      stepTimes(find, 1, steps % (places.length + 1));

      const was = currentOf(find, places);

      revealed.length = 0;

      for (const remove of removers) {
        remove();
      }

      for (const file of changed) {
        add(file);
      }

      expect(find.state().current).toBe(firstFrom(placesIn(changed, text), was));
      expect(revealed).toStrictEqual([]);
    }),
  );
});
