import { viewSettings } from "../shared/settings";
import type { ViewValues } from "../shared/settings";

// The host's settings of how diffs show as useSettings gives them: their read, which is pending,
// failed, found them invalid or found their values, and what saves them all against the revision
// read.
type State = (
  | { status: "loading" }
  | { status: "error"; revision?: undefined }
  | { status: "invalid"; revision: string }
  | { status: "ready"; revision: string; values: ViewValues }
) & { save: (values: ViewValues, revision: string) => Promise<boolean> };

// The settings, and what changes some of them, keeping the others, once the change is saved.
interface ViewSettings {
  values: ViewValues;
  change: (change: Partial<ViewValues>) => Promise<void>;
}

// The settings once they're read, their defaults where they're invalid or couldn't be read. A
// change the host can't save is reported.
export function viewSettingsOf(
  state: State,
  report: (message: string) => void,
): ViewSettings | undefined {
  if (state.status === "loading") {
    return undefined;
  }

  const values = state.status === "ready" ? state.values : viewSettings.schema.parse({});
  const { revision } = state;

  return {
    values,
    change: async (change) => {
      const saved =
        revision !== undefined && (await state.save({ ...values, ...change }, revision));

      if (!saved) {
        report("The diff settings couldn't be changed. Try again.");
      }
    },
  };
}
