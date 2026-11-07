import type { ReactElement } from "react";

import { LabelRow } from "./diff-label";
import { useCollapsedFile } from "./find-page";
import { Hunks } from "./hunks";
import type { HunksProps } from "./hunks";
import { labelOf } from "./labels";
import { ModeBar } from "./mode-bar";

export interface DiffBodyProps extends HunksProps {
  // Scrolls the view to show the diff of its file at the index from its start.
  onShowFile: (fileIndex: number) => void;
  // Asks for a collapsed diff's lines.
  onExpand: () => void;
}

// The diff's mode change, if it has one, above its hunks, or what's shown instead of a diff without
// lines, with a button that shows a collapsed one's.
export function DiffBody(props: DiffBodyProps): ReactElement {
  const { diff, file, view, fileIndex, onShowFile, onFileRun, controls, onExpand, theme } = props;
  const label = labelOf(diff);

  useCollapsedFile(view, fileIndex, diff.collapsed !== undefined);

  return (
    <>
      {diff.mode === undefined ? null : (
        <ModeBar
          mode={diff.mode}
          version={diff.version}
          file={file}
          fileIndex={fileIndex}
          onShow={onShowFile}
          onFileRun={onFileRun}
          controls={controls}
          theme={theme}
        />
      )}
      {label === undefined ? (
        <Hunks {...props} />
      ) : (
        <LabelRow label={label} diff={diff} onExpand={onExpand} theme={theme} />
      )}
    </>
  );
}
