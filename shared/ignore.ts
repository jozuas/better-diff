import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

// Where a rule ignoring files goes, as in Magit's gitignore menu: the .gitignore of the directory
// at `inDirectory`, from the repository's root, "" for the root itself, which other clones share;
// the clone's own .git/info/exclude; or the file core.excludesFile names, for all repositories.
const place = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("shared"), inDirectory: z.string() }),
  z.object({ kind: z.literal("private") }),
  z.object({ kind: z.literal("global") }),
]);

// The candidates for a rule in the directory at `inDirectory` ignoring the untracked file at the
// path, which is in it, as Magit offers them, from what git status lists as untracked in it, and
// the one Enter adds with nothing typed: the file's, unless it's no longer untracked.
export const patternsRpc = defineRpc({
  name: "ignore.patterns",
  input: z.object({ directory: z.string(), path: z.string(), inDirectory: z.string() }),
  output: z.object({ patterns: z.array(z.string()), default: z.string().nullable() }),
});

// The path core.excludesFile names, as the config has it, or null while it isn't set.
export const excludesFileRpc = defineRpc({
  name: "ignore.excludes-file",
  input: z.object({ directory: z.string() }),
  output: z.object({ path: z.string().nullable() }),
});

// Adds the rule on a line of its own at the end of the place's file, and stages a .gitignore,
// unless it's ignored itself.
export const ignoreRpc = defineRpc({
  name: "ignore.add",
  input: z.object({
    directory: z.string(),
    place,
    // One line's: a rule can't have a newline, and git drops a carriage return at its end.
    rule: z.string().regex(/^[^\n\r]+$/u),
  }),
  output: z.object({}),
});
