import * as fc from "fast-check";
import type { RuleTester } from "oxlint/plugins-dev";
import { transformWithOxc } from "vite";
import { expect, test } from "vitest";

import { noHtmlElementsRule } from "./no-html-elements.ts";
import { lint as lintWith } from "./rule-tester.ts";

function lint(tests: RuleTester.TestCases): () => void {
  return lintWith("no-html-elements", noHtmlElementsRule, tests);
}

async function compilesToString(element: string): Promise<boolean> {
  const { code } = await transformWithOxc(element, "element.tsx", {
    jsx: { runtime: "automatic" },
  });

  return code.includes('jsx("');
}

const identifierStarts = ["a", "z", "A", "Z", "_", "$", "ä", "Ä"];
const identifierParts = [...identifierStarts, "0", "9"];

function identifierFrom(parts: string[]): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.constantFrom(...identifierStarts),
      fc.string({ unit: fc.constantFrom(...parts), maxLength: 3 }),
    )
    .map(([start, rest]) => start + rest);
}

const identifier = identifierFrom(identifierParts);

const jsxIdentifier = fc.oneof(fc.constant("this"), {
  arbitrary: identifierFrom([...identifierParts, "-"]),
  weight: 4,
});

const element = fc
  .oneof(
    { arbitrary: jsxIdentifier, weight: 3 },
    fc.tuple(jsxIdentifier, jsxIdentifier).map(([namespace, name]) => `${namespace}:${name}`),
    fc
      .tuple(fc.oneof(fc.constant("this"), identifier), fc.array(identifier, { minLength: 1 }))
      .map(([object, properties]) => [object, ...properties].join(".")),
  )
  .map((name) => `<${name} />`);

test("reports every element that compiles to a string tag", async () => {
  await fc.assert(
    fc.asyncProperty(element, async (code) => {
      fc.pre(await compilesToString(code));

      expect(lint({ valid: [], invalid: [{ code, errors: 1 }] })).not.toThrow();
    }),
  );
});

test("allows every element that compiles to a reference", async () => {
  await fc.assert(
    fc.asyncProperty(element, async (code) => {
      fc.pre(!(await compilesToString(code)));

      expect(lint({ valid: [code], invalid: [] })).not.toThrow();
    }),
  );
});

test("reports each element once, at its name", () => {
  expect(
    lint({
      valid: [],
      invalid: [
        {
          code: "<View>\n  <svg:rect></svg:rect>\n</View>",
          errors: [
            {
              message:
                "`<svg:rect>` is an HTML element, which React Native can't render. Use a React Native component such as `View` or `Text` instead.",
              line: 2,
              column: 3,
              endLine: 2,
              endColumn: 11,
            },
          ],
        },
      ],
    }),
  ).not.toThrow();
});
