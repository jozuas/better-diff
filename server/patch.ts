interface Line {
  kind: "context" | "removed" | "added";
  // Without its prefix or newline.
  content: Buffer;
  // False only for the last line of a version that doesn't end with a newline.
  newline: boolean;
}

interface Hunk {
  oldStart: number;
  newStart: number;
  lines: Line[];
}

// The lines of git's header a patch needs, in the order git prints them, which name the file in each
// version and say whether the patch creates, deletes or renames it, or changes its mode.
const fields = [
  "diff --git",
  "old mode",
  "new mode",
  "new file mode",
  "deleted file mode",
  "rename from",
  "rename to",
  "---",
  "+++",
] as const;

type Field = (typeof fields)[number];

// What follows each field, if git printed it.
export type Header = Record<Field, string | undefined>;

// One file's diff, as git prints it.
export interface FileDiff {
  header: Header;
  hunks: Hunk[];
}

// With every line of context, git starts each version's lines at its first, or at 0 for a version
// without any. A count left out is 1.
const hunkStart = /^@@ -[01](?:,(?<oldCount>\d+))? \+[01](?:,(?<newCount>\d+))? @@/u;

const noNewline = "\\";

const prefixes = { context: " ", removed: "-", added: "+" } as const;

const kinds = ["context", "removed", "added"] as const;

const opposites = { context: "context", removed: "added", added: "removed" } as const;

// Latin-1 reads each byte as one character and writes each character back as that byte, so a line
// keeps bytes that aren't UTF-8.
function bytes(text: string): Buffer {
  return Buffer.from(text, "latin1");
}

function field(lines: readonly string[], name: Field): string | undefined {
  return lines.find((line) => line.startsWith(`${name} `))?.slice(name.length + 1);
}

// Each field is on the first line that starts with it: the header comes before the hunks, whose
// lines can start with `---` or `+++` too.
export function headerOf(lines: readonly string[]): Header {
  return {
    "diff --git": field(lines, "diff --git"),
    "old mode": field(lines, "old mode"),
    "new mode": field(lines, "new mode"),
    "new file mode": field(lines, "new file mode"),
    "deleted file mode": field(lines, "deleted file mode"),
    "rename from": field(lines, "rename from"),
    "rename to": field(lines, "rename to"),
    "---": field(lines, "---"),
    "+++": field(lines, "+++"),
  };
}

// A change to a file's mode.
export interface Mode {
  old: string;
  new: string;
}

// The diff's change to the file's mode, which git prints as its old mode and its new one.
export function modeOf(header: Header): Mode | undefined {
  const { "old mode": old, "new mode": changed } = header;

  if (old === undefined) {
    return undefined;
  }

  if (changed === undefined) {
    throw new Error("git printed a file's old mode without its new one.");
  }

  return { old, new: changed };
}

type Kind = "text" | "unchanged" | "renamed" | "symlink" | "binary" | "mode" | "unmerged";

function hasLine(lines: readonly string[], start: string): boolean {
  return lines.some((line) => line.startsWith(start));
}

// Whether a version is a symlink, by the mode git prints for a new or deleted file, or after the
// blobs a changed one goes between.
function isSymlink(lines: readonly string[]): boolean {
  return (
    hasLine(lines, "new file mode 120000") ||
    hasLine(lines, "deleted file mode 120000") ||
    lines.some((line) => line.startsWith("index ") && line.endsWith(" 120000"))
  );
}

// What a file's diff is, from the lines git prints instead of hunks. For a file with merge
// conflicts, git prints a diff against each side of the merge, or only names the file. A renamed
// file is whatever its other changes are, and renamed only without any.
export function kindOf(diff: Buffer): Kind {
  const lines = diff.toString("latin1").split("\n");

  if (diff.length === 0) {
    return "unchanged";
  }

  if (hasLine(lines, "diff --cc ") || hasLine(lines, "* Unmerged path ")) {
    return "unmerged";
  }

  if (isSymlink(lines)) {
    return "symlink";
  }

  if (hasLine(lines, "Binary files ")) {
    return "binary";
  }

  if (lines.some((line) => hunkStart.test(line))) {
    return "text";
  }

  if (hasLine(lines, "old mode ")) {
    return "mode";
  }

  return hasLine(lines, "rename from ") ? "renamed" : "text";
}

// Whether git printed one diff, which renames a file. Of a renamed file's two paths, it prints one
// for each where it no longer pairs them.
export function isRename(diff: Buffer): boolean {
  const lines = diff.toString("latin1").split("\n");

  return (
    hasLine(lines, "rename from ") &&
    lines.filter((line) => line.startsWith("diff --git ")).length === 1
  );
}

