import type { RpcOutput } from "@getpaseo/plugin";

import { reviewOf } from "../client/attachment";
import type { ReviewAttachment } from "../client/attachment";
import type { CommentTarget } from "../client/comments";
import type { CommentedFile } from "../client/numbering";
import type { diffRpc } from "../shared/diff";
import { reviewed } from "./comments";

type Diff = RpcOutput<typeof diffRpc>;

type Context = ReviewAttachment["comments"][number]["context"];

type Read = Pick<Diff, "hunks" | "review"> & Partial<Pick<Diff, "contents">>;

// A diff that changes nothing, as the file's other diff does unless it's partly staged, read with
// what the review numbers its lines by.
export const unchanged = { hunks: [], review: reviewed };

// The diffs of a file that has changes only on the diff's side, read with what the review numbers
// their lines by.
export function onlyIn(
  diff: Pick<Diff, "hunks"> & Partial<Pick<Diff, "contents">>,
  side: CommentedFile["diff"],
): (each: CommentedFile) => Read {
  return (each: CommentedFile) => (each.diff === side ? { ...diff, review: reviewed } : unchanged);
}

const others = { unstaged: "staged", staged: "unstaged" } as const;

// The file's diffs, each read with what the review numbers its lines by, where it wasn't: the hunks
// of the file's other diff.
export function readWith(
  diffOf: (file: CommentedFile) => (Partial<Read> & Pick<Read, "hunks">) | undefined,
): (file: CommentedFile) => Read | undefined {
  return (file) => {
    const read = diffOf(file);
    const other = diffOf({ ...file, diff: others[file.diff] });

    return read === undefined
      ? undefined
      : { ...read, review: read.review ?? { other: other?.hunks ?? [] } };
  };
}

// What a comment on the target is sent with, as a review of the diff, unstaged or else staged, sends
// it, if the diff has its line, where the file's other diff changes nothing.
export function contextOf(
  diff: Pick<Diff, "hunks">,
  target: CommentTarget,
  side: CommentedFile["diff"] = "unstaged",
): Context | undefined {
  return reviewOf("/repository", [{ ...target, id: 1, body: "" }], onlyIn(diff, side)).attachment
    ?.comments[0]?.context;
}
