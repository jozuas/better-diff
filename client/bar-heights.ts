// The heights of the files' bars by their paths, once the bar of the file at the path is measured:
// the same heights if they have its height already.
export function measured(
  heights: ReadonlyMap<string, number>,
  path: string,
  height: number,
): ReadonlyMap<string, number> {
  return heights.get(path) === height ? heights : new Map(heights).set(path, height);
}

// The height of the tallest of the bars of the files at the paths, by their heights, or 0 if none
// has been measured.
export function tallest(heights: ReadonlyMap<string, number>, paths: readonly string[]): number {
  return Math.max(0, ...paths.map((path) => heights.get(path) ?? 0));
}
