import { expect, test } from "vitest";

import { listingsOf } from "../test/batches";
import { manyPaths } from "../test/many-files";
import { commitAll, inRepository, timeout, writeFile } from "../test/repository";
import { batchedChanges } from "./batches";

function writeEach(repository: string, content: string): void {
  for (const path of manyPaths) {
    writeFile(repository, path, content);
  }
}

test(
  "reads with diffs of several more files than a command's arguments can name",
  async () => {
    await inRepository(async (repository) => {
      writeEach(repository, "a\n");
      commitAll(repository);
      writeEach(repository, "b\n");

      const listings = await listingsOf(repository, "modified");
      const batched = await batchedChanges(repository, listings, "unstaged");

      expect(listings.size).toBe(manyPaths.length);
      expect([...batched.keys()]).toStrictEqual([...listings.keys()]);
    });
  },
  timeout,
);
