import type { CommandIn } from "./keymap";

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

// How a menu's item looks: dimmed while it's disabled, whatever the pointer does, and else
// highlighted while the pointer is over it.
export function itemLook(hovered: boolean, disabled: boolean): "plain" | "hovered" | "disabled" {
  if (disabled) {
    return "disabled";
  }

  return hovered ? "hovered" : "plain";
}

// How far each command moves focus through a menu's items.
const steps: Record<CommandIn<"menu">, number> = { down: 1, up: -1 };

// The index of the item of a menu of `count` items that the command moves focus to from the item at
// the index: the next for ↓, and the one before for ↑, round from the last to the first and back.
export function menuStep(command: CommandIn<"menu">, index: number, count: number): number {
  return (index + steps[command] + count) % count;
}
