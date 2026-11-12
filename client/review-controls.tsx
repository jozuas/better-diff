import type { PluginTheme } from "@getpaseo/plugin";
import { TextInput } from "@getpaseo/plugin/client/ui";
import type { UseQueryResult } from "@tanstack/react-query";
import type { Dispatch, ReactElement, RefObject, SetStateAction } from "react";
import { useContext, useEffect, useId, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { editorKey, reviewPrompt } from "./comments";
import { confirmation } from "./confirmation";
import {
  agentSections,
  agentState,
  agentsNotice,
  canSendTo,
  discardLabel,
  newAgentLabel,
  sendLabel,
} from "./feedback";
import type { Agents, Destination } from "./feedback";
import { FontSizesContext } from "./fonts";
import { useKeys } from "./keyboard";
import { menuEndingAt } from "./menu";
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
// focus once the review opens. Enter does what Send feedback does, as Paseo's message box sends a
// message.
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

interface AgentsNoticeProps {
  agents: UseQueryResult<Agents>;
  theme: PluginTheme;
}

// Why the review can't be sent to an agent, while there's none to send it to.
function AgentsNotice({ agents, theme }: AgentsNoticeProps): ReactElement | null {
  const styles = useStyles(theme);

  return canSendTo(agents.data) ? null : (
    <Text style={styles.notice}>
      {agentsNotice({ pending: agents.isPending, error: agents.error, agents: agents.data })}
    </Text>
  );
}

interface AgentMenuProps {
  // The top right corner of the button it's opened from, above which it goes.
  point: Point;
  agents: Agents;
  // When it opened, in milliseconds since 1970.
  now: number;
  onChoose: (to: Destination) => void;
  onClose: () => void;
  theme: PluginTheme;
}

// The agents the review can be sent to, to choose one from: those not at work, then those at work,
// and those it can't be sent to, disabled, each by what it's called, cut short where it's long, and
// what it's doing, or how long ago it was last active, as of when the menu opened. Last, a new agent,
// where one can be started, with its provider and model.
function AgentMenu({
  point,
  agents: { recipients, template },
  now,
  onChoose,
  onClose,
  theme,
}: AgentMenuProps): ReactElement {
  const listed = agentSections(recipients).map((section) =>
    section.map((agent) => ({
      label: agent.label,
      detail: agentState(agent, now),
      icon: "Bot",
      onPress: () => {
        onChoose({ agent });
      },
      disabled: agent.state === "unavailable",
    })),
  );

  const started =
    template === undefined
      ? []
      : [
          {
            label: "New agent",
            detail: newAgentLabel(template),
            icon: "Plus",
            onPress: () => {
              onChoose({ template });
            },
            disabled: false,
          },
        ];

  return (
    <Menu
      label="Choose an agent"
      point={point}
      place={menuEndingAt}
      maxWidth={400}
      sections={[...listed, started]}
      onClose={onClose}
      theme={theme}
    />
  );
}

// The menu of agents to send the review to, while it's open: where it goes, the agents it lists, as
// they were when it opened, and when that was, in milliseconds since 1970.
export interface AgentsShown {
  point: Point;
  agents: Agents;
  now: number;
}

// What opens the menu of agents to send the review to, and the menu while it's open.
export interface AgentChoice {
  // Send feedback, above which the menu opens.
  button: RefObject<View | null>;
  shown: AgentsShown | undefined;
  // Whether the review can't be sent: while it's being sent, or there's no agent to send it to.
  unsendable: boolean;
  // Opens the menu, unless the review can't be sent.
  choose: () => Promise<void>;
  close: () => void;
}

interface SendFeedbackProps {
  agents: UseQueryResult<Agents>;
  choice: AgentChoice;
  sending: boolean;
  onSend: (to: Destination) => void;
  theme: PluginTheme;
}

// Why the review can't be sent to an agent, while there's none to send it to, and Send feedback,
// which asks which agent to send it to, or whether to start a new one.
export function SendFeedback({
  agents,
  choice,
  sending,
  onSend,
  theme,
}: SendFeedbackProps): ReactElement {
  return (
    <>
      <AgentsNotice agents={agents} theme={theme} />
      <TextButton
        buttonRef={choice.button}
        label={sendLabel(sending)}
        accessibilityLabel={sendLabel(sending)}
        look="primary"
        disabled={choice.unsendable}
        onPress={() => {
          void choice.choose();
        }}
        theme={theme}
      />
      {choice.shown === undefined ? null : (
        <AgentMenu
          point={choice.shown.point}
          agents={choice.shown.agents}
          now={choice.shown.now}
          onChoose={onSend}
          onClose={choice.close}
          theme={theme}
        />
      )}
    </>
  );
}
