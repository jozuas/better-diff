import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

// Whether `node` calls one of `methods` on an import of fast-check.
function callsFastCheck(
  context: Context,
  node: ESTree.CallExpression,
  methods: readonly string[],
): boolean {
  const { callee } = node;

  if (
    callee.type !== "MemberExpression" ||
    callee.computed ||
    callee.object.type !== "Identifier" ||
    !methods.includes(callee.property.name)
  ) {
    return false;
  }

  const { object } = callee;

  const variable = context.sourceCode
    .getScope(object)
    .references.find(({ identifier }) => identifier === object)?.resolved;

  return (
    variable?.defs.some(
      ({ parent }) => parent?.type === "ImportDeclaration" && parent.source.value === "fast-check",
    ) ?? false
  );
}

function propertyName(property: ESTree.ObjectPropertyKind): string | undefined {
  if (property.type === "SpreadElement" || property.computed) {
    return undefined;
  }

  if (property.key.type === "Identifier") {
    return property.key.name;
  }

  return property.key.type === "Literal" ? String(property.key.value) : undefined;
}

// A property's only function argument is its predicate.
function isPredicate(context: Context, node: ESTree.Node): boolean {
  const { parent } = node;

  return (
    parent?.type === "CallExpression" &&
    callsFastCheck(context, parent, ["property", "asyncProperty"])
  );
}

// Whether `node` is an assertion such as `expect(value).toBe(expected)`, which returns nothing.
function isExpectation(node: ESTree.Expression): boolean {
  let current = node.type === "AwaitExpression" ? node.argument : node;

  while (current.type === "CallExpression" || current.type === "MemberExpression") {
    current = current.type === "CallExpression" ? current.callee : current.object;
  }

  return current.type === "Identifier" && current.name === "expect";
}

function enclosingFunction(node: ESTree.Node): ESTree.Node | undefined {
  for (let current = node.parent; current !== null; current = current.parent) {
    if (
      current.type === "ArrowFunctionExpression" ||
      current.type === "FunctionExpression" ||
      current.type === "FunctionDeclaration"
    ) {
      return current;
    }
  }

  return undefined;
}

export const fastCheckNamespaceImportRule = defineRule({
  meta: {
    type: "suggestion",
    docs: { description: 'Require `import * as fc from "fast-check"`.' },
    messages: {
      namespaceImport:
        'Import fast-check as `import * as fc from "fast-check"`, the form the `local/fast-check-*` rules recognise.',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const [specifier] = node.specifiers;

        if (
          node.source.value === "fast-check" &&
          !(specifier?.type === "ImportNamespaceSpecifier" && specifier.local.name === "fc")
        ) {
          context.report({ node, messageId: "namespaceImport" });
        }
      },
    };
  },
});

export const fastCheckStringUnitRule = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Require a `unit` for `fc.string()`." },
    messages: {
      unit: '`fc.string()` without a `unit` generates only printable ASCII: no newlines, `\\r`, tabs or other Unicode, which is where diffs break. Pass a `unit`, such as `"binary"`.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!callsFastCheck(context, node, ["string"])) {
          return;
        }

        const [constraints] = node.arguments;

        if (
          constraints === undefined ||
          (constraints.type === "ObjectExpression" &&
            // A spread or a computed key might set the unit.
            constraints.properties.every(
              (property) => ![undefined, "unit"].includes(propertyName(property)),
            ))
        ) {
          context.report({ node, messageId: "unit" });
        }
      },
    };
  },
});

export const fastCheckNoPredicateReturnRule = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Disallow returning a value from a fast-check property's predicate." },
    messages: {
      predicateReturn:
        "Assert with `expect` instead of returning a value from a property: Vitest doesn't count a returned boolean as an assertion.",
    },
  },
  create(context) {
    return {
      ArrowFunctionExpression(node) {
        if (
          node.body.type !== "BlockStatement" &&
          isPredicate(context, node) &&
          !isExpectation(node.body)
        ) {
          context.report({ node: node.body, messageId: "predicateReturn" });
        }
      },
      ReturnStatement(node) {
        const predicate = enclosingFunction(node);

        if (node.argument !== null && predicate !== undefined && isPredicate(context, predicate)) {
          context.report({ node, messageId: "predicateReturn" });
        }
      },
    };
  },
});

export const fastCheckNoReplayRule = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Disallow replaying a recorded failure in `fc.assert`." },
    messages: {
      replay:
        "`{{name}}` replays a recorded failure instead of generating new cases. Once it's fixed, keep its counterexample in `examples` instead.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const [, parameters] = node.arguments;

        if (parameters?.type !== "ObjectExpression" || !callsFastCheck(context, node, ["assert"])) {
          return;
        }

        for (const property of parameters.properties) {
          const name = propertyName(property);

          if (name === "seed" || name === "path") {
            context.report({ node: property, messageId: "replay", data: { name } });
          }
        }
      },
    };
  },
});
