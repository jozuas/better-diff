import type { PluginTheme } from "@getpaseo/plugin";
import { copyText, useToast } from "@getpaseo/plugin/client/ui";
import { useMutation } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { StyleProp, ViewProps, ViewStyle } from "react-native";
import { View } from "react-native";

import type { Controls, IconAction } from "./actions";
import { BarHostContext, nextTicket } from "./bar-layer";
import type { CommentTarget } from "./comments";
import { useContextMenu, useSelecting } from "./keyboard";
import type { LetGo, Point } from "./menu";
import { actionItems } from "./menu-items";
import { Menu } from "./popup";
import { ReviewContext } from "./review-context";
import type { Bar } from "./shortcuts";
import {
  clearSelection,
  selectedText,
  selectionMark,
  stillMarked,
  useSelectionChanges,
} from "./text-selection";
import type { SelectionMark } from "./text-selection";
import { rectOf, useLatest } from "./web";

// Where the menu was opened, the text selected then, which pressing its item can unselect, and what
// a comment started from it is on, if it can start one.
interface Opened {
  point: Point;
  text: string;
  target: CommentTarget | undefined;
}

interface LinesMenuProps {
  // The path of the file whose lines it's of, which names it.
  path: string;
  // Undefined while it's closed.
  opened: Opened | undefined;
  // The selected lines' actions, while lines of the hunk are selected.
  lines: Bar<IconAction> | undefined;
  // Undefined where what it was opened on can't be commented on.
  onComment: (() => void) | undefined;
  onCopy: (text: string) => void;
  onClose: () => void;
  controls: Controls;
  theme: PluginTheme;
}

// Runs the selected lines' actions, while lines of the hunk are selected, as the bar over them
// does, and then, after a line, starts a comment, where it can, and copies the text selected, while
// there is some.
function LinesMenu({
  path,
  opened,
  lines,
  onComment,
  onCopy,
  onClose,
  controls,
  theme,
}: LinesMenuProps): ReactElement | null {
  // Only arming a button or disarming it renders it again.
  const armed = useSyncExternalStore(controls.subscribe, () => controls.state().armed);

  if (opened === undefined) {
    return null;
  }

  const { point, text } = opened;

  return (
    <Menu
      label={path}
      point={point}
      sections={[
        actionItems(lines, armed, controls),
        [
          {
            label: "Comment",
            icon: "MessageCircle",
            disabled: onComment === undefined,
            // Once the menu has closed, and given focus back to what had it, so that the box the
            // comment is written in takes it.
            onPress: () => {
              setTimeout(() => {
                onComment?.();
              }, 0);
            },
          },
          {
            label: "Copy",
            icon: "Copy",
            disabled: text === "",
            onPress: () => {
              onCopy(text);
            },
          },
        ],
      ]}
      onClose={onClose}
      theme={theme}
    />
  );
}

// What the bar a selection of the lines shows was shown with: where it shows from, the selection
// then, what a comment started from it is on, if it can start one, and the ticket the lines asked
// to show it with.
interface Shown extends LetGo {
  mark: SelectionMark;
  target: CommentTarget | undefined;
  ticket: number;
}

interface LinesAreaProps extends Pick<ViewProps, "dataSet"> {
  // The path of the file whose lines they are.
  path: string;
  // What a comment started on them is on, if it can be on any: from their menu, `clicked`, or from
  // the bar a selection of them shows.
  commentOn: (clicked: boolean) => CommentTarget | undefined;
  // The selected lines' actions, while lines of their hunk are selected.
  lines?: Bar<IconAction> | undefined;
  // Subscribes to requests to show the bar over their selected lines, from a point, centred on it
  // or starting at it. Undefined for lines outside the hunks, which none asks.
  onRequest?: ((show: (point: Point, centred: boolean) => void) => () => void) | undefined;
  // Shows the bar over a selection the pointer let go of in them, in the hunk whose lines it has, if
  // that's another's, and says whether it did.
  passOn: (point: Point) => boolean;
  // The highest the page shows them from, under the bars that stay at the top of the view.
  ceiling: () => number;
  controls: Controls;
  style?: StyleProp<ViewStyle>;
  theme: PluginTheme;
  children: ReactNode;
}

// Lines of a diff, which open the menu of its lines where they're right-clicked, in place of the
// page's own. Its backdrop takes a right click elsewhere, so only one is open at a time. Letting go
// of the pointer once it's selected text in them shows a bar above where it was let go, in the
// view's layer for it, or over the hunk whose lines it selected, if that's another's, and the
// keyboard selecting their lines shows it above the line the selection reaches. It goes once the
// selection changes, but as the keyboard moves it, which moves the bar along, once the pointer's
// pressed in them again, or once Comment is pressed. Starting a comment from either clears the
// selection.
export function LinesArea({
  path,
  commentOn,
  lines,
  onRequest,
  passOn,
  ceiling,
  controls,
  dataSet,
  style,
  theme,
  children,
}: LinesAreaProps): ReactElement {
  const id = useId();
  const toast = useToast();
  const review = useContext(ReviewContext);
  const host = useContext(BarHostContext);
  const [opened, setOpened] = useState<Opened>();
  const [shown, setShown] = useState<Shown>();

  const copy = useMutation({
    mutationFn: copyText,
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Shows the bar for the selection there is now, if there is one, from the point.
  const showAt = useLatest((point: Point, centred: boolean) => {
    const mark = selectionMark();

    setShown(
      mark === undefined
        ? undefined
        : {
            point,
            area: rectOf(id),
            origin: rectOf(host?.id),
            ceiling: ceiling(),
            centred,
            mark,
            target: commentOn(false),
            ticket: nextTicket(),
          },
    );
  });

  useContextMenu(id, (point) => {
    setOpened({ point, text: selectedText(), target: commentOn(true) });
  });

  useSelecting(
    id,
    () => {
      setShown(undefined);
    },
    (point) => {
      if (!passOn(point)) {
        showAt.current(point, true);
      }
    },
  );

  useEffect(
    () =>
      onRequest?.((point, centred) => {
        showAt.current(point, centred);
      }),
    [onRequest, showAt],
  );

  useSelectionChanges(shown !== undefined, () => {
    if (shown !== undefined && !stillMarked(shown.mark)) {
      setShown(undefined);
    }
  });

  // What starts a comment on the target, if there is one, in a view that reviews.
  function starter(target: CommentTarget | undefined): (() => void) | undefined {
    return review === undefined || target === undefined
      ? undefined
      : () => {
          setShown(undefined);
          clearSelection();
          review.onStart(target);
        };
  }

  // Each time they render, the bar shows as they render it, until it doesn't.
  useLayoutEffect(() => {
    if (shown === undefined || host === undefined) {
      return () => {};
    }

    host.layer.show(shown.ticket, {
      at: shown,
      lines,
      onComment: starter(shown.target),
      onCopy: () => {
        copy.mutate(shown.mark.text);
      },
      controls,
    });

    return () => {
      host.layer.hide(shown.ticket);
    };
  });

  return (
    <View nativeID={id} dataSet={dataSet} style={style}>
      {children}
      <LinesMenu
        path={path}
        opened={opened}
        lines={lines}
        onComment={starter(opened?.target)}
        onCopy={copy.mutate}
        onClose={() => {
          setOpened(undefined);
        }}
        controls={controls}
        theme={theme}
      />
    </View>
  );
}
