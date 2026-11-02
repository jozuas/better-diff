import { copyFile, lstat, mkdtemp, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import { changesRpc } from "../shared/changes";
import type { waitRpc } from "../shared/changes";
import { git } from "./git";
import { versionOf } from "./version";
import { changeFrom } from "./wait";
import { watchRepository } from "./watch";

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

// The index file of each directory's repository, as git names it. Those that ask at once wait for
// one answer, in the order they asked.
const indexes = new Map<string, Promise<string>>();

async function askIndexOf(directory: string): Promise<string> {
  // git prints the path, and then the `--` that ends the options.
  const output = await git(directory, "rev-parse", ["--git-path", "index"]);
  const printed = output.toString();

  return resolve(directory, printed.slice(0, printed.indexOf("\n")));
}

// Forgets the directory's index where git couldn't name it, so that git is asked again.
async function forgetFailed(directory: string, index: Promise<string>): Promise<void> {
  try {
    await index;
  } catch {
    indexes.delete(directory);
  }
}

export async function indexOf(directory: string): Promise<string> {
  const index = indexes.get(directory) ?? askIndexOf(directory);

  indexes.set(directory, index);
  await forgetFailed(directory, index);

  return index;
}

async function copyIndex(index: string, copy: string): Promise<void> {
  const { atime, mtime } = await stat(index);

  await copyFile(index, copy);
  await utimes(copy, atime, mtime);
}

// Runs `act` with an index of its own, as `start` writes it, or else empty, in which the files are
// then intent-to-add, as `git add -N` would make them: git then diffs them as new files. The index
// sits in a temporary directory, not the repository, where one left by a process that was stopped
// would stay, and goes once `act` is done. A file outside a sparse checkout is added too.
async function inOwnIndex<T>(
  directory: string,
  paths: readonly string[],
  start: (index: string) => Promise<void>,
  act: (index: string) => Promise<T>,
): Promise<T> {
  // Stryker disable next-line StringLiteral: the name only tells a person what the directory is for.
  const temporary = await mkdtemp(join(tmpdir(), "better-diff-index-"));
  const index = join(temporary, "index");

  try {
    await start(index);
    await git(directory, "add", ["--intent-to-add", "--sparse"], paths, { index });

    const result = await act(index);

    return result;
  } finally {
    await rm(temporary, { recursive: true });
  }
}

// Runs `act` with a copy of the index in which the files are intent-to-add, as they would be in the
// index itself, where git pairs one with a deleted file as a rename. The copy keeps the index's
// modification time, by which git tells that a file changed as the index was written may look
// unchanged. Where the index git named before is gone, as once the repository's git directory has
// moved, git is asked again.
export async function withIntentToAdd<T>(
  directory: string,
  paths: readonly string[],
  act: (index: string) => Promise<T>,
): Promise<T> {
  const result = await inOwnIndex(
    directory,
    paths,
    async (copy) => {
      await copyIndex(await indexOf(directory), copy).catch(async () => {
        indexes.delete(directory);
        await copyIndex(await indexOf(directory), copy);
      });
    },
    act,
  );

  return result;
}

// Runs `act` with an index that has only the files, intent-to-add, whether or not the repository
// has an index yet.
export async function aloneIntentToAdd<T>(
  directory: string,
  paths: readonly string[],
  act: (index: string) => Promise<T>,
): Promise<T> {
  const result = await inOwnIndex(directory, paths, async () => {}, act);

  return result;
}

interface Status {
  // What git status prints.
  output: string;
  entries: Entry[];
}

async function statusOf(directory: string, index?: string, signal?: AbortSignal): Promise<Status> {
  const status = await git(directory, "status", ["--porcelain=v2", "--untracked-files=all"], [], {
    index,
    signal,
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

// What git status says, and the inode, size and times of each file it lists that `isStated` picks,
// which change with the file's content. A file gone from the worktree has none.
async function sourcesOf(
  directory: string,
  { output, entries }: Status,
  isStated: (entry: Entry) => boolean,
): Promise<string> {
  const files = await Promise.all(
    pathsOf(entries, isStated).map(async (path) => {
      const stats = await lstat(join(directory, path)).catch(() => null);

      return stats === null ? null : [stats.ino, stats.size, stats.mtimeMs, stats.ctimeMs];
    }),
  );

  return JSON.stringify([output, files]);
}

// The renames last found in each repository, and what they were found from.
const found = new Map<string, { sources: string; renames: Map<string, string> }>();

// The renames git status finds with the untracked files intent-to-add, found again only once what
// they depend on changes: finding them hashes each untracked file, and runs a filter such as Git
// LFS's on it. What they depend on is what git status says, and each file new in the worktree.
async function renamesOf(directory: string, status: Status): Promise<Map<string, string>> {
  const sources = await sourcesOf(
    directory,
    status,
    (entry) => entry.untracked || entry.intentToAdd,
  );

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

export function groupsOf(entries: readonly Entry[]): RpcOutput<typeof changesRpc> {
  return {
    modified: pathsOf(entries, ({ modified }) => modified),
    untracked: pathsOf(entries, ({ untracked, modified }) => untracked && !modified),
    staged: pathsOf(entries, ({ staged }) => staged),
  };
}

// Changes whenever the files listed, or their diffs, could have: with what git status says, or a
// listed file's content. Not with the config, such as diff.algorithm. git status stops once the
// signal says to.
async function worktreeVersionOf(directory: string, signal: AbortSignal): Promise<string> {
  const status = await statusOf(directory, undefined, signal);
  const sources = await sourcesOf(directory, status, () => true);

  return versionOf(sources);
}

export async function waitForChanges({
  directory,
  version,
  timeout,
}: RpcInput<typeof waitRpc>): Promise<RpcOutput<typeof waitRpc>> {
  const current = await changeFrom(
    directory,
    {
      check: async (stop) => {
        const now = await worktreeVersionOf(directory, stop);

        return now;
      },
      listen: async (changed, failed) => {
        const stop = await watchRepository(directory, process.platform, changed, failed);

        return stop;
      },
    },
    version,
    timeout,
  );

  return { version: current };
}

export async function listChanges({
  directory,
}: RpcInput<typeof changesRpc>): Promise<RpcOutput<typeof changesRpc>> {
  const entries = await readStatus(directory);

  return groupsOf(entries);
}
