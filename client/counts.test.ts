import * as fc from "fast-check";
import { expect, test } from "vitest";

import { filePath } from "../test/file-names";
import { barLabel, countsOf } from "./counts";

test("counts a text diff's added and removed lines, with thousands separated", () => {
  expect(countsOf({ kind: "text", added: 1234, removed: 0 })).toStrictEqual({
    added: "+1,234",
    removed: "−0",
  });
});

const otherKinds = [
  "unchanged",
  "renamed",
  "symlink",
  "binary",
  "mode",
  "unmerged",
  "whitespace",
] as const;

test.each(otherKinds)("counts nothing for a diff of kind %s", (kind) => {
  expect(countsOf({ kind, added: 0, removed: 0 })).toBeUndefined();
});

test.each([
  [
    "MODIFIED",
    "src/a.ts",
    { kind: "text", added: 1234, removed: 5 },
    "MODIFIED src/a.ts +1,234 −5",
  ],
  [
    "STAGED",
    "b.ts",
    { kind: "text", added: 1, removed: 0, renamedFrom: "a.ts" },
    "STAGED a.ts → b.ts +1 −0",
  ],
  [
    "STAGED",
    "b.ts",
    { kind: "renamed", added: 0, removed: 0, renamedFrom: "a.ts" },
    "STAGED a.ts → b.ts",
  ],
  ["UNTRACKED", "a.png", { kind: "binary", added: 0, removed: 0 }, "UNTRACKED a.png"],
  ["MODIFIED", "a.ts", undefined, "MODIFIED a.ts"],
] as const)("a %s file at %s with the diff %o has the bar %s", (status, path, diff, label) => {
  expect(barLabel(status, path, diff)).toBe(label);
});

const status = fc.constantFrom("MODIFIED", "UNTRACKED", "STAGED");

const count = fc.nat({ max: 100_000 });

// A diff without a rename.
const diff = fc.record({
  kind: fc.constantFrom("text", ...otherKinds),
  added: count,
  removed: count,
});

test("a bar of a diff without lines or a rename, or of a file whose diff isn't read yet, reads as the status and the path, whatever the path", () => {
  fc.assert(
    fc.property(
      status,
      filePath,
      fc.option(fc.record({ kind: fc.constantFrom(...otherKinds), added: count, removed: count }), {
        nil: undefined,
      }),
      (shown, path, read) => {
        expect(barLabel(shown, path, read)).toBe(`${shown} ${path}`);
      },
    ),
  );
});

test("a renamed file's bar reads as a bar of the path it was renamed from, an arrow and its path, whatever the paths", () => {
  fc.assert(
    fc.property(status, filePath, filePath, diff, (shown, path, renamedFrom, read) => {
      expect(barLabel(shown, path, { ...read, renamedFrom })).toBe(
        barLabel(shown, `${renamedFrom} → ${path}`, read),
      );
    }),
  );
});
