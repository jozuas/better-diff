import type { RpcOutput } from "@getpaseo/plugin";

import { reviewOf } from "../client/attachment";
import type { ReviewAttachment } from "../client/attachment";
import type { CommentTarget } from "../client/comments";
import type { CommentedFile } from "../client/numbering";
import type { diffRpc } from "../shared/diff";

type Diff = RpcOutput<typeof diffRpc>;

type Context = ReviewAttachment["comments"][number]["context"];

// A diff that changes nothing, as the file's other diff does unless it's partly staged.
export const unchanged = { hunks: [] };

// The diffs of a file that has changes only on the diff's side.
export function onlyIn(
  diff: Pick<Diff, "hunks">,
  side: CommentedFile["diff"],
): (each: CommentedFile) => Pick<Diff, "hunks"> {
  return (each: CommentedFile) => (each.diff === side ? diff : unchanged);
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
