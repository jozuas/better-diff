import { expect, test } from "vitest";

import {
  fastCheckNamespaceImportRule,
  fastCheckNoPredicateReturnRule,
  fastCheckNoReplayRule,
  fastCheckStringUnitRule,
} from "./fast-check.ts";
import { lint } from "./rule-tester.ts";

const fcImport = 'import * as fc from "fast-check";\n';

test("allows fast-check only as `import * as fc`", () => {
  expect(
    lint("fast-check-namespace-import", fastCheckNamespaceImportRule, {
      valid: [
        'import * as fc from "fast-check";',
        'import type * as fc from "fast-check";',
        'import fc from "fast-check-like";',
      ],
      invalid: [
        'import fc from "fast-check";',
        'import { property } from "fast-check";',
        'import type { Arbitrary } from "fast-check";',
        'import * as fastCheck from "fast-check";',
        'import fc, * as other from "fast-check";',
        'import "fast-check";',
      ].map((code) => ({ code, errors: 1 })),
    }),
  ).not.toThrow();
});

test("reports the namespace import message at the import", () => {
  expect(
    lint("fast-check-namespace-import", fastCheckNamespaceImportRule, {
      valid: [],
      invalid: [
        {
          code: 'import fc from "fast-check";',
          errors: [
            {
              message:
                'Import fast-check as `import * as fc from "fast-check"`, the form the `local/fast-check-*` rules recognise.',
              line: 1,
              column: 0,
              endLine: 1,
              endColumn: 28,
            },
          ],
        },
      ],
    }),
  ).not.toThrow();
});

test("requires a unit for every fc.string() that it can see the constraints of", () => {
  expect(
    lint("fast-check-string-unit", fastCheckStringUnitRule, {
      valid: [
        'fc.string({ unit: "binary" });',
        'fc.string({ minLength: 1, "unit": fc.constantFrom("a", "\\n") });',
        "fc.string(constraints);",
        "fc.string({ ...constraints });",
        'fc.string({ [key]: "binary" });',
        "fc.base64String();",
        "function lines(fc: { string(): string }): string { return fc.string(); }",
      ].map((code) => fcImport + code),
      invalid: [
        ...[
          "fc.string();",
          "fc.string({ maxLength: 3 });",
          'fc.array(fc.string({ unit: "binary" }), fc.string());',
        ].map((code) => ({ code: fcImport + code, errors: 1 })),
        ...['import * as check from "fast-check";', 'import check from "fast-check";'].map(
          (declaration) => ({ code: `${declaration}\ncheck.string();`, errors: 1 }),
        ),
      ],
    }),
  ).not.toThrow();
});

test("ignores string() on modules other than fast-check", () => {
  expect(
    lint("fast-check-string-unit", fastCheckStringUnitRule, {
      valid: ['import * as fc from "./fc";\nfc.string();', "fc.string();"],
      invalid: [],
    }),
  ).not.toThrow();
});

test("reports the string unit message at the call", () => {
  expect(
    lint("fast-check-string-unit", fastCheckStringUnitRule, {
      valid: [],
      invalid: [
        {
          code: `${fcImport}fc.string({ maxLength: 3 });`,
          errors: [
            {
              message:
                '`fc.string()` without a `unit` generates only printable ASCII: no newlines, `\\r`, tabs or other Unicode, which is where diffs break. Pass a `unit`, such as `"binary"`.',
              line: 2,
              column: 0,
              endLine: 2,
              endColumn: 27,
            },
          ],
        },
      ],
    }),
  ).not.toThrow();
});

test("allows predicates that assert with expect and return nothing", () => {
  expect(
    lint("fast-check-no-predicate-return", fastCheckNoPredicateReturnRule, {
      valid: [
        "fc.property(fc.nat(), (n) => { expect(n).toBeGreaterThanOrEqual(0); });",
        "fc.property(fc.nat(), (n) => expect(n).toBeGreaterThanOrEqual(0));",
        "fc.property(fc.nat(), (n) => expect.soft(n).not.toBe(-1));",
        "fc.asyncProperty(fc.nat(), async (n) => await expect(half(n)).resolves.toBe(n / 2));",
        "fc.property(fc.nat(), (n) => { if (n > 1) { return; } expect(n).toBeLessThan(2); });",
        "fc.property(fc.nat(), (n) => { expect([n].map((m) => m + 1)).toStrictEqual([n + 1]); });",
        "fc.property(fc.nat(), (n) => { const twice = (): number => { return n * 2; }; expect(twice()).toBe(n + n); });",
        "fc.property(fc.nat(), check);",
        "[1].every((n) => n > 0);",
      ].map((code) => fcImport + code),
      invalid: [
        "fc.property(fc.nat(), (n) => n >= 0);",
        "fc.property(fc.nat(), (n) => check(n));",
        "fc.property(fc.nat(), fc.nat(), (a, b) => { return a + b >= a; });",
        "fc.asyncProperty(fc.nat(), async (n) => (await half(n)) === n / 2);",
        "fc.property(fc.nat(), function (n) { return n >= 0; });",
        "fc.property(fc.nat(), (n) => { if (n > 1) { return false; } expect(n).toBeLessThan(2); });",
      ].map((code) => ({ code: fcImport + code, errors: 1 })),
    }),
  ).not.toThrow();
});

test("reports the predicate message at the returned value", () => {
  const message =
    "Assert with `expect` instead of returning a value from a property: Vitest doesn't count a returned boolean as an assertion.";

  expect(
    lint("fast-check-no-predicate-return", fastCheckNoPredicateReturnRule, {
      valid: [],
      invalid: [
        {
          code: `${fcImport}fc.property(fc.nat(), (n) => n >= 0);`,
          errors: [{ message, line: 2, column: 29, endLine: 2, endColumn: 35 }],
        },
        {
          code: `${fcImport}fc.property(fc.nat(), (n) => {\n  return n >= 0;\n});`,
          errors: [{ message, line: 3, column: 2, endLine: 3, endColumn: 16 }],
        },
      ],
    }),
  ).not.toThrow();
});

test("reports seed and path in fc.assert's parameters", () => {
  expect(
    lint("fast-check-no-replay", fastCheckNoReplayRule, {
      valid: [
        "fc.assert(property, { numRuns: 10, examples: [[1]] });",
        "fc.assert(property, parameters);",
        "fc.assert(property);",
        "fc.configureGlobal({ seed: 0 });",
      ].map((code) => fcImport + code),
      invalid: [
        {
          code: `${fcImport}fc.assert(property, { seed: 42, path: "0:1", endOnFailure: true });`,
          errors: [
            {
              message:
                "`seed` replays a recorded failure instead of generating new cases. Once it's fixed, keep its counterexample in `examples` instead.",
              line: 2,
              column: 22,
              endLine: 2,
              endColumn: 30,
            },
            {
              message:
                "`path` replays a recorded failure instead of generating new cases. Once it's fixed, keep its counterexample in `examples` instead.",
              line: 2,
              column: 32,
              endLine: 2,
              endColumn: 43,
            },
          ],
        },
        { code: `${fcImport}fc.assert(property, { "seed": 42 });`, errors: 1 },
      ],
    }),
  ).not.toThrow();
});
