import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { memo, useCallback, useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";

import type { diffRpc } from "../shared/diff";
import type { TextRange } from "./changed-text";
import { pairingOf } from "./changed-words";
import { useStyles } from "./diff-styles";
import type { Styles } from "./diff-styles";
import { Block } from "./line-block";
import type { ChangedText, IdOf, Selected } from "./line-block";
import { numberLines } from "./lines";
import type { NumberedLine } from "./lines";
import type { PointedHunk } from "./pointed";
import { blocksOfRows, rendersBlock } from "./rendering";
import type { LineWindow } from "./rendering";
import { isSelected, lineId, unchangedLineId } from "./selection";
import type { LineRange } from "./selection";
import { rowsOf } from "./side-by-side";
import type { Focus } from "./side-by-side";

type Hunk = RpcOutput<typeof diffRpc>["hunks"][number];

// The changed text of a line that has none, the same each time, so a line rendered again with it
// isn't rendered again for it.
const unchanged: readonly TextRange[] = [];

// The partners of lines outside hunks, which are unchanged.
const unpaired: ReadonlyMap<number, number> = new Map();

interface LinesProps {
  lines: NumberedLine[];
  idOf: IdOf;
  selected: Selected;
  // Undefined for an inline view.
  focus: Focus | undefined;
  changes: ChangedText;
  // The index of the added line each paired removed line is paired with, by the removed line's.
  partners: ReadonlyMap<number, number>;
  // The lines of the file's new version to render, of those the view renders a step at a time, or
  // undefined to render them all.
  window?: LineWindow | undefined;
  styles: Styles;
}

// How many rows of lines the browser renders as one block: it lays out, paints and finds what's under
// the pointer in only the blocks on screen, rather than in all of a file's lines.
const rowsPerBlock = 100;

// The lines in blocks, one under the other, or side by side.
function Lines({
  lines,
  idOf,
  selected,
  focus,
  changes,
  partners,
  window,
  styles,
}: LinesProps): ReactElement[] {
  const sideBySide = useMemo(
    () => (focus === undefined ? undefined : { rows: rowsOf(lines, partners), focus }),
    [lines, partners, focus],
  );

  return blocksOfRows(sideBySide?.rows.length ?? lines.length, rowsPerBlock).map((block) => (
    <Block
      key={block.start}
      lines={lines}
      sideBySide={sideBySide}
      start={block.start}
      end={block.end}
      rendered={rendersBlock(window, lines, block)}
      idOf={idOf}
      selected={selected}
      changes={changes}
      styles={styles}
    />
  ));
}

interface HunkLinesProps {
  hunk: Hunk;
  index: number;
  container: string;
  // Its lines the page's text selection touches, if any.
  selection: LineRange | undefined;
  // Which of the diff's hunks the pointer is over.
  pointed: PointedHunk;
  // Undefined for an inline view.
  focus: Focus | undefined;
  // The diff's.
  theme: PluginTheme;
}

function LinesOfHunk({
  hunk,
  index,
  container,
  selection,
  pointed,
  focus,
  theme,
}: HunkLinesProps): ReactElement {
  const styles = useStyles(theme);
  const lines = useMemo(() => numberLines(hunk), [hunk]);
  const pairing = useMemo(() => pairingOf(lines), [lines]);

  return (
    <View {...pointed.pointer(index)}>
      <Lines
        lines={lines}
        idOf={(line, focused) => lineId(container, index, line.index, focused)}
        selected={(line, side) => isSelected(selection, index, line, side)}
        focus={focus}
        changes={(line) => pairing.changes[line] ?? unchanged}
        partners={pairing.partners}
        styles={styles}
      />
    </View>
  );
}

// Rendered again only once what it's rendered with changes, as the text selection reaching into the
// hunk or leaving it does, and not as it changes in other hunks.
export const HunkLines = memo(LinesOfHunk);

interface UnchangedLinesProps {
  lines: NumberedLine[];
  // The id of the file's diff they're in.
  container: string;
  // Undefined for an inline view.
  focus: Focus | undefined;
  // The lines of the file's new version to render, while the view renders them a step at a time.
  window?: LineWindow | undefined;
  style?: StyleProp<ViewStyle>;
  theme: PluginTheme;
}

// Lines of the file outside its hunks, if there are any. A selection can copy them, but leaves
// them out of the lines it selects.
function LinesOutsideHunks({
  lines,
  container,
  focus,
  window,
  style,
  theme,
}: UnchangedLinesProps): ReactElement | null {
  const styles = useStyles(theme);

  // The same each time, so that their blocks aren't rendered again for them. None of the lines is
  // selected, nor has changed text.
  const idOf = useCallback<IdOf>(
    ({ line }, focused) => unchangedLineId(container, line, focused),
    [container],
  );

  const selected = useCallback(() => false, []);
  const changes = useCallback(() => unchanged, []);

  return lines.length === 0 ? null : (
    <View style={style}>
      <Lines
        lines={lines}
        idOf={idOf}
        selected={selected}
        focus={focus}
        changes={changes}
        partners={unpaired}
        window={window}
        styles={styles}
      />
    </View>
  );
}

// Rendered again only once what it's rendered with changes.
export const UnchangedLines = memo(LinesOutsideHunks);
