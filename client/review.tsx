import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { PluginTab } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { useQueries } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { Dispatch, ReactElement, ReactNode, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";

import { diffRpc } from "../shared/diff";
import { bothDiffs } from "./attachment";
import { restoredComments, restoredMessage, saved, threadsOf, without } from "./comments";
import type { Editing, ReviewComment, SentReview } from "./comments";
import type { GroupName, OpenFile } from "./groups";
import { fileKey, numberings } from "./numbering";
import type { CommentedFile } from "./numbering";
import { ReviewBar } from "./review-bar";
import { ReviewContext } from "./review-context";
import type { Review, Revealing } from "./review-context";
import { openFileOf, partlyStaged } from "./review-list";
import { useLatest } from "./web";

type Diff = RpcOutput<typeof diffRpc>;

type Listed = Readonly<Record<GroupName, readonly string[]>>;

// Both diffs of each file the comments are on, with every line of the file, as the unchanged lines
// around the hunks can be commented on, and of each file partly staged, whose diffs number each
// other's lines, once they're read, as a file's view reads them with their hunks though they'd be
// collapsed, so that what one reads, the other has. The same while what's read is.
function useReviewedDiffs(
  directory: string,
  hideWhitespace: boolean,
  comments: readonly ReviewComment[],
  listed: Listed | undefined,
) {
  const readDiff = useRpc(diffRpc);
  const partly = useMemo(() => (listed === undefined ? undefined : partlyStaged(listed)), [listed]);

  const files = useMemo(() => {
    const commented = new Set(comments.map(({ path }) => path));

    return bothDiffs([...commented, ...(partly ?? [])]).map(({ diff, path }) => ({
      diff,
      path,
      entire: commented.has(path),
    }));
  }, [comments, partly]);

  const combine = useCallback(
    (results: UseQueryResult<Diff>[]) => results.map(({ data }) => data),
    [],
  );

  const read = useQueries({
    queries: files.map(({ diff, path, entire }) => ({
      queryKey: [directory, "diff", diff, path, true, entire, hideWhitespace],
      queryFn: async () => {
        const diffRead = await readDiff({
          directory,
          path,
          side: diff,
          expand: true,
          entire,
          hideWhitespace,
        });

        return diffRead;
      },
    })),
    combine,
  });

  return useMemo(() => {
    const diffs = new Map(files.map((file, at) => [fileKey(file), read[at]]));

    function diffOf(file: CommentedFile): Diff | undefined {
      return diffs.get(fileKey(file));
    }

    return { diffOf, numbering: numberings(partly, diffOf) };
  }, [files, read, partly]);
}

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
  listed: Listed | undefined;
  onOpen: (file: OpenFile) => void;
  // Whether diffs are read with whitespace changes hidden.
  hideWhitespace: boolean;
  tab: PluginTab;
  theme: PluginTheme;
  // The diffs commented on.
  children: ReactNode;
}

// Has the diffs in it comment on their lines, one comment being written at a time: starting another
// leaves the one being written. A comment's line is numbered as the review the agent reads numbers
// it, so it shows in whichever of its file's diffs has it. Under them, while comments are pending, a
// bar opens the review of them, which sends them to an agent, and shows any of them in the diff that
// has its line, where it stands out for a moment. Once a review's sent, until another comment's
// started, the bar restores it, its comments pending again, as for sending it to another agent.
// While any are pending, the tab shows it has unsaved work, and asks before it's closed.
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
  const [restorable, setRestorable] = useState<SentReview>();
  const written = useRef("");
  const [revealing, setRevealing] = useState<Revealing>();
  const latest = useLatest({ tab, listed, onOpen });
  const pending = comments.length > 0;
  const threads = useMemo(() => threadsOf(comments), [comments]);
  const reviewed = useReviewedDiffs(bar.directory, bar.hideWhitespace, comments, listed);

  useEffect(() => {
    latest.current.tab.setModified(pending);
  }, [latest, pending]);

  const review = useMemo<Review>(
    () => ({
      numbering: reviewed.numbering,
      threads,
      editing,
      revealing,
      onStart: (target) => {
        written.current = "";
        setEditing({ target, id: undefined, where: "line" });
        setRestorable(undefined);
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
    [reviewed.numbering, threads, editing, revealing, onComments],
  );

  // Opens the file's diff that has the comment's line, if a group lists it, and has it show the
  // comment.
  function onShow(comment: ReviewComment, shown: CommentedFile): void {
    const file = openFileOf(
      shown,
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
        restorable={restorable}
        onRestore={() => {
          if (restorable !== undefined) {
            onComments((current) => restoredComments(current, restorable));
            bar.onMessage((current) => restoredMessage(current, restorable));
            setRestorable(undefined);
          }
        }}
        onSent={setRestorable}
        diffOf={reviewed.diffOf}
        onShow={onShow}
        canShow={(file) => listed !== undefined && openFileOf(file, listed) !== undefined}
        {...bar}
      />
    </ReviewContext>
  );
}
