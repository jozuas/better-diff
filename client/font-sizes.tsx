import type { ReactElement, ReactNode } from "react";
import { useMemo } from "react";

import type { ViewValues } from "../shared/settings";
import { fontSizes, FontSizesContext } from "./fonts";

interface FontSizesProviderProps {
  settings: ViewValues;
  children: ReactNode;
}

// Gives what's in it the sizes the font size settings set.
export function FontSizesProvider({ settings, children }: FontSizesProviderProps): ReactElement {
  const { panelFontSize, diffFontSize } = settings;

  const sizes = useMemo(
    () => fontSizes({ panelFontSize, diffFontSize }),
    [panelFontSize, diffFontSize],
  );

  return <FontSizesContext value={sizes}>{children}</FontSizesContext>;
}
