import type { PluginTheme } from "@getpaseo/plugin";
import { TextInput } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useContext, useId, useLayoutEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { bodyOf, editorKey, editorKeyUp } from "./comments";
import type { Editing, ReviewComment, Thread } from "./comments";
import { FontSizesContext } from "./fonts";
import { IconButton } from "./icon-button";
import { commentsMark, useKeyUp, useKeys, usePageMenu } from "./keyboard";
import { ReviewContext } from "./review-context";
import type { Review } from "./review-context";
import { TextButton } from "./text-button";
import { scrollIntoView } from "./web";

function useStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(
    () =>
      StyleSheet.create({
        // Under the line, from where its text starts.
        thread: { gap: 6, maxWidth: 760, paddingTop: 4, paddingBottom: 8, paddingRight: 12 },
        box: {
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderWidth: 1,
          borderRadius: 6,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
        },
        // The box, rather than the input in it, shows it has focus.
        focused: { borderColor: theme.colors.accent },
        header: { flexDirection: "row", alignItems: "center", gap: 4 },
        // As GitHub marks a comment of a review not yet submitted.
        pending: {
          marginRight: "auto",
          paddingHorizontal: 6,
          borderWidth: 1,
          borderRadius: 8,
          borderColor: theme.colors.statusWarning,
          fontSize: fonts.label,
          fontWeight: "600",
          color: theme.colors.statusWarning,
        },
        body: { fontSize: fonts.text, color: theme.colors.foreground },
        input: {
          minHeight: Math.round(3.5 * fonts.text),
          padding: 0,
          fontSize: fonts.text,
          color: theme.colors.foreground,
          outlineWidth: 0,
        },
        buttons: { flexDirection: "row", justifyContent: "flex-end", gap: 6 },
      }),
    [theme, fonts],
  );
}

type Styles = ReturnType<typeof useStyles>;

interface CommentEditorProps {
  review: Review;
  theme: PluginTheme;
}

// Where a comment is written, with focus once it shows, as in Paseo's own diff: Comment, or Cmd or
// Ctrl with Enter, saves it, unless it's only whitespace, and Cancel, or Escape, leaves it. It starts
// with what's written of the comment, which is what the comment edited says, or nothing for a new
// one, until something else is written.
export function CommentEditor({ review, theme }: CommentEditorProps): ReactElement {
  const styles = useStyles(theme);
  const [text, setText] = useState(review.written);
  const [focused, setFocused] = useState(false);
  const id = useId();
  const saveable = bodyOf(text) !== undefined;

  useKeys(id, (event) => {
    if (editorKey(event) !== "save") {
      return false;
    }

    if (saveable) {
      review.onSave(text);
    }

    return true;
  });

  // Kept from the review the comment may be edited in, which closes once Escape is released.
  useKeyUp(id, (event) => {
    if (editorKeyUp(event) === "cancel") {
      event.preventDefault();
      event.stopPropagation();
      review.onCancel();
    }
  });

  return (
    <View nativeID={id} style={[styles.box, focused && styles.focused]}>
      <TextInput
        accessibilityLabel="Review comment"
        placeholder="Leave a comment"
        placeholderTextColor={theme.colors.foregroundMuted}
        multiline
        autoFocus
        value={text}
        onChangeText={(changed) => {
          setText(changed);
          review.onWrite(changed);
        }}
        onFocus={() => {
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
        }}
        style={styles.input}
      />
      <View style={styles.buttons}>
        <TextButton
          label="Cancel"
          accessibilityLabel="Cancel review comment"
          onPress={review.onCancel}
          look="plain"
          disabled={false}
          theme={theme}
        />
        <TextButton
          label="Comment"
          accessibilityLabel="Save review comment"
          look="primary"
          disabled={!saveable}
          onPress={() => {
            review.onSave(text);
          }}
          theme={theme}
        />
      </View>
    </View>
  );
}

interface PendingCommentProps {
  comment: ReviewComment;
  review: Review;
  styles: Styles;
  theme: PluginTheme;
}

// Whether the comment, in the element with the id, is one the view's been asked to show, which it
// stands out as: once it's asked, the views it's in scroll to show it.
function useRevealed(element: string, comment: number, review: Review): boolean {
  const asked = review.revealing?.id === comment;

  useLayoutEffect(() => {
    if (asked) {
      scrollIntoView(element);
    }
  }, [asked, element]);

  return asked;
}

// A comment not yet sent, marked as pending, with buttons that edit it and delete it.
function PendingComment({ comment, review, styles, theme }: PendingCommentProps): ReactElement {
  const id = useId();
  const revealed = useRevealed(id, comment.id, review);

  return (
    <View
      nativeID={id}
      role="group"
      accessibilityLabel="Pending review comment"
      style={[styles.box, revealed && styles.focused]}
    >
      <View style={styles.header}>
        <Text selectable={false} style={styles.pending}>
          Pending
        </Text>
        <IconButton
          label="Edit review comment"
          icon="Pencil"
          onPress={() => {
            review.onEdit(comment, "line");
          }}
          theme={theme}
        />
        <IconButton
          label="Delete review comment"
          icon="Trash2"
          onPress={() => {
            review.onDelete(comment.id);
          }}
          theme={theme}
        />
      </View>
      <Text selectable style={styles.body}>
        {comment.body}
      </Text>
    </View>
  );
}

interface ThreadCommentProps extends PendingCommentProps {
  // The comment being written on its line, if any, which may be an edit of it.
  editing: Editing | undefined;
}

// The comment, or where it's edited, while it is.
function ThreadComment({ comment, editing, ...shown }: ThreadCommentProps): ReactElement {
  return editing?.id === comment.id ? (
    <CommentEditor review={shown.review} theme={shown.theme} />
  ) : (
    <PendingComment comment={comment} {...shown} />
  );
}

interface NewCommentProps extends CommentEditorProps {
  editing: Editing | undefined;
}

// Where a new comment is written on the line, while one is.
function NewComment({ editing, ...shown }: NewCommentProps): ReactElement | null {
  return editing === undefined || editing.id !== undefined ? null : <CommentEditor {...shown} />;
}

interface CommentThreadProps {
  // Undefined under a line that has none.
  thread: Thread | undefined;
  // How far from the left of the line its text starts.
  indent: number;
  theme: PluginTheme;
}

interface ShownThreadProps extends CommentThreadProps {
  thread: Thread;
  review: Review;
}

// The comments, and a new one being written. Pressing the pointer in them, or a right click, is
// theirs, rather than the lines'.
function ShownThread({ thread, review, indent, theme }: ShownThreadProps): ReactElement {
  const styles = useStyles(theme);
  const id = useId();
  const shown = { review, styles, theme };

  usePageMenu(id);

  return (
    <View nativeID={id} dataSet={commentsMark} style={[styles.thread, { paddingLeft: indent }]}>
      {thread.comments.map((comment) => (
        <ThreadComment key={comment.id} comment={comment} editing={thread.editing} {...shown} />
      ))}
      <NewComment editing={thread.editing} review={review} theme={theme} />
    </View>
  );
}

// Under a line, the comments pending on it, in the order they were made, with the one being edited
// in its place, and after them a new one being written.
export function CommentThread({ thread, ...shown }: CommentThreadProps): ReactElement | null {
  const review = useContext(ReviewContext);

  return review === undefined || thread === undefined ? null : (
    <ShownThread thread={thread} review={review} {...shown} />
  );
}
