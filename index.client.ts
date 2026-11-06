import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";

import { ChangesPanel } from "./client/changes-panel";
import { SettingsScreen } from "./client/settings-screen";

export default function contribute(client: PluginClientContext): PluginCleanup {
  client.addWorkspacePanel({
    id: "changes",
    title: "Better Diff",
    icon: "GitCompareArrows",
    Component: ChangesPanel,
  });

  client.addSettingsScreen({
    id: "settings",
    title: "Settings",
    icon: "SlidersHorizontal",
    Component: SettingsScreen,
  });

  return () => {};
}
