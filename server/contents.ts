import { lstat, readFile, readlink } from "node:fs/promises";
import { resolve, sep } from "node:path";

import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import { largestContents } from "../shared/contents";
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

  const stats = await lstat(file).catch(() => null);

  if (stats?.isSymbolicLink() === true) {
    return { status: "read", text: await readlink(file) };
  }

  if (stats === null || !stats.isFile()) {
    return { status: "absent" };
  }

  if (stats.size > largestContents) {
    return { status: "large" };
  }

  const bytes = await readFile(file);

  return bytes.subarray(0, firstFewBytes).includes(0)
    ? { status: "binary" }
    : { status: "read", text: bytes.toString("utf8") };
}
