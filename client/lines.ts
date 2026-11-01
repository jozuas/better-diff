import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";

type Hunk = RpcOutput<typeof diffRpc>["hunks"][number];

// A line with its numbers in the old version of the file and the new one. A removed line has no new
// number, and an added line no old one.
export interface NumberedLine extends Readonly<Hunk["lines"][number]> {
  oldNumber: number | undefined;
  newNumber: number | undefined;
}

export function numberLines({ oldStart, newStart, lines }: Hunk): NumberedLine[] {
  let oldNumber = oldStart;
  let newNumber = newStart;
  const numbered: NumberedLine[] = [];

  for (const line of lines) {
    numbered.push({
      ...line,
      oldNumber: line.kind === "added" ? undefined : oldNumber,
      newNumber: line.kind === "removed" ? undefined : newNumber,
    });

    if (line.kind !== "added") {
      oldNumber += 1;
    }

    if (line.kind !== "removed") {
      newNumber += 1;
    }
  }

  return numbered;
}
