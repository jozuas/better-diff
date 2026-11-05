import type { FileVersions } from "./file-contents";
import { runGitBytes } from "./repository";
import { diffCommands, sides } from "./staging";
import type { Diff, Operation, Side } from "./staging";

type Line = Diff["hunks"][number]["lines"][number];

export interface DiffLine {
  prefix: string;
  bytes: Buffer;
  newline: boolean;
}

// Each of the file's lines, added, as a diff of an untracked file has them.
export function addedLines(content: Buffer | undefined): DiffLine[] {
  // Latin-1 reads each byte as one character, so bytes that aren't UTF-8 survive. What follows the
  // last newline is a last line without one, unless it's empty.
  const lines = (content ?? Buffer.alloc(0)).toString("latin1").split("\n");

  return lines.flatMap((line, index) =>
    index < lines.length - 1 || line !== ""
      ? [{ prefix: "+", bytes: Buffer.from(line, "latin1"), newline: index < lines.length - 1 }]
      : [],
  );
}

// Every line of the file's diff, unchanged ones included, as git prints them with more lines of
// context than the file has, with the options. git diff leaves out an untracked file, whose
// unstaged diff adds all of its lines.
export function fullDiff(
  repository: string,
  path: string,
  side: Side,
  versions: FileVersions,
  options: readonly string[] = [],
): DiffLine[] {
  if (side === "unstaged" && versions.index === undefined) {
    return addedLines(versions.worktree);
  }

  const diff = runGitBytes(repository, [
    ...diffCommands[side],
    ...options,
    "--unified=1000000",
    "--",
    path,
  ]);

  // Latin-1 reads each byte as one character, so bytes that aren't UTF-8 survive.
  const output = diff.toString("latin1").split("\n");
  const start = output.findIndex((line) => line.startsWith("@@"));

  // A new or deleted empty file's diff has no hunk.
  if (start === -1) {
    return [];
  }

  // The lines after the one hunk's start, without the empty string after the last newline.
  const hunk = output.slice(start + 1, -1);
  const lines: DiffLine[] = [];

  for (const line of hunk) {
    const previous = lines.at(-1);

    if (line.startsWith("\\") && previous !== undefined) {
      previous.newline = false;
    } else {
      lines.push({
        prefix: line.charAt(0),
        bytes: Buffer.from(line.slice(1), "latin1"),
        newline: true,
      });
    }
  }

  return lines;
}

// The versions each side's diff goes from and to.
export const diffVersions: Record<Side, readonly [keyof FileVersions, keyof FileVersions]> = {
  unstaged: ["index", "worktree"],
  staged: ["head", "index"],
};

// The file with only the selected changes made, when staging, or undone, when unstaging or
// discarding. Its lines are the unchanged ones, the removed ones whose removal isn't made and the
// added ones whose addition is. Only its last line can lack a newline, if it lacked one where it
// came from. There's no file if no change is made to a version without it, or every change is made
// to get to one.
export function withSelectedChanges(
  lines: readonly DiffLine[],
  selected: readonly boolean[],
  operation: Operation,
  versions: FileVersions,
): Buffer | undefined {
  // Unstaging and discarding undo the selected changes, which leaves the others made.
  const made = selected.map((isSelected) => isSelected === (operation === "stage"));
  const [from, to] = diffVersions[sides[operation]];

  if (
    (versions[from] === undefined && made.every((isMade) => !isMade)) ||
    (versions[to] === undefined && made.every(Boolean))
  ) {
    return undefined;
  }

  const changes = made.values();

  const kept = lines.filter(
    ({ prefix }) => prefix === " " || (prefix === "+") === changes.next().value,
  );

  return Buffer.concat(
    kept.flatMap(({ bytes, newline }, index) =>
      newline || index < kept.length - 1 ? [bytes, Buffer.from("\n")] : [bytes],
    ),
  );
}

// Each changed line of git's diff, as the plugin shows it in a file whose name the highlighter knows
// no language by, without runs.
export function asShown(lines: readonly DiffLine[]): Line[] {
  return lines.flatMap(({ prefix, bytes, newline }) =>
    prefix === " "
      ? []
      : [
          {
            kind: prefix === "-" ? "removed" : "added",
            text: bytes.toString("utf8"),
            newline,
            runs: [],
          },
        ],
  );
}

export function changedLines(diff: Diff): Line[] {
  return diff.hunks.flatMap(({ lines }) => lines.filter(({ kind }) => kind !== "context"));
}

// Whether each changed line, in order, is selected.
export function selectedChanges(
  diff: Diff,
  isSelected: (hunk: number, line: number) => boolean,
): boolean[] {
  return diff.hunks.flatMap(({ lines }, hunk) =>
    lines.flatMap(({ kind }, line) => (kind === "context" ? [] : [isSelected(hunk, line)])),
  );
}
