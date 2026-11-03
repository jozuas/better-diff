import type { RpcOutput } from "@getpaseo/plugin";
import { createContext } from "react";

import type { diffRpc } from "../shared/diff";
import type { OpenFile } from "./groups";

// The diffs the panel shows, by shownFileKey, as it last rendered their bars: an action on a file's
// diff as shown acts on that one.
export const ShownDiffsContext = createContext(new Map<string, RpcOutput<typeof diffRpc>>());

// Tells the file, as opened from its group, apart from the others.
export function shownFileKey({ group, path }: OpenFile): string {
  return JSON.stringify([group, path]);
}
