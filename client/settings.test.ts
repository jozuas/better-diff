import { expect, test, vi } from "vitest";

import type { ViewValues } from "../shared/settings";
import { viewSettingsOf } from "./settings";

const refused = "The diff settings couldn't be changed. Try again.";

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

  const settings = viewSettingsOf(
    { status: "ready", revision: "7", values: { sideBySide: true }, save },
    report,
  );

  expect(settings?.values).toStrictEqual({ sideBySide: true });

  await settings?.change({ sideBySide: false });

  expect(save.mock.calls).toStrictEqual([[{ sideBySide: false }, "7"]]);
  expect(report).not.toHaveBeenCalled();
});

test("invalid settings are their defaults, which a change saves over them", async () => {
  const save = saver();
  const settings = viewSettingsOf({ status: "invalid", revision: "3", save }, reporter());

  expect(settings?.values).toStrictEqual({ sideBySide: false });

  await settings?.change({ sideBySide: true });

  expect(save.mock.calls).toStrictEqual([[{ sideBySide: true }, "3"]]);
});

test("settings that couldn't be read are their defaults, and a change to them says it couldn't be saved", async () => {
  const save = saver();
  const report = reporter();
  const settings = viewSettingsOf({ status: "error", save }, report);

  expect(settings?.values).toStrictEqual({ sideBySide: false });

  await settings?.change({ sideBySide: true });

  expect(save).not.toHaveBeenCalled();
  expect(report.mock.calls).toStrictEqual([[refused]]);
});

test("a change the host refuses to save says so", async () => {
  const report = reporter();

  const settings = viewSettingsOf(
    { status: "ready", revision: "7", values: { sideBySide: true }, save: saver(false) },
    report,
  );

  await settings?.change({ sideBySide: false });

  expect(report.mock.calls).toStrictEqual([[refused]]);
});
