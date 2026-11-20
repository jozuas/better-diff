import * as fc from "fast-check";
import { expect, test, vi } from "vitest";

import type { DeviceLayout, LayoutValues, ViewValues } from "../shared/settings";
import {
  layoutOf,
  layoutSettingsOf,
  lineLengthOf,
  noLayout,
  settingsOf,
  viewDefaults,
} from "./settings";

const refused = "The diff settings couldn't be changed. Try again.";

// A device's settings as they might be read, none of them their defaults.
const read: LayoutValues = {
  diffStyle: "side by side",
  lineLength: 100,
  diffFontSize: 16,
  panelFontSize: 18,
};

const defaults: LayoutValues = {
  diffStyle: "auto",
  lineLength: 80,
  diffFontSize: 13,
  panelFontSize: 13,
};

// What saves the settings, answering whether they were saved.
function saver(saved = true) {
  return vi
    .fn<(values: LayoutValues, revision: string) => Promise<boolean>>()
    .mockResolvedValue(saved);
}

// What reads the settings again.
function reloader() {
  return vi.fn<() => Promise<void>>().mockResolvedValue();
}

// What hears a change couldn't be saved.
function reporter() {
  return vi.fn<(message: string) => void>();
}

test("the settings are nothing until they're read", () => {
  expect(
    settingsOf({ status: "loading", save: saver(), reload: reloader() }, defaults, reporter()),
  ).toBeUndefined();
});

test("the settings are as read, and a change saves them all, changed, against the revision read", async () => {
  const save = saver();
  const reload = reloader();
  const report = reporter();

  const settings = settingsOf(
    { status: "ready", revision: "7", values: read, save, reload },
    defaults,
    report,
  );

  expect(settings?.values).toStrictEqual(read);

  await settings?.change({ diffStyle: "inline" });

  expect(save.mock.calls).toStrictEqual([[{ ...read, diffStyle: "inline" }, "7"]]);
  expect(report).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
});

test("invalid settings are their defaults, which a change saves over them", async () => {
  const save = saver();

  const settings = settingsOf(
    { status: "invalid", revision: "3", save, reload: reloader() },
    defaults,
    reporter(),
  );

  expect(settings?.values).toStrictEqual(defaults);

  await settings?.change({ diffFontSize: 16 });

  expect(save.mock.calls).toStrictEqual([[{ ...defaults, diffFontSize: 16 }, "3"]]);
});

test("settings that couldn't be read are their defaults, and a change to them says it couldn't be saved, and reads them again", async () => {
  const save = saver();
  const reload = reloader();
  const report = reporter();
  const settings = settingsOf({ status: "error", save, reload }, defaults, report);

  expect(settings?.values).toStrictEqual(defaults);

  await settings?.change({ diffStyle: "side by side" });

  expect(save).not.toHaveBeenCalled();
  expect(report.mock.calls).toStrictEqual([[refused]]);
  expect(reload).toHaveBeenCalledTimes(1);
});

test("a change that isn't saved, as one to settings changed since they were read, says so, and reads them again", async () => {
  const reload = reloader();
  const report = reporter();

  const settings = settingsOf(
    { status: "ready", revision: "7", values: read, save: saver(false), reload },
    defaults,
    report,
  );

  await settings?.change({ diffStyle: "inline" });

  expect(report.mock.calls).toStrictEqual([[refused]]);
  expect(reload).toHaveBeenCalledTimes(1);
});

test("until they're changed, the host's settings and a device's are as their documents start", () => {
  expect(viewDefaults).toStrictEqual({
    tabSize: 8,
    hideWhitespace: false,
    showKeys: true,
  } satisfies ViewValues);
  expect(noLayout).toStrictEqual({});
});

// Some of the layout's settings, as a device keeps those set on it, and as the host kept them for
// every client before each device kept its own.
const someLayout: fc.Arbitrary<DeviceLayout> = fc.record(
  {
    diffStyle: fc.constantFrom("auto", "inline", "side by side"),
    lineLength: fc.integer({ min: 20, max: 400 }),
    diffFontSize: fc.integer({ min: 9, max: 22 }),
    panelFontSize: fc.integer({ min: 10, max: 21 }),
  },
  { requiredKeys: [], noNullPrototype: true },
);

test("a device shows each of the layout's settings as set on it, or else as the host kept it before each device kept its own, or else as it starts", () => {
  expect(
    layoutOf({ diffFontSize: 16 }, { ...viewDefaults, lineLength: 100, diffFontSize: 14 }),
  ).toStrictEqual({ diffStyle: "auto", lineLength: 100, diffFontSize: 16, panelFontSize: 13 });
  expect(layoutOf(noLayout, viewDefaults)).toStrictEqual(defaults);

  fc.assert(
    fc.property(someLayout, someLayout, (device, host) => {
      expect(layoutOf(device, { ...viewDefaults, ...host })).toMatchObject(device);
      expect(layoutOf(noLayout, { ...viewDefaults, ...host })).toMatchObject(host);
    }),
  );
});

test("a device's layout changes as what's set on the device does", async () => {
  const change = vi.fn<(change: DeviceLayout) => Promise<void>>().mockResolvedValue();

  const layout = layoutSettingsOf(
    { values: { diffFontSize: 16 }, change },
    { ...viewDefaults, lineLength: 100 },
  );

  expect(layout.values).toStrictEqual({ ...defaults, lineLength: 100, diffFontSize: 16 });

  await layout.change({ diffStyle: "inline" });

  expect(change.mock.calls).toStrictEqual([[{ diffStyle: "inline" }]]);
});

test("a change to what's set on a device saves it with the rest set there, not with what the host kept or what the layout starts as", async () => {
  const save = vi
    .fn<(values: DeviceLayout, revision: string) => Promise<boolean>>()
    .mockResolvedValue(true);

  const device = settingsOf(
    { status: "ready", revision: "2", values: { diffFontSize: 16 }, save, reload: reloader() },
    noLayout,
    reporter(),
  );

  await device?.change({ diffStyle: "inline" });

  expect(save.mock.calls).toStrictEqual([[{ diffFontSize: 16, diffStyle: "inline" }, "2"]]);
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
