import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";

import { ChangesPanel } from "./client/changes-panel";
import { requests } from "./client/requests";
import { SettingsScreen } from "./client/settings-screen";

export default function contribute(client: PluginClientContext): PluginCleanup {
  client.addWorkspacePanel({
    id: "changes",
    title: "Better Diff",
    icon: "GitCompareArrows",
    Component: ChangesPanel,
  });

  // Opens the panel with focus in it, as keys reach it.
  client.addCommandCenterItem({
    id: "open",
    title: "Better Diff",
    icon: "GitCompare",
    keywords: ["diff", "changes", "stage", "git"],
    context: "workspace",
    onSelect: ({ workspace, openPanel }) => {
      requests.ask(workspace.id);
      openPanel("changes");
    },
  });

  client.addSettingsScreen({
    id: "settings",
    title: "Settings",
    icon: "SlidersHorizontal",
    Component: SettingsScreen,
  });

  return () => {};
}
