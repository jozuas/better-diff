import type { Dispatch, ReactElement, SetStateAction } from "react";
import { useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { ReviewComment, SentReview } from "./comments";
import { reviewLabel } from "./feedback";
import type { Rect } from "./menu";
import { oneAtATime } from "./one-at-a-time";
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
};

// The bar's buttons: what restores the review last sent, while it can be, and while comments are
// pending, what opens the review of them. The review is sent once at a time, though it's closed and
// opened again while it's sent.
function Bar({ restorable, onRestore, ...props }: BarProps): ReactElement {
  const { comments, theme } = props;
  const [sending, setSending] = useState(false);
  const sends = useMemo(() => oneAtATime(setSending), []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        bar: {
          flexDirection: "row",
          justifyContent: "flex-end",
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

interface ReviewBarProps extends BarProps {
  comments: readonly ReviewComment[];
  onComments: Dispatch<SetStateAction<readonly ReviewComment[]>>;
}

// While comments are pending, or a review sent can be restored, a bar under the diff whose button,
// which says how many are pending, opens the review of them, as GitHub's opens a review being
// written, and whose other button restores the review sent.
export function ReviewBar(props: ReviewBarProps): ReactElement | null {
  return props.comments.length === 0 && props.restorable === undefined ? null : <Bar {...props} />;
}
