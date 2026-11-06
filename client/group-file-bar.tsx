import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import type { Dispatch, ReactElement, SetStateAction } from "react";
import { memo, useMemo } from "react";

import type { diffRpc } from "../shared/diff";
import type { Controls } from "./actions";
import { measured } from "./bar-heights";
import { FileBar } from "./file-bar";
import type { GroupName } from "./groups";

type Diff = RpcOutput<typeof diffRpc>;

// A file's bar in a group's view, which scrolls the view up to the start of the file's diff, if it's
// above, just before one of the file's actions runs.
interface GroupFileBarProps {
  group: GroupName;
  path: string;
  // Its index among the view's files.
  index: number;
  // Its diff as shown, if it could be read.
  diff: Diff | undefined;
  // The height of the tallest of the view's files' bars, which it's as tall as.
  barHeight: number;
  // Hears how tall what it shows is, by its path.
  onHeights: Dispatch<SetStateAction<ReadonlyMap<string, number>>>;
  // Called with its index just before one of its actions runs.
  onRun: (index: number) => void;
  // Called with its index to scroll the view to show its file's diff from its start.
  onShow: (index: number) => void;
  // Asks for the lines of the collapsed diff of the file at the path.
  onExpand: (path: string) => void;
  controls: Controls;
  theme: PluginTheme;
}

function BarOfGroupFile({
  group,
  path,
  index,
  diff,
  barHeight,
  onHeights,
  onRun,
  onShow,
  onExpand,
  controls,
  theme,
}: GroupFileBarProps): ReactElement {
  const file = useMemo(() => ({ group, path }), [group, path]);

  return (
    <FileBar
      file={file}
      index={index}
      diff={diff}
      minHeight={barHeight}
      onHeight={(height) => {
        onHeights((current) => measured(current, path, height));
      }}
      onRun={() => {
        onRun(index);
      }}
      onShow={() => {
        onShow(index);
      }}
      onExpand={() => {
        onExpand(path);
      }}
      controls={controls}
      theme={theme}
    />
  );
}

// Rendered again only once what it's rendered with changes, and not as the view's selection, an
// action starting or ending, or the view's other files do.
export const GroupFileBar = memo(BarOfGroupFile);
