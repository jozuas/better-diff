import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useContext, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { SentReview } from "./comments";
import { barShows, reviewLabel, writtenNowhereSaid } from "./feedback";
import { FontSizesContext } from "./fonts";
import type { Rect } from "./menu";
import { oneAtATime } from "./one-at-a-time";
import type { WrittenNowhere } from "./placing";
import { ReviewPanel } from "./review-panel";
import type { ReviewPanelProps } from "./review-panel";
import { TextButton } from "./text-button";

type PanelProps = Omit<ReviewPanelProps, "anchor" | "onClose">;

// The button that opens the review, which says how many comments are pending, and the review, above
// it, until it's closed.
function ReviewButton(props: PanelProps): ReactElement {
  const { comments, theme } = props;
  const button = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect>();

  return (
    <>
      <TextButton
        buttonRef={button}
        label={reviewLabel(comments.length)}
        accessibilityLabel={reviewLabel(comments.length)}
        look="primary"
        disabled={false}
        onPress={() => {
          button.current?.measureInWindow((x, y, width, height) => {
            setAnchor({ x, y, width, height });
          });
        }}
        theme={theme}
      />
      {anchor === undefined ? null : (
        <ReviewPanel
          anchor={anchor}
          onClose={() => {
            setAnchor(undefined);
          }}
          {...props}
        />
      )}
    </>
  );
}

type BarProps = Omit<PanelProps, "sending" | "onSending"> & {
  // The review last sent, while it can be restored, and what restores it.
  restorable: SentReview | undefined;
  onRestore: () => void;
  // What's being written under a line, if anything, while it shows under none, as while its line is
  // changed, and what discards it.
  writtenNowhere: WrittenNowhere | undefined;
  onDiscardWritten: () => void;
};

interface NowhereNoteProps {
  written: WrittenNowhere | undefined;
  onDiscard: () => void;
  theme: PluginTheme;
}

// While what's being written under a line shows under none, what says it's no longer in its diffs,
// and what discards it, as Cancel does: a new comment, or an edit of one saved, which stays pending
// as it was saved.
function NowhereNote({ written, onDiscard, theme }: NowhereNoteProps): ReactElement | null {
  const fonts = useContext(FontSizesContext);

  const style = useMemo(
    () => ({ flex: 1, fontSize: fonts.small, color: theme.colors.foregroundMuted }),
    [theme, fonts],
  );

  if (written === undefined) {
    return null;
  }

  const { note, discard } = writtenNowhereSaid(written);

  return (
    <>
      <Text style={style}>{note}</Text>
      <TextButton
        label={discard}
        accessibilityLabel={discard}
        look="plain"
        disabled={false}
        onPress={onDiscard}
        theme={theme}
      />
    </>
  );
}

// The bar's buttons: while what's being written under a line shows under none, what says so, and
// what discards it, what restores the review last sent, while it can be, and while comments are
// pending, what opens the review of them. The review is sent once at a time, though it's closed and
// opened again while it's sent.
function Bar({
  restorable,
  onRestore,
  writtenNowhere,
  onDiscardWritten,
  ...props
}: BarProps): ReactElement {
  const { comments, theme } = props;
  const [sending, setSending] = useState(false);
  const sends = useMemo(() => oneAtATime(setSending), []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        bar: {
          flexDirection: "row",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderTopWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
        },
      }),
    [theme],
  );

  return (
    <View style={styles.bar}>
      <NowhereNote written={writtenNowhere} onDiscard={onDiscardWritten} theme={theme} />
      {restorable === undefined ? null : (
        <TextButton
          label="Restore sent review"
          accessibilityLabel="Restore sent review"
          look="plain"
          disabled={false}
          onPress={onRestore}
          theme={theme}
        />
      )}
      {comments.length === 0 ? null : (
        <ReviewButton sending={sending} onSending={sends.run} {...props} />
      )}
    </View>
  );
}

// While it has anything, as barShows has it, a bar under the diff whose button, which says how many
// comments are pending, opens the review of them, as GitHub's opens a review being written, whose
// other button restores the review sent, and which says what's being written under a line is no
// longer in its diffs, beside what discards it.
export function ReviewBar(props: BarProps): ReactElement | null {
  return barShows(props) ? <Bar {...props} /> : null;
}
