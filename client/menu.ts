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
export interface Position {
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

// Where a menu that ends at the point goes, as one opened from a button above it does: above the
// point and to its left, but never past the window's top or left edge.
export function menuEndingAt(point: Point, menu: Size): Position {
  return { left: Math.max(0, point.x - menu.width), top: Math.max(0, point.y - menu.height) };
}

// How a menu's item looks: dimmed while it's disabled, whatever the pointer does, and else
// highlighted while the pointer is over it.
export function itemLook(hovered: boolean, disabled: boolean): "plain" | "hovered" | "disabled" {
  if (disabled) {
    return "disabled";
  }

  return hovered ? "hovered" : "plain";
}

// What a menu's item is called: its label, and what it says after it, if anything.
export function itemName(label: string, detail?: string): string {
  return detail === undefined ? label : `${label}, ${detail}`;
}

// How far each command moves focus through a menu's items.
const steps: Record<CommandIn<"menu">, number> = { down: 1, up: -1 };

// The index of the item of a menu of `count` items that the command moves focus to from the item at
// the index: the next for ↓, and the one before for ↑, round from the last to the first and back.
export function menuStep(command: CommandIn<"menu">, index: number, count: number): number {
  return (index + steps[command] + count) % count;
}

// Where something is on the page: its top left corner, and its size.
export interface Rect extends Point, Size {}

// Where a panel goes, by its right and bottom edges' distances from the window's, how wide it is,
// and how tall it can be.
interface PanelPlacement {
  right: number;
  bottom: number;
  width: number;
  maxHeight: number;
}

// Where a panel opened from a button goes: above the button, its right edge at the button's, as wide as `width` where the window
// leaves room for that, and no taller than the room above the button, with a margin to the window's
// edges, and a gap to the button.
export function panelPosition(button: Rect, window: Size, width: number): PanelPlacement {
  const margin = 8;
  const gap = 6;

  return {
    right: Math.max(margin, window.width - button.x - button.width),
    bottom: window.height - button.y + gap,
    width: Math.min(width, window.width - 2 * margin),
    maxHeight: Math.max(0, button.y - gap - margin),
  };
}
