import type { RpcOutput } from "@getpaseo/plugin";

import type { diffRpc } from "../shared/diff";
import { fileActions, fileBarOf, hunkActions, hunkLines, lineActions } from "./actions";
import type { Controls } from "./actions";
import { fileBar } from "./focus";
import type { BarAt, KeyboardFocus } from "./focus";
import type { OpenFile } from "./groups";
import type { CommandIn } from "./keymap";
import { at, extended, linesOn, moved } from "./line-cursor";
import type { Cursor } from "./line-cursor";
import { rangeKey, rangeLines } from "./selection";
import type { LineRange } from "./selection";
import { runShortcut } from "./shortcuts";
import type { ActionCommand, Bar, Level } from "./shortcuts";
import type { Side } from "./side-by-side";

type Diff = RpcOutput<typeof diffRpc>;

type Hunk = Diff["hunks"][number];

type Kind = Hunk["lines"][number]["kind"];

// The bars whose actions keys run, at each level: what focus is in, and its file.
type Bars = Partial<Record<Level, Bar | undefined>>;

// Whether the command runs the action of the bars' it runs, given with focus on the bar itself, or
// on something inside it: Enter on its own runs one only on the bar itself, and presses a button
// with focus as anywhere.
function runsAction(command: ActionCommand, own: boolean): boolean {
  return own || command !== "stage";
}

// What a bar in a diff does with keys.
export interface BarKeys {
  file: OpenFile;
  at: BarAt;
  bars: Bars;
  // A hunk's bar's: selects the hunk's first changed line.
  onInto?: (() => void) | undefined;
  // Shows more of the file: the entire file, or a collapsed diff's lines.
  onMore?: (() => void) | undefined;
}

// A file's bar's actions, once its diff is read, as its buttons and keys run them, calling `onRun`
// just before one runs.
export function fileBarActions(
  file: OpenFile,
  diff: Pick<Diff, "version"> | undefined,
  onRun: () => void,
): Bar | undefined {
  return diff === undefined
    ? undefined
    : {
        actions: fileActions[file.group],
        bar: fileBarOf(diff.version),
        target: { file, version: diff.version },
        onRun,
      };
}

// The actions on the hunk at the index, in its file's diff of the version, calling `onRun` just
// before one runs.
export function hunkBarOf(
  file: OpenFile,
  { version, index, hunk }: { version: string; index: number; hunk: Hunk },
  onRun: () => void,
): Bar {
  return {
    actions: hunkActions[file.group],
    bar: `${version}:hunk ${index}`,
    target: { file, version, lines: hunkLines(hunk.lines, index) },
    onRun,
  };
}

// The actions on the hunk's selected lines, while it has any, in its file's diff of the version,
// calling `onRun` just before one runs.
export function lineBarOf(
  file: OpenFile,
  { version, index, hunk }: { version: string; index: number; hunk: Hunk },
  selection: LineRange | undefined,
  onRun: () => void,
): Bar | undefined {
  return selection === undefined
    ? undefined
    : {
        actions: lineActions[file.group],
        bar: `${version}:lines ${index}:${rangeKey(selection)}`,
        target: { file, version, lines: rangeLines(selection, hunk.lines) },
        onRun,
      };
}

// Whether the file's diff shows without hunks, once it's read, as a binary file's does.
export function shownBare(diff: Pick<Diff, "hunks"> | undefined): boolean {
  return diff?.hunks.length === 0;
}

// What keys in the bar of the file at the index in the view act with: its actions, and E showing a
// collapsed diff's lines with `onExpand`.
export function fileBarKeys(
  file: OpenFile,
  index: number,
  { bar, diff }: { bar: Bar | undefined; diff: Pick<Diff, "collapsed"> | undefined },
  onExpand: () => void,
): BarKeys {
  return {
    file,
    at: [index, fileBar],
    bars: { part: bar, file: bar },
    onMore: diff?.collapsed === undefined ? undefined : onExpand,
  };
}

// What keys in a bar act with.
interface BarContext {
  // Whether focus is on the bar itself, rather than on something inside it.
  own: boolean;
  keys: BarKeys;
  focus: Pick<KeyboardFocus, "toBarBy" | "toFileBy" | "toRow">;
  controls: Pick<Controls, "press">;
}

// Moves focus on through the view's bars, a bar or a file at a time.
function moving(by: "toBarBy" | "toFileBy", step: 1 | -1) {
  return ({ keys, focus }: BarContext): boolean => {
    focus[by](keys.at, step);

    return true;
  };
}

// Does what the bar does with `onInto` or `onMore`, if it does anything.
function calling(handler: "onInto" | "onMore") {
  return ({ keys }: BarContext): boolean => {
    keys[handler]?.();

    return keys[handler] !== undefined;
  };
}

