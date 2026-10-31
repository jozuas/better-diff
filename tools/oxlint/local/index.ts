import { definePlugin } from "@oxlint/plugins";

import {
  fastCheckNamespaceImportRule,
  fastCheckNoPredicateReturnRule,
  fastCheckNoReplayRule,
  fastCheckStringUnitRule,
} from "./fast-check.ts";
import { noHtmlElementsRule } from "./no-html-elements.ts";
import { noLintDirectivesRule } from "./no-lint-directives.ts";
import { noTsxHelpersRule } from "./no-tsx-helpers.ts";
import { noViStubsRule } from "./no-vi-stubs.ts";
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
    "no-tsx-helpers": noTsxHelpersRule,
    "no-vi-stubs": noViStubsRule,
    "stryker-directive-format": strykerDirectiveFormatRule,
  },
});
