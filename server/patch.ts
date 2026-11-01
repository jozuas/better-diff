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

// The lines of git's header a patch needs, which name the file in each version and say whether the
// patch creates or deletes it. A patch leaves out the others, such as a mode change: like Magit and
// `git add -p`, line and hunk actions leave that alone.
const fields = ["diff --git", "new file mode", "deleted file mode", "---", "+++"] as const;

type Field = (typeof fields)[number];

// What follows each field, if git printed it.
type Header = Record<Field, string | undefined>;

// One file's diff, as git prints it.
export interface FileDiff {
  header: Header;
  hunks: Hunk[];
}

// A count left out is 1.
const hunkStart =
  /^@@ -(?<oldStart>\d+)(?:,(?<oldCount>\d+))? \+(?<newStart>\d+)(?:,(?<newCount>\d+))? @@/u;

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
function headerOf(lines: readonly string[]): Header {
  return {
    "diff --git": field(lines, "diff --git"),
    "new file mode": field(lines, "new file mode"),
    "deleted file mode": field(lines, "deleted file mode"),
    "---": field(lines, "---"),
    "+++": field(lines, "+++"),
  };
}

type Kind = "text" | "unchanged" | "symlink" | "binary" | "mode" | "unmerged";

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
// conflicts, git prints a diff against each side of the merge, or only names the file.
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

  return hasLine(lines, "old mode ") && !lines.some((line) => hunkStart.test(line))
    ? "mode"
    : "text";
}

// A hunk ends where its start says, after as many lines of each version as it counts, as
// `git apply` reads it. A line after the last hunk is the start of another diff, as git prints for
// a directory.
export function parseDiff(diff: Buffer): FileDiff {
  const hunks: Hunk[] = [];
  const lines = diff.toString("latin1").split("\n").slice(0, -1);

  // The plugin shows other kinds of diff without their lines. A file that changed type, as to a
  // symlink, has a diff for each version.
  if (kindOf(diff) !== "text") {
    return { header: headerOf(lines), hunks };
  }

  // The hunk being read, and how many of each version's lines it has yet to show.
  let reading: { lines: Line[]; oldLeft: number; newLeft: number } | undefined;

  for (const [index, line] of lines.entries()) {
    if (line.startsWith(noNewline)) {
      continue;
    }

    const start = hunkStart.exec(line)?.groups;

    if (reading !== undefined && (reading.oldLeft > 0 || reading.newLeft > 0)) {
      const kind = kinds.find((each) => prefixes[each] === line.charAt(0));

      if (kind === undefined) {
        throw new Error(`A line in a hunk of git's diff has no " ", "-" or "+" prefix: ${line}`);
      }

      reading.lines.push({
        kind,
        content: bytes(line.slice(1)),
        newline: lines[index + 1]?.startsWith(noNewline) !== true,
      });
      reading.oldLeft -= kind === "added" ? 0 : 1;
      reading.newLeft -= kind === "removed" ? 0 : 1;
    } else if (start !== undefined) {
      const hunkLines: Line[] = [];

      hunks.push({
        oldStart: Number(start["oldStart"]),
        newStart: Number(start["newStart"]),
        lines: hunkLines,
      });
      reading = {
        lines: hunkLines,
        oldLeft: Number(start["oldCount"] ?? 1),
        newLeft: Number(start["newCount"] ?? 1),
      };
    } else if (reading !== undefined) {
      throw new Error("git printed more than one diff for the path.");
    }
  }

  return { header: headerOf(lines), hunks };
}

// The diff the other way round, which undoes its changes: a file it creates, the reverse deletes.
export function reverse({ header, hunks }: FileDiff): FileDiff {
  return {
    header: {
      "diff --git": header["diff --git"],
      "new file mode": header["deleted file mode"],
      "deleted file mode": header["new file mode"],
      "---": header["+++"],
      "+++": header["---"],
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

// A patch that deletes a file can't leave any of its lines, so one that does changes the file
// instead.
function patchHeader(header: Header, leavesLines: boolean): Buffer[] {
  const changed =
    header["deleted file mode"] !== undefined && leavesLines
      ? { ...header, "deleted file mode": undefined, "+++": header["---"] }
      : header;

  return fields.flatMap((name) => {
    const value = changed[name];

    return value === undefined ? [] : [bytes(`${name} ${value}\n`)];
  });
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
