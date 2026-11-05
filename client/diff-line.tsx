import type { ReactElement, ReactNode } from "react";
import { memo, useContext } from "react";
import type { TextStyle } from "react-native";
import { Text, View } from "react-native";

import type { Styles } from "./diff-styles";
import { FontSizesContext, textPadding } from "./fonts";
import { lineAsBefore, textAsBefore } from "./line-content";
import type { LineContent, TextContent } from "./line-content";
import { numbersOf } from "./side-by-side";
import { segmentsOf, SyntaxColorsContext } from "./syntax";
import type { Mark, Segment } from "./syntax";
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

interface DiffLineProps extends LineContent {
  styles: Styles;
}

interface LineSegmentsProps extends TextContent {
  styles: Styles;
}

// The line's text in its syntax's colours, with its changed words and trailing whitespace
// highlighted.
function SegmentsOfLine({ line, changes, styles }: LineSegmentsProps): ReactNode[] {
  const colors = useContext(SyntaxColorsContext);

  const markStyles = {
    changed: styles[`${line.kind}Words`],
    "trailing whitespace": styles.trailingWhitespace,
  };

  return segmentsOf(line.text, line.runs, colors, changes, trailingWhitespaceAt(line)).map(
    (segment) =>
      segment.color === undefined && segment.mark === undefined ? (
        segment.text
      ) : (
        <SegmentText key={segment.start} segment={segment} markStyles={markStyles} />
      ),
  );
}

// Rendered again only once the pieces render differently, and not as the line's numbers or id
// change, as lines added or removed above it change them.
const LineSegments = memo(
  SegmentsOfLine,
  (before, after) => before.styles === after.styles && textAsBefore(before, after),
);

// Only the line's text can be selected, so copying a selection copies what the lines say. The
// numbers of a selected line stand out.
function Line({
  id,
  line,
  selected,
  side,
  selectable,
  changes,
  styles,
}: DiffLineProps): ReactElement {
  const numbers = numbersOf(line, side);
  const fonts = useContext(FontSizesContext);
  const numberStyle = selected ? [styles.number, styles.selected] : styles.number;

  const row = (
    <View dataSet={paseoMonospace} style={[styles.line, styles[line.kind]]}>
      {numbers.map(({ side: version, number }) => (
        <Text key={version} selectable={false} style={numberStyle}>
          {number}
        </Text>
      ))}
      <Text nativeID={id} selectable={selectable} style={styles.text}>
        <LineSegments line={line} changes={changes} styles={styles} />
      </Text>
    </View>
  );

  // Only a file's last line can have no newline, and only it needs an element to have the note under
  // it in, rather than one more element for each of the file's lines.
  return line.newline ? (
    row
  ) : (
    <View>
      {row}
      <Text
        selectable={false}
        style={[styles.noNewline, { paddingLeft: numbers.length * fonts.number + textPadding }]}
      >
        No newline at end of file
      </Text>
    </View>
  );
}

// Rendered again only once it renders differently, so a line selected or unselected doesn't render
// the others again, and nor does reading its diff again, which makes all it's rendered with anew,
// though most lines are as they were.
export const DiffLine = memo(
  Line,
  (before, after) => before.styles === after.styles && lineAsBefore(before, after),
);
