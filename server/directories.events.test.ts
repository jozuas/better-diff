import { realpathSync, rmSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { commitAll, inRepository, writeFile } from "../test/repository";
import { afterWatching, hiding, toldOf, watchers, watching } from "../test/watching";

// Linux names a change to the directory itself by the directory's own name.
test("keeps watching a directory where told its attributes changed, by the name of the directory it's in", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, join("x", "x", "a"), "a\n");
    commitAll(repository);

    const top = realpathSync(repository);
    const started = watchers();
    const hidden = hiding(started.watchPath);
    const { paths, stop } = await watching(repository, "linux", hidden.watchPath);

    await toldOf(paths, repository, "ready");

    const watched = started.started().length;

    hidden.tell(join(top, "x"), "x", "change");
    await toldOf(paths, repository, join("later", "a"));
    stop();

    expect(paths).toContain(join(top, "x", "x"));
    expect(started.started()).toHaveLength(watched + 1);
  });
});

test("keeps watching where a directory it started to watch is gone before it looks at when it last changed", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, join("gone", "a"), "a\n");
    writeFile(repository, join("there", "b"), "b\n");
    commitAll(repository);

    const gone = join(realpathSync(repository), "gone");

    const { paths, failed, stop } = await watching(
      repository,
      "linux",
      afterWatching(watchers().watchPath, gone, () => {
        rmSync(gone, { recursive: true });
      }),
    );

    await toldOf(paths, repository, join("there", "b"));
    stop();

    expect(failed()).toBe(0);
  });
});
