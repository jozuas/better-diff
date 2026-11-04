import type { Keys } from "./shift";

// The file list's width before it's resized.
export const defaultWidth = 280;

// The narrowest the file list gets, and the narrowest it leaves the diff beside it.
const narrowest = { fileList: 160, diff: 240 };

// The width the file list gets for the width wanted, in a panel of the width: no narrower than its
// narrowest, nor so wide it leaves the diff narrower than its own, unless the panel is too narrow
// for both.
export function fileListWidth(wanted: number, panel: number): number {
  return Math.max(narrowest.fileList, Math.min(wanted, panel - narrowest.diff));
}

// Where on the page a drag of the separator started, and the file list's width then.
export interface DragStart {
  x: number;
  width: number;
}

// The width wanted as a drag reaches `x` on the page: the width at its start and how far it's gone,
// or the width as it is without a drag.
export function draggedWidth(start: DragStart | null, width: number, x: number): number {
  return start === null ? width : start.width + x - start.x;
}

// Which way each key that resizes the file list moves the separator.
const directions = new Map([
  ["ArrowLeft", -1],
  ["ArrowRight", 1],
]);

// How far the key, pressed with focus on the separator, widens the file list: → by 10 pixels, and
// by 50 with Shift, and ← narrows it as far. None for another key, or with another modifier.
export function keyedStep({ key, shiftKey, altKey, ctrlKey, metaKey }: Keys): number | undefined {
  const direction = directions.get(key);

  if (direction === undefined || altKey || ctrlKey || metaKey) {
    return undefined;
  }

  return direction * (shiftKey ? 50 : 10);
}
