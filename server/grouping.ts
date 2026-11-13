import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import type { changesRpc } from "../shared/changes";
import type { RepositoryKind, diffRpc, groupRpc } from "../shared/diff";
import type { Entry } from "./changes";

type Side = RpcInput<typeof diffRpc>["side"];

type Group = RpcInput<typeof groupRpc>["group"];

// The diff each group's files are shown with.
export const groupSides: Record<Group, Side> = {
  modified: "unstaged",
  untracked: "unstaged",
  staged: "staged",
};

// Whether an entry lists its file in each group.
const listedIn: Record<Group, (entry: Entry) => boolean> = {
  modified: ({ modified }) => modified,
  untracked: ({ untracked, modified }) => untracked && !modified,
  staged: ({ staged }) => staged,
};

function pathsIn(entries: readonly Entry[], group: Group): string[] {
  return entries.flatMap((entry) => (listedIn[group](entry) ? [entry.path] : []));
}

export function groupsOf(
  entries: readonly Entry[],
): Omit<RpcOutput<typeof changesRpc>, "repositories" | "version"> {
  return {
    modified: pathsIn(entries, "modified"),
    untracked: pathsIn(entries, "untracked"),
    staged: pathsIn(entries, "staged"),
  };
}

// What the entry's diff on the side is of, where it's a submodule, or a repository inside the
// worktree: in the index, a submodule's is of its commit.
export function repositoryOn({ repository }: Entry, side: Side): RepositoryKind | undefined {
  return side === "staged" && repository === "submodule files" ? "submodule" : repository;
}

// The group's files that are submodules, or repositories inside the worktree, with what their diffs
// on its side are of.
function repositoriesIn(entries: readonly Entry[], group: Group): [string, RepositoryKind][] {
  return entries.flatMap((entry) => {
    const kind = repositoryOn(entry, groupSides[group]);

    return listedIn[group](entry) && kind !== undefined ? [[entry.path, kind]] : [];
  });
}

export function repositoriesOf(
  entries: readonly Entry[],
): RpcOutput<typeof changesRpc>["repositories"] {
  return {
    modified: repositoriesIn(entries, "modified"),
    untracked: repositoriesIn(entries, "untracked"),
    staged: repositoriesIn(entries, "staged"),
  };
}
