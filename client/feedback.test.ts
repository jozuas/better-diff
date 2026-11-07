import type { RpcOutput } from "@getpaseo/plugin";
import * as fc from "fast-check";
import { expect, test, vi } from "vitest";

import type { diffRpc } from "../shared/diff";
import { diffHunks, reviewComments } from "../test/comments";
import { reviewOf } from "./attachment";
import type { ReviewAttachment } from "./attachment";
import type { CommentedFile, ListedAgent, ReviewComment } from "./comments";
import {
  agentsIn,
  agentsNotice,
  agentsPage,
  discardLabel,
  feedbackTo,
  messageAfter,
  recipientOf,
  reviewLabel,
  sendLabel,
} from "./feedback";
import type { FeedbackServer, Told } from "./feedback";

type Diff = RpcOutput<typeof diffRpc>;

type Diffs = (diff: CommentedFile["diff"], path: string) => { diff: Diff } | undefined;

// How a page that's last says so: that it has no more after it, that it has no cursor to the next,
// or both.
interface LastPage {
  hasMore: boolean;
  nextCursor: string | null;
}

const lastPage = fc.constantFrom<LastPage>(
  { hasMore: false, nextCursor: null },
  { hasMore: false, nextCursor: "past the end" },
  { hasMore: true, nextCursor: null },
);

// What the daemon was asked: for each page of agents, by its cursor, for each file's diff, and to
// send each agent a message.
interface Asked {
  pages: (string | undefined)[];
  reads: string[];
  sends: [string, string, ReviewAttachment][];
}

function keyOf({ diff, path }: CommentedFile): string {
  return JSON.stringify([diff, path]);
}

// The diff of the file the comment is on, if it has one.
function diffIn(diffs: Diffs): (file: CommentedFile) => Diff | undefined {
  return ({ diff, path }) => diffs(diff, path)?.diff;
}

interface Daemon {
  // The agents it lists, a page at a time, each page's cursor its index, and what the last says.
  pages: readonly ListedAgent[][];
  last: LastPage;
  // The diffs it reads, failing to read a file without one.
  diffs: Diffs;
  // What sends an agent a message, once it's noted, if not one that does nothing.
  send?: FeedbackServer["send"] | undefined;
}

// A daemon that answers as the daemon says, and notes what it's asked.
function server({ pages, last, diffs, send }: Daemon, asked: Asked): FeedbackServer {
  return {
    listAgents: async (cursor) => {
      asked.pages.push(cursor);
      await Promise.resolve();

      const at = cursor === undefined ? 0 : Number(cursor);
      const more = at < pages.length - 1;

      return {
        entries: pages[at] ?? [],
        pageInfo: more ? { hasMore: true, nextCursor: String(at + 1) } : last,
      };
    },
    readDiff: async (file) => {
      asked.reads.push(keyOf(file));
      await Promise.resolve();

      const diff = diffIn(diffs)(file);

      if (diff === undefined) {
        throw new Error("Unreadable");
      }

      return diff;
    },
    send: async (agent, prompt, review) => {
      asked.sends.push([agent, prompt, review]);
      await send?.(agent, prompt, review);
    },
  };
}

function asking(): Asked {
  return { pages: [], reads: [], sends: [] };
}

function agentIn(workspace: string, id: string): ListedAgent {
  return { agent: { id, provider: "claude", title: `Agent ${id}`, workspaceId: workspace } };
}

// Pages of agents, each with an ID of its own, in the workspace "w", or another.
const agentPages = fc
  .array(fc.array(fc.tuple(fc.constantFrom("w", "elsewhere"), fc.nat(1000))), {
    minLength: 1,
    maxLength: 4,
  })
  .map((pages) =>
    pages.map((page, at) =>
      page.map(([workspace, id]) => agentIn(workspace, `${String(at)}-${String(id)}`)),
    ),
  )
  .filter(
    (pages) => new Set(pages.flat().map(({ agent }) => agent.id)).size === pages.flat().length,
  );

const diff: Diff = {
  version: "version",
  kind: "text",
  added: 1,
  removed: 0,
  hunks: [
    { oldStart: 0, newStart: 1, lines: [{ kind: "added", text: "", newline: true, runs: [] }] },
  ],
  contents: [],
};

const unchanged: Diff = { ...diff, kind: "unchanged", added: 0, hunks: [] };

// The diffs of every file: an unstaged one, which adds one line, and a staged one, which changes
// nothing.
function everyDiff(side: CommentedFile["diff"]) {
  return { diff: side === "unstaged" ? diff : unchanged };
}

