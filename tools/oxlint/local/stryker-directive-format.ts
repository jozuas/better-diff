import { defineRule } from "@oxlint/plugins";
import type { Comment, ESTree } from "@oxlint/plugins";

// Comments meant as Stryker directives, including ones Stryker can't read.
const intendedPattern = /^\s*stryker\s+(?:disable|restore)\b/iu;

// How Stryker reads a directive that gives a reason, from its instrumenter's
// directive-bookkeeper.js.
const strykerPattern =
  /^\s?Stryker (?<action>disable|restore)(?: (?<scope>next-line))? (?<mutators>[a-zA-Z, ]+):(?<reason>.+)/u;

// Whether `program` loads react-native, which Vitest can't.
function importsReactNative(program: ESTree.Program): boolean {
  return program.body.some(
    (statement) =>
      statement.type === "ImportDeclaration" &&
      statement.importKind !== "type" &&
      /^react-native(?:\/|$)/u.test(statement.source.value),
  );
}

// What's wrong with `comment` as a Stryker directive, unless Stryker reads it as disabling, with a
// reason, the named mutators on the next line, or every mutator in a module that imports
// react-native from before its code.
function problem(comment: Comment, program: ESTree.Program): "format" | "module" | undefined {
  const groups = strykerPattern.exec(comment.value)?.groups;

  if (groups?.["action"] !== "disable") {
    return "format";
  }

  // Stryker disable next-line StringLiteral: the pattern always captures mutators and a reason, so the fallbacks only satisfy the types.
  const { scope, mutators = "", reason = "" } = groups;

  if (reason.trim() === "") {
    return "format";
  }

  const names = mutators.split(",").map((name) => name.trim());

  if (scope === "next-line") {
    return names.every((name) => /^[a-zA-Z]+$/u.test(name) && name.toLowerCase() !== "all")
      ? undefined
      : "format";
  }

  if (
    names.join(",") !== "all" ||
    comment.end > (program.body[0]?.start ?? Number.POSITIVE_INFINITY)
  ) {
    return "format";
  }

  return importsReactNative(program) ? undefined : "module";
}

export const strykerDirectiveFormatRule = defineRule({
  meta: {
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
        for (const comment of context.sourceCode.getAllComments()) {
          if (!intendedPattern.test(comment.value)) {
            continue;
          }

          const messageId = problem(comment, program);

          if (messageId !== undefined) {
            context.report({ node: comment, messageId });
          }
        }
      },
    };
  },
});
