import { z } from "zod";

// What a press's event says of Shift, as a click's does on the web, though React Native's types
// leave it out.
const held = z.object({ shiftKey: z.boolean() });

// Whether Shift was held for a press.
export function withShift({ nativeEvent }: { nativeEvent: object }): boolean {
  return held.safeParse(nativeEvent).data?.shiftKey === true;
}
