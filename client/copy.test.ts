import * as fc from "fast-check";
import { expect, test, vi } from "vitest";

import { copy, copyItems, copyLabel } from "./copy";
import type { Copier, CopyItem } from "./copy";

type Contents = Awaited<ReturnType<Copier["readContents"]>>;

// A copier whose server reads the contents given.
function copierWith(contents: Contents) {
  return {
    readContents: vi.fn<Copier["readContents"]>().mockResolvedValue(contents),
    write: vi.fn<Copier["write"]>().mockResolvedValue(),
  } satisfies Copier;
}

const text: Contents = { status: "read", text: "a\r\nb" };

// What copying the item writes to the clipboard.
async function copied(
  item: CopyItem,
  directory: string,
  path: string,
): Promise<string | undefined> {
  const copier = copierWith(text);

  await expect(copy(item, directory, path, copier)).resolves.toBeUndefined();
  expect(copier.write).toHaveBeenCalledOnce();

  return copier.write.mock.calls[0]?.[0];
}

// A name in a path, with what git quotes and what a path's separators look like elsewhere.
const name = fc.string({
  unit: fc.constantFrom("a", " ", "\\", ":", "\t", "\n", "é", "😀"),
  minLength: 1,
  maxLength: 4,
});

test("names each item the menu copies", () => {
  expect(copyItems.map(copyLabel)).toStrictEqual([
    "Copy full path",
    "Copy relative path",
    "Copy filename",
    "Copy file contents",
  ]);
});

test("copies the path in the directory as the full path", async () => {
  await expect(copied("full path", "/home/me/repo", "src/a b.ts")).resolves.toBe(
    "/home/me/repo/src/a b.ts",
  );
});

test("copies the path as git status lists it as the relative path", async () => {
  await expect(copied("relative path", "/home/me/repo", "src/a b.ts")).resolves.toBe("src/a b.ts");
});

test("copies the last name in the path as the filename, a directory's where it ends in a slash", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(name, { minLength: 1, maxLength: 3 }),
      fc.constantFrom("", "/"),
      async (names, end) => {
        await expect(copied("filename", "/repo", `${names.join("/")}${end}`)).resolves.toBe(
          names.at(-1),
        );
      },
    ),
  );
});

test("copies the file's contents as the server reads them", async () => {
  const copier = copierWith(text);

  await expect(copy("file contents", "/repo", "src/a", copier)).resolves.toBeUndefined();
  expect(copier.readContents.mock.calls).toStrictEqual([[{ directory: "/repo", path: "src/a" }]]);
  expect(copier.write.mock.calls).toStrictEqual([["a\r\nb"]]);
});

test.each([
  [{ status: "binary" }, "src/a is a binary file, so nothing was copied."],
  [{ status: "absent" }, "There's no file at src/a to copy."],
] as const)(
  "copies nothing of a file the server reads as %o, and says why",
  async (contents, why) => {
    const copier = copierWith(contents);

    await expect(copy("file contents", "/repo", "src/a", copier)).resolves.toBe(why);
    expect(copier.write).not.toHaveBeenCalled();
  },
);

test("fails where the clipboard can't be written", async () => {
  const copier = copierWith(text);

  copier.write.mockRejectedValue(new Error("Denied"));

  await expect(copy("relative path", "/repo", "a", copier)).rejects.toThrow("Denied");
});