// Runs the action of the bars' the command runs.
function running(command: ActionCommand) {
  return ({ own, keys, controls }: BarContext): boolean =>
    runsAction(command, own) && runShortcut(command, keys.bars, controls);
}

// What each command does with focus in a bar, and whether it does anything.
const barCommands: Record<CommandIn<"bar">, (bar: BarContext) => boolean> = {
  down: moving("toBarBy", 1),
  up: moving("toBarBy", -1),
  fileDown: moving("toFileBy", 1),
  fileUp: moving("toFileBy", -1),
  out: ({ keys, focus }) => {
    focus.toRow(keys.file);

    return true;
  },
  into: calling("onInto"),
  more: calling("onMore"),
  stage: running("stage"),
  discard: running("discard"),
  stageFile: running("stageFile"),
  discardFile: running("discardFile"),
};

// Does what the command does with focus in the bar, and says whether it did anything: moves focus
// on through the view's bars, or back to the file's row, runs the bars' actions, or what `onInto`
// or `onMore` does.
export function barCommand(
  command: CommandIn<"bar">,
  own: boolean,
  keys: BarKeys,
  focus: BarContext["focus"],
  controls: BarContext["controls"],
): boolean {
  return barCommands[command]({ own, keys, focus, controls });
}

// What a hunk's selected lines do with keys.
export interface LineKeys {
  kinds: readonly Kind[];
  // The lines selected.
  cursor: Cursor;
  // The lines' bar and their file's.
  bars: Bars;
  // Selects the lines, on the side, and shows the line it reaches.
  select: (cursor: Cursor) => void;
  // Moves the selection on past the hunk: to the next hunk, 1, or the one before, -1.
  onPast: (step: 1 | -1) => void;
  // Of the lines at the indices on the other side, the one level with the line the cursor reaches.
  level: (lines: readonly number[]) => number | undefined;
  // Clears the selection, leaving focus in the hunk's bar.
  onLeave: () => void;
  onMore: () => void;
}

// What keys in a hunk's selected lines act with.
interface LineContext {
  // Whether focus is on the hunk's bar itself, rather than on something inside it.
  own: boolean;
  keys: LineKeys;
  controls: Pick<Controls, "press">;
}

// Selects the line after the one the selection reaches, 1, or before it, -1, on its side, or past
// either end of the hunk, the next hunk's first line or the last of the one before.
function movingLines(step: 1 | -1) {
  return ({ keys }: LineContext): boolean => {
    const next = moved(keys.cursor, keys.kinds, step);

    if (next === undefined) {
      keys.onPast(step);
    } else {
      keys.select(next);
    }

    return true;
  };
}

// Selects one more line, 1, or one fewer, -1, within the hunk.
function extending(step: 1 | -1) {
  return ({ keys }: LineContext): boolean => {
    keys.select(extended(keys.cursor, keys.kinds, step));

    return true;
  };
}

// ← and →: side by side, select the line level with the one selected on the other side. ← from the
// old version's side, or inline, clears the selection.
function sideways(to: Side) {
  return ({ keys }: LineContext): boolean => {
    const { side } = keys.cursor;

    if (side === undefined || side === to) {
      if (to === "old") {
        keys.onLeave();
      }

      return true;
    }

    const line = keys.level(linesOn(keys.kinds, to));

    if (line !== undefined) {
      keys.select(at(line, to));
    }

    return true;
  };
}

// Runs the action of the bars' the command runs.
function runningOnLines(command: ActionCommand) {
  return ({ own, keys, controls }: LineContext): boolean =>
    runsAction(command, own) && runShortcut(command, keys.bars, controls);
}

// What each command does with focus in a hunk's bar while lines in it are selected, and whether it
// does anything.
const lineCommands: Record<CommandIn<"lines">, (lines: LineContext) => boolean> = {
  down: movingLines(1),
  up: movingLines(-1),
  extendDown: extending(1),
  extendUp: extending(-1),
  left: sideways("old"),
  right: sideways("new"),
  leave: ({ keys }) => {
    keys.onLeave();

    return true;
  },
  more: ({ keys }) => {
    keys.onMore();

    return true;
  },
  stage: runningOnLines("stage"),
  discard: runningOnLines("discard"),
  stageFile: runningOnLines("stageFile"),
  discardFile: runningOnLines("discardFile"),
};

// Does what the command does with focus in a hunk's bar while lines in it are selected, and says
// whether it did anything: moves the selection on, or extends it, crosses sides, clears it, shows
// more of the file, or runs the actions on the lines or on their file.
export function lineCommand(
  command: CommandIn<"lines">,
  own: boolean,
  keys: LineKeys,
  controls: LineContext["controls"],
): boolean {
  return lineCommands[command]({ own, keys, controls });
}
