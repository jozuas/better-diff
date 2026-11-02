import { expect, test } from "vitest";

import { viewSettings } from "./settings";

test("diffs show inline until they're shown side by side", () => {
  expect(viewSettings.schema.parse({})).toStrictEqual({ sideBySide: false });
  expect(viewSettings.schema.parse({ sideBySide: true })).toStrictEqual({ sideBySide: true });
});
