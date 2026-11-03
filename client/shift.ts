import { z } from "zod";

// A key pressed, and the modifiers held, as a key's event has them.
export interface Keys {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

// How far the key, pressed with Shift and no other modifier, moves the file a selection reaches: 1
// for ↓, and -1 for ↑. None for another key, or other modifiers.
export function shiftStep({ key, shiftKey, altKey, ctrlKey, metaKey }: Keys): 1 | -1 | undefined {
  if (!shiftKey || altKey || ctrlKey || metaKey) {
    return undefined;
  }

  if (key === "ArrowDown") {
    return 1;
  }

  return key === "ArrowUp" ? -1 : undefined;
}

// What a press's event says of Shift, as a click's does on the web, though React Native's types
// leave it out.
const held = z.object({ shiftKey: z.boolean() });

// Whether Shift was held for a press.
export function withShift({ nativeEvent }: { nativeEvent: object }): boolean {
  return held.safeParse(nativeEvent).data?.shiftKey === true;
}
