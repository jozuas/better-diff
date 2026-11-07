import { expect, test, vi } from "vitest";

import { oneAtATime } from "./one-at-a-time";

// A task that runs until it's ended.
function heldTask() {
  let end: (() => void) | undefined;

  const ended = new Promise<void>((resolve) => {
    end = resolve;
  });

  return {
    task: vi.fn<() => Promise<void>>().mockReturnValue(ended),
    end: () => {
      end?.();
    },
  };
}

test("a task asked to run while another runs isn't run, and one asked once it's done is", async () => {
  const running = vi.fn<(running: boolean) => void>();
  const tasks = oneAtATime(running);
  const first = heldTask();
  const second = heldTask();
  const third = heldTask();
  const ran = tasks.run(first.task);

  await tasks.run(second.task);

  expect(second.task).not.toHaveBeenCalled();
  expect(running.mock.calls).toStrictEqual([[true]]);

  first.end();
  await ran;
  third.end();
  await tasks.run(third.task);

  expect(third.task).toHaveBeenCalledOnce();
  expect(running.mock.calls).toStrictEqual([[true], [false], [true], [false]]);
});

test("a task that fails stops running, and one asked after it is run", async () => {
  const running = vi.fn<(running: boolean) => void>();
  const tasks = oneAtATime(running);
  const failing = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("Failed."));
  const next = vi.fn<() => Promise<void>>().mockResolvedValue();

  await expect(tasks.run(failing)).rejects.toThrow("Failed.");
  await tasks.run(next);

  expect(next).toHaveBeenCalledOnce();
  expect(running.mock.calls).toStrictEqual([[true], [false], [true], [false]]);
});
