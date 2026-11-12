import { chordsOf, chordText } from "./keymap";
import type { CommandIn, Place } from "./keymap";

// What keys in a place do: the commands they give there, and what those do.
export type KeyLine = {
  [In in Place]: { place: In; commands: readonly CommandIn<In>[]; does: string };
}[Place];

// Keys of a part of the panel, and what to know of them all.
interface KeySection {
  title: string;
  info?: string;
  lines: readonly KeyLine[];
}

// What the keys that stage and discard do in STAGED.
const unstaging = "In STAGED, the keys that stage or discard unstage instead";

// The panel's keys, by where focus is, as Better Diff's page in Paseo's settings lists them.
export const keyList: readonly KeySection[] = [
  {
    title: "Keys anywhere in the panel",
    lines: [
      { place: "panel", commands: ["filter"], does: "Move to the filter" },
      {
        place: "panel",
        commands: ["find"],
        does: "Find in the diff, or move back to what's typed",
      },
      {
        place: "panel",
        commands: ["findNext", "findPrevious"],
        does: "Move to the next match, or the one before, while the find bar is open",
      },
      { place: "question", commands: ["cancel"], does: "Take back the question a discard asks" },
    ],
  },
  {
    title: "Keys in the file list",
    lines: [
      {
        place: "row",
        commands: ["down", "up"],
        does: "Move to the next row or heading, or the one before, opening the file of a row",
      },
      {
        place: "row",
        commands: ["groupDown", "groupUp"],
        does: "Move to the next group's heading, or the one before",
      },
      {
        place: "row",
        commands: ["selectDown", "selectUp"],
        does: "Select one more file, or one fewer",
      },
      { place: "row", commands: ["into"], does: "Move into the file's diff" },
      {
        place: "row",
        commands: ["stageFile"],
        does: "Stage the file, or the files selected, or in STAGED unstage them",
      },
      {
        place: "row",
        commands: ["discardFile"],
        does: "Discard the file, or the files selected, or in STAGED unstage them",
      },
      { place: "row", commands: ["menu"], does: "Open the file's menu" },
      { place: "row", commands: ["single"], does: "Open just this one of the files selected" },
    ],
  },
  {
    title: "Keys in a group's heading",
    lines: [
      {
        place: "heading",
        commands: ["down", "up"],
        does: "Move to the next row or heading, or the one before, opening the file of a row",
      },
      {
        place: "heading",
        commands: ["groupDown", "groupUp"],
        does: "Move to the next group's heading, or the one before",
      },
      { place: "heading", commands: ["collapse"], does: "Collapse the group" },
      {
        place: "heading",
        commands: ["expand"],
        does: "Expand the group, or once it's expanded, open it and move into its diff",
      },
      {
        place: "heading",
        commands: ["stageFile"],
        does: "Stage all the group's files, or in STAGED unstage them",
      },
      {
        place: "heading",
        commands: ["discardFile"],
        does: "Discard all the group's files, or in STAGED unstage them",
      },
    ],
  },
  {
    title: "Keys in the filter",
    lines: [
      { place: "filter", commands: ["first"], does: "Move to the first file listed, opening it" },
      {
        place: "filter",
        commands: ["clear"],
        does: "Clear the filter, or once it's empty, move to the open file",
      },
    ],
  },
  {
    title: "Keys in a file's, a mode change's or a hunk's bar",
    info: unstaging,
    lines: [
      {
        place: "bar",
        commands: ["down", "up"],
        does: "Move to the next bar or the one before, on into the next file or the one before",
      },
      {
        place: "bar",
        commands: ["fileDown", "fileUp"],
        does: "Move to the next file's bar, or the one before",
      },
      { place: "bar", commands: ["out"], does: "Move back to the file's row" },
      { place: "bar", commands: ["into"], does: "Select the hunk's first changed line" },
      { place: "bar", commands: ["stage"], does: "Stage the hunk, mode change or file" },
      { place: "bar", commands: ["discard"], does: "Discard the hunk, mode change or file" },
      { place: "bar", commands: ["stageFile"], does: "Stage the whole file" },
      { place: "bar", commands: ["discardFile"], does: "Discard the whole file" },
      {
        place: "bar",
        commands: ["more"],
        does: "Show the unchanged lines above the hunk, or hide them, or show a collapsed diff",
      },
      {
        place: "bar",
        commands: ["moreFile"],
        does: "Show the entire file, or only its modified hunks",
      },
    ],
  },
  {
    title: "Keys with lines selected",
    info: unstaging,
    lines: [
      {
        place: "lines",
        commands: ["down", "up"],
        does: "Select the next line or the one before, on into the next hunk or the one before",
      },
      {
        place: "lines",
        commands: ["extendDown", "extendUp"],
        does: "Select one more line, or one fewer",
      },
      {
        place: "lines",
        commands: ["left", "right"],
        does: "Move the selection to the other side, side by side, or back to the hunk's bar",
      },
      { place: "lines", commands: ["stage"], does: "Stage the lines" },
      { place: "lines", commands: ["discard"], does: "Discard the lines" },
      { place: "lines", commands: ["stageFile"], does: "Stage the whole file" },
      { place: "lines", commands: ["discardFile"], does: "Discard the whole file" },
      { place: "lines", commands: ["leave"], does: "Clear the selection" },
      {
        place: "lines",
        commands: ["more"],
        does: "Show the unchanged lines above the hunk, or hide them",
      },
      {
        place: "lines",
        commands: ["moreFile"],
        does: "Show the entire file, or only its modified hunks",
      },
    ],
  },
  {
    title: "Keys in the find bar",
    lines: [
      {
        place: "find",
        commands: ["next", "previous"],
        does: "Move to the next match, or the one before",
      },
      { place: "find", commands: ["matchCase"], does: "Match case, or stop matching it" },
      { place: "find", commands: ["close"], does: "Close the find bar" },
    ],
  },
  {
    title: "Keys in a file's menu",
    lines: [
      { place: "menu", commands: ["down", "up"], does: "Move to the next item, or the one before" },
    ],
  },
];

// How the line's keys are written, each command's keys in turn, apart.
export function keysText({ place, commands }: KeyLine, mac: boolean): string {
  return commands
    .flatMap((command) => chordsOf(place, command, mac).map((chord) => chordText(chord, mac)))
    .join("  ");
}
