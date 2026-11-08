import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";

type Diff = RpcOutput<typeof diffRpc>;

const numbers = new Intl.NumberFormat("en-US");

// The numbers of lines a text diff adds and removes, as GitHub shows them after a file's path, even
// while it's collapsed. None for a diff of another kind, or a new or deleted empty file's, whose
// label says what changed instead.
export function countsOf({
  kind,
  hunks,
  collapsed,
  added,
  removed,
}: Pick<Diff, "kind" | "hunks" | "collapsed" | "added" | "removed">):
  | { added: string; removed: string }
  | undefined {
  if (kind !== "text" || (hunks.length === 0 && collapsed === undefined)) {
    return undefined;
  }

  return { added: `+${numbers.format(added)}`, removed: `−${numbers.format(removed)}` };
}

// How a file's bar reads: the file's status, its path after the one it was renamed from, if it was,
// and, once its diff is read, how many lines a text diff adds and removes.
export function barLabel(
  status: string,
  path: string,
  diff:
    | Pick<Diff, "kind" | "hunks" | "collapsed" | "added" | "removed" | "renamedFrom">
    | undefined,
): string {
  const counts = diff === undefined ? undefined : countsOf(diff);
  const renamed = diff?.renamedFrom === undefined ? undefined : `${diff.renamedFrom} →`;

  return [status, renamed, path, counts?.added, counts?.removed]
    .filter((part) => part !== undefined)
    .join(" ");
}
