import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { diffRpc } from "../shared/diff";
import { filePath } from "../test/file-names";
import { filesToRender, linesShown, stillRendered } from "./rendering";

function sum(lines: readonly number[]): number {
  let total = 0;

  for (const line of lines) {
    total += line;
  }

  return total;
}

// Files' line counts, how many of them are rendered, and how many more lines to render.
const rendering = fc
  .array(fc.nat(50), { maxLength: 20 })
  .chain((lines) =>
    fc.tuple(fc.constant(lines), fc.nat(lines.length), fc.integer({ min: 1, max: 100 })),
  );

test("renders files until those added show the budget of lines, the one that reaches it included", () => {
  fc.assert(
    fc.property(rendering, ([lines, rendered, budget]) => {
      fc.pre(sum(lines.slice(rendered)) >= budget);

      const added = lines.slice(rendered, filesToRender(lines, rendered, budget));

      expect(sum(added)).toBeGreaterThanOrEqual(budget);
      expect(sum(added.slice(0, -1))).toBeLessThan(budget);
    }),
    { examples: [[[[60, 1], 0, 50]], [[[10, 40, 1], 0, 50]], [[[10, 39, 1], 0, 50]]] },
  );
});

test("renders all the files once those left show fewer lines than the budget", () => {
  fc.assert(
    fc.property(rendering, ([lines, rendered, budget]) => {
      fc.pre(sum(lines.slice(rendered)) < budget);

      expect(filesToRender(lines, rendered, budget)).toBe(lines.length);
    }),
  );
});

test("renders one more file at least, though it shows no lines", () => {
  fc.assert(
    fc.property(rendering, ([lines, rendered, budget]) => {
      fc.pre(rendered < lines.length);

      expect(filesToRender(lines, rendered, budget)).toBeGreaterThan(rendered);
    }),
    { examples: [[[[0], 0, 1]]] },
  );
});

test("renders no more once all the files are", () => {
  expect(filesToRender([1, 2], 2, 10)).toBe(2);
  expect(filesToRender([1, 2], 3, 10)).toBe(3);
});

// A view's files' paths, how many of them are rendered, and its files once some of those join it and
// others leave, in the same order as before.
const listedAgain = fc
  .uniqueArray(fc.record({ path: filePath, before: fc.boolean(), after: fc.boolean() }), {
    selector: ({ path }) => path,
    maxLength: 20,
  })
  .chain((files) => {
    const before = files.flatMap(({ path, before: listed }) => (listed ? [path] : []));

    return fc.record({
      before: fc.constant(before),
      rendered: fc.nat(before.length),
      after: fc.constant(files.flatMap(({ path, after: listed }) => (listed ? [path] : []))),
    });
  });

test("once files join a view or leave it, those rendered before still are, and as many as before at least, and no more than that takes", () => {
  fc.assert(
    fc.property(listedAgain, ({ before, rendered, after }) => {
      const still = stillRendered(
        before.map((path) => ({ path })),
        rendered,
        after.map((path) => ({ path })),
      );

      const kept = before.slice(0, rendered).filter((path) => after.includes(path));

      expect(after.slice(0, still)).toStrictEqual(expect.arrayContaining(kept));
      expect(still).toBeGreaterThanOrEqual(rendered);
      expect([rendered, ...kept.map((path) => after.indexOf(path) + 1)]).toContain(still);
    }),
  );
});

test("works out how many files are rendered still in a group of more of them than a function can take as arguments", () => {
  const before = Array.from({ length: 200_000 }, (_, index) => ({ path: String(index) }));

  expect(stillRendered(before, before.length, [{ path: "added" }, ...before])).toBe(
    before.length + 1,
  );
});

type Diff = RpcOutput<typeof diffRpc>;

const line: Diff["hunks"][number]["lines"][number] = { kind: "context", text: "a", newline: true };

const diff: Omit<Diff, "hunks"> = {
  version: "v",
  kind: "text",
  added: 0,
  removed: 0,
  contents: { old: [], new: [] },
  highlights: { old: [], new: [] },
};

test("a file's diff shows its hunks' lines, or one line in their place", () => {
  expect(
    linesShown({
      ...diff,
      path: "a",
      hunks: [
        { oldStart: 1, newStart: 1, lines: [line, line, line] },
        { oldStart: 9, newStart: 9, lines: [line, line] },
      ],
    }),
  ).toBe(5);
  expect(linesShown({ ...diff, path: "a", collapsed: "large", hunks: [] })).toBe(1);
  expect(linesShown({ path: "a", error: "unreadable" })).toBe(1);
});
