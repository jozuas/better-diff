import { expect, test } from "vitest";

import { parseDiff } from "./patch";

test("rejects a hunk line with no prefix, as git prints a blank one with diff.suppressBlankEmpty", () => {
  const diff = Buffer.from("diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1,3 +1,3 @@\n a\n\n-b\n+c\n");

  expect(() => parseDiff(diff)).toThrow(
    `A line in a hunk of git's diff has no " ", "-" or "+" prefix: `,
  );
});
