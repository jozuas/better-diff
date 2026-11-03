import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

interface Range {
  min: number;
  max: number;
  default: number;
}

// The sizes Paseo's own font sizes take, the diff's as its code size and the rest of the panel's as its
// interface size, and the ones Better Diff's start at.
export const fontSizeRanges = {
  panel: { min: 10, max: 21, default: 13 },
  diff: { min: 9, max: 22, default: 13 },
} satisfies Record<string, Range>;

// The line lengths the settings take, in characters, and the one they start at.
export const lineLengthRange = { min: 20, max: 400, default: 80 } satisfies Range;

function wholeNumber(range: Range) {
  return z.number().int().min(range.min).max(range.max).default(range.default);
}

// How diffs show, which the host keeps for every tab and Better Diff's page in its settings.
export const viewSettings = defineSettings({
  id: "view",
  scope: "host",
  version: 1,
  schema: z.object({
    // Removed lines above the added ones, beside them, or beside them where lines of lineLength fit.
    diffStyle: z.enum(["auto", "inline", "side by side"]).default("auto"),
    // How long a line the auto style has room for on each side before it shows a diff side by side,
    // such as the length the code wraps at.
    lineLength: wholeNumber(lineLengthRange),
    // Paseo doesn't pass its own font sizes on to plugins, so Better Diff has these.
    diffFontSize: wholeNumber(fontSizeRanges.diff),
    panelFontSize: wholeNumber(fontSizeRanges.panel),
  }),
});

export type ViewValues = z.infer<typeof viewSettings.schema>;
