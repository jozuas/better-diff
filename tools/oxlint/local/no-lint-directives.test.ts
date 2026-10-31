import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as fc from "fast-check";
import { expect, test } from "vitest";
import { z } from "zod";

import { noLintDirectivesRule } from "./no-lint-directives.ts";
import { lint } from "./rule-tester.ts";

const oxlint = fileURLToPath(new URL("../../../node_modules/.bin/oxlint", import.meta.url));

// Oxlint reads reportUnusedDisableDirectives only from the root config. Files in `oxlint/` get
// Oxlint's own rules, and files in `local/` also get this plugin's, as .oxlintrc.json sets them.
const configs = {
  ".oxlintrc.json": JSON.stringify({ options: { reportUnusedDisableDirectives: "error" } }),
  "oxlint/.oxlintrc.json": JSON.stringify({
    categories: { correctness: "off" },
    rules: { "no-debugger": "error" },
  }),
  "local/.oxlintrc.json": JSON.stringify({
    categories: { correctness: "off" },
    jsPlugins: [{ name: "local", specifier: fileURLToPath(new URL("index.ts", import.meta.url)) }],
    rules: {
      "no-debugger": "error",
      "unicorn/no-abusive-eslint-disable": "error",
      "local/no-lint-directives": "error",
    },
  }),
};

const report = z.object({
  diagnostics: z.array(
    z.object({
      filename: z.string(),
      code: z.string().optional(),
      message: z.string(),
      labels: z.array(z.object({ span: z.object({ line: z.number() }) })),
    }),
  ),
});

