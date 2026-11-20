import type { PluginWorkspaceRowBadgeItemProps } from "@getpaseo/plugin/client";
import { WorkspaceRowBadge } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useState } from "react";

import { reviewWatchRpc } from "../shared/review";
import { Subscribed } from "./subscribed";
import { badgeLabel } from "./workspace-review";

// On a workspace's row in Paseo's sidebar, how many review comments the workspace has pending,
// while it has any, so that a review isn't left unsent in a workspace that's been left.
export function ReviewBadge({ workspaceId }: PluginWorkspaceRowBadgeItemProps): ReactElement {
  const [count, setCount] = useState(0);

  return (
    <>
      <Subscribed
        contract={reviewWatchRpc}
        input={{ workspace: workspaceId }}
        onEvent={({ review }) => {
          setCount(review.comments.length);
        }}
      />
      {count === 0 ? null : (
        <WorkspaceRowBadge
          icon="MessageSquare"
          label={badgeLabel(count)}
          tone="info"
          accessibilityLabel={`Pending review: ${badgeLabel(count)}`}
        />
      )}
    </>
  );
}
