import { setImmediate } from "node:timers/promises";

import {
  highlightCodeInSteps,
  isLanguageSupported,
  resolveSyntaxColors,
} from "@getpaseo/highlight";
import type { HighlightToken } from "@getpaseo/highlight";
import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";
import type { syntaxColorsRpc } from "../shared/syntax";

type Diff = RpcOutput<typeof diffRpc>;

type Highlights = Pick<Diff, "highlights">;

type Runs = Diff["highlights"]["new"][number];

type Steps = ReturnType<typeof highlightCodeInSteps>;

// The most characters a version can have to be highlighted, as Paseo's own diff highlights them.
const longestHighlighted = 768 * 1024;

function runsOf(tokens: readonly HighlightToken[]): Runs {
  return tokens.flatMap(({ text, style }) => (text.length > 0 ? [[text.length, style]] : []));
}

// Each step is a bounded piece of work, after which the plugin's other work, such as reading other
// diffs, takes its turn.
async function finish(steps: Steps): Promise<HighlightToken[][]> {
  const step = steps.next();

  if (step.done === true) {
    return step.value;
  }

  await setImmediate();

  const lines = await finish(steps);

  return lines;
}

// The runs of each of the lines of a version of the file at the path, in the language its extension
// names.
async function highlightLines(lines: readonly string[], path: string): Promise<Runs[]> {
  const code = lines.join("\n");

  if (lines.length === 0 || !isLanguageSupported(path) || code.length > longestHighlighted) {
    return [];
  }

  const tokens = await finish(highlightCodeInSteps(code, path));

  return tokens.map(runsOf);
}

// The diff of the file at the path with its versions highlighted, the old one as the file it was
// renamed from, if it was.
export async function highlighted<D extends Omit<Diff, "highlights">>(
  diff: D,
  path: string,
): Promise<D & Highlights> {
  const [old, changed] = await Promise.all([
    highlightLines(diff.contents.old, diff.renamedFrom ?? path),
    highlightLines(diff.contents.new, path),
  ]);

  return { ...diff, highlights: { old, new: changed } };
}

// Paseo's default syntax theme.
const syntaxTheme = "one";

export function syntaxColors(): RpcOutput<typeof syntaxColorsRpc> {
  return {
    // Stryker disable next-line StringLiteral: resolveSyntaxColors gives the light colours for any scheme but "dark".
    light: resolveSyntaxColors(syntaxTheme, "light"),
    dark: resolveSyntaxColors(syntaxTheme, "dark"),
  };
}
