import { expect, test, vi } from "vitest";

import { barLayer, nextTicket } from "./bar-layer";

test("a layer shows the bar asked with the latest ticket, but not one asked with an earlier one", () => {
  const layer = barLayer<string>();

  expect(layer.shown()).toBeUndefined();

  layer.show(1, "first");
  layer.show(2, "second");

  expect(layer.shown()).toBe("second");

  layer.show(1, "first again");
  layer.show(2, "second again");

  expect(layer.shown()).toBe("second again");
});

test("a layer stops showing a bar once the lines that asked with its ticket hide it, and tells each change, until its listener stops", () => {
  const layer = barLayer<string>();
  const heard = vi.fn<() => void>();
  const unsubscribe = layer.subscribe(heard);

  layer.show(1, "first");
  layer.show(2, "second");
  layer.hide(1);

  expect(layer.shown()).toBe("second");

  layer.hide(2);

  expect(layer.shown()).toBeUndefined();

  unsubscribe();
  layer.show(3, "third");

  expect(heard).toHaveBeenCalledTimes(3);
});

test("a layer shows the first bar asked, whatever its ticket, and hiding one while none shows does nothing", () => {
  const layer = barLayer<string>();

  layer.hide(0);

  expect(layer.shown()).toBeUndefined();

  layer.show(0, "first");

  expect(layer.shown()).toBe("first");
});

test("a bar hidden doesn't show again with its ticket once one with a later ticket has shown", () => {
  const layer = barLayer<string>();

  layer.show(0, "first");
  layer.show(5, "later");
  layer.hide(5);
  layer.show(0, "first again");

  expect(layer.shown()).toBeUndefined();
});

test("each ticket is later than the one before it", () => {
  const first = nextTicket();

  expect(nextTicket()).toBe(first + 1);
});
