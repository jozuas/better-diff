import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import type { diffRpc } from "../shared/diff";
import { startedOn } from "./commenting";
import type { CommentTarget, NumberedFile } from "./comments";
import { HunkLines, UnchangedLines } from "./diff-lines";
import { afterSection } from "./find";
import { numberLines } from "./lines";
import type { NumberedLine } from "./lines";
import { LinesArea } from "./lines-menu";
import { pointedLine } from "./pointed";
import type { PointedHunk } from "./pointed";
import type { LineWindow } from "./rendering";
import { hunkMark } from "./reveal";
import { fileId, hunkId, selectedInHunk } from "./selection";
import type { LineRange } from "./selection";
import type { Focus } from "./side-by-side";
import { selectedNow } from "./text-selection";

type Hunk = RpcOutput<typeof diffRpc>["hunks"][number];

const styles = StyleSheet.create({
  // Under each hunk, as under the unchanged lines before the first.
  spaced: { marginBottom: 8 },
});

interface HunkAreaProps {
  hunk: Hunk;
  index: number;
  // The file whose diff it's in, with how the review numbers its lines, or undefined while they
  // can't be commented on.
  file: NumberedFile | undefined;
  path: string;
  // The id of the view it's shown in, and the file's index among the view's files.
  view: string;
  fileIndex: number;
  // Its lines the page's text selection touches, if any.
  selection: LineRange | undefined;
  // Which of the diff's hunks the pointer is over.
  pointed: PointedHunk;
  // Undefined for an inline view.
  focus: Focus | undefined;
  // The file's lines after the hunk, up to the next, while the entire file shows.
  after: NumberedLine[];
  window: LineWindow;
  ceiling: () => number;
  theme: PluginTheme;
}

// A hunk's lines, and the file's lines after it while the entire file shows, whose menu and the
// bar a selection shows start a comment on the hunk's lines selected, or from the menu with none
// selected, on the line right-clicked.
export function HunkArea({
  hunk,
  index,
  file,
  path,
  view,
  fileIndex,
  selection,
  pointed,
  focus,
  after,
  window,
  ceiling,
  theme,
}: HunkAreaProps): ReactElement {
  const pointedOver = useMemo(() => pointedLine(), []);
  const container = fileId(view, fileIndex);

  function commentOn(clicked: boolean): CommentTarget | undefined {
    return startedOn(
      file,
      numberLines(hunk),
      selectedInHunk(selectedNow(view)?.range, focus, fileIndex, index),
      clicked ? pointedOver.line() : undefined,
    );
  }

  return (
    <LinesArea
      path={path}
      commentOn={commentOn}
      ceiling={ceiling}
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
        theme={theme}
      />
    </LinesArea>
  );
}
