import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginServerContext } from "@getpaseo/plugin/server";

import { listChanges, readVersion, watchChanges } from "./server/changes";
import { readContents } from "./server/contents";
import { applyFile, applyLines, applyMode, readDiff } from "./server/diff";
import { applyGroup, readGroup } from "./server/groups";
import { syntaxColors } from "./server/highlight";
import { ignore, readExcludesFile, readPatterns } from "./server/ignore";
import { reviewsKept } from "./server/reviews";
import { unsubscribeAll } from "./server/subscribers";
import { changesRpc, versionRpc, watchRpc } from "./shared/changes";
import { contentsRpc } from "./shared/contents";
import {
  applyFileRpc,
  applyGroupRpc,
  applyLinesRpc,
  applyModeRpc,
  diffRpc,
  groupRpc,
} from "./shared/diff";
import { excludesFileRpc, ignoreRpc, patternsRpc } from "./shared/ignore";
import { reviewChangeRpc, reviewWatchRpc } from "./shared/review";
import { viewSettings } from "./shared/settings";
import { syntaxColorsRpc } from "./shared/syntax";

export default function contribute(server: PluginServerContext): PluginCleanup {
  const reviews = reviewsKept();

  server.registerSettings(viewSettings);
  server.handle(changesRpc, listChanges);
  server.handle(watchRpc, watchChanges);
  server.handle(versionRpc, readVersion);
  server.handle(diffRpc, readDiff);
  server.handle(applyLinesRpc, applyLines);
  server.handle(applyFileRpc, applyFile);
  server.handle(applyModeRpc, applyMode);
  server.handle(groupRpc, readGroup);
  server.handle(applyGroupRpc, applyGroup);
  server.handle(contentsRpc, readContents);
  server.handle(patternsRpc, readPatterns);
  server.handle(excludesFileRpc, readExcludesFile);
  server.handle(ignoreRpc, ignore);
  server.handle(syntaxColorsRpc, syntaxColors);
  server.handle(reviewWatchRpc, reviews.watch);
  server.handle(reviewChangeRpc, reviews.change);

  return unsubscribeAll;
}
