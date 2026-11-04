import { z } from "zod";

import type { GroupName } from "./groups";
import { defaultWidth } from "./resize";

const group = z.enum(["modified", "untracked", "staged"]) satisfies z.ZodType<GroupName>;

// A file opened from its group, files selected in it, or the group.
const open = z.union([
  z.object({ group, path: z.string() }),
  z.object({ group, paths: z.array(z.string()) }),
  z.object({ group }),
]);

// What the panel keeps of each tab across reloads: the file list's width, what's open, if anything,
// the groups collapsed and the filter. A tab kept with only the width has the rest as a tab starts.
export const tabState = z.object({
  fileListWidth: z.number(),
  open: open.nullable().default(null),
  collapsed: z.array(group).default([]),
  filter: z.string().default(""),
});

export type TabState = z.infer<typeof tabState>;

// What a tab that keeps nothing yet shows.
export const startingTab: TabState = tabState.parse({ fileListWidth: defaultWidth });
