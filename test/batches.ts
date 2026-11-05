import { groupsOf, readStatus } from "../server/changes";
import type { Entry } from "../server/changes";
import { changesIn } from "../server/file-changes";
import type { Changes, Side } from "../server/file-changes";

export type Group = "modified" | "untracked" | "staged";

// Each of the group's files, with the entries git status lists it in, as a group's are read.
export async function listingsOf(repository: string, group: Group): Promise<Map<string, Entry[]>> {
  const entries = await readStatus(repository);

  return new Map(
    groupsOf(entries)[group].map((path) => [path, entries.filter((entry) => entry.path === path)]),
  );
}

// Each file's changes, as its own diff reads them.
export async function eachOnItsOwn(
  repository: string,
  listings: ReadonlyMap<string, readonly Entry[]>,
  side: Side,
  paths: readonly string[],
  hideWhitespace?: boolean,
): Promise<Map<string, Changes>> {
  const changes = await Promise.all(
    paths.map(async (path) => {
      const read = await changesIn(
        repository,
        listings.get(path) ?? [],
        path,
        side,
        hideWhitespace,
      );

      return [path, read] as const;
    }),
  );

  return new Map(changes);
}