// Each file's diagnostics, as `<code> <lines> <message>`.
function lintFiles(files: Readonly<Record<string, string>>): Map<string, string[]> {
  const directory = mkdtempSync(join(tmpdir(), "no-lint-directives-"));

  try {
    for (const [path, content] of Object.entries({ ...configs, ...files })) {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      writeFileSync(join(directory, path), content);
    }

    const { stdout } = spawnSync(oxlint, ["--format", "json"], {
      cwd: directory,
      encoding: "utf8",
    });

    const diagnostics = new Map<string, string[]>();

    for (const { filename, code = "", message, labels } of report.parse(JSON.parse(stdout))
      .diagnostics) {
      diagnostics.set(filename, [
        ...(diagnostics.get(filename) ?? []),
        `${code} ${labels.map(({ span }) => span.line).join(",")} ${message}`,
      ]);
    }

    return diagnostics;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const lineTerminators = /\r\n|[\n\r\p{Zl}\p{Zp}]/u;

// JavaScript and Rust disagree on whether these are whitespace.
const nextLine = String.fromCodePoint(0x85);
const byteOrderMark = String.fromCodePoint(0xfe_ff);

const whitespace = fc.constantFrom(
  nextLine,
  byteOrderMark,
  ...[0x20, 0x09, 0x0a, 0x0d, 0x0b, 0x0c, 0xa0, 0x20_03, 0x20_28, 0x30_00].map((codePoint) =>
    String.fromCodePoint(codePoint),
  ),
);

function mostly(usual: readonly string[], others: readonly string[]): fc.Arbitrary<string> {
  return fc.oneof({ arbitrary: fc.constantFrom(...usual), weight: 3 }, fc.constantFrom(...others));
}

const keyword = fc
  .tuple(
    mostly(["eslint", "oxlint"], ["ESLint", "Oxlint"]),
    mostly(["-disable", "-enable"], ["-Disable"]),
    mostly(["", "-line", "-next-line"], ["-nextline", "-lines"]),
  )
  .map((parts) => parts.join(""));

// Mostly well-formed directives, many of them hiding a `no-debugger` problem, which only this rule
// reports, varied where Oxlint's parsing has edges.
const text = fc
  .tuple(
    fc.oneof(
      { arbitrary: fc.constantFrom(" ", ""), weight: 4 },
      whitespace,
      fc.constantFrom("*", "-"),
    ),
    keyword,
    fc.oneof({ arbitrary: fc.constant(" "), weight: 4 }, whitespace, fc.constantFrom("", ":", "-")),
    fc.array(
      mostly(
        ["no-debugger", "eslint/no-debugger", "local/no-lint-directives"],
        ["no-lint-directives", "unicorn/no-abusive-eslint-disable"],
      ),
      { maxLength: 3 },
    ),
    fc.oneof(
      { arbitrary: fc.constantFrom(",", ", "), weight: 4 },
      whitespace,
      fc.constantFrom(" ,", ",,"),
    ),
    mostly(
      ["", " -- why"],
      ["--why", "-- local/no-lint-directives", " -- local/no-lint-directives"],
    ),
    fc.array(
      fc.oneof(
        whitespace,
        keyword,
        fc.constantFrom("-", "*", "/", "--"),
        fc.string({ unit: "binary", minLength: 1, maxLength: 2 }),
      ),
      { maxLength: 2 },
    ),
  )
  .map(
    ([lead, word, gap, rules, separator, description, rest]) =>
      `${lead}${word}${rules.length > 0 ? gap : ""}${rules.join(separator)}${description}${rest.join("")}`,
  );

const comment = fc.oneof(
  text.map((value) => `//${value.split(lineTerminators).join(" ")}`),
  text.map((value) => `/*${value.replaceAll("*/", "* /")}*/`),
);

type Line = readonly [afterCode: boolean, comment: string];

// Lines that each end in a comment, some after a `debugger` statement, then one more `debugger`.
const file = fc.array(fc.tuple(fc.boolean(), comment), { minLength: 1, maxLength: 3 });

function source(lines: readonly Line[], blank: boolean): string {
  return [
    ...lines.map(
      ([afterCode, line]) =>
        `${afterCode ? "debugger; " : ""}${blank ? line.replaceAll(/[^\n\r\p{Zl}\p{Zp}]/gu, " ") : line}`,
    ),
    "debugger;",
    "",
  ].join("\n");
}

// The files whose lint fails or passes regardless of whether Oxlint reads a directive in them.
function misjudged(
  files: readonly (readonly Line[])[],
): { source: string; hasDirective: boolean }[] {
  const diagnostics = lintFiles(
    Object.fromEntries(
      files.flatMap((lines, index) => [
        [`oxlint/${index}.ts`, source(lines, false)],
        [`oxlint/${index}.blank.ts`, source(lines, true)],
        [`local/${index}.ts`, source(lines, false)],
      ]),
    ),
  );

  function of(path: string): string[] {
    return (diagnostics.get(path) ?? []).toSorted();
  }

  return files.flatMap((lines, index) => {
    // Blanking a directive changes what Oxlint reports: it either hid a problem or is unused.
    const hasDirective =
      of(`oxlint/${index}.ts`).join("\n") !== of(`oxlint/${index}.blank.ts`).join("\n");

    const fails = of(`local/${index}.ts`).some(
      (diagnostic) => !diagnostic.startsWith("eslint(no-debugger) "),
    );

    return hasDirective === fails ? [] : [{ source: source(lines, false), hasDirective }];
  });
}

test(
  "fails the lint exactly when a file has a comment that Oxlint reads as a directive",
  { timeout: 60_000 },
  () => {
    fc.assert(
      fc.property(fc.array(file, { minLength: 1, maxLength: 20 }), (files) => {
        expect(misjudged(files)).toStrictEqual([]);
      }),
      {
        numRuns: 20,
        examples: [
          [
            [
              ...[
                "// eslint-disable-next-line no-debugger",
                "//\teslint-disable-next-line no-debugger",
                `//${nextLine}eslint-disable-next-line no-debugger`,
                `//${byteOrderMark}eslint-disable-next-line no-debugger`,
                `// eslint-disable-next-line${nextLine}no-debugger`,
                `// eslint-disable-next-line${byteOrderMark}no-debugger`,
                "// eslint-disable-next-line no-debugger-- local/no-lint-directives",
                "/* oxlint-disable local/no-lint-directives */",
              ].map((line): Line[] => [[false, line]]),
              [[true, "// eslint-disable-line no-debugger\tlocal/no-lint-directives"]],
            ],
          ],
        ],
      },
    );
  },
);

test("reports each directive at its comment", () => {
  const message = "Fix the code instead of turning a lint rule off in a comment.";

  expect(
    lint("no-lint-directives", noLintDirectivesRule, {
      valid: ["// eslint finds problems.", "/** eslint-disable */", "// oxlint-disabled"],
      invalid: [
        {
          code: "const a = 1; // oxlint-disable-line no-unused-vars\n/* eslint-disable\n   no-console */",
          errors: [
            { message, line: 1, column: 13, endLine: 1, endColumn: 50 },
            { message, line: 2, column: 0, endLine: 3, endColumn: 16 },
          ],
        },
      ],
    }),
  ).not.toThrow();
});

test("reports nothing in a file with a directive that disables this rule, which leaves that directive unused", () => {
  expect(
    lint("no-lint-directives", noLintDirectivesRule, {
      valid: [
        "/* oxlint-disable rule-to-test/no-lint-directives */\n// eslint-disable-next-line no-console",
        "// eslint-disable-line no-console,rule-to-test/no-lint-directives",
      ],
      invalid: [
        "// eslint-disable-line no-console -- rule-to-test/no-lint-directives",
        "// eslint-enable rule-to-test/no-lint-directives",
      ].map((code) => ({ code, errors: 1 })),
    }),
  ).not.toThrow();
});
