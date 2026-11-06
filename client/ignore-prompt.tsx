import type { PluginTheme, RpcOutput } from "@getpaseo/plugin";
import { ScrollView, TextInput } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useContext, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { patternsRpc } from "../shared/ignore";
import { FontSizesContext } from "./fonts";
import { Hoverable, TintLayer } from "./hoverable";
import {
  candidatesIn,
  directoriesOf,
  fieldOf,
  fileOfPlace,
  placeOf,
  shownPatterns,
} from "./ignore";
import type { IgnorePlace, Place } from "./ignore";
import type { Point } from "./menu";
import { Popup } from "./popup";
import { Queried } from "./queried";

type Patterns = RpcOutput<typeof patternsRpc>;

// The query of the candidates for a rule ignoring the file in the directory at the path, "" for
// the root.
type PatternsQuery = (inDirectory: string) => UseQueryOptions<Patterns, Error, Patterns, string[]>;

// What ignoring an untracked file from its menu reads, and does.
export interface Ignoring {
  // The query of the path core.excludesFile names, or null while it isn't set.
  excludesFile: UseQueryOptions<string | null, Error, string | null, string[]>;
  // The query of the candidates for a rule ignoring the file at the path.
  patterns: (path: string) => PatternsQuery;
  onIgnore: (place: Place, rule: string) => void;
}

function useStyles(theme: PluginTheme) {
  const fonts = useContext(FontSizesContext);

  return useMemo(
    () =>
      StyleSheet.create({
        prompt: { width: 360, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
        heading: { fontSize: fonts.text, fontWeight: "600", color: theme.colors.foreground },
        where: { fontSize: fonts.small, color: theme.colors.foregroundMuted },
        input: {
          paddingHorizontal: 8,
          paddingVertical: 5,
          borderWidth: 1,
          borderRadius: 6,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface0,
          fontSize: fonts.text,
          color: theme.colors.foreground,
        },
        candidates: { maxHeight: 240 },
        candidate: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
        hovered: { backgroundColor: theme.colors.surface2 },
        pattern: { fontSize: fonts.text, color: theme.colors.foreground },
        more: { paddingHorizontal: 8, fontSize: fonts.small, color: theme.colors.foregroundMuted },
        buttons: { flexDirection: "row", justifyContent: "flex-end", gap: 6 },
        button: { borderRadius: 4 },
        box: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 4, overflow: "hidden" },
        text: { fontSize: fonts.small, color: theme.colors.foreground },
        disabled: { opacity: 0.5 },
      }),
    [theme, fonts],
  );
}

type Styles = ReturnType<typeof useStyles>;

interface ChoiceProps {
  label: string;
  onPress: () => void;
  styles: Styles;
}

// A directory or a candidate to pick.
function Choice({ label, onPress, styles }: ChoiceProps): ReactElement {
  return (
    <Hoverable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      {({ hovered }) => (
        <View style={[styles.candidate, hovered && styles.hovered]}>
          <Text selectable={false} style={styles.pattern}>
            {label}
          </Text>
        </View>
      )}
    </Hoverable>
  );
}

interface PromptButtonProps {
  label: string;
  onPress: () => void;
  disabled: boolean;
  styles: Styles;
  theme: PluginTheme;
}

function PromptButton({
  label,
  onPress,
  disabled,
  styles,
  theme,
}: PromptButtonProps): ReactElement {
  return (
    <Hoverable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={[styles.button, disabled && styles.disabled]}
      onPress={onPress}
    >
      {({ hovered, pressed }) => (
        <View style={styles.box}>
          <TintLayer color={theme.colors.foreground} hovered={hovered} pressed={pressed} filled />
          <Text selectable={false} style={styles.text}>
            {label}
          </Text>
        </View>
      )}
    </Hoverable>
  );
}

interface DirectoryChoiceProps {
  path: string;
  onPick: (inDirectory: string) => void;
  styles: Styles;
}

// The directories the file is in, from its own outwards, as Magit asks which to limit a rule to.
function DirectoryChoice({ path, onPick, styles }: DirectoryChoiceProps): ReactElement {
  return (
    <View style={styles.prompt}>
      <Text style={styles.heading}>Limit rule to files in</Text>
      {directoriesOf(path).map((directory) => (
        <Choice
          key={directory}
          label={`${directory}/`}
          onPress={() => {
            onPick(directory);
          }}
          styles={styles}
        />
      ))}
    </View>
  );
}

