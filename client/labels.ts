import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";

type Diff = RpcOutput<typeof diffRpc>;

const labels: Record<Exclude<Diff["kind"], "text">, string> = {
  unchanged: "No changes",
  renamed: "Renamed",
  symlink: "Symlink",
  binary: "Binary file",
  mode: "File mode changed",
  unmerged: "Merge conflicts",
};

// What's shown instead of a diff without lines: one of a kind that has none, or a new or deleted
// empty file's. Undefined for a diff with lines.
export function labelOf({ kind, hunks }: Pick<Diff, "kind" | "hunks">): string | undefined {
  if (kind === "text") {
    return hunks.length > 0 ? undefined : "Empty file";
  }

  return labels[kind];
}
