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

// Where a bar over a selection of lines shows from: the point, where the lines are on the page, the
// top left corner of what it's placed in, the highest the page shows the lines from, under bars
// that stay at the top, and whether it's centred on the point, as where the pointer let go of the
// selection, or starts at it, as at the start of the text of the line the keyboard selected up to.
export interface LetGo {
  point: Point;
  area: Rect;
  origin: Point;
  ceiling: number;
  centred: boolean;
}

// Where the bar goes, by its top left corner from the origin: above the point by the gap, or as far
// below it where it would show above the lines' area's top or the ceiling, and never past the
// area's left edge, nor its right one where the area leaves room for that. A point above the area
// or below it, as where the pointer let go past the lines it selected, is taken to be at the area's
// edge.
export function barPosition(
  { point, area, origin, ceiling, centred }: LetGo,
  bar: Size,
  gap: number,
): Position {
  const y = Math.min(Math.max(point.y, area.y), area.y + area.height);
  const above = y - gap - bar.height;
  const left = centred ? point.x - bar.width / 2 : point.x;

  return {
    left: Math.max(area.x, Math.min(left, area.x + area.width - bar.width)) - origin.x,
    top: (above < Math.max(area.y, ceiling) ? y + gap : above) - origin.y,
  };
}

// Where a menu that ends at the point goes, as one opened from a button above it does: above the
// point and to its left, but never past the window's top or left edge.
export function menuEndingAt(point: Point, menu: Size): Position {
  return { left: Math.max(0, point.x - menu.width), top: Math.max(0, point.y - menu.height) };
}

// A menu's item.
export interface MenuItem {
  label: string;
  // What it says after its label, dimmed, if anything, which stays as the label's cut short.
  detail?: string | undefined;
  // A Lucide icon's name.
  icon: string;
  onPress: () => void;
  // Shown, but not pressable, as while there's nothing for it to do.
  disabled: boolean;
  // Whether it asks to be chosen again, as an action that loses work does once chosen.
  armed?: boolean;
  // Whether choosing it leaves the menu open, as for it to ask that.
  stays?: boolean;
}

// How a menu's item looks: dimmed while it's disabled, whatever the pointer does, in the danger
// colour while it asks to be chosen again, and else highlighted while the pointer is over it.
export function itemLook(
  hovered: boolean,
  disabled: boolean,
  armed = false,
): "plain" | "hovered" | "disabled" | "armed" {
  if (disabled) {
    return "disabled";
  }

  if (armed) {
    return "armed";
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
