import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

interface Range {
  min: number;
  max: number;
  default: number;
}

// The sizes Paseo's own font sizes take, and its defaults: the diff's as its code size, the rest of
// the panel's as its interface size.
export const fontSizeRanges = {
  panel: { min: 10, max: 21, default: 14 },
  diff: { min: 9, max: 22, default: 12 },
} satisfies Record<string, Range>;

function fontSize(range: Range) {
  return z.number().int().min(range.min).max(range.max).default(range.default);
}

// How diffs show, which the host keeps for every tab and Better Diff's page in its settings.
export const viewSettings = defineSettings({
  id: "view",
  scope: "host",
  version: 1,
  schema: z.object({
    // Removed lines beside the added ones, rather than above them.
    sideBySide: z.boolean().default(false),
    // Paseo doesn't pass its own font sizes on to plugins, so Better Diff has these.
    diffFontSize: fontSize(fontSizeRanges.diff),
    panelFontSize: fontSize(fontSizeRanges.panel),
  }),
});

export type ViewValues = z.infer<typeof viewSettings.schema>;
