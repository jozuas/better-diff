import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

// The file at the path in the worktree, as it is there, whichever group lists it.
export const contentsRpc = defineRpc({
  name: "file.contents",
  input: z.object({ directory: z.string(), path: z.string() }),
  output: z.discriminatedUnion("status", [
    // Decoded as UTF-8, as a diff's lines are.
    z.object({ status: z.literal("read"), text: z.string() }),
    // Binary as git tells: a NUL among its first 8,000 bytes.
    z.object({ status: z.literal("binary") }),
    // Gone from the worktree, not a file, as a directory isn't, or outside the directory.
    z.object({ status: z.literal("absent") }),
  ]),
});
