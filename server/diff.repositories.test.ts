import { renameSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { inRepository, makeExecutable, writeFile } from "../test/repository";
import { applyFile, readDiff } from "./diff";

test("stages a file in one repository while staging one in another hasn't finished", async () => {
  await inRepository(async (other) => {
    await inRepository(async (repository) => {
      // Holds up staging in the other repository until the test lets it finish, for five seconds at
      // most.
      writeFile(
        other,
        ".git/hooks/post-index-change",
        "#!/bin/sh\nfor _ in $(seq 500); do [ -e .git/finish ] && exit; sleep 0.01; done\n",
      );
      makeExecutable(other, ".git/hooks/post-index-change");
      writeFile(other, "a", "a\n");
      writeFile(repository, "a", "a\n");

      const held = await readDiff({ directory: other, path: "a", side: "unstaged" });
      const diff = await readDiff({ directory: repository, path: "a", side: "unstaged" });

      const holding = applyFile({
        directory: other,
        path: "a",
        operation: "stage",
        version: held.version,
      });

      const first = await Promise.race([
        holding.then((status) => ({ other: status })),
        applyFile({
          directory: repository,
          path: "a",
          operation: "stage",
          version: diff.version,
        }).then((status) => ({ repository: status })),
      ]);

      writeFile(other, ".git/finish", "");

      await expect(holding).resolves.toStrictEqual({ status: "applied" });
      expect(first).toStrictEqual({ repository: { status: "applied" } });
    });
  });
});

test("stages a file once git finds its repository again", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a", "a\n");

    const { version } = await readDiff({ directory: repository, path: "a", side: "unstaged" });
    const action = { directory: repository, path: "a", operation: "stage", version } as const;

    renameSync(join(repository, ".git"), join(repository, "git"));
    await expect(applyFile(action)).rejects.toThrow("not a git repository");
    renameSync(join(repository, "git"), join(repository, ".git"));

    await expect(applyFile(action)).resolves.toStrictEqual({ status: "applied" });
  });
});
