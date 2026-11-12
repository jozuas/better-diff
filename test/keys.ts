import type { Chord, Command, Place } from "../client/keymap";

export const down = { key: "ArrowDown" };
const up = { key: "ArrowUp" };
const left = { key: "ArrowLeft" };
const right = { key: "ArrowRight" };
export const enter = { key: "Enter" };
const backspace = { key: "Backspace" };
const escape = { key: "Escape" };

// Every place's keys, and the command each gives there. A key with `primary` takes ⌘ on a Mac and
// Ctrl elsewhere, and one with `mac` is only a Mac's, or only other computers'.
export const keys: [Place, Chord, Command][] = [
  ["row", down, "down"],
  ["row", up, "up"],
  ["row", { ...down, alt: true }, "groupDown"],
  ["row", { ...up, alt: true }, "groupUp"],
  ["row", { ...down, shift: true }, "selectDown"],
  ["row", { ...up, shift: true }, "selectUp"],
  ["row", right, "into"],
  ["row", { ...enter, shift: true }, "stageFile"],
  ["row", { ...backspace, shift: true }, "discardFile"],
  ["row", { key: "ContextMenu" }, "menu"],
  ["row", { key: "F10", shift: true }, "menu"],
  ["row", escape, "single"],
  ["heading", down, "down"],
  ["heading", up, "up"],
  ["heading", { ...down, alt: true }, "groupDown"],
  ["heading", { ...up, alt: true }, "groupUp"],
  ["heading", left, "collapse"],
  ["heading", right, "expand"],
  ["heading", { ...enter, shift: true }, "stageFile"],
  ["heading", { ...backspace, shift: true }, "discardFile"],
  ["filter", down, "first"],
  ["filter", enter, "first"],
  ["filter", escape, "clear"],
  ["bar", down, "down"],
  ["bar", up, "up"],
  ["bar", { ...down, alt: true }, "fileDown"],
  ["bar", { ...up, alt: true }, "fileUp"],
  ["bar", left, "out"],
  ["bar", right, "into"],
  ["bar", enter, "stage"],
  ["bar", backspace, "discard"],
  ["bar", { ...enter, shift: true }, "stageFile"],
  ["bar", { ...backspace, shift: true }, "discardFile"],
  ["bar", { key: "e" }, "more"],
  ["bar", { key: "e", shift: true }, "moreFile"],
  ["lines", down, "down"],
  ["lines", up, "up"],
  ["lines", { ...down, shift: true }, "extendDown"],
  ["lines", { ...up, shift: true }, "extendUp"],
  ["lines", left, "left"],
  ["lines", right, "right"],
  ["lines", enter, "stage"],
  ["lines", backspace, "discard"],
  ["lines", { ...enter, shift: true }, "stageFile"],
  ["lines", { ...backspace, shift: true }, "discardFile"],
  ["lines", escape, "leave"],
  ["lines", { key: "e" }, "more"],
  ["lines", { key: "e", shift: true }, "moreFile"],
  ["menu", down, "down"],
  ["menu", up, "up"],
  ["panel", { key: "/" }, "filter"],
  ["panel", { key: "f", primary: true }, "find"],
  ["panel", { key: "g", primary: true, mac: true }, "findNext"],
  ["panel", { key: "F3", mac: false }, "findNext"],
  ["panel", { key: "g", shift: true, primary: true, mac: true }, "findPrevious"],
  ["panel", { key: "F3", shift: true, mac: false }, "findPrevious"],
  ["find", enter, "next"],
  ["find", { key: "F3", mac: false }, "next"],
  ["find", { ...enter, shift: true }, "previous"],
  ["find", { key: "F3", shift: true, mac: false }, "previous"],
  ["find", { key: "c", alt: true }, "matchCase"],
  ["find", escape, "close"],
  ["question", escape, "cancel"],
];

// Every place keys give commands in.
export const places = [...new Set(keys.map(([place]) => place))];
