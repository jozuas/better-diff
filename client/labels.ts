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

const collapsedLabels: Record<NonNullable<Diff["collapsed"]>, string> = {
  generated: "Generated file",
  large: "Large diff",
};

// What's shown instead of a diff without lines: one of a kind that has none, a new or deleted empty
// file's, or a collapsed one's. Undefined for a diff with lines.
export function labelOf({
  kind,
  hunks,
  collapsed,
}: Pick<Diff, "kind" | "hunks" | "collapsed">): string | undefined {
  if (collapsed !== undefined) {
    return collapsedLabels[collapsed];
  }

  if (kind === "text") {
    return hunks.length > 0 ? undefined : "Empty file";
  }

  return labels[kind];
}
