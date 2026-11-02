import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import {
  Loading,
  SettingsCard,
  SettingsSection,
  SettingsSelect,
  useToast,
} from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { Text } from "react-native";

import { fontSizeRanges, viewSettings } from "../shared/settings";
import { sizeOptions } from "./fonts";
import { viewSettingsOf } from "./settings";

// The styles a diff can show in.
const diffStyles = [
  { label: "Inline", value: "inline" },
  { label: "Side by side", value: "side by side" },
] as const;

const diffSizes = sizeOptions(fontSizeRanges.diff);
const panelSizes = sizeOptions(fontSizeRanges.panel);

// Paseo's own sizes, though its code size says it sizes diffs, don't reach Better Diff, and its zoom
// reaches everything.
const sizesNote =
  "Better Diff only. Paseo's own sizes, under Appearance, don't change Better Diff, and ⌘+ and ⌘− zoom all of Paseo, Better Diff included.";

// Better Diff's page in Paseo's settings.
export function SettingsScreen({ theme }: PluginSurfaceProps): ReactElement {
  const toast = useToast();
  const settings = viewSettingsOf(useSettings(viewSettings), toast.error);

  if (settings === undefined) {
    return <Loading />;
  }

  return (
    <>
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
      <SettingsSection title="Better Diff font sizes">
        <SettingsCard>
          <SettingsSelect
            label="Diff font size"
            hint="The lines of Better Diff's diffs, and their numbers"
            value={String(settings.values.diffFontSize)}
            options={diffSizes}
            onValueChange={(size) => {
              void settings.change({ diffFontSize: Number(size) });
            }}
          />
          <SettingsSelect
            label="Panel font size"
            hint="The rest of Better Diff's panel: its file list, bars and buttons"
            value={String(settings.values.panelFontSize)}
            options={panelSizes}
            onValueChange={(size) => {
              void settings.change({ panelFontSize: Number(size) });
            }}
          />
        </SettingsCard>
        <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>{sizesNote}</Text>
      </SettingsSection>
    </>
  );
}
