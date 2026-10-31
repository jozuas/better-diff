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

// One file's diff, as git prints it.
export interface FileDiff {
  // The lines naming the file, which a patch of it starts with.
  header: Buffer[];
  hunks: Hunk[];
}

const hunkStart = /^@@ -(?<oldStart>\d+)(?:,\d+)? \+(?<newStart>\d+)(?:,\d+)? @@/u;

const noNewline = "\\";

const prefixes = { context: " ", removed: "-", added: "+" } as const;

const opposites = { context: "context", removed: "added", added: "removed" } as const;

// Latin-1 reads each byte as one character and writes each character back as that byte, so a line
// keeps bytes that aren't UTF-8.
function bytes(text: string): Buffer {
  return Buffer.from(text, "latin1");
}

function kindOf(prefix: string): Line["kind"] {
  if (prefix === prefixes.removed) {
    return "removed";
  }

  return prefix === prefixes.added ? "added" : "context";
}

export function parseDiff(diff: Buffer): FileDiff {
  const header: Buffer[] = [];
  const hunks: Hunk[] = [];
  const lines = diff.toString("latin1").split("\n").slice(0, -1);

  for (const [index, line] of lines.entries()) {
    const start = hunkStart.exec(line)?.groups;
    const hunk = hunks.at(-1);

    if (start !== undefined) {
      hunks.push({
        oldStart: Number(start["oldStart"]),
        newStart: Number(start["newStart"]),
        lines: [],
      });
    } else if (hunk === undefined) {
      header.push(bytes(line));
    } else if (!line.startsWith(noNewline)) {
      hunk.lines.push({
        kind: kindOf(line.charAt(0)),
        content: bytes(line.slice(1)),
        newline: lines[index + 1]?.startsWith(noNewline) !== true,
      });
    }
  }

  return { header, hunks };
}

// The diff the other way round, which undoes its changes.
export function reverse({ header, hunks }: FileDiff): FileDiff {
  return {
    header,
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
  return lines.flatMap((line, index) => {
    const isLast = lines.slice(index + 1).every(({ kind }) => kind === "removed");

    if (line.kind === "removed" || line.newline || isLast) {
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
  const hunks: Buffer[] = [];
  // How many more lines the new version has than the old one before the next hunk.
  let offset = 0;

  for (const [index, hunk] of diff.hunks.entries()) {
    const lines = endLines(selectChanges(hunk, (line) => isSelected(index, line)));

    if (lines.some(({ kind }) => kind !== "context")) {
      const oldCount = lines.filter(({ kind }) => kind !== "added").length;
      const newCount = lines.filter(({ kind }) => kind !== "removed").length;

      // `git apply` looks for a hunk's lines from where its new start says, by which point it has
      // applied the hunks before it. Where the same lines are in more than one place, a wrong new
      // start would patch the wrong ones.
      hunks.push(
        bytes(`@@ -${hunk.oldStart},${oldCount} +${hunk.oldStart + offset},${newCount} @@\n`),
        ...lines.flatMap(render),
      );
      offset += newCount - oldCount;
    }
  }

  return hunks.length === 0
    ? Buffer.alloc(0)
    : Buffer.concat([...diff.header.flatMap((line) => [line, bytes("\n")]), ...hunks]);
}
