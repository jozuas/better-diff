import type { PluginClientContext } from "@getpaseo/plugin/client";

import { GreetingItem, GreetingScreen } from "./client/greeting";

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "greeting", title: "Greeting", Component: GreetingScreen });
  client.addSidebarHeaderItem({ id: "greeting", title: "Greeting", Component: GreetingItem });

  return () => {};
}