function lastPageOf(): LastPage {
  return { hasMore: false, nextCursor: null };
}

const comment: ReviewComment = {
  diff: "unstaged",
  path: "a.txt",
  side: "new",
  line: 1,
  id: 1,
  body: "Why?",
};

const reviewer = { id: "a", label: "Reviewer" };

test("the workspace's agents are listed a page at a time, in order, until a page says it's the last", async () => {
  await fc.assert(
    fc.asyncProperty(agentPages, lastPage, async (pages, last) => {
      const asked = asking();
      const agents = await agentsIn(server({ pages, last, diffs: everyDiff }, asked), "w");

      expect(agents).toStrictEqual(
        pages
          .flat()
          .filter(({ agent }) => agent.workspaceId === "w")
          .map(({ agent }) => ({ id: agent.id, label: agent.title })),
      );
      expect(asked.pages).toStrictEqual([
        undefined,
        ...pages.slice(1).map((_, at) => String(at + 1)),
      ]);
    }),
  );
});

test("feedback goes to the agent chosen while it's in the workspace, or else to the first", () => {
  const second = { id: "b", label: "Second" };

  expect(recipientOf([reviewer, second], "b")).toBe(second);
  expect(recipientOf([reviewer, second], "gone")).toBe(reviewer);
  expect(recipientOf([], "b")).toBeUndefined();
});

// What sending the review says, but how: the comments sent, if any, which no longer pend.
function toldOf({ attachment, sent }: ReturnType<typeof reviewOf>): Pick<Told, "variant" | "sent"> {
  return attachment === undefined ? { variant: "warning", sent: [] } : { variant: "success", sent };
}

// What sending the review sends the agent: what it's asked, and the review, if there is one.
function sendsOf({ attachment }: ReturnType<typeof reviewOf>, prompt: string): Asked["sends"] {
  return attachment === undefined ? [] : [["a", prompt, attachment]];
}

// Each diff of each file the comments are on, by its key, both its unstaged and staged ones.
function bothDiffs(comments: readonly ReviewComment[]): string[] {
  return [
    ...new Set(
      comments.flatMap(({ path }) => [
        keyOf({ diff: "unstaged", path }),
        keyOf({ diff: "staged", path }),
      ]),
    ),
  ];
}

// A message, and what the agent's asked with it: what it says, without whitespace at either end,
// or what Paseo's own diff asks where it says nothing.
const messages = fc.constantFrom(
  ["", "Please address this code review."],
  [" \n\t", "Please address this code review."],
  ["Fix these.", "Fix these."],
  ["  Fix these,\r\nthen test é.\n", "Fix these,\r\nthen test é."],
);

test("comments are sent with the message, or what Paseo's own diff asks, on the lines their diffs have as read now, each of their files' diffs read once", async () => {
  await fc.assert(
    fc.asyncProperty(
      reviewComments,
      fc.func(fc.option(diffHunks, { nil: undefined })),
      messages,
      async (comments, diffs, [message, prompt]) => {
        const asked = asking();
        const daemon = server({ pages: [], last: lastPageOf(), diffs }, asked);
        const result = await feedbackTo(daemon, "/repository", comments, reviewer, message);
        const review = reviewOf("/repository", comments, diffIn(diffs));

        expect(result).toMatchObject(toldOf(review));
        expect(asked.sends).toStrictEqual(sendsOf(review, prompt));
        expect(asked.reads.toSorted()).toStrictEqual(bothDiffs(comments).toSorted());
      },
    ),
  );
});

// What sending the comments to the reviewer says, by the diffs of their files, where they're not
// everyDiff's, with what sends it, if not one that does nothing.
async function told(
  comments: readonly ReviewComment[],
  send?: FeedbackServer["send"],
  diffs: Diffs = everyDiff,
): Promise<Told> {
  const daemon = server({ pages: [], last: lastPageOf(), diffs, send }, asking());
  const sent = await feedbackTo(daemon, "/repository", comments, reviewer, "");

  return sent;
}

const offDiff = { ...comment, line: 7, id: 2 };

test("once comments are sent, the panel says who to, and how many weren't, as their lines are no longer in their diffs", async () => {
  await expect(told([comment])).resolves.toStrictEqual({
    message: "Feedback sent to Reviewer.",
    variant: "success",
    sent: [comment],
  });
  await expect(told([comment, offDiff])).resolves.toMatchObject({
    message: "Feedback sent to Reviewer. 1 comment wasn't, as its line is no longer in its diff.",
  });
  await expect(told([offDiff, comment, { ...offDiff, id: 3 }])).resolves.toMatchObject({
    message:
      "Feedback sent to Reviewer. 2 comments weren't, as their lines are no longer in their diffs.",
  });
  await expect(told([offDiff])).resolves.toStrictEqual({
    message: "Nothing was sent. 1 comment wasn't, as its line is no longer in its diff.",
    variant: "warning",
    sent: [],
  });
});

