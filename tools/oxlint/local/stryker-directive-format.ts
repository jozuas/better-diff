import { defineRule } from "@oxlint/plugins";
import type { Comment, ESTree } from "@oxlint/plugins";

// Comments meant as Stryker directives, including ones Stryker can't read.
const intendedPattern = /^\s*stryker\s+(?:disable|restore)\b/iu;

// How Stryker reads a directive, from its instrumenter's directive-bookkeeper.js.
const strykerPattern =
  /^\s?Stryker (?<action>disable|restore)(?: (?<scope>next-line))? (?<mutators>[a-zA-Z, ]+)(?::(?<reason>.+)?)?/u;

// Whether Stryker reads `comment` as disabling the named mutators on the next line, or every
// mutator in the module from before its code, and gives a reason.
function allowedScope(comment: Comment, codeStart: number): "line" | "module" | undefined {
  const groups = strykerPattern.exec(comment.value)?.groups;

  if (groups?.["action"] !== "disable" || (groups["reason"] ?? "").trim() === "") {
    return undefined;
  }

  const mutators = (groups["mutators"] ?? "").split(",").map((mutator) => mutator.trim());

  if (groups["scope"] === "next-line") {
    return mutators.every(
      (mutator) => /^[a-zA-Z]+$/u.test(mutator) && mutator.toLowerCase() !== "all",
    )
      ? "line"
      : undefined;
  }

  return mutators.join(",") === "all" && comment.end <= codeStart ? "module" : undefined;
}

// Whether `program` loads react-native, which Vitest can't.
function importsReactNative(program: ESTree.Program): boolean {
  return program.body.some(
    (statement) =>
      statement.type === "ImportDeclaration" &&
      statement.importKind !== "type" &&
      /^react-native(?:\/|$)/u.test(statement.source.value),
  );
}

export const strykerDirectiveFormatRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require Stryker directives to disable named mutators on one line, or a whole module that imports react-native, and say why.",
    },
    messages: {
      format:
        "Write a Stryker directive as `// Stryker disable next-line <mutator>: <why>`, or as `// Stryker disable all: <why>` before any code to skip a whole module that imports react-native.",
      module:
        "Only a module that imports react-native, which Vitest can't load, can skip mutation testing. Kill the mutants with tests instead.",
    },
  },
  create(context) {
    return {
      Program(program) {
        const codeStart = program.body[0]?.start ?? Number.POSITIVE_INFINITY;

        for (const comment of context.sourceCode.getAllComments()) {
          if (!intendedPattern.test(comment.value)) {
            continue;
          }

          const scope = allowedScope(comment, codeStart);

          if (scope === undefined) {
            context.report({ node: comment, messageId: "format" });
          } else if (scope === "module" && !importsReactNative(program)) {
            context.report({ node: comment, messageId: "module" });
          }
        }
      },
    };
  },
});