// How many lines of each version some lines have.
interface Counts {
  old: number;
  new: number;
}

// The lines of a diff's hunks. A hunk ends where its start says, after as many lines of each version
// as it counts, as `git apply` reads it. A line after the last hunk would be the start of another
// diff, which git doesn't print for one file's path.
function linesOf(diff: Buffer): Line[] {
  const read: Line[] = [];
  const lines = diff.toString("latin1").split("\n").slice(0, -1);

  // How many of each version's lines the hunk being read has yet to show, once one is.
  let left: Counts | undefined;

  for (const [index, line] of lines.entries()) {
    if (line.startsWith(noNewline)) {
      continue;
    }

    const start = hunkStart.exec(line)?.groups;

    if (left !== undefined && (left.old > 0 || left.new > 0)) {
      const kind = kinds.find((each) => prefixes[each] === line.charAt(0));

      if (kind === undefined) {
        throw new Error(`A line in a hunk of git's diff has no " ", "-" or "+" prefix: ${line}`);
      }

      read.push({
        kind,
        content: bytes(line.slice(1)),
        newline: lines[index + 1]?.startsWith(noNewline) !== true,
      });
      left.old -= kind === "added" ? 0 : 1;
      left.new -= kind === "removed" ? 0 : 1;
    } else if (start !== undefined) {
      left = { old: Number(start["oldCount"] ?? 1), new: Number(start["newCount"] ?? 1) };
    } else if (left !== undefined) {
      throw new Error("git printed more than one diff for the path.");
    }
  }

  return read;
}

// The lines of context git prints around a change.
const context = 3;

function countsOf(lines: readonly Line[]): Counts {
  return {
    old: lines.filter(({ kind }) => kind !== "added").length,
    new: lines.filter(({ kind }) => kind !== "removed").length,
  };
}

// Where a hunk starts in a version: at its first line there, or, where it has none, after the line
// before it.
function startOf(before: number, count: number): number {
  return count > 0 ? before + 1 : before;
}

// The hunks git prints with three lines of context, from all of both versions' lines. As in git,
// changes share a hunk if no more unchanged lines than its context before and after one change
// are between them.
function narrow(lines: readonly Line[]): Hunk[] {
  // Each hunk's first and last changed line.
  const changes: [number, number][] = [];

  for (const [index, { kind }] of lines.entries()) {
    const last = changes.at(-1);

    if (kind !== "context") {
      if (last !== undefined && index - last[1] - 1 <= 2 * context) {
        last[1] = index;
      } else {
        changes.push([index, index]);
      }
    }
  }

  const hunks: Hunk[] = [];
  // Each version's lines before the next hunk, and where the lines after the last hunk start.
  const before: Counts = { old: 0, new: 0 };
  let read = 0;

  for (const [first, last] of changes) {
    const start = Math.max(first - context, 0);
    const end = last + context + 1;
    const between = countsOf(lines.slice(read, start));
    const hunkLines = lines.slice(start, end);
    const counts = countsOf(hunkLines);

    before.old += between.old;
    before.new += between.new;
    hunks.push({
      oldStart: startOf(before.old, counts.old),
      newStart: startOf(before.new, counts.new),
      lines: hunkLines,
    });
    before.old += counts.old;
    before.new += counts.new;
    read = end;
  }

  return hunks;
}

// A file's diff as git prints it with more lines of context than either version has, whose one
// hunk has all of their lines, and its hunks as git prints them with three lines of context. A
// diff of another kind has no lines.
export function parseDiff(diff: Buffer): FileDiff & { lines: Line[] } {
  const header = headerOf(diff.toString("latin1").split("\n"));

  // The plugin shows other kinds of diff without their lines. A file that changed type, as to a
  // symlink, has a diff for each version.
  if (kindOf(diff) !== "text") {
    return { header, hunks: [], lines: [] };
  }

  const lines = linesOf(diff);

  return { header, hunks: narrow(lines), lines };
}

// A path as a --- or +++ line names it: git quotes a path that needs it with its prefix.
function prefixed(prefix: string, path: string): string {
  // Stryker disable next-line MethodExpression: git quotes a path with a quote in it, so a path it prints starts with a quote only where it ends with one.
  return path.startsWith('"') ? `"${prefix}${path.slice(1)}` : `${prefix}${path}`;
}

