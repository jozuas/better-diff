import type { Rule } from "@oxlint/plugins";
import { RuleTester } from "oxlint/plugins-dev";

// Run cases inline instead of as tests of their own, so `expect` can check them.
RuleTester.describe = (_text, run) => run();

RuleTester.it = (_text, run) => run();

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "tsx" } } });

export function lint(name: string, rule: Rule, tests: RuleTester.TestCases): () => void {
  return () => tester.run(name, rule, tests);
}
