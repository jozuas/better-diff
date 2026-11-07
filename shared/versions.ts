import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "./diff";

type Hunk = RpcOutput<typeof diffRpc>["hunks"][number];

// How many lines of the version a hunk goes from come before its own, and up to its last, and as
// many of the version it goes to. A hunk without lines of a version starts after the line before
// it, as git numbers it.
function spanOf({ oldStart, newStart, lines }: Hunk) {
  const old = lines.filter(({ kind }) => kind !== "added").length;
  const added = lines.filter(({ kind }) => kind !== "removed").length;
  const oldBefore = old === 0 ? oldStart : oldStart - 1;
  const newBefore = added === 0 ? newStart : newStart - 1;

  return { oldBefore, newBefore, oldAfter: oldBefore + old, newAfter: newBefore + added };
}

// The number, in the version the hunk goes to, of its line at the number in the version it goes
// from, or undefined if it removes it.
function within({ oldStart, newStart, lines }: Hunk, number: number): number | undefined {
  let old = oldStart;
  let added = newStart;

  for (const { kind } of lines) {
    if (kind !== "added" && old === number) {
      return kind === "removed" ? undefined : added;
    }

    old += kind === "added" ? 0 : 1;
    added += kind === "removed" ? 0 : 1;
  }

  return undefined;
}

// The number, in the version a diff goes to, of the line at the number in the version it goes
// from, by the diff's hunks, or undefined if they remove it.
export function forward(hunks: readonly Hunk[], number: number): number | undefined {
  let shift = 0;

  for (const hunk of hunks) {
    const { oldBefore, newBefore, oldAfter, newAfter } = spanOf(hunk);

    if (number <= oldBefore) {
      return number + newBefore - oldBefore;
    }

    if (number <= oldAfter) {
      return within(hunk, number);
    }

    shift = newAfter - oldAfter;
  }

  return number + shift;
}

const swapped = { context: "context", removed: "added", added: "removed" } as const;

// The hunk of the diff the other way round, from the version it goes to to the one it goes from.
function reversed({ oldStart, newStart, lines }: Hunk): Hunk {
  return {
    oldStart: newStart,
    newStart: oldStart,
    lines: lines.map((line) => ({ ...line, kind: swapped[line.kind] })),
  };
}

// The number, in the version a diff goes from, of the line at the number in the version it goes
// to, by the diff's hunks, or undefined if they add it.
export function backward(hunks: readonly Hunk[], number: number): number | undefined {
  return forward(hunks.map(reversed), number);
}
