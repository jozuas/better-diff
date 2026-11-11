import { createContext } from "react";

import { viewSettings } from "../shared/settings";
import type { ViewValues } from "../shared/settings";

export interface FontSizes {
  // Paths, the filter, the file menu and messages: Paseo's base size.
  text: number;
  // Buttons, line counts and the mode bar.
  small: number;
  // The bold, uppercase group headings and file status.
  label: number;
  // A file's icon in the sidebar, and its distance from the path, as in Paseo's Changes tab at
  // Paseo's interface size.
  fileIcon: number;
  fileIconGap: number;
  // A button's height, and an icon button's width: over twice its label's size, as Linear sizes its
  // buttons, rather than as tight as Paseo's, so they're easy to hit and read. Then the room either
  // side of a button's label, and the size of a button's icon.
  button: number;
  buttonPadding: number;
  buttonIcon: number;
  // The height of a row with a button in it, with room around the button: a file's or a group's in
  // the sidebar, a menu's item and a text box.
  row: number;
  // The diff's lines, their numbers and the note of a missing final newline.
  code: number;
  // The height of a diff's line.
  codeLine: number;
  // The speech bubble that starts a comment on a line, in a box as tall as the line: as large to the
  // diff font size as a button's icon is to the panel font size.
  codeIcon: number;
  // The width of a line number's column: five digits, each a little over 0.6 of the size wide in a
  // monospace font, as Menlo's are 0.602, and a gap.
  number: number;
}

// The room either side of a diff line's text.
export const textPadding = 8;

// The sizes of the panel's text, its smaller text, files' icons, buttons and rows scaled from the
// panel font size as Paseo scales its own text from its interface size, and its lines spaced as
// Paseo's diff spaces them.
export function fontSizes({
  panelFontSize,
  diffFontSize,
}: Pick<ViewValues, "panelFontSize" | "diffFontSize">): FontSizes {
  const scale = panelFontSize / 14;

  return {
    text: panelFontSize,
    small: Math.round(12 * scale),
    label: Math.round(11 * scale),
    fileIcon: Math.round(16 * scale),
    fileIconGap: Math.round(8 * scale),
    button: Math.round(28 * scale),
    buttonPadding: Math.round(12 * scale),
    buttonIcon: Math.round(16 * scale),
    row: Math.round(32 * scale),
    code: diffFontSize,
    codeLine: Math.round(1.5 * diffFontSize),
    codeIcon: Math.round((16 * diffFontSize) / 14),
    number: Math.ceil(5 * 0.61 * diffFontSize) + 8,
  };
}

// The panel's font sizes.
export const FontSizesContext = createContext(fontSizes(viewSettings.schema.parse({})));

// A size setting's choices, from its smallest size to its largest.
export function sizeOptions({ min, max }: { min: number; max: number }): {
  label: string;
  value: string;
}[] {
  return Array.from({ length: max - min + 1 }, (_, index) => {
    const size = String(min + index);

    return { label: size, value: size };
  });
}
