import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { ReactElement } from "react";
import {
  memo,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { StyleSheet, View } from "react-native";

import type { diffRpc } from "../shared/diff";
import type { Controls } from "./actions";
import { DiffBody } from "./diff-body";
import { DiffLayout } from "./diff-layout";
import type { Layout } from "./diff-style";
import { FileBar } from "./file-bar";
import { KeyboardFocusContext } from "./focus";
import type { OpenFile } from "./groups";
import { useFocusOnPress } from "./keyboard";
import { Queried } from "./queried";
import { useSelectedLines } from "./text-selection";
import { scrollToTop, scrollUpTo, useSettledFocus } from "./web";

type Diff = RpcOutput<typeof diffRpc>;

const styles = StyleSheet.create({ file: { flex: 1 } });

interface SettledFocusProps {
  file: OpenFile;
  // Whether the file's diff shows, once it's read.
  shown: boolean;
  controls: Controls;
}

// useSettledFocus each time the diff's layout renders, after the diff's hunks: the layout shows them
// only once it's measured, which, for a diff read before the file opened, is after the file's view
// first renders. And each time an action starts or ends. Tells the panel's keyboard focus once the
// diff shows, for keys that opened the file to move focus to its last bar.
function SettledFocus({ file, shown, controls }: SettledFocusProps): null {
  const focus = useContext(KeyboardFocusContext);

  useSettledFocus(useSyncExternalStore(controls.subscribe, () => controls.state().busy));

  useLayoutEffect(() => {
    if (shown) {
      focus.shown(file);
    }
  });

  return null;
}

interface FileDiffProps {
  // The query of a file's diff, collapsed or not, and with every line of the file or not.
  query: (
    file: OpenFile,
    expand: boolean,
    entire?: boolean,
  ) => UseQueryOptions<Diff, Error, Diff, (string | boolean)[]>;
  file: OpenFile;
  layout: Layout;
  controls: Controls;
  theme: PluginTheme;
}

// The file's diff, as opened from its group, under its bar. A collapsed diff shows its lines once
// asked to, until another file is opened. Just before an action on a hunk runs, the view scrolls up
// to the hunk's start if it's above, so the next hunk, which then takes its place, shows from its
// start, and focus moves on to it if it was in the hunk's bar. Keys move focus past its first bar or
// its last to the file the sidebar lists before it or after it, and a press of the pointer on a
// hunk's lines to the hunk's bar.
function DiffOfFile({ query, file, layout, controls, theme }: FileDiffProps): ReactElement {
  const view = useId();
  const pressed = useId();
  const [expand, setExpand] = useState(false);
  const diff = useQuery(query(file, expand));
  const selection = useSelectedLines(view, () => diff.data?.version);
  const focus = useContext(KeyboardFocusContext);

  const onShow = useCallback(() => {
    scrollToTop(view);
  }, [view]);

  const onExpand = useCallback(() => {
    setExpand(true);
  }, []);

  useLayoutEffect(() => focus.addCrossing(), [focus]);
  useFocusOnPress(pressed, view, focus);

  return (
    <View nativeID={pressed} style={styles.file}>
      <FileBar
        file={file}
        index={0}
        diff={diff.data}
        onShow={onShow}
        onExpand={onExpand}
        controls={controls}
        theme={theme}
      />
      <DiffLayout layout={layout} view={view}>
        {(sideBySide) => (
          <>
            <Queried query={diff} theme={theme}>
              {(data) => (
                <DiffBody
                  diff={data}
                  file={file}
                  view={view}
                  fileIndex={0}
                  selection={selection}
                  scrolls
                  entireQuery={query(file, true, true)}
                  sideBySide={sideBySide}
                  onHunkRun={(top, barHeight) => {
                    scrollUpTo(view, top, barHeight);
                  }}
                  onShowFile={onShow}
                  controls={controls}
                  onExpand={onExpand}
                  theme={theme}
                />
              )}
            </Queried>
            <SettledFocus file={file} shown={diff.data !== undefined} controls={controls} />
          </>
        )}
      </DiffLayout>
    </View>
  );
}

// Rendered again only once what it's rendered with changes, and not with each of the panel's
// renders, as with each key typed in the sidebar's filter.
export const FileDiff = memo(DiffOfFile);
