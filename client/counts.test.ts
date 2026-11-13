import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import type { diffRpc } from "../shared/diff";
import { filePath } from "../test/file-names";
import { barLabel, countsOf } from "./counts";

type Hunks = RpcOutput<typeof diffRpc>["hunks"];

const hunks: Hunks = [{ oldStart: 1, newStart: 1, lines: [] }];

const noHunks: Hunks = [];

test("counts a text diff's added and removed lines, with thousands separated", () => {
  expect(countsOf({ kind: "text", hunks, added: 1234, removed: 0 })).toStrictEqual({
    added: "+1,234",
    removed: "−0",
  });
});

test.each(["generated", "large"] as const)(
  "counts the lines of a text diff collapsed as %s, which leaves its hunks out",
  (collapsed) => {
    expect(
      countsOf({ kind: "text", hunks: noHunks, collapsed, added: 3, removed: 2 }),
    ).toStrictEqual({ added: "+3", removed: "−2" });
  },
);

test("counts nothing for a new or deleted empty file's text diff, which has no hunks", () => {
  expect(countsOf({ kind: "text", hunks: noHunks, added: 0, removed: 0 })).toBeUndefined();
});

const otherKinds = [
  "unchanged",
  "renamed",
  "symlink",
  "binary",
  "mode",
  "unmerged",
  "whitespace",
  "submodule",
  "submodule files",
  "repository",
] as const;

test.each(otherKinds)(
  "counts nothing for a diff of kind %s, though git gives it hunks, as it gives a symlink's",
  (kind) => {
    expect(countsOf({ kind, hunks, added: 1, removed: 1 })).toBeUndefined();
  },
);

test.each([
  [
    "MODIFIED",
    "src/a.ts",
    { kind: "text", hunks, added: 1234, removed: 5 },
    "MODIFIED src/a.ts +1,234 −5",
  ],
  [
    "STAGED",
    "b.ts",
    { kind: "text", hunks, added: 1, removed: 0, renamedFrom: "a.ts" },
    "STAGED a.ts → b.ts +1 −0",
  ],
  [
    "STAGED",
    "b.ts",
    { kind: "renamed", hunks: noHunks, added: 0, removed: 0, renamedFrom: "a.ts" },
    "STAGED a.ts → b.ts",
  ],
  [
    "UNTRACKED",
    "a.png",
    { kind: "binary", hunks: noHunks, added: 0, removed: 0 },
    "UNTRACKED a.png",
  ],
  ["UNTRACKED", "a.txt", { kind: "text", hunks: noHunks, added: 0, removed: 0 }, "UNTRACKED a.txt"],
  ["MODIFIED", "a.ts", undefined, "MODIFIED a.ts"],
] as const)("a %s file at %s with the diff %o has the bar %s", (status, path, diff, label) => {
  expect(barLabel(status, path, diff)).toBe(label);
});

const status = fc.constantFrom("MODIFIED", "UNTRACKED", "STAGED");

const count = fc.nat({ max: 100_000 });

// A diff shown without lines: one of a kind that has none, or a new or deleted empty file's.
const withoutLines = fc.oneof(
  fc.record({
    kind: fc.constantFrom(...otherKinds),
    hunks: fc.constantFrom(noHunks, hunks),
    added: count,
    removed: count,
  }),
  fc.record({
    kind: fc.constant("text"),
    hunks: fc.constant(noHunks),
    added: count,
    removed: count,
  }),
);

// A diff without a rename.
const diff = fc.oneof(
  fc.record({ kind: fc.constant("text"), hunks: fc.constant(hunks), added: count, removed: count }),
  fc.record({
    kind: fc.constant("text"),
    hunks: fc.constant(noHunks),
    collapsed: fc.constantFrom("generated", "large"),
    added: count,
    removed: count,
  }),
  withoutLines,
);

test("a bar of a diff without lines or a rename, or of a file whose diff isn't read yet, reads as the status and the path, whatever the path", () => {
  fc.assert(
    fc.property(
      status,
      filePath,
      fc.option(withoutLines, { nil: undefined }),
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
