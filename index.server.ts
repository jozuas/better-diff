import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginServerContext } from "@getpaseo/plugin/server";

import { listChanges } from "./server/changes";
import { applyFile, applyLines, readDiff } from "./server/diff";
import { changesRpc } from "./shared/changes";
import { applyFileRpc, applyLinesRpc, diffRpc } from "./shared/diff";

export default function contribute(server: PluginServerContext): PluginCleanup {
  server.handle(changesRpc, listChanges);
  server.handle(diffRpc, readDiff);
  server.handle(applyLinesRpc, applyLines);
  server.handle(applyFileRpc, applyFile);

  return () => {};
}
