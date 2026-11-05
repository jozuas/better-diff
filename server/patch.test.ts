import * as fc from "fast-check";
import { expect, test } from "vitest";

import { headerOf, isRename, lineStarts, modeOf, parseDiff } from "./patch";

// Text whose lines start with what's searched for, or nearly do, with what diffs break on.
const diffs = fc
  .string({
    unit: fc.constantFrom(
      "diff --git ",
      "rename to ",
      "--- ",
      "+++ ",
      "old mode",
      " ",
      "-",
      "a",
      "\n",
      "\r",
      "\t",
      "é",
    ),
    maxLength: 20,
  })
  .map((text) => Buffer.from(text));

// The diff's lines as splitting it at its newlines makes them, each with where it starts.
function linesOf(diff: Buffer): [number, string][] {
  let start = 0;

  return diff
    .toString("latin1")
    .split("\n")
    .map((line) => {
      const lineStart = start;

      start += line.length + 1;

      return [lineStart, line];
    });
}

test("finds where each line that starts with a text starts, as splitting the diff at its newlines does", () => {
  fc.assert(
    fc.property(diffs, fc.constantFrom("diff --git ", "--- ", "a"), (diff, text) => {
      expect([...lineStarts(diff, text)]).toStrictEqual(
        linesOf(diff)
          .filter(([, line]) => line.startsWith(text))
          .map(([start]) => start),
      );
    }),
  );
});

test("reads each header field from the first line that starts with it, as splitting the diff at its newlines does", () => {
  fc.assert(
    fc.property(diffs, (diff) => {
      const header = headerOf(diff);
      const lines = linesOf(diff).map(([, line]) => line);

      expect(header).toStrictEqual(
        Object.fromEntries(
          Object.keys(header).map((name) => [
            name,
            lines.find((line) => line.startsWith(`${name} `))?.slice(name.length + 1),
          ]),
        ),
      );
    }),
  );
});

test("rejects a hunk line with no prefix, as git prints a blank one with diff.suppressBlankEmpty", () => {
  const diff = Buffer.from("diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1,3 +1,3 @@\n a\n\n-b\n+c\n");

  expect(() => parseDiff(diff)).toThrow(
    `A line in a hunk of git's diff has no " ", "-" or "+" prefix: `,
  );
});

test("rejects a diff that goes on past where its hunk's counts end, as another diff after it would", () => {
  const diff = Buffer.from(
    "diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1,2 +1 @@\n-a\n-b\n+c\ndiff --git a/b b/b\n",
  );

  expect(() => parseDiff(diff)).toThrow("git printed more than one diff for the path.");
});

test("rejects a diff with a file's old mode but not its new one", () => {
  const { header } = parseDiff(Buffer.from("diff --git a/a b/a\nold mode 100644\n"));

  expect(() => modeOf(header)).toThrow("git printed a file's old mode without its new one.");
});

const rename = "diff --git a/a b/b\nsimilarity index 100%\nrename from a\nrename to b\n";

const newFile =
  "diff --git a/b b/b\nnew file mode 100644\nindex 0000000..6178079\n--- /dev/null\n+++ b/b\n@@ -0,0 +1 @@\n+b\n";

test.each([
  [true, "a rename", rename],
  [false, "a new file", newFile],
  [false, "a rename beside another file's diff", `${newFile}${rename}`],
])("takes for a rename (%s) the diff of %s", (renames, _, diff) => {
  expect(isRename(Buffer.from(diff))).toBe(renames);
});
