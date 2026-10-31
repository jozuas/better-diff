import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const changesRpc = defineRpc({
  name: "changes.list",
  input: z.object({ directory: z.string() }),
  output: z.object({
    modified: z.array(z.string()),
    untracked: z.array(z.string()),
    staged: z.array(z.string()),
  }),
});
