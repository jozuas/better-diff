import type { Dispatch, ReactElement, SetStateAction } from "react";
import { useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import type { ReviewComment } from "./comments";
import { reviewLabel } from "./feedback";
import type { Rect } from "./menu";
import { oneAtATime } from "./one-at-a-time";
import { ReviewPanel } from "./review-panel";
import type { ReviewPanelProps } from "./review-panel";
import { TextButton } from "./text-button";

type BarProps = Omit<
  ReviewPanelProps,
  "anchor" | "onClose" | "chosen" | "onChoose" | "sending" | "onSending"
>;

interface OpenPanelProps extends BarProps {
  // The button it's opened from, while it's open.
  anchor: Rect | undefined;
  onClose: () => void;
  chosen: string | undefined;
  onChoose: (agent: string) => void;
  sending: boolean;
  onSending: (send: () => Promise<void>) => Promise<void>;
}

function OpenPanel({ anchor, ...panel }: OpenPanelProps): ReactElement | null {
  return anchor === undefined ? null : <ReviewPanel anchor={anchor} {...panel} />;
}

// The bar's button, and the review it opens, above it, until it's closed. The agent chosen in it
// stays chosen while the bar shows, and the review is sent once at a time, though it's closed and
// opened again while it's sent.
function Bar(props: BarProps): ReactElement {
  const { comments, theme } = props;
  const button = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect>();
  const [chosen, setChosen] = useState<string>();
  const [sending, setSending] = useState(false);
  const sends = useMemo(() => oneAtATime(setSending), []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        bar: {
          flexDirection: "row",
          justifyContent: "flex-end",
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
      <OpenPanel
        anchor={anchor}
        onClose={() => {
          setAnchor(undefined);
        }}
        chosen={chosen}
        onChoose={setChosen}
        sending={sending}
        onSending={sends.run}
        {...props}
      />
    </View>
  );
}

interface ReviewBarProps extends BarProps {
  comments: readonly ReviewComment[];
  onComments: Dispatch<SetStateAction<readonly ReviewComment[]>>;
}

// While comments are pending, a bar under the diff whose button, which says how many, opens the
// review of them, as GitHub's opens a review being written.
export function ReviewBar(props: ReviewBarProps): ReactElement | null {
  return props.comments.length === 0 ? null : <Bar {...props} />;
}
