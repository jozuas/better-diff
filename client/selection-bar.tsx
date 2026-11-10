import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactElement } from "react";
import { useContext, useId, useMemo, useState, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";

import { ActionFace } from "./action-face";
import { buttonLook, buttonOf, buttonText } from "./actions";
import type { Controls, IconAction } from "./actions";
import { BarHostContext, barLayer } from "./bar-layer";
import type { BarHost, ShownBar } from "./bar-layer";
import { FontSizesContext } from "./fonts";
import { Hoverable } from "./hoverable";
import { IconButton } from "./icon-button";
import { useKeptSelection } from "./keyboard";
import { barPosition } from "./menu";
import type { LetGo, Size } from "./menu";
import { NameTip } from "./shortcut-tip";
import { buttonShortcut, nameTip } from "./shortcuts";
import type { Bar } from "./shortcuts";
import { onMac } from "./web";

function useStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(
    () => ({
      ...StyleSheet.create({
        // Over the lines, and over the bars of the hunks after them.
        bar: {
          position: "absolute",
          zIndex: 20,
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          padding: 4,
          borderWidth: 1,
          borderRadius: 8,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
        },
        // Until it's measured, and so can be placed.
        unmeasured: { opacity: 0 },
        // Rounded as its face is, for its focus ring.
        button: { borderRadius: 6 },
        // As an icon button's face is, which clips its tint to its corners.
        icon: {
          width: fonts.button,
          height: fonts.button,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
          overflow: "hidden",
        },
        armed: {
          height: fonts.button,
          justifyContent: "center",
          paddingHorizontal: fonts.buttonPadding,
          borderRadius: 6,
          overflow: "hidden",
          backgroundColor: theme.colors.statusDanger,
        },
        // Between the lines' actions and the others.
        divider: { width: 1, alignSelf: "stretch", backgroundColor: theme.colors.border },
      }),
      // How far it is from the point it shows from, which is in a line: past the half of the line on
      // its side, and a little more.
      gap: fonts.codeLine / 2 + 4,
      iconSize: fonts.buttonIcon,
    }),
    [theme, fonts],
  );
}

type Styles = ReturnType<typeof useStyles>;

interface LineActionProps {
  action: IconAction;
  lines: Bar<IconAction>;
  controls: Controls;
  styles: Styles;
  theme: PluginTheme;
}

// An action on the selected lines, as its key presses it with focus in their hunk's bar, so either
// arms it for the other to confirm. Once the pointer rests on it, its name and key show above it.
function LineAction({ action, lines, controls, styles, theme }: LineActionProps): ReactElement {
  const button = buttonOf(lines.bar, action);
  // Only arming it or disarming it, or an action starting or ending, renders it again.
  const armed = useSyncExternalStore(controls.subscribe, () => controls.state().armed === button);
  const busy = useSyncExternalStore(controls.subscribe, () => controls.state().busy);
  const name = nameTip(action.label, buttonShortcut(action, "part", "lines", onMac()));

  return (
    <Hoverable
      accessibilityRole="button"
      accessibilityLabel={buttonText(action, armed)}
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      style={styles.button}
      onPress={() => {
        controls.press(button, action, lines.target, lines.onRun);
      }}
    >
      {({ hovered, pressed }) => {
        const look = buttonLook(action, armed, hovered);

        return (
          <>
            <View style={armed ? styles.armed : styles.icon}>
              <ActionFace
                action={action}
                look={look}
                hovered={hovered}
                pressed={pressed}
                size={styles.iconSize}
                theme={theme}
              />
            </View>
            <NameTip name={name} resting={hovered && !pressed} theme={theme} />
          </>
        );
      }}
    </Hoverable>
  );
}

interface LineActionsProps {
  // Undefined while none of the hunk's lines are selected.
  lines: Bar<IconAction> | undefined;
  controls: Controls;
  styles: Styles;
  theme: PluginTheme;
}

