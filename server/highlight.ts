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
import { versionOf } from "./version";

type Diff = RpcOutput<typeof diffRpc>;

type Hunk = Diff["hunks"][number];

type Line = Hunk["lines"][number];

type Runs = Line["runs"];

// A diff as the plugin shows it, before `highlighted` gives its lines their runs: with every line of
// both versions, which highlighting them takes.
export interface UnhighlightedDiff extends Omit<Diff, "hunks" | "contents"> {
  hunks: (Omit<Hunk, "lines"> & { lines: Omit<Line, "runs">[] })[];
  contents: { old: string[]; new: string[] };
}

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

// The lines of the code highlighted, or none where Paseo's highlighter fails on it, as its Nix
// grammar fails on code that ends in a backslash.
async function tokensOf(code: string, path: string): Promise<HighlightToken[][]> {
  try {
    const tokens = await finish(highlightCodeInSteps(code, path));

    return tokens;
  } catch {
    return [];
  }
}

// The runs of each of a version's lines mostly in typed arrays, which take a tenth of the memory
// the runs do: each style the runs have, each run's length and the index of its style, and the
// index of the run after each line's last.
interface PackedRuns {
  styles: (string | null)[];
  lengths: Uint32Array;
  styleIndices: Uint16Array;
  ends: Uint32Array;
}

function packed(lines: readonly Runs[]): PackedRuns {
  const runs = lines.flat();
  const styles = [...new Set(runs.map(([, style]) => style))];
  const ends = new Uint32Array(lines.length);
  let end = 0;

  for (const [index, { length }] of lines.entries()) {
    end += length;
    ends[index] = end;
  }

  return {
    styles,
    lengths: Uint32Array.from(runs, ([length]) => length),
    styleIndices: Uint16Array.from(runs, ([, style]) => styles.indexOf(style)),
    ends,
  };
}

// The runs of the line at the index.
function runsAt({ styles, lengths, styleIndices, ends }: PackedRuns, line: number): Runs {
  const start = ends[line - 1] ?? 0;
  const end = ends[line] ?? start;

  return Array.from(lengths.subarray(start, end), (length, run): Runs[number] => [
    length,
    styles[styleIndices[start + run] ?? 0] ?? null,
  ]);
}

async function highlightedRuns(code: string, path: string): Promise<PackedRuns> {
  const tokens = await tokensOf(code, path);

  return packed(tokens.map(runsOf));
}

// The most characters the versions whose runs are kept can have in all, so that reading diffs
// again, as each refresh does, highlights only the versions that changed. Kept, a character of
// code takes about two bytes.
const mostKept = 8 * 1024 * 1024;

interface Kept {
  characters: number;
  runs: Promise<PackedRuns>;
}

// The runs of the versions highlighted lately, the least lately first, by the path and the code.
const kept = new Map<string, Kept>();

let keptCharacters = 0;

function forget(key: string): void {
  keptCharacters -= kept.get(key)?.characters ?? 0;
  kept.delete(key);
}

function forgetLeastLately(): void {
  for (const key of kept.keys()) {
    if (keptCharacters <= mostKept) {
      return;
    }

    forget(key);
  }
}

// The runs of the code at the path, kept from highlighting it lately, or else highlighted anew.
async function keptRuns(code: string, path: string): Promise<PackedRuns> {
  const key = versionOf(`${path}\0${code}`);
  const version = kept.get(key) ?? { characters: code.length, runs: highlightedRuns(code, path) };

  forget(key);
  kept.set(key, version);
  keptCharacters += version.characters;
  forgetLeastLately();

  const runs = await version.runs;

  return runs;
}

const noRuns = packed([]);

// The runs of the lines of a version of the file at the path, in the language its extension names.
async function versionRuns(version: readonly string[], path: string): Promise<PackedRuns> {
  const code = version.join("\n");

  if (!isLanguageSupported(path) || code.length > longestHighlighted) {
    return noRuns;
  }

  const runs = await keptRuns(code, path);

  return runs;
}

// The runs of each version's lines.
interface VersionsRuns {
  old: PackedRuns;
  new: PackedRuns;
}

// The hunk with each line's runs, by the line's index in its version: a removed line's in the old
// one, any other's in the new one.
function withRuns(
  { oldStart, newStart, lines }: UnhighlightedDiff["hunks"][number],
  runs: VersionsRuns,
): Hunk {
  let old = oldStart - 1;
  let changed = newStart - 1;

  return {
    oldStart,
    newStart,
    lines: lines.map((line) => {
      const lineRuns = line.kind === "removed" ? runsAt(runs.old, old) : runsAt(runs.new, changed);

      if (line.kind !== "added") {
        old += 1;
      }

      if (line.kind !== "removed") {
        changed += 1;
      }

      return { ...line, runs: lineRuns };
    }),
  };
}

// The diff of the file at the path with its hunks' lines highlighted, the old version as the file it
// was renamed from, if it was, and with every line of the new version, if it's to be shown entire,
// or else none. The old version is highlighted only if the diff removes lines, since only removed
// lines are shown from it.
export async function highlighted<D extends UnhighlightedDiff>(
  { hunks, contents, ...diff }: D,
  path: string,
  entire: boolean,
): Promise<Omit<D, "hunks" | "contents"> & Pick<Diff, "hunks" | "contents">> {
  const [old, changed] = await Promise.all([
    diff.removed === 0 ? noRuns : versionRuns(contents.old, diff.renamedFrom ?? path),
    versionRuns(contents.new, path),
  ]);

  return {
    ...diff,
    hunks: hunks.map((hunk) => withRuns(hunk, { old, new: changed })),
    contents: entire
      ? contents.new.map((text, line) => ({ text, runs: runsAt(changed, line) }))
      : [],
  };
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
