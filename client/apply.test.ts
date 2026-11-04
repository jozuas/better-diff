import { expect, test, vi } from "vitest";

import { apply, staleMessage } from "./apply";
import type { Server } from "./apply";

interface Answers {
  // The diff shown, if it's been read.
  shown?: { version: string };
  status?: "applied" | "stale";
}

// A server that answers with what's given, and a diff read with the version "read".
function serverWith({ shown, status = "applied" }: Answers = {}) {
  return {
    shownDiff: vi.fn<Server["shownDiff"]>(() => shown),
    readDiff: vi.fn<Server["readDiff"]>().mockResolvedValue({ version: "read" }),
    applyFile: vi.fn<Server["applyFile"]>().mockResolvedValue({ status }),
    applyLines: vi.fn<Server["applyLines"]>().mockResolvedValue({ status }),
    applyMode: vi.fn<Server["applyMode"]>().mockResolvedValue({ status }),
    applyGroup: vi.fn<Server["applyGroup"]>().mockResolvedValue({ status }),
  } satisfies Server;
}

const modified = { group: "modified", path: "a.txt" } as const;

test("acts on all of a shown diff, or its lines, of the version shown", async () => {
  const server = serverWith({ shown: { version: "shown" } });
  const lines = [{ hunk: 1, line: 2 }];

  await apply(server, "/repo", "stage", { file: modified, version: "1" });
  await apply(server, "/repo", "discard", { file: modified, version: "2", lines });

  expect(server.applyFile.mock.calls).toStrictEqual([
    [{ directory: "/repo", path: "a.txt", operation: "stage", version: "1" }],
  ]);
  expect(server.applyLines.mock.calls).toStrictEqual([
    [{ directory: "/repo", path: "a.txt", operation: "discard", version: "2", lines }],
  ]);
  expect(server.readDiff).not.toHaveBeenCalled();
});

test("acts on the mode change of a shown diff, of the version shown", async () => {
  const server = serverWith({ shown: { version: "shown" } });

  await apply(server, "/repo", "unstage", {
    file: { group: "staged", path: "a.txt" },
    version: "1",
    mode: true,
  });

  expect(server.applyMode.mock.calls).toStrictEqual([
    [{ directory: "/repo", path: "a.txt", operation: "unstage", version: "1" }],
  ]);
  expect(server.applyFile).not.toHaveBeenCalled();
  expect(server.applyLines).not.toHaveBeenCalled();
  expect(server.readDiff).not.toHaveBeenCalled();
});

test("acts on a listed file's diff as it is, read from the side its group shows", async () => {
  const server = serverWith({ shown: { version: "shown" } });

  await apply(server, "/repo", "unstage", { file: { group: "staged", path: "b" }, shown: false });
  await apply(server, "/repo", "discard", {
    file: { group: "untracked", path: "c" },
    shown: false,
  });

  expect(server.readDiff.mock.calls).toStrictEqual([
    [{ directory: "/repo", path: "b", side: "staged" }],
    [{ directory: "/repo", path: "c", side: "unstaged" }],
  ]);
  expect(server.applyFile.mock.calls).toStrictEqual([
    [{ directory: "/repo", path: "b", operation: "unstage", version: "read" }],
    [{ directory: "/repo", path: "c", operation: "discard", version: "read" }],
  ]);
});

test("acts on the diff shown from the shown file's row, without reading it again", async () => {
  const server = serverWith({ shown: { version: "shown" } });

  await apply(server, "/repo", "stage", { file: modified, shown: true });

  expect(server.shownDiff).toHaveBeenCalledWith(modified);
  expect(server.applyFile).toHaveBeenCalledWith({
    directory: "/repo",
    path: "a.txt",
    operation: "stage",
    version: "shown",
  });
  expect(server.readDiff).not.toHaveBeenCalled();
});

test("reads the diff of the shown file's row while it hasn't been read to be shown", async () => {
  const server = serverWith();

  await apply(server, "/repo", "stage", { file: modified, shown: true });

  expect(server.applyFile).toHaveBeenCalledWith({
    directory: "/repo",
    path: "a.txt",
    operation: "stage",
    version: "read",
  });
});

test("answers with the server's answer", async () => {
  const server = serverWith({ status: "stale" });

  await expect(apply(server, "/repo", "stage", { file: modified, version: "1" })).resolves.toBe(
    "stale",
  );
  await expect(apply(server, "/repo", "stage", { file: modified, shown: false })).resolves.toBe(
    "stale",
  );
  await expect(apply(server, "/repo", "stage", { group: "modified", paths: ["a"] })).resolves.toBe(
    "stale",
  );
  await expect(
    apply(server, "/repo", "stage", { file: modified, version: "1", mode: true }),
  ).resolves.toBe("stale");
});

test("acts on all of a group's files as they were listed, without reading them", async () => {
  const server = serverWith();

  await expect(
    apply(server, "/repo", "discard", { group: "untracked", paths: ["a", "b"] }),
  ).resolves.toBe("applied");
  expect(server.applyGroup).toHaveBeenCalledWith({
    directory: "/repo",
    group: "untracked",
    operation: "discard",
    paths: ["a", "b"],
  });
  expect(server.readDiff).not.toHaveBeenCalled();
});

test("acts on the files selected in a group, in the order they were selected", async () => {
  const server = serverWith();

  await expect(
    apply(server, "/repo", "stage", { group: "modified", paths: ["b", "a"], selected: true }),
  ).resolves.toBe("applied");
  expect(server.applyGroup.mock.calls).toStrictEqual([
    [
      {
        directory: "/repo",
        group: "modified",
        operation: "stage",
        paths: ["b", "a"],
        selected: true,
      },
    ],
  ]);
});

test("refuses an operation a group's files can't have", async () => {
  const server = serverWith();

  await expect(
    apply(server, "/repo", "discard", { group: "staged", paths: ["a"] }),
  ).rejects.toThrow(/Invalid input/u);
});

test("says why an action was refused: its group's files changed, or the files selected, or its file's diff did", () => {
  expect(staleMessage({ group: "modified", paths: [] })).toBe(
    "The group's files changed after they were listed, so nothing was done. They've been reloaded.",
  );
  expect(staleMessage({ group: "modified", paths: [], selected: true })).toBe(
    "The selected files changed after they were selected, so nothing was done. They've been reloaded.",
  );
  expect(staleMessage({ file: modified, shown: false })).toBe(
    "The diff changed after it was shown, so nothing was done. It's been reloaded.",
  );
  expect(staleMessage({ file: modified, version: "1" })).toBe(
    "The diff changed after it was shown, so nothing was done. It's been reloaded.",
  );
  expect(staleMessage({ file: modified, version: "1", mode: true })).toBe(
    "The diff changed after it was shown, so nothing was done. It's been reloaded.",
  );
});
