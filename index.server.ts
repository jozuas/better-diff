import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginServerContext } from "@getpaseo/plugin/server";

import { listChanges, waitForChanges } from "./server/changes";
import { readContents } from "./server/contents";
import { applyFile, applyLines, applyMode, readDiff } from "./server/diff";
import { applyGroup, readGroup } from "./server/groups";
import { syntaxColors } from "./server/highlight";
import { stopWaiting } from "./server/wait";
import { changesRpc, waitRpc } from "./shared/changes";
import { contentsRpc } from "./shared/contents";
import {
  applyFileRpc,
  applyGroupRpc,
  applyLinesRpc,
  applyModeRpc,
  diffRpc,
  groupRpc,
} from "./shared/diff";
import { viewSettings } from "./shared/settings";
import { syntaxColorsRpc } from "./shared/syntax";

export default function contribute(server: PluginServerContext): PluginCleanup {
  server.registerSettings(viewSettings);
  server.handle(changesRpc, listChanges);
  server.handle(waitRpc, waitForChanges);
  server.handle(diffRpc, readDiff);
  server.handle(applyLinesRpc, applyLines);
  server.handle(applyFileRpc, applyFile);
  server.handle(applyModeRpc, applyMode);
  server.handle(groupRpc, readGroup);
  server.handle(applyGroupRpc, applyGroup);
  server.handle(contentsRpc, readContents);
  server.handle(syntaxColorsRpc, syntaxColors);

  return stopWaiting;
}
