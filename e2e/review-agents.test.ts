import { startedAgentsSent } from "./agents";
import { expect, test, withoutOtherAgents } from "./fixtures";
import { box, openFile } from "./panel";
import {
  agentItem,
  agentMenu,
  changeA,
  comment,
  openReview,
  pending,
  prompt,
  sendButton,
  sendTo,
} from "./review";

test("Send feedback asks which agent to send the review to, from a menu of the workspace's agents, those active most recently first, which Escape leaves for the review, and sends it to none but the one chosen", async ({
  agents,
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "delta", "Not needed");

  const reviewer = await agents.start("Reviewer");
  const second = await agents.start("Second");
  const opened = await openReview(page, 1);

  await sendButton(opened).click();

  await expect(agentMenu(page).getByRole("menuitem")).toHaveText([
    /^Second/u,
    /^Reviewer/u,
    /^New agent/u,
  ]);
  await expect(
    agentMenu(page).getByRole("menuitem", {
      name: "New agent, better-diff-test-agent/notes",
      exact: true,
    }),
  ).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(agentMenu(page)).toBeHidden();
  await expect(pending(opened, "Not needed")).toBeVisible();

  await sendTo(page, opened, "Reviewer");

  await expect(page.getByText("Feedback sent to Reviewer.", { exact: true })).toBeVisible();
  await expect.poll(reviewer.sent).toHaveLength(1);
  expect(second.sent()).toStrictEqual([]);
});

test("the menu of agents lists those at work after the others, as they are when it opens, marked Working, however long their titles", async ({
  agents,
  app,
  page,
  repository,
}) => {
  const title =
    "Busy with a title too long for the menu, as an agent titled after its first prompt has, which goes on and on";

  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "delta", "Not needed");
  await agents.start("Reviewer");

  const opened = await openReview(page, 1);

  await expect(sendButton(opened)).toBeEnabled();

  const busy = await agents.startWorking(title);

  await sendButton(opened).click();

  const working = agentMenu(page).getByRole("menuitem", { name: `${title}, Working`, exact: true });

  await expect(agentMenu(page).getByRole("menuitem")).toHaveText([
    /^Reviewer/u,
    /^Busy/u,
    /^New agent/u,
  ]);
  await expect(working.getByText("Working", { exact: true })).toBeVisible();

  const menu = await box(agentMenu(page));
  const shown = await box(working.getByText("Working", { exact: true }));
  const panel = await box(opened);
  const send = await box(sendButton(opened));

  expect(shown.x + shown.width).toBeLessThanOrEqual(menu.x + menu.width);
  expect(menu.width).toBeLessThanOrEqual(400);
  expect(send.x + send.width).toBeLessThanOrEqual(panel.x + panel.width);

  await working.click();

  await expect(page.getByText(`Feedback sent to ${title}.`, { exact: true })).toBeVisible();
  await expect.poll(busy.sent).toHaveLength(1);
});

test("the menu of agents says how long ago each agent not at work was last active, marks one whose last turn failed Error, among them, and one waiting for permission to go on Needs permission, among those at work", async ({
  agents,
  app,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "delta", "Not needed");
  await agents.start("Reviewer");
  await agents.startFailing("Failed");

  const asking = await agents.startAsking("Asking");

  await agents.startWorking("Busy");

  const opened = await openReview(page, 1);

  await sendButton(opened).click();

  await expect(agentMenu(page).getByRole("menuitem")).toHaveText([
    /^Failed/u,
    /^Reviewer/u,
    /^Busy/u,
    /^Asking/u,
    /^New agent/u,
  ]);

  await Promise.all(
    ["Failed, Error", "Reviewer, Just now", "Busy, Working", "Asking, Needs permission"].map(
      async (name) => {
        await expect(agentMenu(page).getByRole("menuitem", { name, exact: true })).toBeVisible();
      },
    ),
  );

  await agentItem(page, "Asking").click();

  await expect(page.getByText("Feedback sent to Asking.", { exact: true })).toBeVisible();
  await expect.poll(asking.sent).toHaveLength(1);
});

test("without an agent in the workspace, the review is sent to a new one in it, started as the agent last active on the host was", async ({
  app,
  elsewhere,
  page,
  repository,
}) => {
  changeA(repository);

  await app.openPanel();
  await openFile(page, "MODIFIED FILES (1)", "a.txt");
  await comment(page, "BRAVO", "Why uppercase?");
  await elsewhere.start("Elsewhere");

  const opened = await openReview(page, 1);

  await expect(sendButton(opened)).toBeEnabled();

  await sendButton(opened).click();

  await expect(agentMenu(page).getByRole("menuitem")).toHaveCount(1);
  await expect(agentMenu(page).getByRole("menuitem")).toHaveAccessibleName(
    "New agent, better-diff-test-agent/notes",
  );

  await agentItem(page, "New agent").click();

  await expect(page.getByText("Feedback sent to a new agent.", { exact: true })).toBeVisible();
  await expect(pending(page, "Why uppercase?")).toBeHidden();
  await expect
    .poll(() => startedAgentsSent(repository))
    .toMatchObject([
      [prompt, { type: "review", comments: [{ filePath: "a.txt", body: "Why uppercase?" }] }],
    ]);
});

test.describe("on a host without agents", () => {
  withoutOtherAgents();

  test("without an agent in the workspace, nor one on the host to start a new one as, the review says to start one, and can't be sent", async ({
    app,
    page,
    repository,
  }) => {
    changeA(repository);

    await app.openPanel();
    await openFile(page, "MODIFIED FILES (1)", "a.txt");
    await comment(page, "BRAVO", "Why uppercase?");

    const opened = await openReview(page, 1);

    await expect(
      opened.getByText("Start an agent in this workspace to send it feedback.", { exact: true }),
    ).toBeVisible();
    await expect(sendButton(opened)).toBeDisabled();
  });
});
