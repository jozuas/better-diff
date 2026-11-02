import { useSettings } from "@getpaseo/plugin/client";
import {
  Loading,
  SettingsCard,
  SettingsSection,
  SettingsSelect,
  useToast,
} from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";

import { viewSettings } from "../shared/settings";
import { viewSettingsOf } from "./settings";

// The styles a diff can show in.
const diffStyles = [
  { label: "Inline", value: "inline" },
  { label: "Side by side", value: "side by side" },
] as const;

// Better Diff's page in Paseo's settings.
export function SettingsScreen(): ReactElement {
  const toast = useToast();
  const settings = viewSettingsOf(useSettings(viewSettings), toast.error);

  if (settings === undefined) {
    return <Loading />;
  }

  return (
    <SettingsSection title="Diff">
      <SettingsCard>
        <SettingsSelect
          label="Diff style"
          hint="Removed lines above the added ones, or beside them."
          value={settings.values.sideBySide ? "side by side" : "inline"}
          options={diffStyles}
          onValueChange={(style) => {
            void settings.change({ sideBySide: style === "side by side" });
          }}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
