import { z } from "zod";

// A colour, as React Native's processColor gives it, 0xaarrggbb, at the opacity: its own alpha
// times the opacity.
function rgbaOf(color: number, opacity: number): string {
  const alpha = ((color >>> 24) / 255) * opacity;

  return `rgba(${(color >>> 16) & 0xff}, ${(color >>> 8) & 0xff}, ${color & 0xff}, ${alpha})`;
}

// What React Native's processColor makes of a colour, whatever CSS colour it is: 0xaarrggbb on the
// web, or nothing if it can't read it.
type ProcessedColor = number | symbol | null | undefined;

// The colour processColor read at the opacity, or none if it couldn't read it.
export function tintOf(processed: ProcessedColor, opacity: number): string | undefined {
  const color = z.number().safeParse(processed);

  return color.success ? rgbaOf(color.data, opacity) : undefined;
}
