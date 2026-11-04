import type { Keys } from "./shift";

// How far ↓ and ↑ move focus down a list.
const steps = new Map<string, 1 | -1>([
  ["ArrowDown", 1],
  ["ArrowUp", -1],
]);

function withModifier({ shiftKey, altKey, ctrlKey, metaKey }: Keys): boolean {
  return shiftKey || altKey || ctrlKey || metaKey;
}

// Where the key, pressed without modifiers, moves focus from a file's row: to the file the sidebar
// lists after it, 1 for ↓, or before it, -1 for ↑, or into its diff for →. None for another key, or
// with a modifier.
export function rowMove(keys: Keys): 1 | -1 | "diff" | undefined {
  if (withModifier(keys)) {
    return undefined;
  }

  return keys.key === "ArrowRight" ? "diff" : steps.get(keys.key);
}

// Where the key, pressed without modifiers, moves focus from a hunk's bar: to the next hunk, 1 for
// ↓, or the one before, -1 for ↑, or back to its file's row for ←. None for another key, or with a
// modifier.
export function hunkMove(keys: Keys): 1 | -1 | "row" | undefined {
  if (withModifier(keys)) {
    return undefined;
  }

  return keys.key === "ArrowLeft" ? "row" : steps.get(keys.key);
}
