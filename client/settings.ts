import { layoutValues, viewSettings } from "../shared/settings";
import type { DeviceLayout, LayoutValues, ViewValues } from "../shared/settings";

// The line length typed, if it's a whole number of characters the settings take.
export function lineLengthOf(text: string): number | undefined {
  const typed = text.trim();
  const parsed = layoutValues.shape.lineLength.safeParse(Number(typed));

  return /^\d+$/u.test(typed) && parsed.success ? parsed.data : undefined;
}

// Settings as useSettings gives them: their read, which is pending, failed, found them invalid or
// found their values, what saves them all against the revision read, and what reads them again.
type State<Values> = (
  | { status: "loading" }
  | { status: "error"; revision?: undefined }
  | { status: "invalid"; revision: string }
  | { status: "ready"; revision: string; values: Values }
) & {
  save: (values: Values, revision: string) => Promise<boolean>;
  reload: () => Promise<void>;
};

// The settings, and what changes some of them, keeping the others, once the change is saved.
export interface Settings<Values> {
  values: Values;
  change: (change: Partial<Values>) => Promise<void>;
}

// The settings once they're read, the defaults where they're invalid or couldn't be read. A change
// that can't be saved is reported, and the settings read again, so that it can be once tried again:
// a device's aren't read again by themselves once they change, as from another of its windows, and
// a change is saved only against them as they are.
export function settingsOf<Values>(
  state: State<Values>,
  defaults: Values,
  report: (message: string) => void,
): Settings<Values> | undefined {
  if (state.status === "loading") {
    return undefined;
  }

  const values = state.status === "ready" ? state.values : defaults;
  const { revision } = state;

  return {
    values,
    change: async (change) => {
      const saved =
        revision !== undefined && (await state.save({ ...values, ...change }, revision));

      if (!saved) {
        report("The diff settings couldn't be changed. Try again.");
        await state.reload();
      }
    },
  };
}

// What the host's settings are until they're changed, and what a device keeps of the layout until
// any of it is set there: nothing.
export const viewDefaults = viewSettings.schema.parse({});
export const noLayout: DeviceLayout = {};

// The layout a device shows: each of its settings as set on the device, or else as the host kept it
// for every client before each device kept its own, so that it's not lost to the devices that
// showed it, or else as it starts.
export function layoutOf(device: DeviceLayout, host: ViewValues): LayoutValues {
  return layoutValues.parse({ ...host, ...device });
}

// A device's layout, as layoutOf has it, and what changes some of its settings on the device.
export function layoutSettingsOf(
  device: Settings<DeviceLayout>,
  host: ViewValues,
): Settings<LayoutValues> {
  return { values: layoutOf(device.values, host), change: device.change };
}
