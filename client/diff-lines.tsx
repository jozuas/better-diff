import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { memo, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";

import type { diffRpc } from "../shared/diff";
import type { TextRange } from "./changed-text";
import { pairingOf } from "./changed-words";
import type { Commenting } from "./commenting";
import type { NumberedFile } from "./comments";
import { useStyles } from "./diff-styles";
import type { Styles } from "./diff-styles";
import { hunkSection } from "./find";
import type { FoundLines, FoundRange } from "./find";
import { FindContext } from "./find-store";
import { Block } from "./line-block";
import type { ChangedText, FoundText, IdOf, Selected } from "./line-block";
import { numberLines } from "./lines";
import type { NumberedLine } from "./lines";
import type { PointedHunk, PointedLine } from "./pointed";
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

// What the find bar found in a line it found nothing in, the same each time.
const notFound: readonly FoundRange[] = [];

// What the find bar found in the lines of the section of the file shown at the container, as it
// finds it.
function useFoundLines(container: string, section: number): FoundLines {
  const find = useContext(FindContext);

  return useSyncExternalStore(find.subscribe, () => find.foundIn(container, section));
}

interface LinesProps {
  lines: NumberedLine[];
  idOf: IdOf;
  selected: Selected;
  // Undefined for an inline view.
  focus: Focus | undefined;
  changes: ChangedText;
  found: FoundText;
  // The index of the added line each paired removed line is paired with, by the removed line's.
  partners: ReadonlyMap<number, number>;
  // The lines of the file's new version to render, of those the view renders a step at a time, or
  // undefined to render them all.
  window?: LineWindow | undefined;
  // Undefined for lines that can't be commented on.
  commenting?: Commenting | undefined;
  styles: Styles;
  theme: PluginTheme;
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
  found,
  partners,
  window,
  commenting,
  styles,
  theme,
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
      found={found}
      commenting={commenting}
      styles={styles}
      theme={theme}
    />
  ));
}

interface HunkLinesProps {
  hunk: Hunk;
  index: number;
  // The file whose diff they're in, with how the review numbers its lines, or undefined while
  // they can't be commented on, as until that's known.
  file: NumberedFile | undefined;
  container: string;
  // Its lines the page's text selection touches, if any.
  selection: LineRange | undefined;
  // Which of the diff's hunks the pointer is over, and which of the hunk's lines.
  pointed: PointedHunk;
  pointedOver: PointedLine;
  // Undefined for an inline view.
  focus: Focus | undefined;
  // The diff's.
  theme: PluginTheme;
}

// The hunk's lines, which can be commented on.
function LinesOfHunk({
  hunk,
  index,
  file,
  container,
  selection,
  pointed,
  pointedOver,
  focus,
  theme,
}: HunkLinesProps): ReactElement {
  const styles = useStyles(theme);
  const lines = useMemo(() => numberLines(hunk), [hunk]);
  const pairing = useMemo(() => pairingOf(lines), [lines]);
  const found = useFoundLines(container, hunkSection(index));

  const commenting = useMemo(
    () => (file === undefined ? undefined : { file, pointed: pointedOver }),
    [file, pointedOver],
  );

  return (
    <View {...pointed.pointer(index)}>
      <Lines
        lines={lines}
        idOf={(line, focused) => lineId(container, index, line.index, focused)}
        selected={(line, side) => isSelected(selection, index, line, side)}
        focus={focus}
        changes={(line) => pairing.changes[line] ?? unchanged}
        found={(line) => found.get(line) ?? notFound}
        partners={pairing.partners}
        commenting={commenting}
        styles={styles}
        theme={theme}
      />
    </View>
  );
}

// Rendered again only once what it's rendered with changes, as the text selection reaching into the
// hunk or leaving it does, and not as it changes in other hunks.
export const HunkLines = memo(LinesOfHunk);

interface UnchangedLinesProps {
  lines: NumberedLine[];
  // The id of the file's diff they're in, and the section of it they are.
  container: string;
  section: number;
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
  section,
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
  const foundLines = useFoundLines(container, section);
  const found = useCallback((line: number) => foundLines.get(line) ?? notFound, [foundLines]);

  return lines.length === 0 ? null : (
    <View style={style}>
      <Lines
        lines={lines}
        idOf={idOf}
        selected={selected}
        focus={focus}
        changes={changes}
        found={found}
        partners={unpaired}
        window={window}
        styles={styles}
        theme={theme}
      />
    </View>
  );
}

// Rendered again only once what it's rendered with changes.
export const UnchangedLines = memo(LinesOutsideHunks);
