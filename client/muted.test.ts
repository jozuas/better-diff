import * as fc from "fast-check";
import { expect, test } from "vitest";

import { mutedColour } from "./muted";

function channels(colour: string): number[] {
  return [1, 3, 5].map((start) => Number.parseInt(colour.slice(start, start + 2), 16));
}

function spread(colour: string): number {
  return Math.max(...channels(colour)) - Math.min(...channels(colour));
}

const byte = fc.integer({ min: 0, max: 255 }).map((value) => value.toString(16).padStart(2, "0"));

const colour = fc.tuple(byte, byte, byte).map((bytes) => `#${bytes.join("")}`);

// Each colour in the icons, and what Paseo mutes it to.
test.each([
  ["#0097a7", "#4f929b"],
  ["#00acc1", "#5ba6b3"],
  ["#00bcd4", "#64b6c5"],
  ["#01579b", "#2f5883"],
  ["#0277bd", "#4177a3"],
  ["#0288d1", "#4a87b6"],
  ["#1976d2", "#4678b3"],
  ["#1e88e5", "#5189c4"],
  ["#26a69a", "#5d9f97"],
  ["#26c6da", "#6fbfcc"],
  ["#29b6f6", "#6ab3dc"],
  ["#35495e", "#3c4856"],
  ["#41b883", "#6db08d"],
  ["#42a5f5", "#6ba4d7"],
  ["#4fc3f7", "#7dbfe0"],
  ["#5c6bc0", "#636fa6"],
  ["#64b5f6", "#82b3dd"],
  ["#64dd17", "#8ad36d"],
  ["#7c4dff", "#7865d2"],
  ["#7cb342", "#89ad6a"],
  ["#7e57c2", "#7963a7"],
  ["#8bc34a", "#98bd75"],
  ["#90a4ae", "#96a3a9"],
  ["#9575cd", "#907db6"],
  ["#cfd8dc", "#d2d7da"],
  ["#d500f9", "#bd59d4"],
  ["#e65100", "#c96c4a"],
  ["#ec407a", "#cf6580"],
  ["#eceff1", "#edeff0"],
  ["#ef5350", "#d26f69"],
  ["#f44336", "#d4685a"],
  ["#f9a825", "#e4b06d"],
  ["#fdd835", "#f1da83"],
  ["#ff5252", "#df736d"],
  ["#ff5722", "#df7658"],
  ["#ff6e40", "#e28568"],
  ["#ff7043", "#e2866a"],
  ["#ff9800", "#e7a464"],
  ["#ffa726", "#e9b16e"],
  ["#ffb300", "#ebba6d"],
  ["#ffca28", "#efce7b"],
  ["#ffd54f", "#f2d88b"],
  ["#ffee58", "#f7ee97"],
])("%s is muted to %s, as Paseo mutes it", (unmuted, muted) => {
  expect(mutedColour(unmuted)).toBe(muted);
});

test("a grey is left as it is", () => {
  fc.assert(
    fc.property(byte, (value) => {
      const grey = `#${value}${value}${value}`;

      expect(mutedColour(grey)).toBe(grey);
    }),
  );
});

test("muting never moves a colour's channels further apart", () => {
  fc.assert(
    fc.property(colour, (unmuted) => {
      expect(spread(mutedColour(unmuted))).toBeLessThanOrEqual(spread(unmuted));
    }),
  );
});
