import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const colors = z.record(z.string(), z.string());

// The colour of each style a diff's highlights give, in Paseo's default syntax theme, One: for a
// light Paseo theme and a dark one.
export const syntaxColorsRpc = defineRpc({
  name: "syntax.colors",
  input: z.object({}),
  output: z.object({ light: colors, dark: colors }),
});
