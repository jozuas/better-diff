import { QueryClient, QueryObserver } from "@tanstack/react-query";
import * as fc from "fast-check";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { readAt, refreshOf } from "./refresh";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function elapsed(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

// A client whose queries fail at once, as the app's do once its retries are spent.
function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

interface Query {
  key: string[];
  // How many milliseconds each of its reads takes.
  takes: number;
}

// How many reads of the queries started, and whether those that start fail.
interface Reads {
  started: number;
  fails: boolean;
}

// Shows the queries, each of whose reads holds how many reads had started once it started, and
// stops showing them once the returned function is called. Their first reads start at once.
function showing(queryClient: QueryClient, queries: readonly Query[], reads: Reads): () => void {
  const stops = queries.map(({ key, takes }) =>
    new QueryObserver(queryClient, {
      queryKey: key,
      queryFn: async () => {
        reads.started += 1;

        const started = reads.started;
        const fails = reads.fails;

        await elapsed(takes);

        if (fails) {
          throw new Error("The read failed.");
        }

        return started;
      },
    }).subscribe(() => {}),
  );

  return () => {
    for (const stop of stops) {
      stop();
    }
  };
}

// The refresh of a directory's query, which takes the milliseconds to read, once its first read is
// done, and how many times it was read.
async function shownQuery(takes = 0) {
  const queryClient = client();
  const reads = { started: 0, fails: false };

  showing(queryClient, [{ key: ["/a"], takes }], reads);
  await vi.runAllTimersAsync();

  return { refresh: refreshOf(queryClient, "/a"), reads };
}

// Has the refresh show each version in turn, once the one before is shown.
async function showEach(
  refresh: (version?: string) => Promise<void>,
  versions: readonly (string | undefined)[],
): Promise<void> {
  const [first, ...rest] = versions;

  if (versions.length > 0) {
    await Promise.all([refresh(first), vi.runAllTimersAsync()]);
    await showEach(refresh, rest);
  }
}

// Notes the name once the promise is done.
async function noteDone(promise: Promise<void>, done: string[], name: string): Promise<void> {
  await promise;
  done.push(name);
}

test("reads again once for each version, however many times it's asked to show it", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom("a", "b"),
      fc.integer({ min: 1, max: 5 }),
      async (version, times) => {
        const { refresh, reads } = await shownQuery();

        await showEach(
          refresh,
          Array.from({ length: times }, () => version),
        );

        expect(reads.started).toBe(2);
      },
    ),
  );
});

test("reads again for a version other than the last read's, though one read before was for it", async () => {
  const { refresh, reads } = await shownQuery();

  await showEach(refresh, ["a", "b", "a"]);

  expect(reads.started).toBe(4);
});

test("reads again each time it's asked to show the changes as they are, without a version", async () => {
  const { refresh, reads } = await shownQuery();

  await showEach(refresh, [undefined, undefined]);

  expect(reads.started).toBe(3);
});

test("reads again for a version whose read failed, and fails as it does", async () => {
  const { refresh, reads } = await shownQuery();

  reads.fails = true;

  await expect(Promise.all([refresh("a"), vi.runAllTimersAsync()])).rejects.toThrow(
    "The read failed.",
  );

  reads.fails = false;

  await Promise.all([refresh("a"), vi.runAllTimersAsync()]);

  expect(reads.started).toBe(3);
});

test("shows a version a read under way is for once that read is done", async () => {
  const { refresh, reads } = await shownQuery(1000);
  const done: string[] = [];

  void noteDone(refresh("a"), done, "first");
  await vi.advanceTimersByTimeAsync(500);
  void noteDone(refresh("a"), done, "second");
  await vi.advanceTimersByTimeAsync(499);

  expect(done).toStrictEqual([]);

  await vi.advanceTimersByTimeAsync(1);

  expect([reads.started, done]).toStrictEqual([2, ["first", "second"]]);
});

