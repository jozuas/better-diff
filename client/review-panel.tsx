import type { PluginTheme } from "@getpaseo/plugin";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { ScrollView, useToast } from "@getpaseo/plugin/client/ui";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { Dispatch, ReactElement, SetStateAction } from "react";
import { useContext, useId, useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { diffRpc } from "../shared/diff";
import { reviewedDiffs } from "./attachment";
import { unsent } from "./comments";
import type { Recipient, ReviewComment } from "./comments";
import { agentsIn, agentsPage, feedbackTo, messageAfter, recipientOf, sendLabel } from "./feedback";
import type { FeedbackServer } from "./feedback";
import { FontSizesContext } from "./fonts";
import { useContextMenu } from "./keyboard";
import { panelPosition } from "./menu";
import type { Rect } from "./menu";
import { AgentChoice, DiscardReview, MessageBox } from "./review-controls";
import { ReviewFiles } from "./review-files";
import { fileKey, reviewList } from "./review-list";
import { TextButton } from "./text-button";
import { useLatest } from "./web";

// What feedback reaches the daemon with: the host's agents, those active most recently first, the
// diffs of the worktree in the directory, as shown with whitespace changes hidden or not, and an
// agent sent a review, which an agent at work is given in the turn it's taking, without interrupting
// it, as Paseo's own diff sends it by default.
function useFeedbackServer(directory: string, hideWhitespace: boolean): FeedbackServer {
  const paseo = usePaseo();
  const readDiff = useRpc(diffRpc);

  return useMemo(
    () => ({
      listAgents: async (cursor) => {
        const page = await paseo.agents.list({
          page: agentsPage(cursor),
          sort: [{ key: "updated_at", direction: "desc" }],
        });

        return page;
      },
      readDiff: async ({ diff, path }) => {
        const read = await readDiff({ directory, path, side: diff, expand: true, hideWhitespace });

        return read;
      },
      send: async (agent, prompt, review) => {
        await paseo.agents
          .ref(agent)
          .send(prompt, { activeTurnBehavior: "steer", attachments: [review] });
      },
    }),
    [paseo, readDiff, directory, hideWhitespace],
  );
}

// Both diffs of each file the comments are on, by their keys, once they're read, as a file's view
// reads them with their hunks though they would be collapsed, so that what one reads, the other has.
function useCommentedDiffs(
  directory: string,
  hideWhitespace: boolean,
  comments: readonly ReviewComment[],
) {
  const readDiff = useRpc(diffRpc);
  const files = useMemo(() => reviewedDiffs(comments), [comments]);

  const read = useQueries({
    queries: files.map(({ diff, path }) => ({
      queryKey: [directory, "diff", diff, path, true, false, hideWhitespace],
      queryFn: async () => {
        const diffRead = await readDiff({
          directory,
          path,
          side: diff,
          expand: true,
          entire: false,
          hideWhitespace,
        });

        return diffRead;
      },
    })),
  });

  return new Map(files.map((file, at) => [fileKey(file), read[at]?.data]));
}

function useStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(
    () =>
      StyleSheet.create({
        // Over the backdrop, which comes after it so that the modal's focus goes into it.
        panel: {
          position: "absolute",
          zIndex: 1,
          borderWidth: 1,
          borderRadius: 8,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.3)",
        },
        title: {
          paddingHorizontal: 12,
          paddingTop: 10,
          fontSize: fonts.label,
          fontWeight: "700",
          color: theme.colors.foregroundMuted,
        },
        list: { flexShrink: 1 },
        footer: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          padding: 8,
          paddingLeft: 12,
          borderTopWidth: 1,
          borderColor: theme.colors.border,
        },
        spacer: { flex: 1 },
      }),
    [theme, fonts],
  );
}