// The diff the other way round, which undoes its changes: a file it creates, the reverse deletes,
// and a mode it changes, the reverse changes back. A file it renames keeps its new path, where the
// reverse undoes its other changes: for a diff whose `diff --git` line names two paths without
// saying it renames, `git apply` takes them from the --- and +++ lines, which name the new path as
// its rename to line does, since git prints them only with hunks.
export function reverse({ header, hunks }: FileDiff): FileDiff {
  const renamed = header["rename to"];
  const kept = renamed === undefined ? undefined : prefixed("b/", renamed);

  return {
    header: {
      "diff --git": header["diff --git"],
      "old mode": header["new mode"],
      "new mode": header["old mode"],
      "new file mode": header["deleted file mode"],
      "deleted file mode": header["new file mode"],
      "rename from": undefined,
      "rename to": undefined,
      "---": kept ?? header["+++"],
      "+++": kept ?? header["---"],
    },
    hunks: hunks.map(({ oldStart, newStart, lines }) => ({
      oldStart: newStart,
      newStart: oldStart,
      lines: lines.map((line) => ({ ...line, kind: opposites[line.kind] })),
    })),
  };
}

// The hunk's lines with only the selected changes: a removal that isn't selected leaves its line
// in place, and an addition that isn't selected leaves its line out.
function selectChanges({ lines }: Hunk, isSelected: (line: number) => boolean): Line[] {
  return lines.flatMap((line, index) => {
    if (line.kind === "context" || isSelected(index)) {
      return [line];
    }

    return line.kind === "removed" ? [{ ...line, kind: "context" }] : [];
  });
}

// Only the new version's last line can lack a newline, so a line that is no longer last gets one.
// An unchanged line, which the old version has without one, is removed and added back.
function endLines(lines: readonly Line[]): Line[] {
  const last = lines.findLastIndex(({ kind }) => kind !== "removed");

  return lines.flatMap((line, index) => {
    if (line.kind === "removed" || line.newline || index === last) {
      return [line];
    }

    return line.kind === "added"
      ? [{ ...line, newline: true }]
      : [
          { ...line, kind: "removed" },
          { ...line, kind: "added", newline: true },
        ];
  });
}

function headerLines(header: Header): Buffer[] {
  return fields.flatMap((name) => {
    const value = header[name];

    return value === undefined ? [] : [bytes(`${name} ${value}\n`)];
  });
}

// A patch of lines leaves out a mode change: like Magit and lazygit, line and hunk actions leave
// that alone. A patch that deletes a file can't leave any of its lines, so one that does changes
// the file instead.
function patchHeader(header: Header, leavesLines: boolean): Buffer[] {
  const changed =
    header["deleted file mode"] !== undefined && leavesLines
      ? { ...header, "deleted file mode": undefined, "+++": header["---"] }
      : header;

  return headerLines({ ...changed, "old mode": undefined, "new mode": undefined });
}

// A patch of only the diff's mode change, and of its rename, where it has one, as a patch of its
// lines would rename the file too.
export function buildModePatch({ header }: FileDiff): Buffer {
  return Buffer.concat(headerLines(header));
}

function render(line: Line): Buffer[] {
  return [
    bytes(prefixes[line.kind]),
    line.content,
    bytes(line.newline ? "\n" : "\n\\ No newline at end of file\n"),
  ];
}

// A patch of the diff's selected changes, which is empty when none is selected.
export function buildPatch(
  diff: FileDiff,
  isSelected: (hunk: number, line: number) => boolean,
): Buffer {
  // Each hunk's start line and lines, kept apart until the end: a hunk can have more lines than a
  // function call can take arguments.
  const hunks: Buffer[][] = [];
  // How many more lines the new version has than the old one before the next hunk.
  let offset = 0;
  let leavesLines = false;

  for (const [index, hunk] of diff.hunks.entries()) {
    const lines = endLines(selectChanges(hunk, (line) => isSelected(index, line)));

    if (lines.some(({ kind }) => kind !== "context")) {
      const oldCount = lines.filter(({ kind }) => kind !== "added").length;
      const newCount = lines.filter(({ kind }) => kind !== "removed").length;

      // `git apply` looks for a hunk's lines from where its new start says, by which point it has
      // applied the hunks before it. Where the same lines are in more than one place, a wrong new
      // start would patch the wrong ones.
      hunks.push([
        bytes(`@@ -${hunk.oldStart},${oldCount} +${hunk.oldStart + offset},${newCount} @@\n`),
        ...lines.flatMap(render),
      ]);
      offset += newCount - oldCount;
      leavesLines ||= newCount > 0;
    }
  }

  return hunks.length === 0
    ? Buffer.alloc(0)
    : Buffer.concat([...patchHeader(diff.header, leavesLines), ...hunks.flat()]);
}
