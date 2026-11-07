import { expect, test } from "vitest";

import { searched, stepTimes, testView } from "../test/find";

test("the Match case button finds only the case typed, from the current match, and with it off, text without capitals is found whatever the case", () => {
  const { find, revealed } = searched([{ index: 0, sections: [["a A a"]] }], "a");

  expect(find.state()).toMatchObject({ count: 3, current: 0, matchCase: false });

  find.step(1);
  find.setMatchCase(true);

  expect(find.state()).toMatchObject({ count: 2, current: 1, matchCase: true });
  expect(revealed.at(-1)).toStrictEqual({ index: 0, section: 0, line: 0 });
  expect(find.foundIn("view:0", 0).get(0)).toStrictEqual([
    { start: 0, end: 1, current: false },
    { start: 4, end: 5, current: true },
  ]);

  find.setMatchCase(false);

  expect(find.state()).toMatchObject({ count: 3, current: 2, matchCase: false });
});

test("with nothing found, moving to a match does nothing, and tells no listener", () => {
  const { find, revealed } = searched([{ index: 0, sections: [["b"]] }], "a");
  let heard = 0;

  find.subscribe(() => {
    heard += 1;
  });
  find.step(1);
  find.step(-1);

  expect(find.state()).toMatchObject({ count: 0, current: undefined });
  expect(revealed).toStrictEqual([]);
  expect(heard).toBe(0);
});

test("the find bar starts closed, with nothing typed, Match case off, and nothing found", () => {
  const { find, add } = testView();

  add({ index: 0, sections: [["a"]], collapsed: false });

  expect(find.state()).toMatchObject({
    open: false,
    text: "",
    matchCase: false,
    count: 0,
    current: undefined,
    collapsed: 0,
  });

  find.open();

  expect(find.state()).toMatchObject({ open: true, text: "", count: 0, current: undefined });
});

test("once another view shows, its first match is current, and typing makes current the first at or after its top", () => {
  const { find, revealed, add } = testView();
  const remove = add({ index: 0, sections: [["a a a"]] }, "one");

  find.open();
  find.search("a");
  stepTimes(find, 1, 2);
  remove();
  add({ index: 0, sections: [["a", "a"]], offsets: [[-20, 0]] }, "two");
  revealed.length = 0;

  expect(find.state()).toMatchObject({ count: 2, current: 0 });
  expect(revealed).toStrictEqual([]);

  find.search("a");

  expect(find.state()).toMatchObject({ count: 2, current: 1 });
  expect(revealed).toStrictEqual([{ index: 0, section: 0, line: 1 }]);
});

test("while a view's files still show, the current match stays as another view's files join it", () => {
  const { find, add } = testView();

  add({ index: 0, sections: [["a a a"]] }, "one");
  find.open();
  find.search("a");
  stepTimes(find, 1, 2);
  add({ index: 1, sections: [["a"]] }, "two");

  expect(find.state()).toMatchObject({ count: 4, current: 2 });
});

test("the find bar counts the collapsed files shown, which it doesn't find in", () => {
  const { find, add } = testView();

  add({ index: 0, sections: [], collapsed: true });
  add({ index: 1, sections: [["a"]] });

  const remove = add({ index: 2, sections: [], collapsed: true });

  find.open();

  expect(find.state().collapsed).toBe(2);

  remove();

  expect(find.state().collapsed).toBe(1);
});

test("what the find bar shows stays the same while nothing changes", () => {
  const { find } = searched([{ index: 0, sections: [["a a"]] }], "a");
  const state = find.state();
  const found = find.foundIn("view:0", 0);

  expect(find.state()).toBe(state);
  expect(find.foundIn("view:0", 0)).toBe(found);

  find.step(1);

  expect(find.state()).not.toBe(state);
  expect(find.foundIn("view:0", 0)).not.toBe(found);
});

test("moving to another match changes only the matches of the sections it moves from and to", () => {
  const { find } = searched(
    [
      { index: 0, sections: [["a", "b"], ["a a"]] },
      { index: 1, sections: [["a"]] },
    ],
    "a",
  );

  const from = find.foundIn("view:0", 0);
  const to = find.foundIn("view:0", 1);
  const other = find.foundIn("view:1", 0);

  find.step(1);

  expect(find.foundIn("view:0", 0)).not.toBe(from);
  expect(find.foundIn("view:0", 1)).not.toBe(to);
  expect(find.foundIn("view:1", 0)).toBe(other);
});

test("sections without matches all have the same nothing found, whatever's typed", () => {
  const { find, add } = testView();

  add({ index: 0, sections: [["b"], ["c"]] });

  const closed = find.foundIn("view:0", 0);

  find.open();
  find.search("a");

  expect(find.foundIn("view:0", 0)).toBe(closed);
  expect(find.foundIn("view:0", 1)).toBe(closed);

  find.search("x");

  expect(find.foundIn("view:0", 0)).toBe(closed);
  expect(find.foundIn("view:1", 0)).toBe(closed);
});

test("a listener hears each change until it stops listening", () => {
  const { find, add } = testView();
  let heard = 0;

  const stop = find.subscribe(() => {
    heard += 1;
  });

  const changes = [
    () => add({ index: 0, sections: [["a a"]] }),
    () => {
      find.open();
    },
    () => {
      find.search("a");
    },
    () => {
      find.setMatchCase(true);
    },
    () => {
      find.step(1);
    },
    () => {
      find.close();
    },
  ];

  const counts = changes.map((change) => {
    change();

    return heard;
  });

  expect(counts).toStrictEqual([1, 2, 3, 4, 5, 6]);

  stop();
  add({ index: 1, sections: [] });
  find.open();

  expect(heard).toBe(6);
});

test("a file shown again under the same id stays shown once the one before it is removed", () => {
  const { find, add } = testView();
  const removeFirst = add({ index: 0, sections: [["a"]] });

  add({ index: 0, sections: [["a a"]] });
  find.open();
  find.search("a");

  let heard = 0;

  find.subscribe(() => {
    heard += 1;
  });

  removeFirst();

  expect(find.state().count).toBe(2);
  expect(heard).toBe(0);
});

test("opening the find bar while it's open stays at the current match", () => {
  const { find, revealed } = searched([{ index: 0, sections: [["a a"]] }], "a");

  find.step(1);
  revealed.length = 0;
  find.open();

  expect(find.state().current).toBe(1);
  expect(revealed).toStrictEqual([]);
});
