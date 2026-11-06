import { expect, test } from "vitest";

import { ignoreRpc } from "./ignore";

function takes(rule: string): boolean {
  return ignoreRpc.input.safeParse({ directory: "/r", place: { kind: "private" }, rule }).success;
}

test("a rule can have any characters on one line", () => {
  expect(takes("/a b\t*.log")).toBe(true);
});

test("a rule can't be empty, nor have a newline or carriage return anywhere", () => {
  expect(takes("")).toBe(false);
  expect(takes("a\nb")).toBe(false);
  expect(takes("a\rb")).toBe(false);
  expect(takes("a\n")).toBe(false);
  expect(takes("\na")).toBe(false);
});
