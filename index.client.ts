import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";

import { GreetingItem, GreetingScreen } from "./client/greeting";

export default function contribute(client: PluginClientContext): PluginCleanup {
  client.addScreen({ id: "greeting", title: "Greeting", Component: GreetingScreen });
  client.addSidebarHeaderItem({ id: "greeting", title: "Greeting", Component: GreetingItem });

  return () => {};
}
