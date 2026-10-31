import { expect, test, vi } from "vitest";

import { noViStubsRule } from "./no-vi-stubs.ts";
import { lint } from "./rule-tester.ts";

const viImport = 'import { vi } from "vitest";\n';

test("reports exactly the methods of Vitest's `vi` that stand in for real code", () => {
  const methods = Object.keys(vi).toSorted();

  expect(
    lint("no-vi-stubs", noViStubsRule, {
      valid: [],
      invalid: [
        {
          code: viImport + methods.map((method) => `vi.${method};`).join("\n"),
          errors: ["importMock", "mockObject", "spyOn", "stubEnv", "stubGlobal"].map((method) => ({
            message: `\`vi.${method}\` replaces real code with a stand-in, so the test checks the stand-in. Test the real code, and pass in as a parameter anything a test has to control.`,
            line: methods.indexOf(method) + 2,
            column: 3,
            endColumn: method.length + 3,
          })),
        },
      ],
    }),
  ).not.toThrow();
});

test("reports a stand-in wherever `vi` from Vitest is used, under any name", () => {
  expect(
    lint("no-vi-stubs", noViStubsRule, {
      valid: [
        ...[
          "vi.fn();",
          "vi.useFakeTimers();",
          'object.spyOn(Math, "random");',
          "vi.fn().mockReturnValue(0);",
          "type Spy = typeof vi.spyOn;",
          'function stub(vi: { stubEnv(name: string): void }): void { vi.stubEnv("HOME"); }',
          'clock().spyOn(Date, "now");',
          'helpers.vi.spyOn(Math, "random");',
        ].map((code) => viImport + code),
        'import { vi } from "vitest-like";\nvi.spyOn(Math, "random");',
        'import { spyOn as vi } from "vitest";\nvi.spyOn(Math, "random");',
        'import * as vi from "vitest";\nvi.spyOn(Math, "random");',
        "const vi = { spyOn(): void {} };\nvi.spyOn();",
        { code: 'vi.spyOn(Math, "random");', languageOptions: { globals: { vi: "readonly" } } },
      ],
      invalid: [
        {
          code: `${viImport}vi.stubEnv("HOME", "/").stubEnv("TERM", "dumb");`,
          errors: [
            { messageId: "stub", line: 2, column: 3, endColumn: 10 },
            { messageId: "stub", line: 2, column: 24, endColumn: 31 },
          ],
        },
        ...[
          'vi.spyOn(Math, "random").mockReturnValue(0);',
          'vi.useFakeTimers().stubGlobal("fetch", null);',
          'test("time", () => { const spy = vi.spyOn(Date, "now"); });',
          "const spyOn = vi.spyOn;",
          'vi?.importMock("node:fs");',
        ].map((code) => ({ code: viImport + code, errors: 1 })),
        ...[
          'import { vi as v } from "vitest";\nv.spyOn(Math, "random");',
          'import { "vi" as v } from "vitest";\nv.mockObject({});',
          'import { expect, vi } from "vitest";\nexpect(vi.stubEnv("HOME", "/")).toBe(vi);',
        ].map((code) => ({ code, errors: 1 })),
      ],
    }),
  ).not.toThrow();
});
