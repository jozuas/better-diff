import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { ScrollView, useToast } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { Dispatch, ReactElement, SetStateAction } from "react";
import { useContext, useId, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { diffRpc } from "../shared/diff";
import { unsent } from "./comments";
import type { ReviewComment, SentReview } from "./comments";
import { agentsIn, agentsPage, canSendTo, configOf, feedbackTo, messageAfter } from "./feedback";
import type { Agents, Destination, FeedbackServer } from "./feedback";
import { FontSizesContext } from "./fonts";
import { useContextMenu } from "./keyboard";
import { panelPosition } from "./menu";
import type { Rect } from "./menu";
import type { CommentedFile } from "./numbering";
import { DiscardReview, MessageBox, SendFeedback } from "./review-controls";
import type { AgentChoice, AgentsShown } from "./review-controls";
import { ReviewFiles } from "./review-files";
import { reviewList } from "./review-list";
import { useLatest } from "./web";

type Diff = RpcOutput<typeof diffRpc>;

// What feedback reaches the daemon with: the host's agents, those active most recently first, the
// diffs of the worktree in the directory, with every line of their files, as the unchanged lines
// around the hunks can be commented on, as shown with whitespace changes hidden or not, an agent
// sent a review, which an agent at work is given in the turn it's taking, without interrupting it,
// as Paseo's own diff sends it by default, and a new agent in the workspace, which starts with it.
function useFeedbackServer(
  directory: string,
  workspace: string,
  hideWhitespace: boolean,
): FeedbackServer {
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
        const read = await readDiff({
          directory,
          path,
          side: diff,
          expand: true,
          entire: true,
          hideWhitespace,
        });

        return read;
      },
      send: async (agent, prompt, review) => {
        await paseo.agents
          .ref(agent)
          .send(prompt, { activeTurnBehavior: "steer", attachments: [review] });
      },
      start: async (template, prompt, review) => {
        await paseo.workspaces
          .ref(workspace)
          .agents.create({ config: configOf(template), prompt, attachments: [review] });
      },
    }),
    [paseo, readDiff, directory, workspace, hideWhitespace],
  );
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
  // Whether it's being sent, and what sends it, unless it's being sent.
  sending: boolean;
  onSending: (send: () => Promise<void>) => Promise<void>;
  // Keeps the review sent, once some of its comments have been, so it can be restored.
  onSent: (sent: SentReview) => void;
  // Both diffs of each file comments are on, as read now, if they are.
  diffOf: (file: CommentedFile) => Diff | undefined;
  // Opens the file's diff, and shows the comment in it, and whether it can open it.
  onShow: (comment: ReviewComment, file: CommentedFile) => void;
  canShow: (file: CommentedFile) => boolean;
  theme: PluginTheme;
}

// Sends the review to the agent chosen, with the message, unless it's being sent already, while the
// review says it's being sent, and says what came of it. The comments sent no longer pend, and once
// some are, the message is empty again, unless it's changed since, and the review sent is kept.
function useSend(
  panel: ReviewPanelProps,
  server: FeedbackServer,
): (to: Destination) => Promise<void> {
  const toast = useToast();
  const latest = useLatest(panel);

  return async (to) => {
    const { comments, message, directory, onComments, onMessage } = latest.current;

    await latest.current.onSending(async () => {
      const told = await feedbackTo(server, directory, comments, to, message);

      toast.show(told.message, { variant: told.variant });
      onComments((current) => unsent(current, told.sent));
      onMessage((current) => messageAfter(told, message, current));

      if (told.sent.length > 0) {
        latest.current.onSent({ comments: told.sent, message });
      }
    });
  };
}

// The menu of agents Send feedback opens, which lists them again first, so that it says which are at
// work now, unless the review can't be sent.
function useAgentChoice(agents: UseQueryResult<Agents>, sending: boolean): AgentChoice {
  const button = useRef<View>(null);
  const [shown, setShown] = useState<AgentsShown>();
  const unsendable = sending || !canSendTo(agents.data);

  // Opens the menu above Send feedback, its right edge at the button's, while it has an agent to
  // send to.
  function open(listed: Agents | undefined): void {
    if (canSendTo(listed)) {
      button.current?.measureInWindow((x, y, width) => {
        setShown({ point: { x: x + width, y }, agents: listed, now: Date.now() });
      });
    }
  }

  async function choose(): Promise<void> {
    if (unsendable) {
      return;
    }

    const { data } = await agents.refetch();

    open(data);
  }

  return {
    button,
    shown,
    unsendable,
    choose,
    close: () => {
      setShown(undefined);
    },
  };
}

// The review of the comments pending, over the page above the button it's opened from, until it's
// closed, with Escape or a click outside it: what the agent's asked, the comments under their files,
// each of which shows it in its file's diff, and what sends it, to an agent chosen from those in the
// workspace as they are then, or discards it.
export function ReviewPanel(props: ReviewPanelProps): ReactElement {
  const { anchor, onClose, comments, onComments, onMessage, theme } = props;
  const styles = useStyles(theme);
  const window = useWindowDimensions();
  const backdrop = useId();
  const server = useFeedbackServer(props.directory, props.workspace, props.hideWhitespace);

  const agents = useQuery({
    queryKey: ["better-diff agents", props.workspace],
    queryFn: async () => {
      const listed = await agentsIn(server, props.workspace);

      return listed;
    },
  });

  const send = useSend(props, server);
  const { sending } = props;
  const choice = useAgentChoice(agents, sending);

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
            void choice.choose();
          }}
          theme={theme}
        />
        <ScrollView style={styles.list}>
          <ReviewFiles
            files={reviewList(comments, props.diffOf)}
            onShow={(comment, file) => {
              onClose();
              props.onShow(comment, file);
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
          <SendFeedback
            agents={agents}
            choice={choice}
            sending={sending}
            onSend={(to) => {
              void send(to);
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
