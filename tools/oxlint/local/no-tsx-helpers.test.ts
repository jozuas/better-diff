import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as fc from "fast-check";
import type { RuleTester } from "oxlint/plugins-dev";
import { expect, test } from "vitest";

import { noTsxHelpersRule } from "./no-tsx-helpers.ts";
import { lint as lintWith } from "./rule-tester.ts";

function lint(tests: RuleTester.TestCases): () => void {
  return lintWith("no-tsx-helpers", noTsxHelpersRule, tests);
}

const oxlint = fileURLToPath(new URL("../../../node_modules/.bin/oxlint", import.meta.url));

// Splits `functions`, each a function that calls a hook, into those `react/rules-of-hooks` allows
// and those it reports as neither a component nor a hook.
function byRulesOfHooks(functions: string[]): [allowed: string[], rejected: string[]] {
  const directory = mkdtempSync(path.join(tmpdir(), "rules-of-hooks-"));

  try {
    writeFileSync(
      path.join(directory, "oxlintrc.json"),
      JSON.stringify({
        plugins: ["react"],
        categories: { correctness: "off" },
        rules: { "react/rules-of-hooks": "error" },
      }),
    );
    writeFileSync(path.join(directory, "functions.tsx"), functions.join("\n"));

    const { stdout, stderr } = spawnSync(
      oxlint,
      ["--config", "oxlintrc.json", "--format", "unix", "functions.tsx"],
      { cwd: directory, encoding: "utf8" },
    );

    expect(stderr).toBe("");

    const rejected = new Set(
      stdout.split("\n").flatMap((output) => {
        const line = /^functions\.tsx:(?<line>\d+):/u.exec(output)?.groups?.["line"];

        return line === undefined ? [] : [Number(line) - 1];
      }),
    );

    return [
      functions.filter((_, index) => !rejected.has(index)),
      functions.filter((_, index) => rejected.has(index)),
    ];
  } finally {
    rmSync(directory, { recursive: true });
  }
}

// Around the cases React tells apart: ASCII and other capitals, a titlecase letter, a numeral that's
// uppercase without being a capital, a capital outside the Basic Multilingual Plane, and a digit
// that isn't ASCII.
const identifierStarts = ["a", "z", "A", "Z", "_", "$", "ä", "Ä", "ǅ", "Ⅰ", "𝐀"];
const identifierParts = [...identifierStarts, "0", "9", "٣"];

const rest = fc.string({ unit: fc.constantFrom(...identifierParts), maxLength: 3 });

const name = fc.oneof(
  fc.tuple(fc.constantFrom(...identifierStarts), rest),
  fc.tuple(fc.constantFrom("use", "Use", "usE", "us"), rest),
);

test("allows exactly the top-level functions that React lets call hooks", () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(
        name.map(([start, end]) => start + end),
        { minLength: 1, maxLength: 30 },
      ),
      (names) => {
        const [allowed, rejected] = byRulesOfHooks(
          names.map((each) => `function ${each}() { useState(); }`),
        );

        expect(
          lint({
            valid: allowed,
            invalid: rejected.map((code) => ({ code, errors: [{ messageId: "helper" }] })),
          }),
        ).not.toThrow();
      },
    ),
    {
      numRuns: 20,
      examples: [
        [["use", "use0", "use٣", "useA", "usea", "useÄ", "useä", "useǅ", "useⅠ", "use𝐀", "user"]],
        [["A", "Ä", "ǅx", "Ⅰx", "𝐀x", "Use", "_A", "$A"]],
      ],
    },
  );
});

test("reports each top-level helper once, at its name, however it's exported", () => {
  expect(
    lint({
      valid: [],
      invalid: [
        {
          code: [
            "function format() {}",
            "export function parse() {}",
            "export default function render() {}",
            "function count(value: string): number;",
            "function count(value: unknown) { return 0; }",
          ].join("\n"),
          errors: [
            {
              message:
                "`format` is neither a component nor a hook, and tests and Stryker can't reach a `.tsx` file. Move it to a `.ts` module that doesn't import `react-native`.",
              line: 1,
              column: 9,
              endColumn: 15,
            },
            { messageId: "helper", line: 2, column: 16, endColumn: 21 },
            { messageId: "helper", line: 3, column: 24, endColumn: 30 },
            { messageId: "helper", line: 5, column: 9, endColumn: 14 },
          ],
        },
      ],
    }),
  ).not.toThrow();
});

test("allows functions inside components and hooks, and functions without a body or name", () => {
  expect(
    lint({
      valid: [
        "export function Row() {\n  function label() {}\n  return label();\n}",
        "export function useRows() {\n  function compare() {}\n  return compare;\n}",
        "declare function format(value: number): string;",
        "export default function () {}",
      ],
      invalid: [],
    }),
  ).not.toThrow();
});
