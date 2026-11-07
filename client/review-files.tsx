import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useContext, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CommentEditor } from "./comment-thread";
import { editedIn } from "./comments";
import type { ReviewComment } from "./comments";
import { FontSizesContext } from "./fonts";
import { Hoverable } from "./hoverable";
import { IconButton } from "./icon-button";
import { ReviewContext } from "./review-context";
import type { Review } from "./review-context";
import { fileHeading, fileKey, lineMark, lineNote } from "./review-list";
import type { ListedComment, ListedFile } from "./review-list";

// Paseo sets its UI font on everything in the app but what's marked data-pmono.
const paseoMonospace = { pmono: "" };

const monospace =
  "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

function useStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(
    () =>
      StyleSheet.create({
        file: { paddingVertical: 4 },
        path: {
          paddingHorizontal: 12,
          paddingVertical: 4,
          fontSize: fonts.small,
          fontWeight: "600",
          color: theme.colors.foreground,
        },
        row: { flexDirection: "row", alignItems: "flex-start", gap: 2, paddingRight: 8 },
        link: { flex: 1, borderRadius: 4, overflow: "hidden" },
        content: { gap: 2, paddingLeft: 12, paddingRight: 4, paddingVertical: 4 },
        hovered: { backgroundColor: theme.colors.surface2 },
        line: { flexDirection: "row", gap: 8 },
        number: {
          minWidth: fonts.number - 8,
          fontFamily: monospace,
          fontSize: fonts.code,
          color: theme.colors.foregroundMuted,
        },
        code: {
          flex: 1,
          fontFamily: monospace,
          fontSize: fonts.code,
          color: theme.colors.foregroundMuted,
        },
        body: { fontSize: fonts.text, color: theme.colors.foreground },
        editor: { paddingHorizontal: 8, paddingVertical: 4 },
      }),
    [theme, fonts],
  );
}

type Styles = ReturnType<typeof useStyles>;

interface Showing {
  // Opens the comment's file, and shows the comment in it, and whether it can.
  onShow: (comment: ReviewComment) => void;
  canShow: (comment: ReviewComment) => boolean;
}

interface CommentLinkProps extends Showing {
  listed: ListedComment;
  styles: Styles;
}

// The comment's line, its number, marked as removed or added, and its text, or what's said of it,
// and what the comment says, which shows the comment in its file's diff where it can.
function CommentLink({
  listed: { comment, placed },
  onShow,
  canShow,
  styles,
}: CommentLinkProps): ReactElement {
  return (
    <Hoverable
      accessibilityRole="button"
      accessibilityLabel={`Show line ${String(comment.line)} of ${comment.path}`}
      disabled={placed === "gone" || !canShow(comment)}
      style={styles.link}
      onPress={() => {
        onShow(comment);
      }}
    >
      {({ hovered }) => (
        <View style={[styles.content, hovered && styles.hovered]}>
          <View dataSet={paseoMonospace} style={styles.line}>
            <Text style={styles.number}>{`${lineMark(placed)}${String(comment.line)}`}</Text>
            <Text numberOfLines={1} style={styles.code}>
              {lineNote(placed)}
            </Text>
          </View>
          <Text numberOfLines={3} style={styles.body}>
            {comment.body}
          </Text>
        </View>
      )}
    </Hoverable>
  );
}

interface ReviewedCommentProps extends Showing {
  listed: ListedComment;
  review: Review;
  styles: Styles;
  theme: PluginTheme;
}

// A comment pending, with buttons that edit it, there in the list, and delete it, or where it's
// edited, while it is.
function ReviewedComment({
  listed,
  review,
  styles,
  theme,
  ...showing
}: ReviewedCommentProps): ReactElement {
  const { comment } = listed;

  return editedIn(review.editing, comment.id, "list") ? (
    <View style={styles.editor}>
      <CommentEditor review={review} theme={theme} />
    </View>
  ) : (
    <View role="group" accessibilityLabel="Pending review comment" style={styles.row}>
      <CommentLink listed={listed} styles={styles} {...showing} />
      <IconButton
        label="Edit review comment"
        icon="Pencil"
        onPress={() => {
          review.onEdit(comment, "list");
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
  );
}

interface ReviewFilesProps extends Showing {
  files: readonly ListedFile[];
  theme: PluginTheme;
}

// The comments pending, under the file each is on.
export function ReviewFiles({ files, theme, ...showing }: ReviewFilesProps): ReactElement | null {
  const review = useContext(ReviewContext);
  const styles = useStyles(theme);

  return review === undefined ? null : (
    <>
      {files.map(({ file, comments }) => (
        <View
          key={fileKey(file)}
          role="list"
          accessibilityLabel={fileHeading(file)}
          style={styles.file}
        >
          <Text style={styles.path}>{fileHeading(file)}</Text>
          {comments.map((listed) => (
            <ReviewedComment
              key={listed.comment.id}
              listed={listed}
              review={review}
              styles={styles}
              theme={theme}
              {...showing}
            />
          ))}
        </View>
      ))}
    </>
  );
}
