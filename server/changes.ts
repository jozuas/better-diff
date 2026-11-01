import { copyFile, lstat, mkdtemp, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import { changesRpc } from "../shared/changes";
import { git } from "./git";

// A file git status lists.
export interface Entry {
  path: string;
  // Not in the index. One git status pairs with a deleted file is also modified, as renamed.
  untracked: boolean;
  // In the index intent-to-add, as `git add -N` leaves a file new in the worktree.
  intentToAdd: boolean;
  staged: boolean;
  modified: boolean;
  deleted: boolean;
  // The path git status names as the one the file was renamed or copied from, on either side. Its
  // diff on a side tells whether it's renamed there.
  original: string | undefined;
}

function untrackedEntry(path: string): Entry {
  return {
    path,
    untracked: true,
    intentToAdd: false,
    staged: false,
    modified: false,
    // Stryker disable next-line BooleanLiteral: an untracked file is never the one a new file is renamed from, so taking it for deleted only has git status asked again where it pairs nothing.
    deleted: false,
    original: undefined,
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
        original,
      };
    }
  }
}

// Runs `act` with a copy of the index in which the files are intent-to-add, as `git add -N` would
// make them in the index itself: git then diffs them as new files, and pairs one with a deleted
// file as a rename. The copy sits in a temporary directory, not the repository, where one left by a
// process that was stopped would stay, and goes once `act` is done. It keeps the index's
// modification time, by which git tells that a file changed as the index was written may look
// unchanged. A file outside a sparse checkout is added too.
export async function withIntentToAdd<T>(
  directory: string,
  paths: readonly string[],
  act: (index: string) => Promise<T>,
): Promise<T> {
  // git prints the path, and then the `--` that ends the options.
  const output = await git(directory, "rev-parse", ["--git-path", "index"]);
  const printed = output.toString();
  const index = resolve(directory, printed.slice(0, printed.indexOf("\n")));
  // Stryker disable next-line StringLiteral: the name only tells a person what the directory is for.
  const copies = await mkdtemp(join(tmpdir(), "better-diff-index-"));
  const copy = join(copies, "index");

  try {
    const { atime, mtime } = await stat(index);

    await copyFile(index, copy);
    await utimes(copy, atime, mtime);

    await git(
      directory,
      "add",
      ["--intent-to-add", "--sparse", "--pathspec-from-file=-", "--pathspec-file-nul"],
      [],
      { input: Buffer.from(paths.map((path) => `${path}\0`).join("")), index: copy },
    );

    const result = await act(copy);

    return result;
  } finally {
    await rm(copies, { recursive: true });
  }
}

interface Status {
  // What git status prints.
  output: string;
  entries: Entry[];
}

async function statusOf(directory: string, index?: string): Promise<Status> {
  const status = await git(directory, "status", ["--porcelain=v2", "--untracked-files=all"], [], {
    index,
  });

  const output = status.toString();

  return { output, entries: [...entriesOf(output.split("\0").values())] };
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
async function pairsOf(directory: string, entries: readonly Entry[]): Promise<Map<string, string>> {
  const tracked = new Set(pathsOf(entries, (entry) => !entry.untracked));

  const untracked = new Set(
    pathsOf(entries, (entry) => entry.untracked && !tracked.has(entry.path)),
  );

  const paired = await withIntentToAdd(directory, [...untracked], async (index) => {
    const { entries: status } = await statusOf(directory, index);

    return status;
  });

  // The untracked file each deleted file is paired with. Of several, git takes the last for the one
  // it's renamed to, and the others for copies.
  const renamedTo = new Map(
    paired
      .filter(({ path }) => untracked.has(path))
      .map(({ path, original }) => [original, path] as const),
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

// What the renames found in a repository depend on: what git status says, and the size and times of
// each file new in the worktree, which change with its content.
async function sourcesOf(directory: string, { output, entries }: Status): Promise<string> {
  const files = await Promise.all(
    pathsOf(entries, (entry) => entry.untracked || entry.intentToAdd).map(async (path) => {
      const { ino, size, mtimeMs, ctimeMs } = await lstat(join(directory, path));

      return [ino, size, mtimeMs, ctimeMs];
    }),
  );

  return JSON.stringify([output, files]);
}

// The renames last found in each repository, and what they were found from.
const found = new Map<string, { sources: string; renames: Map<string, string> }>();

// The renames git status finds with the untracked files intent-to-add, found again only once what
// they depend on changes: finding them hashes each untracked file, and runs a filter such as Git
// LFS's on it.
async function renamesOf(directory: string, status: Status): Promise<Map<string, string>> {
  const sources = await sourcesOf(directory, status);
  const last = found.get(directory);

  if (last?.sources === sources) {
    return last.renames;
  }

  const renames = await pairsOf(directory, status.entries);

  found.set(directory, { sources, renames });

  return renames;
}

// git status pairs a file deleted from the worktree with a new one as a rename, as it does in the
// index, but only where the new one is in the index. So with a file deleted, it's asked again with
// the untracked files intent-to-add: those it pairs are modified, as renamed, and the files they're
// paired with no longer are. Where that fails, as where a file is gone by then, or git won't have
// its path in the index, what git status said first stands.
export async function readStatus(directory: string): Promise<Entry[]> {
  const status = await statusOf(directory);
  const { entries } = status;

  const renames = entries.some(({ deleted }) => deleted)
    ? await renamesOf(directory, status).catch(() => new Map<string, string>())
    : new Map<string, string>();

  const originals = new Set(renames.values());

  for (const entry of entries) {
    const original = renames.get(entry.path);

    if (original !== undefined) {
      entry.modified = true;
      entry.original = original;
    }

    if (originals.has(entry.path)) {
      entry.modified = false;
    }
  }

  return entries;
}

// The files in each group.
export function groupsOf(entries: readonly Entry[]): RpcOutput<typeof changesRpc> {
  return {
    modified: pathsOf(entries, ({ modified }) => modified),
    untracked: pathsOf(entries, ({ untracked, modified }) => untracked && !modified),
    staged: pathsOf(entries, ({ staged }) => staged),
  };
}

export async function listChanges({
  directory,
}: RpcInput<typeof changesRpc>): Promise<RpcOutput<typeof changesRpc>> {
  const entries = await readStatus(directory);

  return groupsOf(entries);
}