export interface ReviewPanelProps {
  // The button it's opened from, above which it goes.
  anchor: Rect;
  onClose: () => void;
  // The worktree's, and its workspace's ID, whose agents the comments are sent to.
  directory: string;
  workspace: string;
  // The comments pending, and what changes them.
  comments: readonly ReviewComment[];
  onComments: Dispatch<SetStateAction<readonly ReviewComment[]>>;
  // What they're sent with, and what changes it.
  message: string;
  onMessage: Dispatch<SetStateAction<string>>;
  // Whether diffs are read with whitespace changes hidden.
  hideWhitespace: boolean;
  // The agent chosen to send the review to, if one has been, and what chooses one.
  chosen: string | undefined;
  onChoose: (agent: string) => void;
  // Whether it's being sent, and what sends it, unless it's being sent.
  sending: boolean;
  onSending: (send: () => Promise<void>) => Promise<void>;
  // Opens the comment's file, and shows the comment in it, and whether it can.
  onShow: (comment: ReviewComment) => void;
  canShow: (comment: ReviewComment) => boolean;
  theme: PluginTheme;
}

// Sends the review to the agent chosen, with the message, unless it's being sent already, while the
// review says it's being sent, and says what came of it. The comments sent no longer pend, and once
// some are, the message is empty again, unless it's changed since.
function useSend(
  panel: ReviewPanelProps,
  server: FeedbackServer,
  recipient: Recipient | undefined,
): () => Promise<void> {
  const toast = useToast();
  const latest = useLatest({ ...panel, recipient });

  return async () => {
    const { comments, message, directory, onComments, onMessage, recipient: to } = latest.current;

    if (to === undefined) {
      return;
    }

    await latest.current.onSending(async () => {
      const told = await feedbackTo(server, directory, comments, to, message);

      toast.show(told.message, { variant: told.variant });
      onComments((current) => unsent(current, told.sent));
      onMessage((current) => messageAfter(told, message, current));
    });
  };
}

// The review of the comments pending, over the page above the button it's opened from, until it's
// closed, with Escape or a click outside it: what the agent's asked, the comments under their files,
// each of which shows it in its file's diff, the agent it's sent to, and what sends it, or discards
// it.
export function ReviewPanel(props: ReviewPanelProps): ReactElement {
  const { anchor, onClose, comments, onComments, onMessage, chosen, onChoose, theme } = props;
  const styles = useStyles(theme);
  const window = useWindowDimensions();
  const backdrop = useId();
  const server = useFeedbackServer(props.directory, props.hideWhitespace);
  const diffs = useCommentedDiffs(props.directory, props.hideWhitespace, comments);

  const agents = useQuery({
    queryKey: ["better-diff agents", props.workspace],
    queryFn: async () => {
      const listed = await agentsIn(server, props.workspace);

      return listed;
    },
  });

  const recipient = recipientOf(agents.data ?? [], chosen);
  const send = useSend(props, server, recipient);
  const { sending } = props;

  useContextMenu(backdrop, onClose);

  return (
    <Modal transparent visible onRequestClose={onClose}>
      <View
        role="dialog"
        accessibilityLabel="Review"
        style={[styles.panel, panelPosition(anchor, window, 560)]}
      >
        <Text style={styles.title}>{`REVIEW · ${String(comments.length)} PENDING`}</Text>
        <MessageBox
          message={props.message}
          onMessage={onMessage}
          onSend={() => {
            void send();
          }}
          theme={theme}
        />
        <ScrollView style={styles.list}>
          <ReviewFiles
            files={reviewList(comments, (file) => diffs.get(fileKey(file)))}
            onShow={(comment) => {
              onClose();
              props.onShow(comment);
            }}
            canShow={props.canShow}
            theme={theme}
          />
        </ScrollView>
        <View style={styles.footer}>
          <DiscardReview
            onDiscard={() => {
              onComments([]);
              onMessage("");
            }}
            disabled={sending}
            theme={theme}
          />
          <View style={styles.spacer} />
          <AgentChoice agents={agents} chosen={chosen} onChoose={onChoose} theme={theme} />
          <TextButton
            label={sendLabel(sending)}
            accessibilityLabel={sendLabel(sending)}
            look="primary"
            disabled={sending || recipient === undefined}
            onPress={() => {
              void send();
            }}
            theme={theme}
          />
        </View>
      </View>
      <Pressable
        nativeID={backdrop}
        accessibilityRole="button"
        accessibilityLabel="Close review"
        focusable={false}
        style={StyleSheet.absoluteFill}
        onPress={onClose}
      />
    </Modal>
  );
}
