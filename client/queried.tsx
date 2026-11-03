import type { PluginTheme } from "@getpaseo/plugin";
import { Loading } from "@getpaseo/plugin/client/ui";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useContext } from "react";
import { Text } from "react-native";

import { FontSizesContext } from "./fonts";

interface FailedProps {
  message: string;
  theme: PluginTheme;
}

// Why something couldn't be read.
export function Failed({ message, theme }: FailedProps): ReactElement {
  const fonts = useContext(FontSizesContext);

  return (
    <Text
      selectable
      style={{ padding: 16, fontSize: fonts.text, color: theme.colors.statusDanger }}
    >
      {message}
    </Text>
  );
}

interface QueriedProps<Data> {
  query: UseQueryResult<Data>;
  theme: PluginTheme;
  children: (data: Data) => ReactElement;
}

interface RefetchFailedProps {
  // Why it couldn't be read again, if the last try failed.
  error: Error | null;
  theme: PluginTheme;
}

// Why what's shown couldn't be read again, if it couldn't, which it may be out of date for.
function RefetchFailed({ error, theme }: RefetchFailedProps): ReactElement | null {
  return error === null ? null : (
    <Failed
      message={`Couldn't read this again, so it may be out of date: ${error.message}`}
      theme={theme}
    />
  );
}

// What the query got, once it has, or why it couldn't. Once it has, what it got stays while it
// fails to read it again, as it's read again whenever it may have changed, under why it couldn't,
// from the first try that fails.
export function Queried<Data>({ query, theme, children }: QueriedProps<Data>): ReactElement {
  if (query.isPending) {
    return <Loading />;
  }

  if (query.isLoadingError) {
    return <Failed message={query.error.message} theme={theme} />;
  }

  return (
    <>
      <RefetchFailed error={query.failureReason} theme={theme} />
      {children(query.data)}
    </>
  );
}
