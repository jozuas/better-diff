import { definePlugin } from "@oxlint/plugins";

import {
  fastCheckNamespaceImportRule,
  fastCheckNoPredicateReturnRule,
  fastCheckNoReplayRule,
  fastCheckStringUnitRule,
} from "./fast-check.ts";
import { noHtmlElementsRule } from "./no-html-elements.ts";
import { noLintDirectivesRule } from "./no-lint-directives.ts";
import { strykerDirectiveFormatRule } from "./stryker-directive-format.ts";

export default definePlugin({
  meta: { name: "local" },
  rules: {
    "fast-check-namespace-import": fastCheckNamespaceImportRule,
    "fast-check-no-predicate-return": fastCheckNoPredicateReturnRule,
    "fast-check-no-replay": fastCheckNoReplayRule,
    "fast-check-string-unit": fastCheckStringUnitRule,
    "no-html-elements": noHtmlElementsRule,
    "no-lint-directives": noLintDirectivesRule,
    "stryker-directive-format": strykerDirectiveFormatRule,
  },
});
