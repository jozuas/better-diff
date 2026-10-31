import { expect, test } from "vitest";

import { noHtmlElementsRule } from "./no-html-elements.ts";
import { lint } from "./rule-tester.ts";

test("fails a case whose expectation doesn't hold", () => {
  expect(lint("no-html-elements", noHtmlElementsRule, { valid: ["<div />"], invalid: [] })).toThrow(
    "Should have no errors but had 1",
  );

  expect(
    lint("no-html-elements", noHtmlElementsRule, {
      valid: [],
      invalid: [{ code: "<View />", errors: 1 }],
    }),
  ).toThrow("Should have 1 error but had 0");
});
