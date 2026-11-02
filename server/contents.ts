import { readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import type { contentsRpc } from "../shared/contents";

// The bytes git looks for a NUL in to tell a binary file.
const firstFewBytes = 8000;

export async function readContents({
  directory,
  path,
}: RpcInput<typeof contentsRpc>): Promise<RpcOutput<typeof contentsRpc>> {
  const root = resolve(directory);
  const file = resolve(root, path);

  if (!file.startsWith(`${root}${sep}`)) {
    return { status: "absent" };
  }

  const stats = await stat(file).catch(() => null);

  if (stats === null || !stats.isFile()) {
    return { status: "absent" };
  }

  const bytes = await readFile(file);

  return bytes.subarray(0, firstFewBytes).includes(0)
    ? { status: "binary" }
    : { status: "read", text: bytes.toString("utf8") };
}
