import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import { changesRpc } from "../shared/changes";
import { git } from "./git";

export async function listChanges({
  directory,
}: RpcInput<typeof changesRpc>): Promise<RpcOutput<typeof changesRpc>> {
  const status = await git(directory, "status", ["--porcelain=v2", "--untracked-files=all"]);
  const entries = status.toString().split("\0").values();
  const modified: string[] = [];
  const untracked: string[] = [];
  const staged: string[] = [];

  for (const entry of entries) {
    const type = entry.charAt(0);

    if (type === "?") {
      untracked.push(entry.slice(2));
    } else if (type === "1" || type === "2") {
      // A changed file's path follows eight fields, a renamed or copied one's nine.
      const path = entry
        .split(" ")
        .slice(type === "1" ? 8 : 9)
        .join(" ");

      if (entry.charAt(2) !== ".") {
        staged.push(path);
      }

      if (entry.charAt(3) !== ".") {
        modified.push(path);
      }

      if (type === "2") {
        // Its original path.
        entries.next();
      }
    }
  }

  return { modified, untracked, staged };
}
