import { randomUUID } from "node:crypto";
import { copyFile, stat, unlink, utimes } from "node:fs/promises";
import { resolve } from "node:path";

import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import { changesRpc } from "../shared/changes";
import type { diffRpc } from "../shared/diff";
import { git } from "./git";

type Side = RpcInput<typeof diffRpc>["side"];

// A file git status lists.
interface Entry {
  path: string;
  // Not in the index. One git status pairs with a deleted file is also modified, as renamed.
  untracked: boolean;
  // In the index intent-to-add, as `git add -N` leaves a file new in the worktree.
  intentToAdd: boolean;
  staged: boolean;
  modified: boolean;
  deleted: boolean;
  // Where the file was renamed from on each side. A copy's original is still there.
  renamedFrom: Partial<Record<Side, string | undefined>>;
}

function untrackedEntry(path: string): Entry {
  return {
    path,
    untracked: true,
    intentToAdd: false,
    staged: false,
    modified: false,
    deleted: false,
    renamedFrom: {},
  };
}

// The files git status's fields list.
function* entriesOf(fields: ArrayIterator<string>): Generator<Entry> {
  for (const field of fields) {
    const type = field.charAt(0);

    if (type === "?") {
      yield untrackedEntry(field.slice(2));
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
        // The worktree adds, renames or copies only a file the index has intent-to-add.
        intentToAdd: ["A", "R", "C"].includes(field.charAt(3)),
        staged: field.charAt(2) !== ".",
        modified: field.charAt(3) !== ".",
        deleted: field.charAt(3) === "D",
        renamedFrom: {
          staged: field.charAt(2) === "R" ? original : undefined,
          unstaged: field.charAt(3) === "R" ? original : undefined,
        },
      };
    }
  }
}

// Runs `act` with a copy of the index in which the files are intent-to-add, as `git add -N` would
// make them in the index itself: git then diffs them as new files, and pairs one with a deleted
// file as a rename. The copy sits beside the index, and goes once `act` is done. It keeps the
// index's modification time, by which git tells that a file changed as the index was written may
// look unchanged.
export async function withIntentToAdd<T>(
  directory: string,
  paths: readonly string[],
  act: (index: string) => Promise<T>,
): Promise<T> {
  // git prints the path, and then the `--` that ends the options.
  const output = await git(directory, "rev-parse", ["--git-path", "index"]);
  const printed = output.toString();
  const index = resolve(directory, printed.slice(0, printed.indexOf("\n")));
  const copy = `${index}.better-diff-${randomUUID()}`;

  const { atime, mtime } = await stat(index);

  await copyFile(index, copy);
  await utimes(copy, atime, mtime);

  try {
    await git(
      directory,
      "add",
      ["--intent-to-add", "--pathspec-from-file=-", "--pathspec-file-nul"],
      [],
      { input: Buffer.from(paths.map((path) => `${path}\0`).join("")), index: copy },
    );

    const result = await act(copy);

    return result;
  } finally {
    await unlink(copy);
  }
}

async function statusOf(directory: string, index?: string): Promise<Entry[]> {
  const status = await git(directory, "status", ["--porcelain=v2", "--untracked-files=all"], [], {
    index,
  });

  return [...entriesOf(status.toString().split("\0").values())];
}

function pathsOf(entries: readonly Entry[], isListed: (entry: Entry) => boolean): string[] {
  return entries.flatMap((entry) => (isListed(entry) ? [entry.path] : []));
}

// The untracked files git status pairs with deleted ones once they're intent-to-add: each one's
// path, with its deleted file's. Only that is taken from what git status then says, as the rest can
// differ: adding a file `a/b` takes a file `a` out of the index, a nested repository becomes a
// submodule, and a file added intent-to-add before can be paired with another deleted file. A file
// deleted from the index but not the worktree, which git lists twice, as deleted and as untracked,
// is left out and stays untracked, though git would pair it too.
async function renamesOf(
  directory: string,
  entries: readonly Entry[],
): Promise<Map<string, string>> {
  const tracked = new Set(pathsOf(entries, (entry) => !entry.untracked));

  const untracked = new Set(
    pathsOf(entries, (entry) => entry.untracked && !tracked.has(entry.path)),
  );

  const paired = await withIntentToAdd(directory, [...untracked], async (index) => {
    const status = await statusOf(directory, index);

    return status;
  });

  // The untracked file each deleted file is paired with.
  const renamedTo = new Map(
    paired
      .filter(({ path }) => untracked.has(path))
      .map(({ path, renamedFrom }) => [renamedFrom.unstaged, path] as const),
  );

  const renames = new Map<string, string>();

  // Only a file listed as deleted: not one paired with a file added intent-to-add before.
  for (const { path, deleted } of entries) {
    const renamed = renamedTo.get(path);

    if (deleted && renamed !== undefined) {
      renames.set(renamed, path);
    }
  }

  return renames;
}

// git status pairs a file deleted from the worktree with a new one as a rename, as it does in the
// index, but only where the new one is in the index. So with a file deleted, it's asked again with
// the untracked files intent-to-add: those it pairs are modified, as renamed, and the files they're
// paired with no longer are.
export async function readStatus(directory: string): Promise<Entry[]> {
  const entries = await statusOf(directory);

  const renames = entries.some(({ deleted }) => deleted)
    ? await renamesOf(directory, entries)
    : new Map<string, string>();

  const originals = new Set(renames.values());

  for (const entry of entries) {
    const original = renames.get(entry.path);

    if (original !== undefined) {
      entry.modified = true;
      entry.renamedFrom.unstaged = original;
    }

    if (originals.has(entry.path)) {
      entry.modified = false;
    }
  }

  return entries;
}

export async function listChanges({
  directory,
}: RpcInput<typeof changesRpc>): Promise<RpcOutput<typeof changesRpc>> {
  const entries = await readStatus(directory);

  return {
    modified: pathsOf(entries, ({ modified }) => modified),
    untracked: pathsOf(entries, ({ untracked, modified }) => untracked && !modified),
    staged: pathsOf(entries, ({ staged }) => staged),
  };
}
