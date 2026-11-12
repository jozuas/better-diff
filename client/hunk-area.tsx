import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useCallback, useContext, useMemo } from "react";
import { StyleSheet, View } from "react-native";

import type { diffRpc } from "../shared/diff";
import type { Controls } from "./actions";
import { lineBarOf } from "./bar-commands";
import type { BarRequests } from "./bar-requests";
import { startedOn } from "./commenting";
import type { Commenting } from "./commenting";
import type { CommentTarget, NumberedFile } from "./comments";
import { HunkLines, UnchangedLines } from "./diff-lines";
import { afterSection, beforeSection } from "./find";
import { KeyboardFocusContext } from "./focus";
import { textPadding } from "./fonts";
import type { OpenFile } from "./groups";
import { numberLines } from "./lines";
import type { NumberedLine } from "./lines";
import { LinesArea } from "./lines-menu";
import type { Point } from "./menu";
import { pointedLine } from "./pointed";
import type { PointedHunk } from "./pointed";
import type { LineWindow } from "./rendering";
import { hunkMark } from "./reveal";
import { fileId, hunkId, lineId, otherHunk, selectedInHunk } from "./selection";
import type { LineRange } from "./selection";
import type { Focus } from "./side-by-side";
import { selectedNow } from "./text-selection";
import { rectOf } from "./web";

type Hunk = RpcOutput<typeof diffRpc>["hunks"][number];

const styles = StyleSheet.create({
  // Under each hunk, as under the unchanged lines before the first.
  spaced: { marginBottom: 8 },
});

// What shows the bar over a selection the pointer let go of in the lines of the view's file at the
// index `fileIndex`, of its hunk at the index `own` or outside its hunks, in the other hunk whose
// lines it has, if any, and says whether it did.
function usePassOn(
  view: string,
  fileIndex: number,
  requests: BarRequests,
  own?: number,
): (point: Point) => boolean {
  return useCallback(
    (point) => {
      const hunk = otherHunk(selectedNow(view)?.range, fileIndex, own);

      if (hunk !== undefined) {
        requests.show(hunk, { point });
      }

      return hunk !== undefined;
    },
    [view, fileIndex, requests, own],
  );
}

// How unchanged lines outside the hunks are commented on: the lines, with which of them the pointer
// is over, and what a comment started from their menu is on, if it can be on any: the line
// right-clicked, if it's one of them. Undefined while they can't be commented on, as until it's
// known how the review numbers them.
function useUnchangedCommenting(
  file: NumberedFile | undefined,
  lines: readonly NumberedLine[],
): [Commenting | undefined, (clicked: boolean) => CommentTarget | undefined] {
  const pointed = useMemo(() => pointedLine(), []);

  const commenting = useMemo(
    () => (file === undefined ? undefined : { file, pointed }),
    [file, pointed],
  );

  return [
    commenting,
    (clicked) => (clicked ? startedOn(file, lines, undefined, pointed.line()) : undefined),
  ];
}

interface LinesBeforeProps {
  // The file's lines before its first hunk, while they show.
  lines: NumberedLine[];
  path: string;
  // The file whose diff they're in, with how the review numbers its lines, or undefined while they
  // can't be commented on.
  file: NumberedFile | undefined;
  // The id of the view it's shown in, and the file's index among the view's files.
  view: string;
  fileIndex: number;
  requests: BarRequests;
  // Undefined for an inline view.
  focus: Focus | undefined;
  window: LineWindow;
  ceiling: () => number;
  controls: Controls;
  theme: PluginTheme;
}

// The file's lines before its first hunk, whose menu starts a comment on the line right-clicked,
// and which a selection reaching into the hunk shows the bar over the hunk's lines for.
export function LinesBefore({
  lines,
  path,
  file,
  view,
  fileIndex,
  requests,
  focus,
  window,
  ceiling,
  controls,
  theme,
}: LinesBeforeProps): ReactElement {
  const passOn = usePassOn(view, fileIndex, requests);
  const [commenting, commentOn] = useUnchangedCommenting(file, lines);

  return (
    <LinesArea
      path={path}
      commentOn={commentOn}
      passOn={passOn}
      ceiling={ceiling}
      controls={controls}
      theme={theme}
    >
      <UnchangedLines
        lines={lines}
        container={fileId(view, fileIndex)}
        section={beforeSection}
        focus={focus}
        window={window}
        commenting={commenting}
        style={styles.spaced}
        theme={theme}
      />
    </LinesArea>
  );
}

