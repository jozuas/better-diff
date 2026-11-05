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
  // The diff's lines, their numbers and the note of a missing final newline.
  code: number;
  // The height of a diff's line.
  codeLine: number;
  // The width of a line number's column: five digits, each a little over 0.6 of the size wide in a
  // monospace font, as Menlo's are 0.602, and a gap.
  number: number;
}

// The room either side of a diff line's text.
export const textPadding = 8;

// The sizes of the panel's text, its smaller text and files' icons scaled from the panel font size as
// Paseo scales its own text from its interface size, and its lines spaced as Paseo's diff spaces
// them.
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
    code: diffFontSize,
    codeLine: Math.round(1.5 * diffFontSize),
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
