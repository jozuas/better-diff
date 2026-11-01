import { expect, test } from "vitest";

import { isRename, parseDiff } from "./patch";

test("rejects a hunk line with no prefix, as git prints a blank one with diff.suppressBlankEmpty", () => {
  const diff = Buffer.from("diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1,3 +1,3 @@\n a\n\n-b\n+c\n");

  expect(() => parseDiff(diff)).toThrow(
    `A line in a hunk of git's diff has no " ", "-" or "+" prefix: `,
  );
});

test("rejects a diff that goes on past where its hunk's counts end, as git prints for each file in a directory", () => {
  const diff = Buffer.from(
    "diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1,2 +1 @@\n-a\n-b\n+c\ndiff --git a/b b/b\n",
  );

  expect(() => parseDiff(diff)).toThrow("git printed more than one diff for the path.");
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
