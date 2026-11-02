import { expect, test } from "vitest";

import { manyPaths } from "../test/many-files";
import { inRepository, runGit, timeout, writeFile } from "../test/repository";
import { applyChanges } from "./diff";
import type { ChangedFile, Changes } from "./diff";

// Each file, with changes that give only what an action goes by: that there are some, and how git
// status lists the file.
function changed(listed: Pick<Changes, "untracked" | "intentToAdd">): ChangedFile[] {
  return manyPaths.map((path) => ({
    path,
    changes: { diff: Buffer.from("changes"), renamedFrom: undefined, paths: [path], ...listed },
  }));
}

function writeEach(repository: string, content: string): void {
  for (const path of manyPaths) {
    writeFile(repository, path, content);
  }
}

// Each check runs a git command that prints nothing once the action has done its job: listing the
// files would print more than runGit takes.
test(
  "stages, discards, unstages and deletes more files at once than a command's arguments can name",
  async () => {
    await inRepository(async (repository) => {
      writeEach(repository, "a\n");

      expect(() => runGit(repository, ["add", "--", ...manyPaths])).toThrow(/E2BIG/u);

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
