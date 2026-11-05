import type { RpcOutput } from "@getpaseo/plugin";

import { highlighted } from "../server/highlight";
import type { diffRpc } from "../shared/diff";

type Runs = RpcOutput<typeof diffRpc>["contents"][number]["runs"];

// The runs of each of the lines of a new file at the path.
export async function highlightLines(lines: string[], path: string): Promise<Runs[]> {
  const { contents } = await highlighted(
    {
      version: "",
      kind: "text",
      added: lines.length,
      removed: 0,
      hunks: [],
      contents: { old: [], new: lines },
    },
    path,
    true,
  );

  return contents.map(({ runs }) => runs);
}
