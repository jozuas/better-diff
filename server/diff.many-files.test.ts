import { expect, test } from "vitest";

import { inRepository, runGit, timeout, writeFile } from "../test/repository";
import { applyChanges } from "./diff";
import type { ChangedFile, Changes } from "./diff";

// About 2.4 MB of paths: Linux lets a process start with 2 MiB of arguments and environment, and
// macOS with 1 MiB. Each is shorter than the 1024 bytes macOS allows a path. Each check runs a git
// command that prints nothing once the action has done its job: listing the files would print more
// than runGit takes.
const paths = Array.from({ length: 3000 }, (_, index) =>
  ["a".repeat(200), "b".repeat(200), "c".repeat(200), `${index}${"d".repeat(200)}`].join("/"),
);

// Each file, with changes that give only what an action goes by: that there are some, and how git
// status lists the file.
function changed(listed: Pick<Changes, "untracked" | "intentToAdd">): ChangedFile[] {
  return paths.map((path) => ({
    path,
    changes: { diff: Buffer.from("changes"), renamedFrom: undefined, paths: [path], ...listed },
  }));
}

function writeEach(repository: string, content: string): void {
  for (const path of paths) {
    writeFile(repository, path, content);
  }
}

test(
  "stages, discards, unstages and deletes more files at once than a command's arguments can name",
  async () => {
    await inRepository(async (repository) => {
      writeEach(repository, "a\n");

      expect(() => runGit(repository, ["add", "--", ...paths])).toThrow(/E2BIG/u);

      await applyChanges(repository, "stage", changed({ untracked: true, intentToAdd: false }));

      expect(runGit(repository, ["ls-files", "--others"])).toBe("");

      writeEach(repository, "b\n");
      await applyChanges(repository, "discard", changed({ untracked: false, intentToAdd: false }));

      expect(runGit(repository, ["diff", "--name-only"])).toBe("");

      await applyChanges(repository, "unstage", changed({ untracked: false, intentToAdd: false }));

      expect(runGit(repository, ["ls-files"])).toBe("");

      runGit(repository, ["add", "--intent-to-add", "--all"]);
      await applyChanges(repository, "discard", changed({ untracked: false, intentToAdd: true }));

      expect(runGit(repository, ["status", "--porcelain", "--untracked-files=all"])).toBe("");
    });
  },
  timeout,
);
