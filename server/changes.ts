import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import { changesRpc } from "../shared/changes";
import { git } from "./git";

// A file git status lists.
interface Entry {
  path: string;
  untracked: boolean;
  staged: boolean;
  modified: boolean;
  // Where a file renamed in the index came from. A copy's original is still there.
  renamedFrom: string | undefined;
}

// The files git status's fields list.
function* entriesOf(fields: ArrayIterator<string>): Generator<Entry> {
  for (const field of fields) {
    const type = field.charAt(0);

    if (type === "?") {
      yield {
        path: field.slice(2),
        untracked: true,
        staged: false,
        modified: false,
        renamedFrom: undefined,
      };
    } else if (type === "1" || type === "2") {
      // A changed file's path follows eight fields, a renamed or copied one's nine, and the next
      // field is its original path.
      const path = field
        .split(" ")
        .slice(type === "1" ? 8 : 9)
        .join(" ");

      const original = type === "2" ? fields.next().value : undefined;

      yield {
        path,
        untracked: false,
        staged: field.charAt(2) !== ".",
        modified: field.charAt(3) !== ".",
        renamedFrom: field.charAt(2) === "R" ? original : undefined,
      };
    }
  }
}

export async function readStatus(directory: string): Promise<Entry[]> {
  const status = await git(directory, "status", ["--porcelain=v2", "--untracked-files=all"]);

  return [...entriesOf(status.toString().split("\0").values())];
}

function pathsOf(entries: readonly Entry[], isListed: (entry: Entry) => boolean): string[] {
  return entries.flatMap((entry) => (isListed(entry) ? [entry.path] : []));
}

export async function listChanges({
  directory,
}: RpcInput<typeof changesRpc>): Promise<RpcOutput<typeof changesRpc>> {
  const entries = await readStatus(directory);

  return {
    modified: pathsOf(entries, ({ modified }) => modified),
    untracked: pathsOf(entries, ({ untracked }) => untracked),
    staged: pathsOf(entries, ({ staged }) => staged),
  };
}
