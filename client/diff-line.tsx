import type { ReactElement } from "react";
import { memo, useContext } from "react";
import type { TextStyle } from "react-native";
import { Text, View } from "react-native";

import type { TextRange } from "./changed-text";
import type { Styles } from "./diff-styles";
import { FontSizesContext, textPadding } from "./fonts";
import type { NumberedLine } from "./lines";
import { numbersOf } from "./side-by-side";
import type { Side } from "./side-by-side";
import { runsOf, segmentsOf, SyntaxColorsContext } from "./syntax";
import type { Highlights, Mark, Segment } from "./syntax";
import { trailingWhitespaceAt } from "./whitespace";

declare module "react-native" {
  interface ViewProps {
    // React Native Web's: each entry becomes a data- attribute of the element.
    dataSet?: Readonly<Record<string, string>>;
  }
}

// Paseo sets its UI font on everything in the app but what's marked data-pmono, and inside it, over
// any font family the plugin gives.
const paseoMonospace = { pmono: "" };

interface SegmentTextProps {
  segment: Segment;
  markStyles: Record<Mark, TextStyle>;
}

// A piece of a line's text in its colour, highlighted as what it's marked as, if anything.
function SegmentText({
  segment: { text, color, mark },
  markStyles,
}: SegmentTextProps): ReactElement {
  return <Text style={[{ color }, mark !== undefined && markStyles[mark]]}>{text}</Text>;
}

interface DiffLineProps {
  // By which a selection finds a hunk's line, and the view keeps its place.
  id: string;
  line: NumberedLine;
  selected: boolean;
  // The side it shows on, with only that version's number, or undefined inline, with both.
  side: Side | undefined;
  selectable: boolean;
  highlights: Highlights;
  changes: readonly TextRange[];
  styles: Styles;
}

// Only the line's text can be selected, so copying a selection copies what the lines say. The
// numbers of a selected line stand out. Its text is in its syntax's colours, and its changed words
// and trailing whitespace are highlighted.
function Line({
  id,
  line,
  selected,
  side,
  selectable,
  highlights,
  changes,
  styles,
}: DiffLineProps): ReactElement {
  const numbers = numbersOf(line, side);
  const fonts = useContext(FontSizesContext);
  const colors = useContext(SyntaxColorsContext);
  const numberStyle = selected ? [styles.number, styles.selected] : styles.number;

  const markStyles = {
    changed: styles[`${line.kind}Words`],
    "trailing whitespace": styles.trailingWhitespace,
  };

  return (
    <View>
      <View dataSet={paseoMonospace} style={[styles.line, styles[line.kind]]}>
        {numbers.map(({ side: version, number }) => (
          <Text key={version} selectable={false} style={numberStyle}>
            {number}
          </Text>
        ))}
        <Text nativeID={id} selectable={selectable} style={styles.text}>
          {segmentsOf(
            line.text,
            runsOf(line, highlights),
            colors,
            changes,
            trailingWhitespaceAt(line),
          ).map((segment) =>
            segment.color === undefined && segment.mark === undefined ? (
              segment.text
            ) : (
              <SegmentText key={segment.start} segment={segment} markStyles={markStyles} />
            ),
          )}
        </Text>
      </View>
      {line.newline ? null : (
        <Text
          selectable={false}
          style={[styles.noNewline, { paddingLeft: numbers.length * fonts.number + textPadding }]}
        >
          No newline at end of file
        </Text>
      )}
    </View>
  );
}

// Rendered again only once what it's rendered with changes, so a line selected or unselected
// doesn't render the others again.
export const DiffLine = memo(Line);
