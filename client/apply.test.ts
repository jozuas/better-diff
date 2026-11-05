import { expect, test, vi } from "vitest";

import { apply, misalignedMessage, staleMessage } from "./apply";
import type { Server } from "./apply";

interface Answers {
  // The diff shown, if it's been read.
  shown?: { version: string };
  status?: "applied" | "stale" | "misaligned";
}

// A server that answers with what's given.
function serverWith({ shown, status = "applied" }: Answers = {}) {
  return {
    shownDiff: vi.fn<Server["shownDiff"]>(() => shown),
    applyFile: vi.fn<Server["applyFile"]>().mockResolvedValue({ status }),
    applyLines: vi.fn<Server["applyLines"]>().mockResolvedValue({ status }),
    applyMode: vi.fn<Server["applyMode"]>().mockResolvedValue({ status }),
    applyGroup: vi.fn<Server["applyGroup"]>().mockResolvedValue({ status }),
  } satisfies Server;
}

const modified = { group: "modified", path: "a.txt" } as const;

const repo = { directory: "/repo", hideWhitespace: false };

test("acts on all of a shown diff, or its lines, of the version shown", async () => {
  const server = serverWith({ shown: { version: "shown" } });
  const lines = [{ hunk: 1, line: 2 }];

  await apply(server, repo, "stage", { file: modified, version: "1" });
  await apply(server, repo, "discard", { file: modified, version: "2", lines });

  expect(server.applyFile.mock.calls).toStrictEqual([
    [
      {
        directory: "/repo",
        hideWhitespace: false,
        path: "a.txt",
        operation: "stage",
        version: "1",
      },
    ],
  ]);
  expect(server.applyLines.mock.calls).toStrictEqual([
    [
      {
        directory: "/repo",
        hideWhitespace: false,
        path: "a.txt",
        operation: "discard",
        version: "2",
        lines,
      },
    ],
  ]);
});

test("acts on the mode change of a shown diff, of the version shown", async () => {
  const server = serverWith({ shown: { version: "shown" } });

  await apply(server, repo, "unstage", {
    file: { group: "staged", path: "a.txt" },
    version: "1",
    mode: true,
  });

  expect(server.applyMode.mock.calls).toStrictEqual([
    [
      {
        directory: "/repo",
        hideWhitespace: false,
        path: "a.txt",
        operation: "unstage",
        version: "1",
      },
    ],
  ]);
  expect(server.applyFile).not.toHaveBeenCalled();
  expect(server.applyLines).not.toHaveBeenCalled();
});

test("acts on a listed file whose diff isn't shown as it is, without a version", async () => {
  const server = serverWith({ shown: { version: "shown" } });

  await apply(server, repo, "unstage", { file: { group: "staged", path: "b" }, shown: false });
  await apply(server, repo, "discard", {
    file: { group: "untracked", path: "c" },
    shown: false,
  });

  expect(server.applyFile.mock.calls).toStrictEqual([
    [{ directory: "/repo", hideWhitespace: false, path: "b", operation: "unstage", version: null }],
    [{ directory: "/repo", hideWhitespace: false, path: "c", operation: "discard", version: null }],
  ]);
  expect(server.shownDiff).not.toHaveBeenCalled();
});

test("acts on the diff shown from the shown file's row, of the version shown", async () => {
  const server = serverWith({ shown: { version: "shown" } });

  await apply(server, repo, "stage", { file: modified, shown: true });

  expect(server.shownDiff.mock.calls).toStrictEqual([[modified]]);
  expect(server.applyFile.mock.calls).toStrictEqual([
    [
      {
        directory: "/repo",
        hideWhitespace: false,
        path: "a.txt",
        operation: "stage",
        version: "shown",
      },
    ],
  ]);
});

test("acts on the shown file's row's file as it is, without a version, while its diff hasn't been read to be shown", async () => {
  const server = serverWith();

  await apply(server, repo, "stage", { file: modified, shown: true });

  expect(server.applyFile.mock.calls).toStrictEqual([
    [
      {
        directory: "/repo",
        hideWhitespace: false,
        path: "a.txt",
        operation: "stage",
        version: null,
      },
    ],
  ]);
});

test("answers with the server's answer", async () => {
  const server = serverWith({ status: "stale" });

  await expect(apply(server, repo, "stage", { file: modified, version: "1" })).resolves.toBe(
    "stale",
  );
  await expect(apply(server, repo, "stage", { file: modified, shown: false })).resolves.toBe(
    "stale",
  );
  await expect(apply(server, repo, "stage", { group: "modified", paths: ["a"] })).resolves.toBe(
    "stale",
  );
  await expect(
    apply(server, repo, "stage", { file: modified, version: "1", mode: true }),
  ).resolves.toBe("stale");
});

test("acts on all of a group's files as they were listed", async () => {
  const server = serverWith();

  await expect(
    apply(server, repo, "discard", { group: "untracked", paths: ["a", "b"] }),
  ).resolves.toBe("applied");
  expect(server.applyGroup).toHaveBeenCalledWith({
    directory: "/repo",
    group: "untracked",
    operation: "discard",
    paths: ["a", "b"],
  });
});

test("acts on the files selected in a group, in the order they were selected", async () => {
  const server = serverWith();

  await expect(
    apply(server, repo, "stage", { group: "modified", paths: ["b", "a"], selected: true }),
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

  await expect(apply(server, repo, "discard", { group: "staged", paths: ["a"] })).rejects.toThrow(
    /Invalid input/u,
  );
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

test("acts on a file, its lines and its mode change with whitespace changes hidden, where they are, and on a group's files as they are", async () => {
  const server = serverWith();
  const hiding = { directory: "/repo", hideWhitespace: true };
  const lines = [{ hunk: 0, line: 1 }];

  await apply(server, hiding, "stage", { file: modified, shown: false });
  await apply(server, hiding, "discard", { file: modified, version: "1", lines });
  await apply(server, hiding, "stage", { file: modified, version: "1", mode: true });
  await apply(server, hiding, "stage", { group: "modified", paths: ["a"] });

  for (const request of [server.applyFile, server.applyLines, server.applyMode]) {
    expect(request.mock.calls).toMatchObject([[{ hideWhitespace: true }]]);
  }

  expect(server.applyGroup).toHaveBeenCalledWith({
    directory: "/repo",
    group: "modified",
    operation: "stage",
    paths: ["a"],
  });
});

test("answers that lines git lines up otherwise with whitespace changes shown were refused", async () => {
  const server = serverWith({ status: "misaligned" });

  await expect(
    apply(server, repo, "stage", { file: modified, version: "1", lines: [] }),
  ).resolves.toBe("misaligned");
  expect(misalignedMessage("discard")).toBe(
    "With whitespace changes shown, git lines these lines up differently, so nothing was done. Show whitespace changes to discard them.",
  );
});
