import { anchored } from "./anchors";
import { rangeOf, shownOn, targetOf, threadAt } from "./comments";
import type { CommentTarget, NumberedFile, Thread } from "./comments";
import type { IndexedLine, NumberedLine } from "./lines";
import type { CommentedFile } from "./numbering";
import type { FileComments } from "./placing";
import type { LineAt, PointedLine, PointerHandlers } from "./pointed";
import type { Review } from "./review-context";
import type { LineRange } from "./selection";
import type { Row, Side } from "./side-by-side";

// How lines can be commented on, as a hunk's can: the file whose diff they're in, with how the
// review numbers its lines, the lines, and which of them the pointer is over.
export interface Commenting {
  file: NumberedFile;
  lines: readonly NumberedLine[];
  pointed: PointedLine;
}

// What some of those lines are commented on with: the file, the lines, what shows under them, what
// hears the pointer come over a line, the line it's over, if it's one of them, and the view's review.
export interface Commented {
  file: NumberedFile;
  lines: readonly NumberedLine[];
  shown: FileComments;
  pointer: (line: LineAt) => PointerHandlers;
  pointed: LineAt | undefined;
  review: Review;
}

// What the lines are commented on with in the view's review, if they can be commented on, and it
// has one.
export function commentedBy(
  review: Review | undefined,
  commenting: Commenting | undefined,
  pointed: LineAt | undefined,
): Commented | undefined {
  return review === undefined || commenting === undefined
    ? undefined
    : {
        file: commenting.file,
        lines: commenting.lines,
        shown: review.commentsIn(commenting.file.path),
        pointer: commenting.pointed.pointer,
        pointed,
        review,
      };
}

// What a line is commented on with, where it can be: what hears the pointer, what starts a comment
// on it while the pointer is over it, and what shows under it, if anything does.
export interface LineComments {
  pointer: PointerHandlers | undefined;
  onComment: (() => void) | undefined;
  thread: Thread | undefined;
}

const uncommented: LineComments = { pointer: undefined, onComment: undefined, thread: undefined };

// The line's, as shown at its index on the side, or inline, if there's one there, and it can be
// commented on there. A comment's started on it with what tells it apart from the others of its
// version.
export function commentsOn(
  commented: Commented | undefined,
  shown: IndexedLine | undefined,
  side?: Side,
): LineComments {
  if (commented === undefined || shown === undefined) {
    return uncommented;
  }

  const target = targetOf(commented.file, shown.line, side);

  if (target === undefined) {
    return uncommented;
  }

  const { pointed, review, shown: comments } = commented;

  return {
    pointer: commented.pointer({ index: shown.index, side }),
    onComment:
      pointed?.index === shown.index && pointed.side === side
        ? () => {
            review.onStart(anchored(target, shown, commented.lines, commented.file.numbering));
          }
        : undefined,
    thread: threadAt(comments.threads, comments.editing, shownOn(commented.file, shown.line, side)),
  };
}

// What a comment on the line shown among the lines of the file's diff is on, on the side, or inline,
// as targetOf has it, with what tells it apart from the others of its version, if it can be on it.
function anchoredOn(
  file: NumberedFile,
  lines: readonly NumberedLine[],
  shown: IndexedLine,
  side: Side | undefined,
): CommentTarget | undefined {
  const target = targetOf(file, shown.line, side);

  return target === undefined ? undefined : anchored(target, shown, lines, file.numbering);
}

// What a comment started on a hunk's lines other than with the button over one is on, of the hunk's
// lines of the file's diff: with some of them selected, those from the first that can be commented
// on to the last, on the last one's side where the first has it, as an unchanged line does inline,
// and with none selected, the line the pointer is over, if any, each with what tells it apart from
// the others of its version. Undefined if that's none that can be commented on, or the lines can't
// be, as until it's known how the review numbers them.
export function startedOn(
  file: NumberedFile | undefined,
  lines: readonly NumberedLine[],
  selected?: LineRange,
  pointed?: LineAt,
): CommentTarget | undefined {
  if (file === undefined) {
    return undefined;
  }

  if (selected !== undefined) {
    const shown = lines
      .slice(selected.first, selected.last + 1)
      .map((line, at) => ({ index: selected.first + at, line }));

    const last = shown.flatMap((each) => anchoredOn(file, lines, each, selected.side) ?? []).at(-1);

    if (last === undefined) {
      return undefined;
    }

    const [first = last] = shown.flatMap(
      (each) =>
        anchoredOn(file, lines, each, last.side) ??
        anchoredOn(file, lines, each, selected.side) ??
        [],
    );

    return rangeOf(first, last);
  }

  if (pointed === undefined) {
    return undefined;
  }

  const line = lines[pointed.index];

  return line === undefined
    ? undefined
    : anchoredOn(file, lines, { index: pointed.index, line }, pointed.side);
}

// The line the pointer is over, of lines that can be commented on, if it's one of those from
// `start` up to `end` that a block shows of its lines inline, or that it shows in its rows side by
// side.
export function pointedIn(
  commenting: Commenting | undefined,
  rows: readonly Row[] | undefined,
  start: number,
  end: number,
): LineAt | undefined {
  const line = commenting?.pointed.line();

  if (line === undefined) {
    return undefined;
  }

  const shown =
    rows === undefined
      ? line.index >= start && line.index < end
      : rows
          .slice(start, end)
          .some((row) => row.old?.index === line.index || row.new?.index === line.index);

  return shown ? line : undefined;
}

function subscribeToNothing(): () => void {
  return () => {};
}

// What subscribes to the line the pointer is over, of lines that can be commented on, or to
// nothing, for lines that can't be.
export function subscribeToPointed(commenting?: Commenting): (listener: () => void) => () => void {
  return commenting?.pointed.subscribe ?? subscribeToNothing;
}

// What says whether a line of the file's diff has comments under it, or one being written, on either
// side, as inline, of what shows under its lines.
function commentedOn(
  file: NumberedFile,
  { threads, editing }: FileComments,
): (line: NumberedLine) => boolean {
  return (line) => threadAt(threads, editing, shownOn(file, line)) !== undefined;
}

// What says whether a line of the file's diff has comments under it, or one being written, as
// commentedOn does, of those the view's review shows under its lines, by what it shows under each
// file's, while they can be commented on.
export function linesCommented(
  commentsIn: Review["commentsIn"] | undefined,
  file: NumberedFile | undefined,
): ((line: NumberedLine) => boolean) | undefined {
  return commentsIn === undefined || file === undefined
    ? undefined
    : commentedOn(file, commentsIn(file.path));
}

// Whether a comment of the view's review is on the file of the diff, or being written on it, while
// its lines can be commented on.
export function hasComments(review: Review | undefined, file: CommentedFile | undefined): boolean {
  return review !== undefined && file !== undefined && review.commentedOn(file.path);
}
