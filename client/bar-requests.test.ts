import { expect, test, vi } from "vitest";

import { barRequests } from "./bar-requests";
import type { BarRequests } from "./bar-requests";

// What hears a hunk asked to show the bar.
type Listener = Parameters<BarRequests["subscribe"]>[1];

test("a hunk asked to show the bar over its selected lines is heard by its listeners, until they stop, and by no other hunk's", () => {
  const requests = barRequests();
  const first = vi.fn<Listener>();
  const also = vi.fn<Listener>();
  const second = vi.fn<Listener>();
  const stop = requests.subscribe(0, first);

  requests.subscribe(0, also);
  requests.subscribe(1, second);
  requests.show(0, { head: 3 });
  stop();
  requests.show(0, { point: { x: 1, y: 2 } });
  requests.show(2, { head: 5 });

  expect(first.mock.calls).toStrictEqual([[{ head: 3 }]]);
  expect(also.mock.calls).toStrictEqual([[{ head: 3 }], [{ point: { x: 1, y: 2 } }]]);
  expect(second).not.toHaveBeenCalled();
});
