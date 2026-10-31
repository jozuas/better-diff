import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginServerContext } from "@getpaseo/plugin/server";

import { listChanges } from "./server/changes";
import { createGreeting } from "./server/greeting";
import { changesRpc } from "./shared/changes";
import { greetingRpc } from "./shared/greeting";

export default function contribute(server: PluginServerContext): PluginCleanup {
  server.handle(greetingRpc, createGreeting);
  server.handle(changesRpc, listChanges);

  return () => {};
}
