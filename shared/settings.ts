import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

// How diffs show, which the host keeps for every tab and Better Diff's page in its settings.
export const viewSettings = defineSettings({
  id: "view",
  scope: "host",
  version: 1,
  schema: z.object({
    // Removed lines beside the added ones, rather than above them.
    sideBySide: z.boolean().default(false),
  }),
});

export type ViewValues = z.infer<typeof viewSettings.schema>;
