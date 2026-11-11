import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";

type Diff = RpcOutput<typeof diffRpc>;

// A mode change on its own has none: its bar shows it, as Magit shows it.
const labels: Record<Exclude<Diff["kind"], "text">, string | undefined> = {
  unchanged: "No changes",
  renamed: "Renamed",
  symlink: "Symlink",
  binary: "Binary file",
  mode: undefined,
  unmerged: "Merge conflicts",
  whitespace: "Only whitespace changes",
};

const collapsedLabels: Record<NonNullable<Diff["collapsed"]>, string> = {
  generated: "Generated file",
  large: "Large diff",
};

// What's shown instead of a diff without lines: one of a kind that has none, a new or deleted empty
// file's, or a collapsed one's. Undefined for a diff with lines, or a mode change on its own.
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

// What a hunk's bar says of the unchanged lines the diff leaves out before the hunk.
export function unchangedLabel(count: number): string {
  return count === 1 ? "1 unchanged line" : `${count} unchanged lines`;
}
