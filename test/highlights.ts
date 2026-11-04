import type { RpcOutput } from "@getpaseo/plugin";

import { highlighted } from "../server/highlight";
import type { diffRpc } from "../shared/diff";

type Highlights = RpcOutput<typeof diffRpc>["highlights"];

// The highlights of each of the lines of a new file at the path.
export async function highlightLines(lines: string[], path: string): Promise<Highlights["new"]> {
  const { highlights } = await highlighted(
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

  return highlights.new;
}
