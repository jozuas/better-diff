import * as fc from "fast-check";
import { expect, test, vi } from "vitest";

import type { ViewValues } from "../shared/settings";
import { lineLengthOf, viewSettingsOf } from "./settings";

const refused = "The diff settings couldn't be changed. Try again.";

// Settings as a host might have read them, none of them their defaults.
const read: ViewValues = {
  diffStyle: "side by side",
  lineLength: 100,
  tabSize: 4,
  hideWhitespace: true,
  diffFontSize: 16,
  panelFontSize: 18,
};

const defaults: ViewValues = {
  diffStyle: "auto",
  lineLength: 80,
  tabSize: 8,
  hideWhitespace: false,
  diffFontSize: 13,
  panelFontSize: 13,
};

// What saves the settings, answering whether the host saved them.
function saver(saved = true) {
  return vi
    .fn<(values: ViewValues, revision: string) => Promise<boolean>>()
    .mockResolvedValue(saved);
}

// What hears a change couldn't be saved.
function reporter() {
  return vi.fn<(message: string) => void>();
}

test("the settings are nothing until they're read", () => {
  expect(viewSettingsOf({ status: "loading", save: saver() }, reporter())).toBeUndefined();
});

test("the settings are as read, and a change saves them all, changed, against the revision read", async () => {
  const save = saver();
  const report = reporter();

  const settings = viewSettingsOf({ status: "ready", revision: "7", values: read, save }, report);

  expect(settings?.values).toStrictEqual(read);

  await settings?.change({ diffStyle: "inline" });

  expect(save.mock.calls).toStrictEqual([[{ ...read, diffStyle: "inline" }, "7"]]);
  expect(report).not.toHaveBeenCalled();
});

test("invalid settings are their defaults, which a change saves over them", async () => {
  const save = saver();
  const settings = viewSettingsOf({ status: "invalid", revision: "3", save }, reporter());

  expect(settings?.values).toStrictEqual(defaults);

  await settings?.change({ diffFontSize: 16 });

  expect(save.mock.calls).toStrictEqual([[{ ...defaults, diffFontSize: 16 }, "3"]]);
});

test("settings that couldn't be read are their defaults, and a change to them says it couldn't be saved", async () => {
  const save = saver();
  const report = reporter();
  const settings = viewSettingsOf({ status: "error", save }, report);

  expect(settings?.values).toStrictEqual(defaults);

  await settings?.change({ diffStyle: "side by side" });

  expect(save).not.toHaveBeenCalled();
  expect(report.mock.calls).toStrictEqual([[refused]]);
});

test("a change the host refuses to save says so", async () => {
  const report = reporter();

  const settings = viewSettingsOf(
    { status: "ready", revision: "7", values: read, save: saver(false) },
    report,
  );

  await settings?.change({ diffStyle: "inline" });

  expect(report.mock.calls).toStrictEqual([[refused]]);
});

test("a whole number from 20 to 400 is a line length, typed with or without spaces around it", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 20, max: 400 }),
      fc.constantFrom("", " ", "\t", "\n"),
      (length, space) => {
        expect(lineLengthOf(`${space}${length}${space}`)).toBe(length);
      },
    ),
  );
});

test("a number shorter than 20 or longer than 400 isn't a line length", () => {
  fc.assert(
    fc.property(fc.oneof(fc.integer({ max: 19 }), fc.integer({ min: 401 })), (length) => {
      expect(lineLengthOf(String(length))).toBeUndefined();
    }),
  );
});

test("text that isn't a whole number isn't a line length, though JavaScript reads it as one", () => {
  for (const text of ["", " ", "80.0", "8e1", "0x50", "+80", "80 0", "eighty"]) {
    expect(lineLengthOf(text)).toBeUndefined();
  }
});