test("reads each shown query of the directory again, from a read that starts after it's asked to, though one is under way, its first included", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.integer({ min: 0, max: 2000 }), { minLength: 1, maxLength: 4 }),
      fc.integer({ min: 0, max: 2000 }),
      async (takes, after) => {
        const queryClient = client();
        const queries = takes.map((each, index) => ({ key: ["/a", String(index)], takes: each }));
        const reads = { started: 0, fails: false };
        const stop = showing(queryClient, queries, reads);

        await vi.advanceTimersByTimeAsync(after);

        const asked = reads.started;

        await Promise.all([refreshOf(queryClient, "/a")(), vi.runAllTimersAsync()]);

        expect(
          Math.min(...queries.map(({ key }) => Number(queryClient.getQueryData(key)))),
        ).toBeGreaterThan(asked);

        stop();
        queryClient.clear();
      },
    ),
    {
      examples: [
        [[1000], 500],
        [[1000, 0], 500],
      ],
    },
  );
});

test("one read again under way is done once a later one is", async () => {
  const { refresh, reads } = await shownQuery(1000);
  const done: string[] = [];

  void noteDone(refresh(), done, "first");
  await vi.advanceTimersByTimeAsync(500);
  void noteDone(refresh(), done, "later");
  await vi.advanceTimersByTimeAsync(999);

  expect(done).toStrictEqual([]);

  await vi.advanceTimersByTimeAsync(1);

  expect([reads.started, done.toSorted()]).toStrictEqual([3, ["first", "later"]]);
});

test("reads no query of another directory, nor one that isn't shown, though it has it read again later", async () => {
  const queryClient = client();
  const reads = { started: 0, fails: false };

  const stop = showing(
    queryClient,
    [
      { key: ["/b"], takes: 0 },
      { key: ["/a", "hidden"], takes: 0 },
    ],
    reads,
  );

  await vi.runAllTimersAsync();
  stop();
  await Promise.all([refreshOf(queryClient, "/a")(), vi.runAllTimersAsync()]);

  expect(reads.started).toBe(2);
  expect(queryClient.getQueryState(["/a", "hidden"])?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(["/b"])?.isInvalidated).toBe(false);

  queryClient.clear();
});

test("leaves the read under way of another directory's query to finish", async () => {
  const queryClient = client();
  const reads = { started: 0, fails: false };
  const stop = showing(queryClient, [{ key: ["/b"], takes: 1000 }], reads);

  await vi.advanceTimersByTimeAsync(500);
  await Promise.all([refreshOf(queryClient, "/a")(), vi.runAllTimersAsync()]);

  expect(queryClient.getQueryData(["/b"])).toBe(1);

  stop();
  queryClient.clear();
});

test("leaves the read under way of a query no longer shown to finish", async () => {
  const queryClient = client();
  const reads = { started: 0, fails: false };
  const stop = showing(queryClient, [{ key: ["/a", "hidden"], takes: 1000 }], reads);

  await vi.advanceTimersByTimeAsync(500);
  stop();
  await Promise.all([refreshOf(queryClient, "/a")(), vi.runAllTimersAsync()]);

  expect(queryClient.getQueryData(["/a", "hidden"])).toBe(1);

  queryClient.clear();
});

test("the refresh of a directory's queries is the same for every panel that shows them, and another for another directory or client", () => {
  const queryClient = client();
  const refresh = refreshOf(queryClient, "/a");

  expect(refreshOf(queryClient, "/a")).toBe(refresh);
  expect(refreshOf(queryClient, "/b")).not.toBe(refresh);
  expect(refreshOf(client(), "/a")).not.toBe(refresh);
});

test("the changes were first read at no version until they're read, at none if they couldn't be, and else at the one they were", () => {
  expect(readAt({ isPending: true, data: undefined })).toBeUndefined();
  expect(readAt({ isPending: false, data: undefined })).toBe("");
  expect(readAt({ isPending: false, data: { version: "a" } })).toBe("a");
});
