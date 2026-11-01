// Stryker disable all: this module imports react-native, which Vitest can't load.
import { Platform } from "react-native";

// This plugin typechecks without the DOM library. Declare only what this module uses.
declare const window: {
  addEventListener: (type: "focus", listener: () => void) => void;
  removeEventListener: (type: "focus", listener: () => void) => void;
};

// Calls the listener whenever the app's window gains focus, as on switching back to it from
// another app, until the returned function is called. Only on the web, where the desktop app runs.
export function onWindowFocus(listener: () => void): () => void {
  if (Platform.OS !== "web") {
    return () => {};
  }

  window.addEventListener("focus", listener);

  return () => {
    window.removeEventListener("focus", listener);
  };
}
