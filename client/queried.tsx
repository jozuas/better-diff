import type { PluginTheme } from "@getpaseo/plugin";
import { Loading } from "@getpaseo/plugin/client/ui";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { Text } from "react-native";

interface FailedProps {
  message: string;
  theme: PluginTheme;
}

// Why something couldn't be read.
export function Failed({ message, theme }: FailedProps): ReactElement {
  return (
    <Text selectable style={{ padding: 16, color: theme.colors.statusDanger }}>
      {message}
    </Text>
  );
}

interface QueriedProps<Data> {
  query: UseQueryResult<Data>;
  theme: PluginTheme;
  children: (data: Data) => ReactElement;
}

// What the query got, once it has, or why it couldn't.
export function Queried<Data>({ query, theme, children }: QueriedProps<Data>): ReactElement {
  if (query.isPending) {
    return <Loading />;
  }

  if (query.isError) {
    return <Failed message={query.error.message} theme={theme} />;
  }

  return children(query.data);
}
