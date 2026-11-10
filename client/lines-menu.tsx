import type { PluginTheme } from "@getpaseo/plugin";
import { copyText, useToast } from "@getpaseo/plugin/client/ui";
import { useMutation } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useContext, useId, useState } from "react";
import type { StyleProp, ViewProps, ViewStyle } from "react-native";
import { View } from "react-native";

import type { CommentTarget } from "./comments";
import { useContextMenu, useSelecting } from "./keyboard";
import type { Point } from "./menu";
import { Menu } from "./popup";
import { ReviewContext } from "./review-context";
import { SelectionBar } from "./selection-bar";
import type { LetGo } from "./selection-bar";
import { clearSelection, selectedText, useSelectionChanges } from "./text-selection";
import { rectOf } from "./web";

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
  // Undefined where what it was opened on can't be commented on.
  onComment: (() => void) | undefined;
  onCopy: (text: string) => void;
  onClose: () => void;
  theme: PluginTheme;
}

// Starts a comment, where it can, and copies the text selected, while there is some.
function LinesMenu({
  path,
  opened,
  onComment,
  onCopy,
  onClose,
  theme,
}: LinesMenuProps): ReactElement | null {
  if (opened === undefined) {
    return null;
  }

  const { point, text } = opened;

  return (
    <Menu
      label={path}
      point={point}
      sections={[
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

// What the bar a selection of the lines shows was shown with: where the pointer let go of it, the
// text selected then, and what a comment started from it is on, if it can start one.
interface Shown extends LetGo {
  text: string;
  target: CommentTarget | undefined;
}

interface LinesAreaProps extends Pick<ViewProps, "dataSet"> {
  // The path of the file whose lines they are.
  path: string;
  // What a comment started on them is on, if it can be on any: from their menu, `clicked`, or from
  // the bar a selection of them shows. Undefined for lines that can't be commented on.
  commentOn?: ((clicked: boolean) => CommentTarget | undefined) | undefined;
  // The highest the page shows them from, under the bars that stay at the top of the view.
  ceiling: () => number;
  style?: StyleProp<ViewStyle>;
  theme: PluginTheme;
  children: ReactNode;
}

// Lines of a diff, which open the menu of its lines where they're right-clicked, in place of the
// page's own. Its backdrop takes a right click elsewhere, so only one is open at a time. Letting go
// of the pointer once it's selected text in them shows a bar above where it was let go, which goes
// once the selection changes, the pointer's pressed in them again, or either of its buttons is
// pressed. Starting a comment from either clears the selection.
export function LinesArea({
  path,
  commentOn,
  ceiling,
  dataSet,
  style,
  theme,
  children,
}: LinesAreaProps): ReactElement {
  const id = useId();
  const bar = useId();
  const toast = useToast();
  const review = useContext(ReviewContext);
  const [opened, setOpened] = useState<Opened>();
  const [shown, setShown] = useState<Shown>();

  const copy = useMutation({
    mutationFn: copyText,
    onError: (error) => {
      toast.error(error.message);
    },
  });

  useContextMenu(id, (point) => {
    setOpened({ point, text: selectedText(), target: commentOn?.(true) });
  });

  useSelecting(
    id,
    bar,
    () => {
      setShown(undefined);
    },
    (point) => {
      const text = selectedText();

      setShown(
        text === ""
          ? undefined
          : { point, area: rectOf(id), ceiling: ceiling(), text, target: commentOn?.(false) },
      );
    },
  );

  useSelectionChanges(shown !== undefined, () => {
    if (selectedText() !== shown?.text) {
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

  return (
    <View nativeID={id} dataSet={dataSet} style={style}>
      {children}
      {shown === undefined ? null : (
        <SelectionBar
          id={bar}
          at={shown}
          onComment={starter(shown.target)}
          onCopy={() => {
            setShown(undefined);
            copy.mutate(shown.text);
          }}
          theme={theme}
        />
      )}
      <LinesMenu
        path={path}
        opened={opened}
        onComment={starter(opened?.target)}
        onCopy={copy.mutate}
        onClose={() => {
          setOpened(undefined);
        }}
        theme={theme}
      />
    </View>
  );
}
