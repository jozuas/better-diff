import { expect, test } from "vitest";

import { entersOnList, focusRequests } from "./focus-requests";

test("a workspace's panel takes an ask for it once, and none for another workspace", () => {
  const requests = focusRequests();

  requests.ask("a");

  expect(requests.take("b")).toBe(false);
  expect(requests.take("a")).toBe(true);
  expect(requests.take("a")).toBe(false);
});

test("a panel listening takes each ask for its workspace as it comes, until it stops listening", () => {
  const requests = focusRequests();
  const heard: string[] = [];

  const stop = requests.subscribe("a", () => {
    heard.push("a");
  });

  requests.ask("b");
  requests.ask("a");

  expect(requests.take("a")).toBe(false);
  expect(requests.take("b")).toBe(true);

  stop();
  requests.ask("a");

  expect(heard).toStrictEqual(["a"]);
  expect(requests.take("a")).toBe(true);
});

test("a panel listening takes none of the asks for another workspace, though its own is waiting", () => {
  const requests = focusRequests();
  const heard: string[] = [];

  requests.ask("a");
  requests.subscribe("a", () => {
    heard.push("a");
  });
  requests.ask("b");

  expect(heard).toStrictEqual([]);
  expect(requests.take("a")).toBe(true);
});

test.each<[boolean, boolean, boolean]>([
  [true, true, true],
  [true, false, true],
  [false, false, true],
  [false, true, false],
])(
  "asked for: %s, with focus staying where it is: %s, a panel moves focus into itself as it lists the changes: %s",
  (asked, focusStays, enters) => {
    expect(entersOnList(asked, focusStays)).toBe(enters);
  },
);
