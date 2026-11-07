import { commitAll, runGit, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { box, button, findInput, found, line, openFile, openFind } from "./panel";

function status(repository: string): string {
  return runGit(repository, ["status", "--porcelain", "--untracked-files=all"]);
}

test("⌘F, or Ctrl+F elsewhere, with focus in the panel, as after a click in it, opens a find bar under the diff, with focus in its input", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "first\nsecond\n");

  await app.openPanel();
  await openFind(page, "second");

  await expect(findInput(page)).toBeFocused();

  const bar = await box(findInput(page));
  const diff = await box(line(page, "second"));

  expect(bar.y).toBeGreaterThan(diff.y);
  expect(status(repository)).toBe("?? a.txt\n");
});

test("⌘F pressed while the find bar is open moves focus back to its input and selects what's typed", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "first\nsecond\n");

  await app.openPanel();
  await openFind(page, "second");
  await findInput(page).pressSequentially("fir");
  await openFind(page, "second");

  await expect(findInput(page)).toBeFocused();

  await page.keyboard.type("sec");

  await expect(findInput(page)).toHaveValue("sec");
});

test("the find bar finds what's typed in the text of the lines the view shows, and not in line numbers, bars or labels", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "needle.txt", "a needle\nb\nneedle and needle\n");

  await app.openPanel();
  await openFind(page, "b");
  await findInput(page).pressSequentially("needle");

  await expect(page.getByText("1 of 3", { exact: true })).toBeVisible();
  await expect(found(page, "needle")).toHaveCount(3);

  await findInput(page).fill("2");

  await expect(page.getByText("No results", { exact: true })).toBeVisible();
});

test("in a group's view, the find bar finds what's typed in all of its files' diffs, in the order they show", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a needle\n");
  writeFile(repository, "b.txt", "b needle\n");

  await app.openPanel();
  await button(page, "UNTRACKED FILES (2)").click();
  await openFind(page, "b needle");
  await findInput(page).pressSequentially("needle");

  await expect(page.getByText("1 of 2", { exact: true })).toBeVisible();
  await expect(found(page, "needle").first()).toHaveCSS("outline-style", "solid");

  await findInput(page).press("Enter");

  await expect(page.getByText("2 of 2", { exact: true })).toBeVisible();
  await expect(found(page, "needle").last()).toHaveCSS("outline-style", "solid");
  await expect(found(page, "needle").first()).toHaveCSS("outline-style", "none");
});

test("while a file shows only its modified hunks, the find bar finds only in the hunks' lines, and while it shows the entire file, in all of them", async ({
  app,
  page,
  repository,
}) => {
  const lines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`);

  writeFile(repository, "a.txt", `needle\n${lines.join("\n")}\nneedle\n`);
  commitAll(repository);
  lines[14] = "changed needle";
  writeFile(repository, "a.txt", `needle\n${lines.join("\n")}\nneedle\n`);

  await app.openPanel();
  await openFind(page, "changed needle");
  await findInput(page).pressSequentially("needle");

  await expect(page.getByText("1 of 1", { exact: true })).toBeVisible();

  await line(page, "changed needle").hover();
  await button(page, "Show entire file").click();

  await expect(page.getByText("2 of 3", { exact: true })).toBeVisible();
  expect(status(repository)).toBe(" M a.txt\n");
});

test("a collapsed diff's lines aren't found in until Show diff shows them, and the find bar says how many collapsed files it left out", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a needle\n");
  writeFile(repository, "package-lock.json", "a locked needle\n");

  await app.openPanel();
  await button(page, "UNTRACKED FILES (2)").click();
  await openFind(page, "a needle");
  await findInput(page).pressSequentially("needle");

  await expect(page.getByText("1 of 1", { exact: true })).toBeVisible();
  await expect(page.getByText("1 collapsed file not searched", { exact: true })).toBeVisible();

  await button(page, "Show diff").click();

  await expect(page.getByText("1 of 2", { exact: true })).toBeVisible();
  await expect(page.getByText("1 collapsed file not searched", { exact: true })).toHaveCount(0);
});

test("what's typed in the find bar matches whatever the case, unless it has a capital letter, when it matches only that case", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a needle\nb Needle\nc NEEDLE\n");

  await app.openPanel();
  await openFind(page, "a needle");
  await findInput(page).pressSequentially("needle");

  await expect(page.getByText("1 of 3", { exact: true })).toBeVisible();

  await findInput(page).fill("Needle");

  await expect(page.getByText("1 of 1", { exact: true })).toBeVisible();
  await expect(found(page, "Needle")).toHaveCount(1);
});

test("Match case makes what's typed match only its case, and it and what's typed stay as they are as another file opens", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a needle\nb Needle\n");
  writeFile(repository, "b.txt", "c needle\nd NEEDLE\n");

  await app.openPanel();
  await openFind(page, "a needle");
  await findInput(page).pressSequentially("needle");
  await page.getByRole("checkbox", { name: "Match case", exact: true }).click();

  await expect(page.getByText("1 of 1", { exact: true })).toBeVisible();

  await openFile(page, "UNTRACKED FILES (2)", "b.txt");

  await expect(line(page, "d NEEDLE")).toBeVisible();
  await expect(findInput(page)).toHaveValue("needle");
  await expect(page.getByRole("checkbox", { name: "Match case", exact: true })).toBeChecked();
  await expect(page.getByText("1 of 1", { exact: true })).toBeVisible();
});

test("Alt+C in the find bar switches Match case on, and off", async ({ app, page, repository }) => {
  writeFile(repository, "a.txt", "a needle\nb Needle\n");

  const matchCase = page.getByRole("checkbox", { name: "Match case", exact: true });

  await app.openPanel();
  await openFind(page, "a needle");
  await findInput(page).pressSequentially("needle");
  await findInput(page).press("Alt+c");

  await expect(matchCase).toBeChecked();
  await expect(findInput(page)).toHaveValue("needle");
  await expect(page.getByText("1 of 1", { exact: true })).toBeVisible();

  await findInput(page).press("Alt+c");

  await expect(matchCase).not.toBeChecked();
  await expect(page.getByText("1 of 2", { exact: true })).toBeVisible();
});

test("Better Diff's settings page lists the find bar's keys with the others", async ({
  app,
  page,
}) => {
  await app.openSettings();

  await expect(page.getByText("Keys in the find bar", { exact: true })).toBeVisible();
  await expect(page.getByText("Close the find bar", { exact: true })).toBeVisible();
  await expect(page.getByText(/^(?:⌘F|Ctrl\+F)$/u)).toBeVisible();
});

test("each match is highlighted, and the current one more strongly", async ({
  app,
  page,
  repository,
}) => {
  writeFile(repository, "a.txt", "a needle\nb needle\n");

  await app.openPanel();

  await expect(found(page, "needle")).toHaveCount(0);

  await openFind(page, "a needle");
  await findInput(page).pressSequentially("needle");

  await expect(found(page, "needle")).toHaveCount(2);
  await expect(found(page, "needle").first()).toHaveCSS("outline-style", "solid");
  await expect(found(page, "needle").last()).toHaveCSS("outline-style", "none");
  await expect(found(page, "needle").last()).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  const current = await found(page, "needle")
    .first()
    .evaluate(
      (element: Styled) =>
        element.ownerDocument.defaultView.getComputedStyle(element).backgroundColor,
    );

  await expect(found(page, "needle").last()).not.toHaveCSS("background-color", current);
});

// An element on the page, which the tests typecheck without the DOM library to describe.
interface Styled {
  ownerDocument: {
    defaultView: { getComputedStyle: (element: Styled) => { backgroundColor: string } };
  };
}
