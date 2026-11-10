import { buttonOf, buttonText } from "./actions";
import type { Controls, IconAction } from "./actions";
import type { MenuItem } from "./menu";
import type { Bar } from "./shortcuts";

// The items of a menu that run the actions on selected lines, as the buttons over them do, the
// button `armed` asking for confirmation, if any: each called as its button is, and one that loses
// work asking for confirmation once chosen, as its button does, in the menu, which stays open for
// it to be chosen again. None while no lines are selected.
export function actionItems(
  lines: Bar<IconAction> | undefined,
  armed: string | undefined,
  controls: Pick<Controls, "press">,
): MenuItem[] {
  if (lines === undefined) {
    return [];
  }

  return lines.actions.map((action) => {
    const button = buttonOf(lines.bar, action);
    const asking = armed === button;

    return {
      label: buttonText(action, asking),
      icon: action.icon,
      disabled: false,
      armed: asking,
      stays: action.confirmation !== undefined && !asking,
      onPress: () => {
        controls.press(button, action, lines.target, lines.onRun);
      },
    };
  });
}
