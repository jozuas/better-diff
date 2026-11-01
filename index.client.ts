import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";

import { ChangesPanel } from "./client/changes-panel";

export default function contribute(client: PluginClientContext): PluginCleanup {
  client.addWorkspacePanel({
    id: "changes",
    title: "Better Diff",
    icon: "GitCompare",
    Component: ChangesPanel,
  });

  return () => {};
}
