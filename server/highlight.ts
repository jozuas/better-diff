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

// The runs of the lines at the indices, and none for the others before the last of them.
function unpacked(
  { styles, lengths, styleIndices, ends }: PackedRuns,
  lines: ReadonlySet<number>,
): Runs[] {
  let last = 0;

  for (const line of lines) {
    last = Math.max(last, line + 1);
  }

  return Array.from(ends.subarray(0, last), (end, line): Runs => {
    if (!lines.has(line)) {
      return [];
    }

    const start = ends[line - 1] ?? 0;

    return Array.from(lengths.subarray(start, end), (length, run): Runs[number] => [
      length,
      styles[styleIndices[start + run] ?? 0] ?? null,
    ]);
  });
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

// The indices, in each version, of some of its lines.
interface Lines {
  old: Set<number>;
  new: Set<number>;
}

function hunkLinesOf(hunks: Diff["hunks"]): Lines {
  const indices: Lines = { old: new Set(), new: new Set() };

  for (const { oldStart, newStart, lines } of hunks) {
    let old = oldStart - 1;
    let changed = newStart - 1;

    for (const { kind } of lines) {
      if (kind !== "added") {
        indices.old.add(old);
        old += 1;
      }

      if (kind !== "removed") {
        indices.new.add(changed);
        changed += 1;
      }
    }
  }

  return indices;
}

// The runs of the lines at the indices of a version of the file at the path, in the language its
// extension names, and none for the others before the last of them.
async function highlightLines(
  version: readonly string[],
  path: string,
  lines: ReadonlySet<number>,
): Promise<Runs[]> {
  const code = version.join("\n");

  if (!isLanguageSupported(path) || code.length > longestHighlighted) {
    return [];
  }

  const runs = await keptRuns(code, path);

  return unpacked(runs, lines);
}

// The diff of the file at the path with its versions highlighted, the old one as the file it was
// renamed from, if it was: with every line of the versions, if it's to be shown entire, or else with
// only what showing its hunks takes, the highlights of the hunks' lines and no contents. The old
// version is highlighted only if the diff removes lines, since only removed lines are shown in it.
export async function highlighted<D extends Omit<Diff, "highlights">>(
  diff: D,
  path: string,
  entire: boolean,
): Promise<D & Highlights> {
  const lines = entire
    ? { old: new Set(diff.contents.old.keys()), new: new Set(diff.contents.new.keys()) }
    : hunkLinesOf(diff.hunks);

  const [old, changed] = await Promise.all([
    diff.removed === 0
      ? []
      : highlightLines(diff.contents.old, diff.renamedFrom ?? path, lines.old),
    highlightLines(diff.contents.new, path, lines.new),
  ]);

  return {
    ...diff,
    contents: entire ? diff.contents : { old: [], new: [] },
    highlights: { old, new: changed },
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
