import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";
import { placedIn, versionsOf } from "./anchors";
import type { Versions } from "./anchors";
import { threadsOf } from "./comments";
import type { Editing, ReviewComment } from "./comments";
import type { CommentedFile } from "./numbering";

type Diff = RpcOutput<typeof diffRpc>;

// The paths of the files the comments are on, and the one being written is, if any, each once.
export function commentedPaths(comments: readonly ReviewComment[], editing?: Editing): string[] {
  const targets = [...comments, ...(editing === undefined ? [] : [editing.target])];

  return [...new Set(targets.map(({ path }) => path))];
}

// The paths kept, while the paths now are the same ones, in whatever order, and else the paths now,
// each of them once in each, so that what's read of their files, and found of it, stays the same
// while they do, as while comments are started and saved on files already commented on.
export function keptPaths(kept: readonly string[], now: readonly string[]): readonly string[] {
  return kept.length === now.length && now.every((path) => kept.includes(path)) ? kept : now;
}

// A file's diff, as read with every line of its version, if it is.
type DiffOf = (file: CommentedFile) => Pick<Diff, "hunks" | "contents"> | undefined;

// The versions of each of the files at the paths that the review numbers lines in, as both its
// diffs, read with every line of their versions, have them, by path, of those whose diffs are both
// read.
export function versionsByPath(
  paths: readonly string[],
  diffOf: DiffOf,
): ReadonlyMap<string, Versions> {
  return new Map(
    paths.flatMap((path): [string, Versions][] => {
      const versions = versionsOf(
        diffOf({ diff: "unstaged", path }),
        diffOf({ diff: "staged", path }),
      );

      return versions === undefined ? [] : [[path, versions]];
    }),
  );
}

// The comments pending on a file on the lines theirs are in its versions, by the key of the line each
// is on.
type Threads = ReadonlyMap<string, readonly ReviewComment[]>;

// What shows under the lines of a file's diffs: the comments pending on the file, as Threads has
// them, and the comment being written on it, if any, on the line its line is, or while the versions
// aren't known, as on the line it was started on.
export interface FileComments {
  threads: Threads;
  editing: Editing | undefined;
}

// What's found of each file, by its path, found once for each, so that it's the same each time it's
// asked for.
function onceEach<Found extends object>(find: (path: string) => Found): (path: string) => Found {
  const found = new Map<string, Found>();

  return (path) => {
    const each = found.get(path) ?? find(path);

    found.set(path, each);

    return each;
  };
}

function editingOn(
  editing: Editing | undefined,
  path: string,
  versions: Versions | undefined,
): Editing | undefined {
  if (editing?.target.path !== path) {
    return undefined;
  }

  const target = versions === undefined ? editing.target : placedIn(editing.target, versions);

  if (target === undefined) {
    return undefined;
  }

  return target === editing.target ? editing : { ...editing, target };
}

// What's being written under a line while it shows under none: a new comment, or an edit of one
// saved, which stays pending as it was saved.
export type WrittenNowhere = "comment" | "edit";

// What's being written under a line, if anything, while it shows under none, as while its line is
// changed or removed, by what shows under the lines of each file's diffs.
export function writtenNowhere(
  editing: Editing | undefined,
  commentsIn: (path: string) => FileComments,
): WrittenNowhere | undefined {
  if (editing?.where !== "line" || commentsIn(editing.target.path).editing !== undefined) {
    return undefined;
  }

  return editing.id === undefined ? "comment" : "edit";
}

// The comments pending on each file, by its path, as Threads has them, as they're placed in the
// versions of their files, by path, found once for each file, so that they're the same each time
// they're asked for, whatever's being written.
export function threadsByPath(
  comments: readonly ReviewComment[],
  versions: ReadonlyMap<string, Versions>,
): (path: string) => Threads {
  return onceEach((path) =>
    threadsOf(
      comments.flatMap((comment) =>
        comment.path === path ? (placedIn(comment, versions.get(path)) ?? []) : [],
      ),
    ),
  );
}

// What shows under the lines of each file's diffs, by its path, of the comments pending, as
// threadsIn has them, and the one being written, as it's placed in the versions of its file, by
// path, found once for each file, so that it's the same each time it's asked for.
export function commentsByPath(
  threadsIn: (path: string) => Threads,
  editing: Editing | undefined,
  versions: ReadonlyMap<string, Versions>,
): (path: string) => FileComments {
  return onceEach((path) => ({
    threads: threadsIn(path),
    editing: editingOn(editing, path, versions.get(path)),
  }));
}
