import type { ViewValues } from "../shared/settings";
import { textPadding } from "./fonts";
import type { FontSizes } from "./fonts";

// How a diff shows, as the settings say.
export type Layout = Pick<ViewValues, "diffStyle" | "lineLength">;

// How wide a character of Paseo's monospace fonts is, in their size.
const characterWidth = 0.6;

// Whether a diff the width, with lines in the font sizes, shows side by side, rather than inline, as
// the layout says: in the auto style, once each side has room beside its line numbers for a line of
// the layout's line length.
export function showsSideBySide(
  { diffStyle, lineLength }: Layout,
  width: number,
  fonts: Pick<FontSizes, "code" | "number">,
): boolean {
  const room = width / 2 - fonts.number - 2 * textPadding;

  return (
    diffStyle === "side by side" ||
    (diffStyle === "auto" && room >= lineLength * characterWidth * fonts.code)
  );
}
