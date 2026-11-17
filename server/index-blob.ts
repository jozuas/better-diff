// The line of a diff's header that names the blobs it goes between, as git abbreviates their ids.
const indexLine = /^index (?<old>[\da-f]+)\.\.(?<new>[\da-f]+)/mu;

// What starts each section of a diff after its first. A file whose type changed, as from a symlink
// to a file, has two: one that deletes it as it was, and one that adds it as it is.
const nextSection = "\ndiff --git ";

// The blob the diff goes from, on its old side, as git names it in the header of its first section,
// or to, on its new one, as in that of its last, or undefined where git names none, as for a diff
// that changes no line, of a file only renamed, or whose mode only changed, or names more than one,
// as for a merge's.
export function blobOf(diff: Buffer, side: "old" | "new"): string | undefined {
  const start = side === "old" ? 0 : diff.lastIndexOf(nextSection) + 1;
  const header = diff.subarray(start, diff.indexOf("\n@@", start)).toString("latin1");

  const blobs = indexLine.exec(header)?.groups;

  return blobs === undefined ? undefined : blobs[side];
}
