import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginServerContext } from "@getpaseo/plugin/server";

import { listChanges, waitForChanges } from "./server/changes";
import { readContents } from "./server/contents";
import { applyFile, applyLines, readDiff } from "./server/diff";
import { applyGroup, readGroup } from "./server/groups";
import { changesRpc, waitRpc } from "./shared/changes";
import { contentsRpc } from "./shared/contents";
import { applyFileRpc, applyGroupRpc, applyLinesRpc, diffRpc, groupRpc } from "./shared/diff";

export default function contribute(server: PluginServerContext): PluginCleanup {
  server.handle(changesRpc, listChanges);
  server.handle(waitRpc, waitForChanges);
  server.handle(diffRpc, readDiff);
  server.handle(applyLinesRpc, applyLines);
  server.handle(applyFileRpc, applyFile);
  server.handle(groupRpc, readGroup);
  server.handle(applyGroupRpc, applyGroup);
  server.handle(contentsRpc, readContents);

  return () => {};
}
