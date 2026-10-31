import * as fc from "fast-check";

// What git quotes or escapes in its output and in patches (newlines, `\r`, tabs, quotes, backslashes
// and non-ASCII), what a pathspec reads as a pattern (`*`, `?`, `[`, `:`, `!`), and a leading `-`,
// which reads as an option. Each letter comes in one case only, so no two names clash on a
// case-insensitive file system such as macOS's.
const unit = fc.constantFrom(
  "a",
  "B",
  " ",
  "-",
  "\n",
  "\r",
  "\t",
  '"',
  "'",
  "\\",
  "*",
  "?",
  "[",
  "]",
  ":",
  "!",
  "#",
  "é",
  "中",
  "😀",
);

export const filePath = fc
  .array(fc.string({ unit, minLength: 1, maxLength: 6 }), { minLength: 1, maxLength: 3 })
  .map((names) => names.join("/"));

// Whether the paths can all be files at once: no two are the same, and none is a directory another
// is inside.
export function canCoexist(paths: readonly string[]): boolean {
  return (
    new Set(paths).size === paths.length &&
    paths.every((path) => !paths.some((other) => other.startsWith(`${path}/`)))
  );
}
