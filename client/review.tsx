import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginTab } from "@getpaseo/plugin/client";
import type { Dispatch, ReactElement, ReactNode, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";

import { saved, threadsOf, without } from "./comments";
import type { Editing, ReviewComment } from "./comments";
import type { GroupName, OpenFile } from "./groups";
import { ReviewBar } from "./review-bar";
import { ReviewContext } from "./review-context";
import type { Review, Revealing } from "./review-context";
import { openFileOf } from "./review-list";
import { useLatest } from "./web";

// How many milliseconds a comment shown stands out for.
const revealedFor = 3000;

interface ReviewProviderProps {
  // The worktree's, and its workspace's ID, whose agents the comments are sent to.
  directory: string;
  workspace: string;
  // Those pending, and what changes them.
  comments: readonly ReviewComment[];
  onComments: Dispatch<SetStateAction<readonly ReviewComment[]>>;
  // What they're to be sent with, and what changes it.
  message: string;
  onMessage: Dispatch<SetStateAction<string>>;
  // The files each group lists, once they're listed, and what opens one.
  listed: Readonly<Record<GroupName, readonly string[]>> | undefined;
  onOpen: (file: OpenFile) => void;
  // Whether diffs are read with whitespace changes hidden.
  hideWhitespace: boolean;
  tab: PluginTab;
  theme: PluginTheme;
  // The diffs commented on.
  children: ReactNode;
}

// Has the diffs in it comment on their lines, one comment being written at a time: starting another
// leaves the one being written. Under them, while comments are pending, a bar opens the review of
// them, which sends them to an agent, and shows any of them in its file's diff, where it stands out
// for a moment. While any are
// pending, the tab shows it has unsaved work, and asks before it's closed.
export function ReviewProvider({
  comments,
  onComments,
  listed,
  onOpen,
  tab,
  children,
  ...bar
}: ReviewProviderProps): ReactElement {
  const [editing, setEditing] = useState<Editing>();
  const written = useRef("");
  const [revealing, setRevealing] = useState<Revealing>();
  const latest = useLatest({ tab, listed, onOpen });
  const pending = comments.length > 0;
  const threads = useMemo(() => threadsOf(comments), [comments]);

  useEffect(() => {
    latest.current.tab.setModified(pending);
  }, [latest, pending]);

  const review = useMemo<Review>(
    () => ({
      threads,
      editing,
      revealing,
      onStart: (target) => {
        written.current = "";
        setEditing({ target, id: undefined, where: "line" });
      },
      onEdit: (comment, where) => {
        written.current = comment.body;
        setEditing({ target: comment, id: comment.id, where });
      },
      written: () => written.current,
      onWrite: (text) => {
        written.current = text;
      },
      onCancel: () => {
        setEditing(undefined);
      },
      onSave: (text) => {
        setEditing(undefined);
        onComments((current) => (editing === undefined ? current : saved(current, editing, text)));
      },
      onDelete: (id) => {
        onComments((current) => without(current, id));
      },
    }),
    [threads, editing, revealing, onComments],
  );

  // Opens the file the comment is on, if a group lists it, and has its diff show the comment.
  function onShow(comment: ReviewComment): void {
    const file = openFileOf(
      comment,
      latest.current.listed ?? { modified: [], untracked: [], staged: [] },
    );

    if (file !== undefined) {
      const asked = { id: comment.id };

      latest.current.onOpen(file);
      setRevealing(asked);
      setTimeout(() => {
        setRevealing((current) => (current === asked ? undefined : current));
      }, revealedFor);
    }
  }

  return (
    <ReviewContext value={review}>
      <View style={{ flex: 1 }}>{children}</View>
      <ReviewBar
        comments={comments}
        onComments={onComments}
        onShow={onShow}
        canShow={(comment) => listed !== undefined && openFileOf(comment, listed) !== undefined}
        {...bar}
      />
    </ReviewContext>
  );
}
