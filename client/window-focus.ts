// Stryker disable all: this module imports react-native, which Vitest can't load.
import { useEffect } from "react";
import { Platform } from "react-native";

import { useLatest } from "./web";

// This plugin typechecks without the DOM library. Declare only what this module uses.
declare const window: {
  addEventListener: (type: "focus", listener: () => void) => void;
  removeEventListener: (type: "focus", listener: () => void) => void;
};

// Calls the latest listener whenever the app's window gains focus, as on switching back to it from
// another app, while the caller is mounted. Only on the web, where the desktop app runs.
export function useWindowFocus(listener: () => void): void {
  const latest = useLatest(listener);

  useEffect(() => {
    if (Platform.OS !== "web") {
      return () => {};
    }

    function focused(): void {
      latest.current();
    }

    window.addEventListener("focus", focused);

    return () => {
      window.removeEventListener("focus", focused);
    };
  }, [latest]);
}
