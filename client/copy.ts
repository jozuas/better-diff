import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import { largestContents } from "../shared/contents";
import type { contentsRpc } from "../shared/contents";

// What a file's menu copies of it.
export type CopyItem = "full path" | "relative path" | "filename" | "file contents";

export const copyItems: CopyItem[] = ["full path", "relative path", "filename", "file contents"];

export function copyLabel(item: CopyItem): string {
  return `Copy ${item}`;
}

// What copying asks of the server and the clipboard.
export interface Copier {
  readContents: (input: RpcInput<typeof contentsRpc>) => Promise<RpcOutput<typeof contentsRpc>>;
  write: (text: string) => Promise<void>;
}

// The last name in the path, of the directory where it ends in `/`, as git status names a
// repository inside the repository.
function fileName(path: string): string {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;

  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

// What copying puts on the clipboard, or why it puts nothing there.
type Copied = { text: string } | { refused: string };

// What each item but the file's contents is of the file at the path, in the directory.
const names: Record<
  Exclude<CopyItem, "file contents">,
  (directory: string, path: string) => string
> = {
  "full path": (directory, path) => `${directory}/${path}`,
  "relative path": (_, path) => path,
  filename: (_, path) => fileName(path),
};

// Why the file at the path copies nothing, as the server reads it.
const refusals: Record<
  Exclude<RpcOutput<typeof contentsRpc>["status"], "read">,
  (path: string) => string
> = {
  binary: (path) => `${path} is a binary file, so nothing was copied.`,
  large: (path) =>
    `${path} is larger than ${largestContents / 1_000_000} MB, so nothing was copied.`,
  absent: (path) => `There's no file at ${path} to copy.`,
};

async function copiedOf(
  item: CopyItem,
  directory: string,
  path: string,
  { readContents }: Copier,
): Promise<Copied> {
  if (item !== "file contents") {
    return { text: names[item](directory, path) };
  }

  const contents = await readContents({ directory, path });

  if (contents.status === "read") {
    return { text: contents.text };
  }

  return { refused: refusals[contents.status](path) };
}

// Copies the item of the file at the path, in the workspace's directory, as git status lists it:
// relative to the repository's root. Returns why it copies nothing, if it doesn't.
export async function copy(
  item: CopyItem,
  directory: string,
  path: string,
  copier: Copier,
): Promise<string | undefined> {
  const copied = await copiedOf(item, directory, path, copier);

  if ("refused" in copied) {
    return copied.refused;
  }

  await copier.write(copied.text);

  return undefined;
}
