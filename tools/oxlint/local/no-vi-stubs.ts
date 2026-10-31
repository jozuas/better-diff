import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

import { resolve } from "./scope.ts";

// The `vi` methods that put a stand-in where real code was, other than module mocking, which
// `anti-slop/no-module-mocking` reports. Oxlint's `vitest/no-restricted-vi-methods` misses a call
// that another call is chained onto, as in `vi.spyOn(object, "method").mockReturnValue(value)`.
const stubMethods = new Set(["spyOn", "stubGlobal", "stubEnv", "importMock", "mockObject"]);

function exportName(name: ESTree.ModuleExportName): string {
  return name.type === "Literal" ? name.value : name.name;
}

// Whether `node` is `vi`, imported from Vitest under any name, or a call of one of its methods,
// most of which return it.
function isVi(context: Context, node: ESTree.Expression): boolean {
  if (node.type === "CallExpression") {
    return node.callee.type === "MemberExpression" && isVi(context, node.callee.object);
  }

  return (
    resolve(context, node)?.defs.some(
      ({ node: definition, parent }) =>
        parent?.type === "ImportDeclaration" &&
        parent.source.value === "vitest" &&
        definition.type === "ImportSpecifier" &&
        exportName(definition.imported) === "vi",
    ) ?? false
  );
}

export const noViStubsRule = defineRule({
  meta: {
    messages: {
      stub: "`vi.{{name}}` replaces real code with a stand-in, so the test checks the stand-in. Test the real code, and pass in as a parameter anything a test has to control.",
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (!node.computed && stubMethods.has(node.property.name) && isVi(context, node.object)) {
          context.report({
            node: node.property,
            messageId: "stub",
            data: { name: node.property.name },
          });
        }
      },
    };
  },
});
