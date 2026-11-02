import { commitAll, runGit, writeFile } from "../test/repository";
import { expect, test } from "./fixtures";
import { box, button, line, openFile, selectLines } from "./panel";

function staged(repository: string): string {
  return runGit(repository, ["diff", "--cached"]);
}

function linesOf(name: string): string[] {
  return Array.from({ length: 200 }, (_, index) => `${name} ${index + 1}`);
}

// Commits each file `<name>.txt` as lines "<name> 1" to "<name> 200", then changes line 100 to
// "<name> first" and line 150 to "<name> second", which makes two hunks, with more unchanged lines
// before, between and after them than the view shows.
function changeTwoHunks(repository: string, names: readonly string[] = ["a"]): void {
  for (const name of names) {
    writeFile(repository, `${name}.txt`, `${linesOf(name).join("\n")}\n`);
  }

  commitAll(repository);

  for (const name of names) {
    const changed = linesOf(name).with(99, `${name} first`).with(149, `${name} second`);

    writeFile(repository, `${name}.txt`, `${changed.join("\n")}\n`);
  }
}

test('a hunk\'s bar shows a "Show entire file" icon on its left while the pointer is over the hunk', async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await expect(line(page, "a first")).toBeVisible();

  const toggle = button(page, "Show entire file");

  await expect(toggle.first()).toHaveCSS("opacity", "0");
  await line(page, "a first").hover();
  await expect(toggle.first()).toHaveCSS("opacity", "1");
  await expect(toggle.last()).toHaveCSS("opacity", "0");
  await expect(toggle.first()).toHaveText("");
  await expect(toggle.first().locator("svg")).toHaveCount(1);

  const shown = await box(toggle.first());
  const actions = await box(button(page, "Discard Hunk").first());
  const fileBar = await box(page.getByRole("heading", { name: "MODIFIED a.txt" }));

  expect(shown.x + shown.width).toBeLessThan(actions.x);
  expect(shown.x - fileBar.x).toBeLessThan(20);

  await page.mouse.move(0, 0);

  await expect(toggle.first()).toHaveCSS("opacity", "0");
});

test('"Show entire file" shows the unchanged lines around the hunks, and "Show only modified hunks" only the hunks again, leaving the hunk where it was', async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await line(page, "a second").hover();

  const before = await box(button(page, "Show entire file").last());
  const entireIcon = await button(page, "Show entire file").last().locator("svg").innerHTML();

  await button(page, "Show entire file").last().click();

  await expect(line(page, "a 1")).toBeVisible();
  await expect(line(page, "a 125")).toBeVisible();
  await expect(line(page, "a 200")).toBeVisible();
  await expect(button(page, "Show only modified hunks")).toHaveCount(2);

  const entire = await box(button(page, "Show only modified hunks").last());

  const hunksIcon = await button(page, "Show only modified hunks")
    .last()
    .locator("svg")
    .innerHTML();

  expect(entire.y).toBe(before.y);
  expect(hunksIcon).not.toBe(entireIcon);

  await button(page, "Show only modified hunks").last().click();

  await expect(line(page, "a 125")).toBeHidden();
  await expect(line(page, "a 1")).toBeHidden();
  await expect(button(page, "Show entire file")).toHaveCount(2);

  const hunks = await box(button(page, "Show entire file").last());

  expect(hunks.y).toBe(before.y);
});

test("every file opens showing only modified hunks: the toggle doesn't carry over to the next file", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository, ["a", "b"]);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (2)", "a.txt");
  await line(page, "a first").hover();
  await button(page, "Show entire file").first().click();

  await expect(line(page, "a 125")).toBeVisible();

  await openFile(page, "MODIFIED FILES (2)", "b.txt");

  await expect(line(page, "b first")).toBeVisible();
  await expect(line(page, "b 125")).toBeHidden();
  await expect(button(page, "Show only modified hunks")).toHaveCount(0);

  await openFile(page, "MODIFIED FILES (2)", "a.txt");

  await expect(line(page, "a first")).toBeVisible();
  await expect(line(page, "a 125")).toBeHidden();
});

test("staging a hunk while the entire file shows stages only it, and the next hunk takes its place", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await line(page, "a first").hover();
  await button(page, "Show entire file").first().click();

  const stageHunk = button(page, "Stage Hunk");
  const before = await box(stageHunk.first());

  await stageHunk.first().click();

  await expect(stageHunk).toHaveCount(1);
  await expect(line(page, "a 100")).toBeHidden();
  await expect(line(page, "a second")).toBeInViewport();
  await expect(button(page, "Show only modified hunks")).toHaveCount(1);

  const after = await box(stageHunk);

  expect(after.y).toBe(before.y);
  expect(staged(repository)).toContain("-a 100\n+a first\n");
  expect(staged(repository)).not.toContain("a second");
});

test("in a group's view, \"Show entire file\" shows the entire file of only the file whose hunk it's on, leaving the hunk where it was", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository, ["a", "b"]);

  await app.openPanel();
  await button(page, "MODIFIED FILES (2)").click();
  await line(page, "a first").hover();

  const before = await box(button(page, "Show entire file").first());

  await button(page, "Show entire file").first().click();

  await expect(line(page, "a 125")).toBeVisible();
  await expect(line(page, "b 125")).toBeHidden();
  await expect(button(page, "Show only modified hunks")).toHaveCount(2);
  await expect(button(page, "Show entire file")).toHaveCount(2);

  const after = await box(button(page, "Show only modified hunks").first());

  expect(after.y).toBe(before.y);
});

test("while the entire file shows, a selection reaching into a hunk from the unchanged lines before it selects only the hunk's lines", async ({
  app,
  page,
  repository,
}) => {
  changeTwoHunks(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await line(page, "a first").hover();
  await button(page, "Show entire file").first().click();
  await line(page, "a 95").scrollIntoViewIfNeeded();
  await selectLines(page, "a 95", "a first");
  await button(page, "Stage Lines").click();

  await expect(page.getByRole("heading", { name: "STAGED FILES (1)" })).toBeVisible();
  expect(staged(repository)).toContain("-a 100\n+a first\n");
  expect(staged(repository)).not.toMatch(/^[-+]a (?:9\d|second)$/mu);
});