// everyDiff's diffs, but none of b.txt, which can't be read.
function unreadableB(side: CommentedFile["diff"], path: string): { diff: Diff } | undefined {
  return path === "b.txt" ? undefined : everyDiff(side);
}

test("the panel says how many comments weren't sent as their diffs couldn't be read", async () => {
  const unreadable = { ...comment, path: "b.txt", id: 4 };

  await expect(
    told([unreadable, offDiff, comment, { ...unreadable, id: 5 }], undefined, unreadableB),
  ).resolves.toMatchObject({
    message:
      "Feedback sent to Reviewer. 1 comment wasn't, as its line is no longer in its diff. 2 comments weren't, as their diffs couldn't be read.",
  });
  await expect(told([unreadable], undefined, unreadableB)).resolves.toMatchObject({
    message: "Nothing was sent. 1 comment wasn't, as its diff couldn't be read.",
  });
});

// The diffs of every file whose index adds a line, which the worktree removes.
function restaged(side: CommentedFile["diff"]) {
  const removed: Diff = {
    ...diff,
    added: 0,
    removed: 1,
    hunks: [
      { oldStart: 1, newStart: 0, lines: [{ kind: "removed", text: "", newline: true, runs: [] }] },
    ],
  };

  return { diff: side === "staged" ? diff : removed };
}

test("the panel says how many comments weren't sent as their lines have changed since they were staged", async () => {
  const staged = { ...comment, diff: "staged" } as const;

  await expect(told([staged], undefined, restaged)).resolves.toMatchObject({
    message: "Nothing was sent. 1 comment wasn't, as its line has changed since it was staged.",
  });
  await expect(
    told([staged, { ...staged, id: 2 }, { ...staged, line: 7, id: 3 }], undefined, restaged),
  ).resolves.toMatchObject({
    message:
      "Nothing was sent. 1 comment wasn't, as its line is no longer in its diff. 2 comments weren't, as their lines have changed since they were staged.",
  });
});

test("a send that fails says why, and has sent nothing", async () => {
  const gone = vi.fn<FeedbackServer["send"]>().mockRejectedValue(new Error("The agent is gone."));
  const other = vi.fn<FeedbackServer["send"]>().mockRejectedValue("gone");

  await expect(told([comment], gone)).resolves.toStrictEqual({
    message: "Couldn't send feedback: The agent is gone.",
    variant: "error",
    sent: [],
  });
  await expect(told([comment], other)).resolves.toMatchObject({
    message: "Couldn't send feedback: gone",
  });
});

test("the message is empty again once comments have been sent with it, unless it's changed since, and else stays", () => {
  const sent = { message: "", variant: "success", sent: [comment] } as const;
  const none = { message: "", variant: "warning", sent: [] } as const;

  expect(messageAfter(sent, "Fix these.", "Fix these.")).toBe("");
  expect(messageAfter(sent, "Fix these.", "Fix these, and test.")).toBe("Fix these, and test.");
  expect(messageAfter(none, "Fix these.", "Fix these.")).toBe("Fix these.");
});

test("while feedback can't be sent to an agent, the review says why", () => {
  const agents = { pending: false, error: null, recipients: [reviewer] };

  expect(agentsNotice(agents)).toBeUndefined();
  expect(agentsNotice({ ...agents, pending: true })).toBe("Finding the workspace's agents…");
  expect(agentsNotice({ ...agents, error: new Error("Disconnected.") })).toBe(
    "Couldn't list the workspace's agents: Disconnected.",
  );
  expect(agentsNotice({ ...agents, recipients: [] })).toBe(
    "Start an agent in this workspace to send it feedback.",
  );
});

test("the daemon is asked for agents a page of 200 at a time, from the cursor, if there's one", () => {
  expect(agentsPage()).toStrictEqual({ limit: 200 });
  expect(agentsPage("next")).toStrictEqual({ limit: 200, cursor: "next" });
});

test("the buttons say how many comments are pending, whether they're being sent, and ask once Discard is pressed", () => {
  expect(reviewLabel(3)).toBe("Review (3)");
  expect(sendLabel(false)).toBe("Send feedback");
  expect(sendLabel(true)).toBe("Sending feedback");
  expect(discardLabel(false)).toBe("Discard review");
  expect(discardLabel(true)).toBe("Confirm discard?");
});
