import * as fc from "fast-check";
import { expect, test } from "vitest";

import { filePath } from "../test/file-names";
import {
  candidatesIn,
  directoriesOf,
  fileOfPlace,
  fieldOf,
  ignoreItems,
  placeOf,
  shownPatterns,
} from "./ignore";

test("a file is in the directories its path goes through, from its own outwards", () => {
  fc.assert(
    fc.property(filePath, (path) => {
      const slashes = [...path.matchAll(/\//gu)].map(({ index }) => index);

      expect(directoriesOf(path)).toStrictEqual(
        slashes.map((slash) => path.slice(0, slash)).toReversed(),
      );
    }),
  );
});

test("a repository inside the repository is in the directories its path goes through", () => {
  expect(directoriesOf("a/b/")).toStrictEqual(["a"]);
  expect(directoriesOf("a/")).toStrictEqual([]);
});

test("a file in a subdirectory can be ignored in its .gitignore, and in all repositories once core.excludesFile is set", () => {
  expect(ignoreItems("a/b", "~/.gitignore")).toStrictEqual([
    { place: "root", label: "Ignore in .gitignore", disabled: false },
    { place: "subdirectory", label: "Ignore in a subdirectory's .gitignore", disabled: false },
    { place: "private", label: "Ignore privately (.git/info/exclude)", disabled: false },
    { place: "global", label: "Ignore in all repositories (~/.gitignore)", disabled: false },
  ]);
});

test("a file at the root has no subdirectory's .gitignore, and none for all repositories until core.excludesFile is read", () => {
  expect(ignoreItems("a")).toStrictEqual([
    { place: "root", label: "Ignore in .gitignore", disabled: false },
    { place: "private", label: "Ignore privately (.git/info/exclude)", disabled: false },
    { place: "global", label: "Ignore in all repositories", disabled: true },
  ]);
});

test("without core.excludesFile, a file can't be ignored in all repositories, and says why", () => {
  expect(ignoreItems("a", null).at(-1)).toStrictEqual({
    place: "global",
    label: "Ignore in all repositories (core.excludesFile isn't set)",
    disabled: true,
  });
});

test("a rule's place is where the server puts it, and its candidates are from its directory", () => {
  expect(placeOf("root")).toStrictEqual({ kind: "shared", inDirectory: "" });
  expect(placeOf("private")).toStrictEqual({ kind: "private" });
  expect(placeOf("global")).toStrictEqual({ kind: "global" });
  expect(candidatesIn({ kind: "shared", inDirectory: "a/b" })).toBe("a/b");
  expect(candidatesIn({ kind: "global" })).toBe("");
});

test("a rule's place names the file it goes in", () => {
  expect(fileOfPlace({ kind: "shared", inDirectory: "" })).toBe(".gitignore");
  expect(fileOfPlace({ kind: "shared", inDirectory: "a/b" })).toBe("a/b/.gitignore");
  expect(fileOfPlace({ kind: "private" }, "~/x")).toBe(".git/info/exclude");
  expect(fileOfPlace({ kind: "global" }, "~/x")).toBe("~/x");
  expect(fileOfPlace({ kind: "global" })).toBe("core.excludesFile");
});

test("typing shows the candidates that have what's typed in them, in their order, at most 100, and says how many more", () => {
  fc.assert(
    fc.property(
      fc.array(fc.string({ unit: fc.constantFrom("a", "b", "/") }), { maxLength: 300 }),
      fc.string({ unit: fc.constantFrom("a", "b"), maxLength: 2 }),
      (patterns, typed) => {
        const { shown, more } = shownPatterns(patterns, typed);
        const matching = patterns.filter((pattern) => pattern.includes(typed));

        expect([...shown, ...matching.slice(shown.length)]).toStrictEqual(matching);
        expect(shown).toHaveLength(Math.min(matching.length, 100));
        expect(shown.length + more).toBe(matching.length);
      },
    ),
  );
});

test("of more candidates than show, the first 100 show", () => {
  const patterns = Array.from({ length: 150 }, (_, index) => `/${index}`);

  expect(shownPatterns(patterns, "")).toStrictEqual({ shown: patterns.slice(0, 100), more: 50 });
});

test("pressing Enter adds what's typed, as it is, or with nothing typed, the default, which the field shows", () => {
  expect(fieldOf("", { default: "/a" })).toStrictEqual({ rule: "/a", placeholder: "/a" });
  expect(fieldOf(" *.log", { default: "/a" })).toStrictEqual({
    rule: " *.log",
    placeholder: "/a",
  });
  expect(fieldOf("", { default: null })).toStrictEqual({ rule: undefined, placeholder: "" });
  expect(fieldOf("")).toStrictEqual({ rule: undefined, placeholder: "" });
});
