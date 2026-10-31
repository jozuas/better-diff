import { defineRule } from "@oxlint/plugins";

// The names `react/rules-of-hooks` lets call hooks: a component's starts with an ASCII capital, and
// a hook's is `use`, alone or followed by an uppercase letter or an ASCII digit.
const componentOrHookName = /^(?:[A-Z]|use(?:$|[\p{Uppercase}0-9]))/u;

const topLevel = new Set(["Program", "ExportNamedDeclaration", "ExportDefaultDeclaration"]);

export const noTsxHelpersRule = defineRule({
  meta: {
    messages: {
      helper:
        "`{{name}}` is neither a component nor a hook, and tests and Stryker can't reach a `.tsx` file. Move it to a `.ts` module that doesn't import `react-native`.",
    },
  },
  create(context) {
    return {
      FunctionDeclaration(node) {
        if (
          node.id !== null &&
          topLevel.has(node.parent.type) &&
          !componentOrHookName.test(node.id.name)
        ) {
          context.report({ node: node.id, messageId: "helper", data: { name: node.id.name } });
        }
      },
    };
  },
});
