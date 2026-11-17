import { expect, test } from "vitest";

import { barShows, discardLabel, reviewLabel, sendLabel, writtenNowhereSaid } from "./feedback";

test("the buttons say how many comments are pending, whether they're being sent, and ask once Discard is pressed", () => {
  expect(reviewLabel(3)).toBe("Review (3)");
  expect(sendLabel(false)).toBe("Send feedback");
  expect(sendLabel(true)).toBe("Sending feedback");
  expect(discardLabel(false)).toBe("Discard review");
  expect(discardLabel(true)).toBe("Confirm discard?");
});

test("the bar under the diff shows while comments are pending, or a review sent can be restored, or what's being written under a line shows under none, and else not", () => {
  const nothing = { comments: [], restorable: undefined, writtenNowhere: undefined };
  const pendingOne = { path: "a.txt", side: "new", line: 1, id: 1, body: "Why?" } as const;

  expect(barShows(nothing)).toBe(false);
  expect(barShows({ ...nothing, comments: [pendingOne] })).toBe(true);
  expect(barShows({ ...nothing, restorable: { comments: [], message: "" } })).toBe(true);
  expect(barShows({ ...nothing, writtenNowhere: "comment" })).toBe(true);
  expect(barShows({ ...nothing, writtenNowhere: "edit" })).toBe(true);
});

test("while what's being written under a line shows under none, the bar says whether it's a new comment or an edit of one saved, and what leaves it says which it discards", () => {
  expect(writtenNowhereSaid("comment")).toStrictEqual({
    note: "The comment being written is no longer in its diffs",
    discard: "Discard comment",
  });
  expect(writtenNowhereSaid("edit")).toStrictEqual({
    note: "The comment being edited is no longer in its diffs",
    discard: "Discard edit",
  });
});
