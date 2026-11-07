import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useSettings, useWorkspace } from "@getpaseo/plugin/client";
import { Loading, useToast } from "@getpaseo/plugin/client/ui";
import type { ReactElement } from "react";

import { viewSettings } from "../shared/settings";
import type { ViewValues } from "../shared/settings";
import { Changes } from "./changes-panel";
import { TabSizeContext } from "./diff-styles";
import { FontSizesProvider } from "./font-sizes";
import { viewSettingsOf } from "./settings";
import { SyntaxColorsProvider } from "./syntax-colors";

// The settings once they're read.
function useViewValues(): ViewValues | undefined {
  const toast = useToast();

  return viewSettingsOf(useSettings(viewSettings), toast.error)?.values;
}

// The workspace's changed files, and the diff of the one opened, shown as the host's settings say
// once it says.
export function ChangesPanel({ workspaceId, tab, theme }: PluginWorkspacePanelProps): ReactElement {
  const directory = useWorkspace(workspaceId, (workspace) => workspace.directory);
  const settings = useViewValues();

  if (directory === null || settings === undefined) {
    return <Loading />;
  }

  return (
    <FontSizesProvider settings={settings}>
      <TabSizeContext value={settings.tabSize}>
        <SyntaxColorsProvider theme={theme}>
          <Changes
            workspace={workspaceId}
            directory={directory}
            layout={settings}
            hideWhitespace={settings.hideWhitespace}
            tab={tab}
            theme={theme}
          />
        </SyntaxColorsProvider>
      </TabSizeContext>
    </FontSizesProvider>
  );
}
