import type { PluginTab } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/ui";
import type { ReactNode } from "react";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { reviewChangeRpc, reviewWatchRpc } from "../shared/review";
import { Subscribed } from "./subscribed";
import { useLatest } from "./web";
import { reviewingThrough } from "./workspace-review";
import type { ReviewState } from "./workspace-review";

interface KeptReviewProps {
  workspace: string;
  tab: PluginTab;
  // What shows the review.
  children: (review: ReviewState) => ReactNode;
}

const notSaved = "The review isn't saved on the workspace yet. Better Diff will keep trying.";

// The review comments pending on the workspace, and the message they're to be sent with, with what
// changes them, as the plugin's server keeps them on the workspace, so that they stay once the tab
// closes or Paseo reloads, and show in its other tabs, and on the host's other clients.
export function KeptReview({ workspace, tab, children }: KeptReviewProps): ReactNode {
  const toast = useToast();
  const change = useRpc(reviewChangeRpc);

  const latest = useLatest({
    change,
    failed: () => {
      toast.error(notSaved);
    },
    tab,
  });

  const review = useMemo(() => reviewingThrough(workspace, latest), [workspace, latest]);
  const shown = useSyncExternalStore(review.subscribe, review.value);

  // The same until the review is another, so that what shows the review's comments isn't rendered
  // again for what changes nothing of them.
  const state = useMemo(
    (): ReviewState => ({
      comments: shown.comments,
      message: shown.message,
      onChange: (...changes) => {
        void review.change(...changes);
      },
    }),
    [shown, review],
  );

  // A tab showed unsaved work while it kept comments, before reviews were kept on the workspace,
  // and Paseo goes on showing it, though Better Diff is updated, until it's told it has none.
  useEffect(() => {
    latest.current.tab.setModified(false);
  }, [latest]);

  return (
    <>
      <Subscribed
        contract={reviewWatchRpc}
        input={{ workspace, writer: review.writer }}
        onEvent={review.told}
      />
      {children(state)}
    </>
  );
}
