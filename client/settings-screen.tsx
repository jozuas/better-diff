import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import {
  Loading,
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsSection,
  SettingsSelect,
  useToast,
} from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useState } from "react";
import { Text } from "react-native";

import { fontSizeRanges, lineLengthRange, viewSettings } from "../shared/settings";
import { sizeOptions } from "./fonts";
import { lineLengthOf, viewSettingsOf } from "./settings";

// The styles a diff can show in.
const diffStyles = [
  { label: "Auto", value: "auto" },
  { label: "Inline", value: "inline" },
  { label: "Side by side", value: "side by side" },
] as const;

const diffSizes = sizeOptions(fontSizeRanges.diff);
const panelSizes = sizeOptions(fontSizeRanges.panel);

// Paseo's own sizes, though its code size says it sizes diffs, don't reach Better Diff, and its zoom
// reaches everything.
const sizesNote =
  "Better Diff only. Paseo's own sizes, under Appearance, don't change Better Diff, and ⌘+ and ⌘− zoom all of Paseo, Better Diff included.";

type Settings = NonNullable<ReturnType<typeof viewSettingsOf>>;

interface LineLengthProps {
  settings: Settings;
}

// The line length as it's typed, saved once it's one the settings take.
function LineLength({ settings }: LineLengthProps): ReactElement {
  const [typed, setTyped] = useState(String(settings.values.lineLength));
  const lineLength = lineLengthOf(typed);

  return (
    <>
      <SettingsInput
        label="Line length"
        hint="Auto shows a diff side by side once lines this many characters long, in the diff font size, fit on each side. Set it to the length your code wraps at."
        initialValue={typed}
        onChangeText={setTyped}
        error={
          lineLength === undefined
            ? `Enter a whole number from ${lineLengthRange.min} to ${lineLengthRange.max}.`
            : null
        }
      />
      <SettingsAction
        label="Save the line length"
        actionLabel="Save"
        disabled={lineLength === undefined || lineLength === settings.values.lineLength}
        onPress={() => {
          if (lineLength !== undefined) {
            void settings.change({ lineLength });
          }
        }}
      />
    </>
  );
}

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
            hint="Removed lines above the added ones, or beside them. Auto puts them beside them where lines of the line length fit."
            value={settings.values.diffStyle}
            options={diffStyles}
            onValueChange={(diffStyle) => {
              void settings.change({ diffStyle });
            }}
          />
          <LineLength settings={settings} />
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
