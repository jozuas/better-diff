import { defineRule } from "@oxlint/plugins";

// The comments Oxlint reads as directives. It takes the rules a directive names from the text
// before any `--`, separated by commas or whitespace. Whitespace is Rust's, which, unlike `\s`,
// includes U+0085 and excludes U+FEFF.
const directivePattern =
  /^\p{White_Space}*(?:eslint|oxlint)-(?<action>enable|disable(?:-line|-next-line)?)(?:\p{White_Space}(?<rules>.*))?$/su;

export const noLintDirectivesRule = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Disallow comments that turn lint rules off." },
    messages: { directive: "Fix the code instead of turning a lint rule off in a comment." },
  },
  create(context) {
    return {
      Program() {
        const directives = context.sourceCode.getAllComments().flatMap((comment) => {
          const groups = directivePattern.exec(comment.value)?.groups;

          if (groups === undefined) {
            return [];
          }

          const [ruleList = ""] = (groups["rules"] ?? "").split("--", 1);

          return [
            { comment, action: groups["action"], rules: ruleList.split(/[\p{White_Space},]+/u) },
          ];
        });

        // A directive that disables this rule would hide its reports, and be used by doing so.
        // Reporting nothing leaves it unused, so reportUnusedDisableDirectives reports it instead.
        if (
          directives.some(({ action, rules }) => action !== "enable" && rules.includes(context.id))
        ) {
          return;
        }

        for (const { comment } of directives) {
          context.report({ node: comment, messageId: "directive" });
        }
      },
    };
  },
});
