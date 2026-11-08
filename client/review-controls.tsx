import type { PluginTheme } from "@getpaseo/plugin";
import { TextInput } from "@getpaseo/plugin/client/ui";
import type { UseQueryResult } from "@tanstack/react-query";
import type { Dispatch, ReactElement, SetStateAction } from "react";
import { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { editorKey, reviewPrompt } from "./comments";
import type { Recipient } from "./comments";
import { confirmation } from "./confirmation";
import { agentsNotice, discardLabel, recipientOf } from "./feedback";
import { FontSizesContext } from "./fonts";
import { useKeys } from "./keyboard";
import type { Point } from "./menu";
import { Menu } from "./popup";
import { TextButton } from "./text-button";

function useStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(
    () =>
      StyleSheet.create({
        message: {
          margin: 12,
          marginBottom: 4,
          padding: 8,
          borderWidth: 1,
          borderRadius: 6,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface0,
        },
        // The box, rather than the input in it, shows it has focus.
        focused: { borderColor: theme.colors.accent },
        input: {
          minHeight: Math.round(2.5 * fonts.text),
          padding: 0,
          fontSize: fonts.text,
          color: theme.colors.foreground,
          outlineWidth: 0,
        },
        notice: { flexShrink: 1, fontSize: fonts.small, color: theme.colors.foregroundMuted },
      }),
    [theme, fonts],
  );
}

interface MessageBoxProps {
  message: string;
  onMessage: Dispatch<SetStateAction<string>>;
  onSend: () => void;
  theme: PluginTheme;
}

// What the agent's asked with the review, which Paseo's own diff asks where it's left empty, with
// focus once the review opens. Enter sends the review, as Paseo's message box sends a message.
export function MessageBox({ message, onMessage, onSend, theme }: MessageBoxProps): ReactElement {
  const styles = useStyles(theme);
  const id = useId();
  const [focused, setFocused] = useState(false);

  useKeys(id, (event) => {
    if (editorKey(event) !== "save") {
      return false;
    }

    onSend();

    return true;
  });

  return (
    <View nativeID={id} style={[styles.message, focused && styles.focused]}>
      <TextInput
        accessibilityLabel="Message for the agent"
        placeholder={reviewPrompt}
        placeholderTextColor={theme.colors.foregroundMuted}
        multiline
        autoFocus
        value={message}
        onChangeText={onMessage}
        onFocus={() => {
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
        }}
        style={styles.input}
      />
    </View>
  );
}

interface DiscardReviewProps {
  onDiscard: () => void;
  disabled: boolean;
  theme: PluginTheme;
}

// Discards the comments pending, and the message, on a second press, as discarding changes does.
export function DiscardReview({ onDiscard, disabled, theme }: DiscardReviewProps): ReactElement {
  const [armed, setArmed] = useState(false);

  const confirm = useMemo(
    () =>
      confirmation((button) => {
        setArmed(button !== undefined);
      }),
    [],
  );

  useEffect(() => confirm.dispose, [confirm]);

  return (
    <TextButton
      label={discardLabel(armed)}
      accessibilityLabel={discardLabel(armed)}
      look={armed ? "armed" : "plain"}
      confirms
      disabled={disabled}
      onPress={() => {
        confirm.press("discard", true, async () => {
          onDiscard();
          await Promise.resolve();
        });
      }}
      theme={theme}
    />
  );
}

interface AgentPickerProps {
  recipient: Recipient;
  recipients: readonly Recipient[];
  onChoose: (agent: string) => void;
  theme: PluginTheme;
}

// The agent the review goes to, and a menu, from its button, of the others it can go to.
function AgentPicker({ recipient, recipients, onChoose, theme }: AgentPickerProps): ReactElement {
  const button = useRef<View>(null);
  const [menu, setMenu] = useState<Point>();

  return (
    <>
      <TextButton
        buttonRef={button}
        label={`To ${recipient.label} ▾`}
        accessibilityLabel={`Agent: ${recipient.label}`}
        look="plain"
        disabled={false}
        onPress={() => {
          button.current?.measureInWindow((x, y) => {
            setMenu({ x, y });
          });
        }}
        theme={theme}
      />
      {menu === undefined ? null : (
        <Menu
          label="Choose an agent"
          point={menu}
          sections={[
            recipients.map(({ id, label }) => ({
              label,
              icon: "Bot",
              onPress: () => {
                onChoose(id);
              },
              disabled: false,
            })),
          ]}
          onClose={() => {
            setMenu(undefined);
          }}
          theme={theme}
        />
      )}
    </>
  );
}

interface AgentChoiceProps {
  agents: UseQueryResult<Recipient[]>;
  chosen: string | undefined;
  onChoose: (agent: string) => void;
  theme: PluginTheme;
}

// The agent the review goes to, or why it can't go to one.
export function AgentChoice({ agents, chosen, onChoose, theme }: AgentChoiceProps): ReactElement {
  const styles = useStyles(theme);
  const recipients = agents.data ?? [];
  const recipient = recipientOf(recipients, chosen);

  return recipient === undefined ? (
    <Text style={styles.notice}>
      {agentsNotice({ pending: agents.isPending, error: agents.error, recipients })}
    </Text>
  ) : (
    <AgentPicker recipient={recipient} recipients={recipients} onChoose={onChoose} theme={theme} />
  );
}