interface CandidatesProps {
  patterns: readonly string[];
  typed: string;
  onPick: (rule: string) => void;
  styles: Styles;
}

// Those that have what's typed in them, as many as show, and how many more there are.
function Candidates({ patterns, typed, onPick, styles }: CandidatesProps): ReactElement {
  const { shown, more } = shownPatterns(patterns, typed);

  return (
    <ScrollView style={styles.candidates}>
      {shown.map((pattern) => (
        <Choice
          key={pattern}
          label={pattern}
          onPress={() => {
            onPick(pattern);
          }}
          styles={styles}
        />
      ))}
      {more === 0 ? null : <Text style={styles.more}>{more} more</Text>}
    </ScrollView>
  );
}

interface PatternFieldProps {
  place: Place;
  // What core.excludesFile is: undefined until it's read, null while it isn't set.
  excludesFile: string | null | undefined;
  query: PatternsQuery;
  onIgnore: (rule: string) => void;
  onClose: () => void;
  styles: Styles;
  theme: PluginTheme;
}

// Asks for the file or pattern to ignore, as Magit does: Enter adds what's typed, or with nothing
// typed, the default, and a candidate picked adds it.
function PatternField({
  place,
  excludesFile,
  query,
  onIgnore,
  onClose,
  styles,
  theme,
}: PatternFieldProps): ReactElement {
  const [typed, setTyped] = useState("");
  const patterns = useQuery(query(candidatesIn(place)));
  const { rule, placeholder } = fieldOf(typed, patterns.data);

  function add(chosen: string | undefined): void {
    if (chosen !== undefined) {
      onClose();
      onIgnore(chosen);
    }
  }

  return (
    <View style={styles.prompt}>
      <Text style={styles.heading}>File or pattern to ignore</Text>
      <Text style={styles.where}>In {fileOfPlace(place, excludesFile)}</Text>
      <TextInput
        accessibilityLabel="File or pattern to ignore"
        placeholder={placeholder}
        placeholderTextColor={theme.colors.foregroundMuted}
        value={typed}
        onChangeText={setTyped}
        onSubmitEditing={() => {
          add(rule);
        }}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        style={styles.input}
      />
      <Queried query={patterns} theme={theme}>
        {(read) => (
          <Candidates patterns={read.patterns} typed={typed} onPick={add} styles={styles} />
        )}
      </Queried>
      <View style={styles.buttons}>
        <PromptButton
          label="Cancel"
          disabled={false}
          onPress={onClose}
          styles={styles}
          theme={theme}
        />
        <PromptButton
          label="Ignore"
          disabled={rule === undefined}
          onPress={() => {
            add(rule);
          }}
          styles={styles}
          theme={theme}
        />
      </View>
    </View>
  );
}

interface IgnorePromptProps {
  // The untracked file whose menu it's opened from.
  path: string;
  place: IgnorePlace;
  // Where the menu was opened.
  point: Point;
  ignoring: Ignoring;
  onClose: () => void;
  theme: PluginTheme;
}

// Asks where a rule ignoring the file goes, for a subdirectory's .gitignore, and then for the rule.
export function IgnorePrompt({
  path,
  place,
  point,
  ignoring,
  onClose,
  theme,
}: IgnorePromptProps): ReactElement {
  const styles = useStyles(theme);
  const excludesFile = useQuery(ignoring.excludesFile);

  const [picked, setPicked] = useState<Place | undefined>(
    place === "subdirectory" ? undefined : placeOf(place),
  );

  return (
    <Popup role="dialog" label={`Ignore ${path}`} point={point} onClose={onClose} theme={theme}>
      {picked === undefined ? (
        <DirectoryChoice
          path={path}
          onPick={(inDirectory) => {
            setPicked({ kind: "shared", inDirectory });
          }}
          styles={styles}
        />
      ) : (
        <PatternField
          place={picked}
          excludesFile={excludesFile.data}
          query={ignoring.patterns(path)}
          onIgnore={(rule) => {
            ignoring.onIgnore(picked, rule);
          }}
          onClose={onClose}
          styles={styles}
          theme={theme}
        />
      )}
    </Popup>
  );
}
