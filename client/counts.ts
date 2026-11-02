import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";

type Diff = RpcOutput<typeof diffRpc>;

const numbers = new Intl.NumberFormat("en-US");

// The numbers of lines a text diff adds and removes, as GitHub shows them after a file's path.
// None for a diff of another kind, whose label says what changed instead.
export function countsOf({
  kind,
  added,
  removed,
}: Pick<Diff, "kind" | "added" | "removed">): { added: string; removed: string } | undefined {
  if (kind !== "text") {
    return undefined;
  }

  return { added: `+${numbers.format(added)}`, removed: `−${numbers.format(removed)}` };
}
