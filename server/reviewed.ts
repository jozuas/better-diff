import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";
import { readStatus } from "./changes";
import { changesIn } from "./file-changes";
import type { Changes, Side } from "./file-changes";
import { indexChanged, otherChanges, reviewIn } from "./review";
import { untilUnchanged } from "./tries";

type Review = NonNullable<RpcOutput<typeof diffRpc>["review"]>;

// The file's changes on the side, as git status lists it, and how the review numbers their lines,
// by its changes on the other, read again while they're read of other lines of the index, as
// untilUnchanged reads them.
export async function reviewedChanges(
  directory: string,
  path: string,
  side: Side,
  hideWhitespace: boolean | undefined,
): Promise<{ own: Changes; review: Review | undefined }> {
  const reviewed = await untilUnchanged(async () => {
    const entries = await readStatus(directory);
    const listed = entries.filter((entry) => entry.path === path);

    const [own, other] = await Promise.all([
      changesIn(directory, listed, path, side, hideWhitespace),
      otherChanges(directory, listed, path, side, hideWhitespace),
    ]);

    return {
      own,
      review: reviewIn(side, listed, own, other),
      changed: indexChanged(side, listed, own, other),
    };
  });

  return reviewed;
}
