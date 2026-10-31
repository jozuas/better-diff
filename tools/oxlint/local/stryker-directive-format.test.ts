import type { Mutant } from "@stryker-mutator/api/core";
import type { Logger } from "@stryker-mutator/api/logging";
import { Instrumenter } from "@stryker-mutator/instrumenter";
import * as fc from "fast-check";
import { expect, test } from "vitest";

import { lint } from "./rule-tester.ts";
import { strykerDirectiveFormatRule } from "./stryker-directive-format.ts";

function discard(): void {}

function disabled(): boolean {
  return false;
}

const instrumenter = new Instrumenter({
  isTraceEnabled: disabled,
  isDebugEnabled: disabled,
  isInfoEnabled: disabled,
  isWarnEnabled: disabled,
  isErrorEnabled: disabled,
  isFatalEnabled: disabled,
  trace: discard,
  debug: discard,
  info: discard,
  warn: discard,
  error: discard,
  fatal: discard,
} satisfies Logger);

// Every line has mutants from several mutators, including BooleanLiteral, which the generated
// directives never name.
const code = ["a", "b", "c"].map(
  (name) => `export const ${name} = (n: number): string => (n > 0 ? "${name}" : [true].join());`,
);

const named = fc.constantFrom("StringLiteral", "EqualityOperator", "ConditionalExpression");

const lineTerminators = /\r\n|[\n\r\p{Zl}\p{Zp}]/u;

function mostly(usual: readonly string[], others: readonly string[]): fc.Arbitrary<string> {
  return fc.oneof({ arbitrary: fc.constantFrom(...usual), weight: 9 }, fc.constantFrom(...others));
}

const directive = fc
  .record({
    lead: mostly([" "], ["", "  ", "\t", "\n"]),
    name: mostly(["Stryker"], ["stryker"]),
    action: mostly([" disable", " restore"], ["  disable", "\tdisable"]),
    scope: mostly([" next-line", ""], ["  next-line", " next-line ", " Next-line"]),
    mutators: fc.oneof(
      fc.constant(["all"]),
      fc.array(named, { minLength: 1, maxLength: 3 }),
      fc.array(fc.oneof(named, fc.constantFrom("stringLiteral", "all", "All", "String Literal")), {
        maxLength: 3,
      }),
    ),
    separator: mostly([", ", ","], [" ,", " "]),
    colon: mostly([": ", ":"], [" : ", ""]),
    reason: fc.oneof(
      { arbitrary: fc.string({ unit: "binary", minLength: 1, maxLength: 8 }), weight: 9 },
      fc.constantFrom("", " ", "\nwhy"),
    ),
    block: fc.boolean(),
  })
  .map(({ lead, name, action, scope, mutators, separator, colon, reason, block }) => {
    const text = `${lead}${name}${action}${scope} ${mutators.join(separator)}${colon}${reason}`;

    return block
      ? `/*${text.replaceAll("*/", "* /")}*/`
      : `//${text.split(lineTerminators).join(" ")}`;
  });

const givenReason = fc
  .string({ unit: "binary", minLength: 1 })
  .filter((text) => text.trim() !== "" && !lineTerminators.test(text));

// Whether Stryker ignores, with a reason, only mutants on the line after the directive from
// mutators other than BooleanLiteral, or every mutant when the directive comes before any code.
function isReadAsAllowed(mutants: readonly Mutant[], position: number, nextLine: number): boolean {
  const ignored = mutants.filter(({ status }) => status === "Ignored");

  return (
    ignored.length > 0 &&
    ignored.every(
      ({ statusReason = "" }) =>
        statusReason.trim() !== "" && statusReason !== "Ignored using a comment",
    ) &&
    ((position === 0 && ignored.length === mutants.length) ||
      ignored.every(
        ({ location, mutatorName }) =>
          location.start.line === nextLine && mutatorName !== "BooleanLiteral",
      ))
  );
}

test("reports every directive that Stryker doesn't read as allowed", async () => {
  await fc.assert(
    fc.asyncProperty(
      directive,
      fc.integer({ min: 0, max: code.length - 1 }),
      async (comment, position) => {
        const content = code.toSpliced(position, 0, comment).join("\n");

        const { mutants } = await instrumenter.instrument(
          [{ name: "module.ts", content, mutate: true }],
          { plugins: null, excludedMutations: [], ignorers: [] },
        );

        fc.pre(
          !isReadAsAllowed(mutants, position, position + comment.split(lineTerminators).length),
        );

        expect(
          lint("stryker-directive-format", strykerDirectiveFormatRule, {
            valid: [],
            invalid: [{ code: content, errors: 1 }],
          }),
        ).not.toThrow();
      },
    ),
    {
      examples: [
        ["// Stryker restore next-line StringLiteral: why", 1],
        ["// Stryker disable all: why", 1],
        ["// Stryker disable StringLiteral: why", 0],
        ["// Stryker disable next-line StringLiteral", 1],
        ["//  Stryker disable next-line StringLiteral: why", 1],
        ["/* Stryker disable next-line StringLiteral:\n   why */", 1],
      ],
    },
  );
});

test("allows naming mutators for the next line, or all of them before any code, with a reason", () => {
  fc.assert(
    fc.property(
      fc.array(named, { minLength: 1, maxLength: 3 }),
      givenReason,
      (mutators, reason) => {
        expect(
          lint("stryker-directive-format", strykerDirectiveFormatRule, {
            valid: [
              [`// Stryker disable all: ${reason}`, ...code].join("\n"),
              code
                .toSpliced(1, 0, `// Stryker disable next-line ${mutators.join(", ")}: ${reason}`)
                .join("\n"),
            ],
            invalid: [],
          }),
        ).not.toThrow();
      },
    ),
  );
});

test("ignores comments that only mention Stryker", () => {
  expect(
    lint("stryker-directive-format", strykerDirectiveFormatRule, {
      valid: [
        "// Stryker rewrites the tsconfig it finds.",
        "// Under Stryker, fast-check runs with a fixed seed.",
        "/* Stryker disabled nothing here. */",
      ],
      invalid: [],
    }),
  ).not.toThrow();
});

test("reports the format message at the directive", () => {
  expect(
    lint("stryker-directive-format", strykerDirectiveFormatRule, {
      valid: [],
      invalid: [
        {
          code: 'export const a = "a";\n/* Stryker restore\n   all */',
          errors: [
            {
              message:
                "Write a Stryker directive as `// Stryker disable next-line <mutator>: <why>`, or as `// Stryker disable all: <why>` before any code to skip a whole module.",
              line: 2,
              column: 0,
              endLine: 3,
              endColumn: 9,
            },
          ],
        },
      ],
    }),
  ).not.toThrow();
});
