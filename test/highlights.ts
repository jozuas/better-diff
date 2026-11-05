import type { RpcOutput } from "@getpaseo/plugin";

import { highlighted } from "../server/highlight";
import type { UnhighlightedDiff } from "../server/highlight";
import type { diffRpc } from "../shared/diff";

type Runs = RpcOutput<typeof diffRpc>["contents"][number]["runs"];

// The most characters a version can have to be highlighted, and the most the versions whose
// highlights are kept can have in all.
export const longestHighlighted = 786_432;
export const mostKept = 8_388_608;

// The diff of a new file of the lines.
export function newFile(lines: string[]): UnhighlightedDiff {
  return {
    version: "",
    kind: "text",
    added: lines.length,
    removed: 0,
    hunks: [],
    contents: { old: [], new: lines },
  };
}

// The runs of each of the lines of a new file at the path.
export async function highlightLines(lines: string[], path: string): Promise<Runs[]> {
  const { contents } = await highlighted(newFile(lines), path, true);

  return contents.map(({ runs }) => runs);
}

// The runs of each of the lines of a new file at the path, and whether highlighting them finished
// before other work waiting for its turn took it, as it does only where they were kept rather than
// highlighted anew: highlighting gives other work a turn at least once.
export async function highlightLinesKept(
  lines: string[],
  path: string,
): Promise<{ runs: Runs[]; kept: boolean }> {
  let finished = false;

  const otherWork = new Promise<boolean>((resolve) => {
    setImmediate(() => {
      resolve(finished);
    });
  });

  const highlighting = (async () => {
    const runs = await highlightLines(lines, path);

    finished = true;

    return runs;
  })();

  return { kept: await otherWork, runs: await highlighting };
}

// Whether the highlights of the lines of a new file at the path were kept, as highlighting them
// again, which keeps them, finds.
export async function wereKept(lines: string[], path: string): Promise<boolean> {
  const highlighting = await highlightLinesKept(lines, path);

  return highlighting.kept;
}
