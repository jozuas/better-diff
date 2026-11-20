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

// The tab sizes the settings take, in columns, and the one they start at, a terminal's.
export const tabSizeRange = { min: 1, max: 16, default: 8 } satisfies Range;

function wholeNumber(range: Range) {
  return z.number().int().min(range.min).max(range.max);
}

// How diffs are laid out, which depends on the screen.
const layout = {
  // Removed lines above the added ones, beside them, or beside them where lines of lineLength fit.
  diffStyle: z.enum(["auto", "inline", "side by side"]),
  // How long a line the auto style has room for on each side before it shows a diff side by side,
  // such as the length the code wraps at.
  lineLength: wholeNumber(lineLengthRange),
  // Paseo doesn't pass its own font sizes on to plugins, so Better Diff has these.
  diffFontSize: wholeNumber(fontSizeRanges.diff),
  panelFontSize: wholeNumber(fontSizeRanges.panel),
};

// Those of the layout's settings that have been set.
const layoutSet = z.object(layout).partial();

// How diffs show whatever the screen, which the host keeps for every client's tabs and Better Diff's
// page in its settings.
export const viewSettings = defineSettings({
  id: "view",
  scope: "host",
  version: 1,
  schema: z.object({
    // How many columns apart the tab stops of a diff's lines are, the next of which a tab reaches.
    tabSize: wholeNumber(tabSizeRange).default(tabSizeRange.default),
    // Whether diffs leave out changes only to whitespace, which hunk and line actions then leave as
    // they are.
    hideWhitespace: z.boolean().default(false),
    // Whether the panel has the strip along its bottom of the keys that work where focus is.
    showKeys: z.boolean().default(true),
    // The layout the host kept for every client before each device kept its own, which nothing
    // changes any more: a device shows each of its settings as the host kept it until it's set
    // there.
    ...layoutSet.shape,
  }),
});

export type ViewValues = z.infer<typeof viewSettings.schema>;

// The layout's settings set on a device, which the app keeps there, for the tabs and Better Diff's
// page on it. The server never reads them.
export const layoutSettings = defineSettings({
  id: "layout",
  scope: "device",
  version: 1,
  schema: layoutSet,
});

export type DeviceLayout = z.infer<typeof layoutSet>;

// The layout a device shows, each of its settings as it is until it's set.
export const layoutValues = z.object({
  diffStyle: layout.diffStyle.default("auto"),
  lineLength: layout.lineLength.default(lineLengthRange.default),
  diffFontSize: layout.diffFontSize.default(fontSizeRanges.diff.default),
  panelFontSize: layout.panelFontSize.default(fontSizeRanges.panel.default),
});

export type LayoutValues = z.infer<typeof layoutValues>;
