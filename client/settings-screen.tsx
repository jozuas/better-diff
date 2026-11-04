import { useSettings } from "@getpaseo/plugin/client";
import {
  Loading,
  SettingsCard,
  SettingsInput,
  SettingsSection,
  SettingsSelect,
  useToast,
} from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";

import { fontSizeRanges, lineLengthRange, viewSettings } from "../shared/settings";
import { debounced } from "./debounce";
import { sizeOptions } from "./fonts";
import { lineLengthOf, viewSettingsOf } from "./settings";
import { useLatest } from "./web";

// The styles a diff can show in.
const diffStyles = [
  { label: "Auto", value: "auto" },
  { label: "Inline", value: "inline" },
  { label: "Side by side", value: "side by side" },
] as const;

const diffSizes = sizeOptions(fontSizeRanges.diff);
const panelSizes = sizeOptions(fontSizeRanges.panel);

// How long typing pauses before the line length typed is saved.
const typingPause = 500;

// Paseo's own sizes, though its code size says it sizes diffs, don't reach Better Diff, and its zoom
// reaches everything.
const sizesInfo =
  "Paseo's own font sizes, under Appearance, don't change Better Diff. Zooming Paseo in or out scales Better Diff with it";

type Settings = NonNullable<ReturnType<typeof viewSettingsOf>>;

interface LineLengthProps {
  settings: Settings;
}

// The line length as it's typed, saved once typing pauses on one the settings take, or at once on
// leaving the page.
function LineLength({ settings }: LineLengthProps): ReactElement {
  const [typed, setTyped] = useState(String(settings.values.lineLength));
  // The settings as they are when typing pauses, which a save changes, rather than as they were
  // when the length was typed.
  const latest = useLatest(settings);
  const save = useMemo(() => debounced(typingPause), []);

  useEffect(() => save.flush, [save]);

  return (
    <SettingsInput
      label="Line length"
      hint="Characters per line Auto needs room for on each side. Set it to where your code wraps"
      initialValue={typed}
      onChangeText={(text) => {
        const lineLength = lineLengthOf(text);

        setTyped(text);
        save.set(
          lineLength === undefined
            ? undefined
            : () => {
                if (lineLength !== latest.current.values.lineLength) {
                  void latest.current.change({ lineLength });
                }
              },
        );
      }}
      error={
        lineLengthOf(typed) === undefined
          ? `Enter a whole number from ${lineLengthRange.min} to ${lineLengthRange.max}`
          : null
      }
    />
  );
}

// Better Diff's page in Paseo's settings.
export function SettingsScreen(): ReactElement {
  const toast = useToast();
  const settings = viewSettingsOf(useSettings(viewSettings), toast.error);

  if (settings === undefined) {
    return <Loading />;
  }

  return (
    <>
      <SettingsSection title="Layout">
        <SettingsCard>
          <SettingsSelect
            label="Diff style"
            hint="Auto shows diffs side by side where lines of the line length fit, and inline where they don't"
            value={settings.values.diffStyle}
            options={diffStyles}
            onValueChange={(diffStyle) => {
              void settings.change({ diffStyle });
            }}
          />
          <LineLength settings={settings} />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Font sizes" info={sizesInfo}>
        <SettingsCard>
          <SettingsSelect
            label="Diff font size"
            hint="Used for diff lines and line numbers"
            value={String(settings.values.diffFontSize)}
            options={diffSizes}
            onValueChange={(size) => {
              void settings.change({ diffFontSize: Number(size) });
            }}
          />
          <SettingsSelect
            label="Panel font size"
            hint="Used for the file list, bars, and buttons"
            value={String(settings.values.panelFontSize)}
            options={panelSizes}
            onValueChange={(size) => {
              void settings.change({ panelFontSize: Number(size) });
            }}
          />
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
