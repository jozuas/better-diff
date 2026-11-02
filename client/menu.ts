// A point on the page, from its top left corner.
export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

// Where a menu goes, by its top left corner.
interface Position {
  left: number;
  top: number;
}

// Where a menu opened at the point goes: below the point and to its right, as far as the window
// leaves room, and otherwise above it or to its left, but never past the window's top or left edge.
export function menuPosition(point: Point, menu: Size, window: Size): Position {
  return {
    left: Math.max(0, point.x + menu.width > window.width ? point.x - menu.width : point.x),
    top: Math.max(0, point.y + menu.height > window.height ? point.y - menu.height : point.y),
  };
}
