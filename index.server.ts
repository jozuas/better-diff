import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginServerContext } from "@getpaseo/plugin/server";

import { createGreeting } from "./server/greeting";
import { greetingRpc } from "./shared/greeting";

export default function contribute(server: PluginServerContext): PluginCleanup {
  server.handle(greetingRpc, createGreeting);

  return () => {};
}
