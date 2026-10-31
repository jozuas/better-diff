import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

// The JSX transform compiles these names to strings, which React looks up as host elements.
function isHtmlElementName(name: ESTree.JSXElementName): boolean {
  if (name.type === "JSXNamespacedName") {
    return true;
  }

  if (name.type === "JSXMemberExpression") {
    return false;
  }

  return name.name !== "this" && (/^[a-z]/u.test(name.name) || name.name.includes("-"));
}

export const noHtmlElementsRule = defineRule({
  meta: {
    messages: {
      htmlElement:
        "`<{{name}}>` is an HTML element, which React Native can't render. Use a React Native component such as `View` or `Text` instead.",
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (isHtmlElementName(node.name)) {
          context.report({
            node: node.name,
            messageId: "htmlElement",
            data: { name: context.sourceCode.getText(node.name) },
          });
        }
      },
    };
  },
});
