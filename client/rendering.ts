import type { RpcOutput } from "@getpaseo/plugin";

import type { groupRpc } from "../shared/diff";

type GroupFile = RpcOutput<typeof groupRpc>["files"][number];

// How many lines a file's diff shows as the group's read has it: its hunks' lines, or one for what
// shows in their place.
export function linesShown(file: GroupFile): number {
  let lines = 0;

  for (const hunk of "error" in file ? [] : file.hunks) {
    lines += hunk.lines.length;
  }

  return Math.max(1, lines);
}

// How many of a view's files, from the first, to render the diffs of, by how many lines each shows,
// once `rendered` of them are: one more, and more until those added show `budget` lines, or all.
export function filesToRender(lines: readonly number[], rendered: number, budget: number): number {
  let next = rendered;
  let added = 0;

  while (next < lines.length && added < budget) {
    added += lines[next] ?? 0;
    next += 1;
  }

  return next;
}
