import { expect, test } from "vitest";

import { diffRpc } from "../shared/diff";
import { syntaxColorsRpc } from "../shared/syntax";
import { commitAll, inRepository, runGit, writeFile } from "../test/repository";
import { readDiff } from "./diff";
import { readGroup } from "./groups";
import { syntaxColors } from "./highlight";

test("highlights a diff's removed lines as part of the old version, and its added and unchanged lines as part of the new one, as the diff's schema has them", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a.ts", "/*\nconst a = 1;\n*/\nconst b = 2;\n");
    commitAll(repository);
    writeFile(repository, "a.ts", "const a = 1;\nconst b = 2;\n");

    const diff = await readDiff({ directory: repository, path: "a.ts", side: "unstaged" });
    const { highlights } = diff;

    expect(highlights.old[1]).toStrictEqual([[12, "comment"]]);
    expect([highlights.new[0]?.[0], highlights.new[1]?.[0]]).toStrictEqual([
      [5, "keyword"],
      [5, "keyword"],
    ]);
    expect(diffRpc.output.parse(diff)).toStrictEqual(diff);
  });
});

test("the syntax colours are as their schema has them", () => {
  expect(syntaxColorsRpc.output.parse(syntaxColors())).toStrictEqual(syntaxColors());
});

test("highlights a renamed file's old version in the language of the path it was renamed from", async () => {
  await inRepository(async (repository) => {
    const code = Array.from({ length: 10 }, (_, index) => `const a${index} = ${index};\n`);

    writeFile(repository, "a.ts", code.join(""));
    commitAll(repository);
    runGit(repository, ["mv", "a.ts", "a.txt"]);
    writeFile(repository, "a.txt", ["const b = 0;\n", ...code.slice(1)].join(""));
    runGit(repository, ["add", "a.txt"]);

    const { renamedFrom, highlights } = await readDiff({
      directory: repository,
      path: "a.txt",
      side: "staged",
    });

    expect(renamedFrom).toBe("a.ts");
    expect(highlights.old.map((runs) => runs[0])).toStrictEqual(
      Array.from({ length: 10 }, () => [5, "keyword"]),
    );
    expect(highlights.new).toStrictEqual([]);
  });
});

test("highlights each of a group's files as its own diff is highlighted", async () => {
  await inRepository(async (repository) => {
    writeFile(repository, "a.ts", "const a = 1;\n");
    writeFile(repository, "b.py", "def b():\n  return 2\n");

    const { files } = await readGroup({ directory: repository, group: "untracked" });

    const own = await Promise.all(
      ["a.ts", "b.py"].map(async (path) => {
        const diff = await readDiff({ directory: repository, path, side: "unstaged" });

        return diff.highlights;
      }),
    );

    expect(files).toMatchObject(own.map((highlights) => ({ highlights })));
  });
});
