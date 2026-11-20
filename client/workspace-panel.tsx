import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useSettings, useWorkspace } from "@getpaseo/plugin/client";
import { Loading, useToast } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";

import { layoutSettings, viewSettings } from "../shared/settings";
import type { LayoutValues, ViewValues } from "../shared/settings";
import { Changes } from "./changes-panel";
import { TabSizeContext } from "./diff-styles";
import { FontSizesProvider } from "./font-sizes";
import { KeptReview } from "./kept-review";
import { KeysShownContext } from "./key-hints";
import { layoutOf, noLayout, settingsOf, viewDefaults } from "./settings";
import { SyntaxColorsProvider } from "./syntax-colors";

interface PanelSettings {
  view: ViewValues;
  layout: LayoutValues;
}

// The host's settings and this device's layout, once both are read.
function usePanelSettings(): PanelSettings | undefined {
  const toast = useToast();
  const view = settingsOf(useSettings(viewSettings), viewDefaults, toast.error);
  const device = settingsOf(useSettings(layoutSettings), noLayout, toast.error);

  return view === undefined || device === undefined
    ? undefined
    : { view: view.values, layout: layoutOf(device.values, view.values) };
}

// The workspace's changed files, and the diff of the one opened, shown as the host's settings and
// this device's say, once they're read.
export function ChangesPanel({ workspaceId, tab, theme }: PluginWorkspacePanelProps): ReactElement {
  const directory = useWorkspace(workspaceId, (workspace) => workspace.directory);
  const settings = usePanelSettings();

  if (directory === null || settings === undefined) {
    return <Loading />;
  }

  const { view, layout } = settings;

  return (
    <FontSizesProvider settings={layout}>
      <TabSizeContext value={view.tabSize}>
        <SyntaxColorsProvider theme={theme}>
          <KeysShownContext value={view.showKeys}>
            <KeptReview key={workspaceId} workspace={workspaceId} tab={tab}>
              {(review) => (
                <Changes
                  workspace={workspaceId}
                  directory={directory}
                  layout={layout}
                  hideWhitespace={view.hideWhitespace}
                  review={review}
                  tab={tab}
                  theme={theme}
                />
              )}
            </KeptReview>
          </KeysShownContext>
        </SyntaxColorsProvider>
      </TabSizeContext>
    </FontSizesProvider>
  );
}
