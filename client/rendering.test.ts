import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { diffRpc } from "../shared/diff";
import { filesToRender, linesShown } from "./rendering";

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
