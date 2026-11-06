import * as fc from "fast-check";
import { expect, test, vi } from "vitest";

import { misalignedMessage, staleMessage, unwritableMessage } from "./apply";
import type { Server } from "./apply";
import { applyAndTell, controlsStore, runBusy } from "./controls";
import type { ControlsStore } from "./controls";

type ControlsState = ReturnType<ControlsStore["state"]>;

// A change to the state, of either part, both or neither. Few buttons, so a change often arms the
// one armed again.
const change: fc.Arbitrary<Partial<ControlsState>> = fc.record(
  { armed: fc.constantFrom(undefined, "a", "b"), busy: fc.boolean() },
  { requiredKeys: [] },
);

// The state after each change: the part each gives, and the rest as it was.
function model(changes: readonly Partial<ControlsState>[]): ControlsState[] {
  let state: ControlsState = { armed: undefined, busy: false };

  return changes.map((next) => {
    state = {
      armed: "armed" in next ? next.armed : state.armed,
      busy: next.busy ?? state.busy,
    };

    return state;
  });
}

// Each state that's not the one before it.
function changesOf(states: readonly ControlsState[]): ControlsState[] {
  return states
    .slice(1)
    .filter((state, index) => JSON.stringify(state) !== JSON.stringify(states[index]));
}

test("the state is what the changes made it, with nothing armed and nothing running at first", () => {
  fc.assert(
    fc.property(fc.array(change), (changes) => {
      const store = controlsStore();
      const states = [store.state()];

      for (const next of changes) {
        store.update(next);
        states.push(store.state());
      }

      expect(states).toStrictEqual([{ armed: undefined, busy: false }, ...model(changes)]);
    }),
    { examples: [[[{ armed: "a" }, { busy: true }, { armed: undefined }]]] },
  );
});

test("each listener hears each change of the state, once, and nothing once it unsubscribes", () => {
  fc.assert(
    fc.property(fc.array(change), fc.array(change), (heard, unheard) => {
      const store = controlsStore();
      const changes: string[] = [];

      const listeners = ["a", "b"].map((name) =>
        store.subscribe(() => {
          changes.push(`${name} ${JSON.stringify(store.state())}`);
        }),
      );

      const changed = changesOf([store.state(), ...model(heard)]);

      for (const next of heard) {
        store.update(next);
      }

      for (const unsubscribe of listeners) {
        unsubscribe();
      }

      for (const next of unheard) {
        store.update(next);
      }

      expect(changes).toStrictEqual(
        changed.flatMap((state) => [`a ${JSON.stringify(state)}`, `b ${JSON.stringify(state)}`]),
      );
    }),
    { examples: [[[{ armed: "a" }, { armed: "a" }, { busy: false }, { busy: true }], []]] },
  );
});

test("the state is the same each time until it changes", () => {
  const store = controlsStore();
  const first = store.state();

  store.update({ armed: undefined, busy: false });

  expect(store.state()).toBe(first);
});

// Calls back only once `show` is called, as a view does once it shows what changed.
function showing() {
  const callbacks: (() => void)[] = [];

  return {
    shown: (callback: () => void) => {
      callbacks.push(callback);
    },
    show: () => {
      for (const callback of callbacks.splice(0)) {
        callback();
      }
    },
  };
}

test("an action keeps the store busy while it runs, and until what it changed shows", async () => {
  const store = controlsStore();
  const view = showing();
  const during: boolean[] = [];

  const running = runBusy(
    store,
    async () => {
      during.push(store.state().busy);
      await Promise.resolve();
      during.push(store.state().busy);
    },
    view.shown,
  );

  await vi.waitFor(() => {
    expect(during).toHaveLength(2);
  });
  await Promise.resolve();

  expect(store.state().busy).toBe(true);

  view.show();
  await running;

  expect(during).toStrictEqual([true, true]);
  expect(store.state().busy).toBe(false);
});

test("an action that fails leaves the store not busy once what it changed shows, and fails as it did", async () => {
  const store = controlsStore();
  const view = showing();
  const failure = new Error("failed");

  const running = runBusy(
    store,
    async () => {
      await Promise.resolve();
      throw failure;
    },
    view.shown,
  );

  await Promise.all([
    expect(running).rejects.toBe(failure),
    vi.waitFor(() => {
      view.show();
      expect(store.state().busy).toBe(false);
    }),
  ]);
});

const modified = { group: "modified", path: "a.txt" } as const;

const where = { directory: "/repo", hideWhitespace: true };

// A server whose actions on a file answer as `answer` does.
function serverAnswering(answer: Server["applyFile"]): Server {
  const unused = vi.fn<() => Promise<never>>();

  return {
    shownDiff: vi.fn<Server["shownDiff"]>(),
    applyFile: answer,
    applyLines: unused,
    applyMode: unused,
    applyGroup: unused,
  };
}

// What an action told, in order.
function told() {
  const heard: string[] = [];

  return {
    heard,
    tell: {
      refused: (message: string) => heard.push(`refused: ${message}`),
      failed: (message: string) => heard.push(`failed: ${message}`),
    },
  };
}

test("an action applied tells nothing, and one refused tells why", async () => {
  const applied = told();
  const refused = told();
  const misaligned = told();
  const unwritable = told();
  const target = { file: modified, version: "1" };

  await applyAndTell(
    serverAnswering(vi.fn<Server["applyFile"]>().mockResolvedValue({ status: "applied" })),
    where,
    "stage",
    target,
    applied.tell,
  );
  await applyAndTell(
    serverAnswering(vi.fn<Server["applyFile"]>().mockResolvedValue({ status: "stale" })),
    where,
    "stage",
    target,
    refused.tell,
  );

  await applyAndTell(
    serverAnswering(vi.fn<Server["applyFile"]>().mockResolvedValue({ status: "misaligned" })),
    where,
    "discard",
    target,
    misaligned.tell,
  );
  await applyAndTell(
    serverAnswering(vi.fn<Server["applyFile"]>().mockResolvedValue({ status: "unwritable" })),
    where,
    "discard",
    target,
    unwritable.tell,
  );

  expect(applied.heard).toStrictEqual([]);
  expect(refused.heard).toStrictEqual([`refused: ${staleMessage(target)}`]);
  expect(misaligned.heard).toStrictEqual([`refused: ${misalignedMessage("discard")}`]);
  expect(unwritable.heard).toStrictEqual([`refused: ${unwritableMessage()}`]);
});

test("an action that fails tells what failed, and doesn't fail itself", async () => {
  const error = told();
  const other = told();
  const target = { file: modified, version: "1" };

  await applyAndTell(
    serverAnswering(vi.fn<Server["applyFile"]>().mockRejectedValue(new Error("git broke"))),
    where,
    "stage",
    target,
    error.tell,
  );
  await applyAndTell(
    serverAnswering(vi.fn<Server["applyFile"]>().mockRejectedValue("gone")),
    where,
    "stage",
    target,
    other.tell,
  );

  expect(error.heard).toStrictEqual(["failed: git broke"]);
  expect(other.heard).toStrictEqual(["failed: gone"]);
});