interface HunkAreaProps {
  hunk: Hunk;
  index: number;
  // The version of the diff it's in, which its lines' actions act on.
  version: string;
  // The file whose diff it's in, as its group lists it, and with how the review numbers its lines,
  // or undefined while they can't be commented on.
  open: OpenFile;
  file: NumberedFile | undefined;
  // The id of the view it's shown in, and the file's index among the view's files.
  view: string;
  fileIndex: number;
  // Its lines the page's text selection touches, if any.
  selection: LineRange | undefined;
  // Which of the diff's hunks the pointer is over.
  pointed: PointedHunk;
  // What asks the diff's hunks to show the bar over their selected lines.
  requests: BarRequests;
  // Undefined for an inline view.
  focus: Focus | undefined;
  // The file's lines after the hunk, up to the next, while they show.
  after: NumberedLine[];
  window: LineWindow;
  ceiling: () => number;
  controls: Controls;
  theme: PluginTheme;
}

// A hunk's lines, and the file's lines after it while they show, whose menu and the bar a selection
// shows start a comment on the hunk's lines selected, or from the menu with none selected, on the
// line right-clicked, of either. The bar has the selected lines' actions, and shows for lines
// the keyboard selects too, and for those of the hunk a selection the pointer let go of elsewhere
// has. Once one of their actions runs, focus moves on with the view, from the hunk.
export function HunkArea({
  hunk,
  index,
  version,
  open,
  file,
  view,
  fileIndex,
  selection,
  pointed,
  requests,
  focus,
  after,
  window,
  ceiling,
  controls,
  theme,
}: HunkAreaProps): ReactElement {
  const pointedOver = useMemo(() => pointedLine(), []);
  const container = fileId(view, fileIndex);
  const keyboard = useContext(KeyboardFocusContext);
  const passOn = usePassOn(view, fileIndex, requests, index);

  const lines = lineBarOf(open, { version, index, hunk }, selection, () => {
    keyboard.hold([fileIndex, index]);
  });

  // Shows the bar where it's asked to: where the pointer let go, or above the start of the text of
  // the line the keyboard selected up to.
  const onRequest = useCallback(
    (show: (point: Point, centred: boolean) => void) =>
      requests.subscribe(index, (from) => {
        if ("point" in from) {
          show(from.point, true);

          return;
        }

        const line = rectOf(lineId(container, index, from.head));

        show({ x: line.x + textPadding, y: line.y + line.height / 2 }, false);
      }),
    [requests, index, container],
  );

  const [commentingAfter, commentAfter] = useUnchangedCommenting(file, after);

  function commentOnHunk(clicked: boolean): CommentTarget | undefined {
    return startedOn(
      file,
      numberLines(hunk),
      selectedInHunk(selectedNow(view)?.range, focus, fileIndex, index),
      clicked ? pointedOver.line() : undefined,
    );
  }

  function commentOn(clicked: boolean): CommentTarget | undefined {
    return commentOnHunk(clicked) ?? commentAfter(clicked);
  }

  return (
    <LinesArea
      path={open.path}
      commentOn={commentOn}
      lines={lines}
      onRequest={onRequest}
      passOn={passOn}
      ceiling={ceiling}
      controls={controls}
      dataSet={{ hunk: hunkMark([fileIndex, index]) }}
      style={styles.spaced}
      theme={theme}
    >
      <View nativeID={hunkId(container, index)} />
      <HunkLines
        hunk={hunk}
        index={index}
        file={file}
        container={container}
        selection={selection}
        pointed={pointed}
        pointedOver={pointedOver}
        focus={focus}
        theme={theme}
      />
      <UnchangedLines
        lines={after}
        container={container}
        section={afterSection(index)}
        focus={focus}
        window={window}
        commenting={commentingAfter}
        theme={theme}
      />
    </LinesArea>
  );
}
