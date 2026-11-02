import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";

import { syntaxColorsRpc } from "../shared/syntax";
import { schemeOf, SyntaxColorsContext } from "./syntax";

interface SyntaxColorsProviderProps {
  theme: PluginTheme;
  children: ReactNode;
}

// Gives its children the colours of syntax for the theme, none until they're read, or if they can't
// be.
export function SyntaxColorsProvider({ theme, children }: SyntaxColorsProviderProps): ReactElement {
  const readColors = useRpc(syntaxColorsRpc);

  const colors = useQuery({
    queryKey: ["syntax colors"],
    queryFn: async () => {
      const read = await readColors({});

      return read;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  return (
    <SyntaxColorsContext value={colors.data?.[schemeOf(theme.colors.surface0)] ?? {}}>
      {children}
    </SyntaxColorsContext>
  );
}
