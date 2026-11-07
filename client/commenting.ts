import { shownOn, targetOf, threadAt } from "./comments";
import type { CommentedFile, Thread } from "./comments";
import type { IndexedLine } from "./lines";
import type { LineAt, PointedLine, PointerHandlers } from "./pointed";
import type { Review } from "./review-context";
import type { Row, Side } from "./side-by-side";

// How lines can be commented on, as a hunk's can: the file whose diff they're in, and which of them
// the pointer is over.
export interface Commenting {
  file: CommentedFile;
  pointed: PointedLine;
}

// What some of those lines are commented on with: the file, what hears the pointer come over a
// line, the line it's over, if it's one of them, and the view's review.
export interface Commented {
  file: CommentedFile;
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
    : { file: commenting.file, pointer: commenting.pointed.pointer, pointed, review };
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
// commented on there.
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

  const { pointed, review } = commented;

  return {
    pointer: commented.pointer({ index: shown.index, side }),
    onComment:
      pointed?.index === shown.index && pointed.side === side
        ? () => {
            review.onStart(target);
          }
        : undefined,
    thread: threadAt(review.threads, review.editing, shownOn(commented.file, shown.line, side)),
  };
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
