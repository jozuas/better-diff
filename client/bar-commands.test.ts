import * as fc from "fast-check";
import { expect, test } from "vitest";

import { fileActions, hunkActions, lineActions } from "./actions";
import {
  barCommand,
  fileBarActions,
  fileBarKeys,
  hunkBarOf,
  lineBarOf,
  lineCommand,
  shownBare,
} from "./bar-commands";
import type { BarKeys, LineKeys } from "./bar-commands";
import { fileBar } from "./focus";
import type { BarAt } from "./focus";
import type { CommandIn } from "./keymap";
import { at } from "./line-cursor";
import type { Cursor, Kind } from "./line-cursor";

const file = { group: "modified", path: "a" } as const;
const barAt: BarAt = [0, 1];

function onRun(): void {}

function onExpand(): void {}

const bars = {
  part: {
    actions: hunkActions.modified,
    bar: "1:hunk 1",
    target: { group: "modified", paths: [] },
  },
  file: { actions: fileActions.modified, bar: "1:file", target: { group: "modified", paths: [] } },
} as const;

// Records what keys did with focus in a bar or lines, in order.
function recorder() {
  const done: string[] = [];

  return {
    done,
    focus: {
      toBarBy: (from: BarAt, step: 1 | -1) => {
        done.push(`bar ${from.join(",")} ${step}`);
      },
      toFileBy: (from: BarAt, step: 1 | -1) => {
        done.push(`file ${from.join(",")} ${step}`);
      },
      toRow: ({ path }: { path: string }) => {
        done.push(`row ${path}`);
      },
    },
    controls: {
      press: (button: string) => {
        done.push(`press ${button}`);
      },
    },
    record: (name: string) => () => {
      done.push(name);
    },
  };
}

function barKeys(record: (name: string) => () => void): BarKeys {
  return { file, at: barAt, bars, onInto: record("into"), onMore: record("more") };
}

test.each<[CommandIn<"bar">, string]>([
  ["down", "bar 0,1 1"],
  ["up", "bar 0,1 -1"],
  ["fileDown", "file 0,1 1"],
  ["fileUp", "file 0,1 -1"],
  ["out", "row a"],
  ["into", "into"],
  ["more", "more"],
  ["stage", "press 1:hunk 1:stage"],
  ["discard", "press 1:hunk 1:discard"],
  ["stageFile", "press 1:file:stage"],
  ["discardFile", "press 1:file:discard"],
])("in a bar, %s does %s", (command, did) => {
  const { done, focus, controls, record } = recorder();

  expect(barCommand(command, true, barKeys(record), focus, controls)).toBe(true);
  expect(done).toStrictEqual([did]);
});

test("in a bar, Enter presses a button with focus inside it rather than run the bar's action, and the other keys act the same either way", () => {
  fc.assert(
    fc.property(
      fc.constantFrom<CommandIn<"bar">>(
        "down",
        "up",
        "fileDown",
        "fileUp",
        "out",
        "into",
        "more",
        "discard",
        "stageFile",
        "discardFile",
      ),
      (command) => {
        const inside = recorder();
        const own = recorder();

        expect(
          barCommand(command, false, barKeys(inside.record), inside.focus, inside.controls),
        ).toBe(barCommand(command, true, barKeys(own.record), own.focus, own.controls));
        expect(inside.done).toStrictEqual(own.done);
      },
    ),
  );

  const { done, focus, controls, record } = recorder();

  expect(barCommand("stage", false, barKeys(record), focus, controls)).toBe(false);
  expect(done).toStrictEqual([]);
});

test("a bar without something to move into, or more to show, does nothing with → or E", () => {
  const { done, focus, controls } = recorder();

  expect(barCommand("into", true, { file, at: barAt, bars }, focus, controls)).toBe(false);
  expect(barCommand("more", true, { file, at: barAt, bars }, focus, controls)).toBe(false);
  expect(done).toStrictEqual([]);
});

const kinds: Kind[] = ["context", "removed", "added", "context"];

// What keys with lines selected act with, from the cursor, the line `level` finds on the other side.
function lineKeys(
  cursor: Cursor,
  record: (name: string) => () => void,
  done: string[],
  level?: number,
): LineKeys {
  return {
    kinds,
    cursor,
    bars,
    select: ({ anchor, head, side }) => {
      done.push(`select ${anchor}-${head} ${String(side)}`);
    },
    onPast: (step) => {
      done.push(`past ${step}`);
    },
    level: (lines) => {
      done.push(`level of ${lines.join(",")}`);

      return level;
    },
    onLeave: record("leave"),
    onMore: record("more"),
  };
}