// The selected lines' actions, and a line after them, while lines are selected.
function LineActions({ lines, ...shown }: LineActionsProps): ReactElement | null {
  return lines === undefined ? null : (
    <>
      {lines.actions.map((action) => (
        <LineAction key={action.operation} action={action} lines={lines} {...shown} />
      ))}
      <View style={shown.styles.divider} />
    </>
  );
}

interface CommentProps {
  // Undefined where the selection can't be commented on.
  onComment: (() => void) | undefined;
  theme: PluginTheme;
}

// Comment, where the selection can be commented on.
function Comment({ onComment, theme }: CommentProps): ReactElement | null {
  return onComment === undefined ? null : (
    <IconButton
      label="Comment"
      name="Comment"
      icon="MessageCircle"
      onPress={onComment}
      theme={theme}
    />
  );
}

interface SelectionBarProps {
  // Its id on the page.
  id: string;
  at: LetGo;
  // The selected lines' actions, while lines of the hunk are selected.
  lines: Bar<IconAction> | undefined;
  // Undefined where the selection can't be commented on.
  onComment: (() => void) | undefined;
  onCopy: () => void;
  controls: Controls;
  theme: PluginTheme;
}

// Over the selected lines, above where the pointer let go of the selection, or above the start of
// the line the keyboard selected up to, as in Linear's PR review: the selected lines' actions,
// while lines of a hunk are selected, Comment, where the selection can be commented on, and Copy,
// each named above it once the pointer rests on it. Pressing it leaves the selection, and focus,
// as they are.
function SelectionBar({
  id,
  at,
  lines,
  onComment,
  onCopy,
  controls,
  theme,
}: SelectionBarProps): ReactElement {
  const styles = useStyles(theme);
  const [size, setSize] = useState<Size>();

  useKeptSelection(id);

  return (
    <View
      nativeID={id}
      role="toolbar"
      accessibilityLabel="Selection"
      style={[
        styles.bar,
        barPosition(at, size ?? { width: 0, height: 0 }, styles.gap),
        size === undefined && styles.unmeasured,
      ]}
      onLayout={(event) => {
        setSize(event.nativeEvent.layout);
      }}
    >
      <LineActions lines={lines} controls={controls} styles={styles} theme={theme} />
      <Comment onComment={onComment} theme={theme} />
      <IconButton label="Copy" name="Copy" icon="Copy" onPress={onCopy} theme={theme} />
    </View>
  );
}

const layerStyles = StyleSheet.create({
  // Over all of the view's scrolling content, from its top left corner, its sticky bars included,
  // taking no room and no presses but the bar's.
  layer: { position: "absolute", top: 0, left: 0, right: 0, height: 0, zIndex: 20 },
});

interface LayerProps {
  host: BarHost;
  theme: PluginTheme;
}

// Where the bar over a selection of the view's lines shows, while lines show one.
function Layer({ host, theme }: LayerProps): ReactElement {
  const shown = useSyncExternalStore(host.layer.subscribe, host.layer.shown);
  const bar = useId();

  return (
    <View nativeID={host.id} pointerEvents="box-none" style={layerStyles.layer}>
      {shown === undefined ? null : <SelectionBar id={bar} {...shown} theme={theme} />}
    </View>
  );
}

interface SelectionBarLayerProps {
  theme: PluginTheme;
  // The view's scrolling content, given the layer to go last in it.
  children: (layer: ReactElement) => ReactElement;
}

// Has the lines in a view's scrolling content show the bar over their selection in a layer over all
// of it, rather than among the lines, where what comes after them, as the next hunk's or file's,
// would cover it, as it can reach past them. The bar scrolls with them.
export function SelectionBarLayer({ theme, children }: SelectionBarLayerProps): ReactElement {
  const layer = useMemo(() => barLayer<ShownBar>(), []);
  const id = useId();
  const host = useMemo(() => ({ layer, id }), [layer, id]);

  return (
    <BarHostContext value={host}>
      {children(<Layer key="selection bar" host={host} theme={theme} />)}
    </BarHostContext>
  );
}
