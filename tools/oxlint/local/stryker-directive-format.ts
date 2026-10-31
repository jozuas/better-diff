import { defineRule } from "@oxlint/plugins";
import type { Comment } from "@oxlint/plugins";

// Comments meant as Stryker directives, including ones Stryker can't read.
const intendedPattern = /^\s*stryker\s+(?:disable|restore)\b/iu;

// How Stryker reads a directive, from its instrumenter's directive-bookkeeper.js.
const strykerPattern =
  /^\s?Stryker (?<action>disable|restore)(?: (?<scope>next-line))? (?<mutators>[a-zA-Z, ]+)(?::(?<reason>.+)?)?/u;

// Whether Stryker reads `comment` as disabling the named mutators on the next line, or every
// mutator in a module from before its code, and gives a reason.
function isAllowed(comment: Comment, codeStart: number): boolean {
  const groups = strykerPattern.exec(comment.value)?.groups;

  if (groups?.["action"] !== "disable" || (groups["reason"] ?? "").trim() === "") {
    return false;
  }

  const mutators = (groups["mutators"] ?? "").split(",").map((mutator) => mutator.trim());

  if (groups["scope"] === "next-line") {
    return mutators.every(
      (mutator) => /^[a-zA-Z]+$/u.test(mutator) && mutator.toLowerCase() !== "all",
    );
  }

  return mutators.join(",") === "all" && comment.end <= codeStart;
}

export const strykerDirectiveFormatRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require Stryker directives to disable named mutators on one line, or a whole module, and say why.",
    },
    messages: {
      format:
        "Write a Stryker directive as `// Stryker disable next-line <mutator>: <why>`, or as `// Stryker disable all: <why>` before any code to skip a whole module.",
    },
  },
  create(context) {
    return {
      Program(program) {
        const codeStart = program.body[0]?.start ?? Number.POSITIVE_INFINITY;

        for (const comment of context.sourceCode.getAllComments()) {
          if (intendedPattern.test(comment.value) && !isAllowed(comment, codeStart)) {
            context.report({ node: comment, messageId: "format" });
          }
        }
      },
    };
  },
});
