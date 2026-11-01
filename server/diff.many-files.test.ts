import { expect, test } from "vitest";

import { inRepository, runGit, timeout, writeFile } from "../test/repository";
import { applyChanges } from "./diff";
import type { ChangedFile, Changes } from "./diff";

// More bytes of paths than a process can start with as arguments: macOS lets it start with 1 MiB of
// arguments and environment, and Linux with a quarter of its stack size limit, but at most 6 MiB. A
// path, the temporary directory's included, can be 1024 bytes long on macOS and 4096 on Linux, where
// longer paths take fewer files: about 2.4 MB of paths on macOS, and 7.2 MB on Linux. Each check
// runs a git command that prints nothing once the action has done its job: listing the files would
// print more than runGit takes.
const { count, directories } =
  process.platform === "darwin"
    ? { count: 3000, directories: 3 }
    : { count: 2000, directories: 17 };

const paths = Array.from({ length: count }, (_, index) =>
  [
    ...Array.from({ length: directories }, () => "a".repeat(200)),
    `${index}${"b".repeat(200)}`,
  ].join("/"),
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