test.each<[CommandIn<"lines">, Cursor, string[]]>([
  ["down", at(1), ["select 2-2 undefined"]],
  ["up", at(1), ["select 0-0 undefined"]],
  ["down", at(3), ["past 1"]],
  ["up", at(0), ["past -1"]],
  ["down", at(1, "old"), ["select 3-3 old"]],
  ["extendDown", { anchor: 1, head: 1, side: undefined }, ["select 1-2 undefined"]],
  ["extendUp", { anchor: 2, head: 1, side: undefined }, ["select 2-0 undefined"]],
  ["extendDown", at(3, "new"), ["select 3-3 new"]],
  ["left", at(1), ["leave"]],
  ["right", at(1), []],
  ["left", at(1, "old"), ["leave"]],
  ["right", at(2, "new"), []],
  ["right", at(1, "old"), ["level of 0,2,3", "select 2-2 new"]],
  ["left", at(2, "new"), ["level of 0,1,3", "select 2-2 old"]],
  ["leave", at(1), ["leave"]],
  ["more", at(1), ["more"]],
  ["stage", at(1), ["press 1:hunk 1:stage"]],
  ["discard", at(1), ["press 1:hunk 1:discard"]],
  ["stageFile", at(1), ["press 1:file:stage"]],
  ["discardFile", at(1), ["press 1:file:discard"]],
])("with lines selected, %s from %o does %o", (command, cursor, did) => {
  const { done, controls, record } = recorder();

  expect(lineCommand(command, true, lineKeys(cursor, record, done, 2), controls)).toBe(true);
  expect(done).toStrictEqual(did);
});

test("side by side, ← and → select nothing on the other side while it has no line level with the one selected", () => {
  const { done, controls, record } = recorder();

  expect(lineCommand("right", true, lineKeys(at(1, "old"), record, done), controls)).toBe(true);
  expect(done).toStrictEqual(["level of 0,2,3"]);
});

test("with lines selected, Enter presses a button with focus inside the bar rather than run their action, and the other keys act the same either way", () => {
  fc.assert(
    fc.property(
      fc.constantFrom<CommandIn<"lines">>(
        "down",
        "up",
        "extendDown",
        "extendUp",
        "left",
        "right",
        "leave",
        "more",
        "discard",
        "stageFile",
        "discardFile",
      ),
      fc.constantFrom(at(1), at(3, "new"), at(1, "old")),
      (command, cursor) => {
        const inside = recorder();
        const own = recorder();

        expect(
          lineCommand(
            command,
            false,
            lineKeys(cursor, inside.record, inside.done, 2),
            inside.controls,
          ),
        ).toBe(lineCommand(command, true, lineKeys(cursor, own.record, own.done, 2), own.controls));
        expect(inside.done).toStrictEqual(own.done);
      },
    ),
  );

  const { done, controls, record } = recorder();

  expect(lineCommand("stage", false, lineKeys(at(1), record, done), controls)).toBe(false);
  expect(done).toStrictEqual([]);
});

test("a file's bar acts on all of the file once its diff is read, and shows a collapsed diff's lines with E", () => {
  const read = { version: "2", hunks: [], collapsed: "large" as const };
  const actions = fileBarActions(file, read, onRun);

  expect(actions).toStrictEqual({
    actions: fileActions.modified,
    bar: "2:file",
    target: { file, version: "2" },
    onRun,
  });
  expect(fileBarActions(file, [read][1], onRun)).toBeUndefined();
  expect(fileBarKeys(file, 3, { bar: actions, diff: read }, onExpand)).toStrictEqual({
    file,
    at: [3, fileBar],
    bars: { part: actions, file: actions },
    onMore: onExpand,
  });
  expect(fileBarKeys(file, 3, { bar: actions, diff: {} }, onExpand).onMore).toBeUndefined();
  expect(fileBarKeys(file, 3, { bar: actions, diff: [{}][1] }, onExpand).onMore).toBeUndefined();
});

test("a hunk's bar acts on its lines, and while lines in it are selected, on those", () => {
  const hunk = {
    oldStart: 1,
    newStart: 1,
    lines: kinds.map((kind) => ({ kind, text: kind, newline: true, runs: [] })),
  };

  const selection = { file: 0, hunk: 2, first: 1, last: 3, side: "new" } as const;

  expect(hunkBarOf(file, { version: "2", index: 2, hunk }, onRun)).toStrictEqual({
    actions: hunkActions.modified,
    bar: "2:hunk 2",
    target: { file, version: "2", lines: [0, 1, 2, 3].map((line) => ({ hunk: 2, line })) },
    onRun,
  });
  expect(lineBarOf(file, { version: "2", index: 2, hunk }, selection, onRun)).toStrictEqual({
    actions: lineActions.modified,
    bar: "2:lines 2:1-3 new",
    target: { file, version: "2", lines: [2, 3].map((line) => ({ hunk: 2, line })) },
    onRun,
  });
  expect(lineBarOf(file, { version: "2", index: 2, hunk }, [selection][1], onRun)).toBeUndefined();
});

test("a file's diff shows bare once it's read without hunks", () => {
  expect(shownBare({ hunks: [] })).toBe(true);
  expect(shownBare({ hunks: [{ oldStart: 1, newStart: 1, lines: [] }] })).toBe(false);
  expect(shownBare([{ hunks: [] }][1])).toBe(false);
});
