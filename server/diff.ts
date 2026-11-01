import { createHash } from "node:crypto";

import type { RpcInput, RpcOutput } from "@getpaseo/plugin";

import type { applyFileRpc, applyLinesRpc, diffRpc } from "../shared/diff";
import { readStatus, withIntentToAdd } from "./changes";
import { git } from "./git";
import { buildPatch, kindOf, parseDiff, reverse } from "./patch";

type Side = RpcInput<typeof diffRpc>["side"];

type Action = RpcInput<typeof applyFileRpc>;

type Status = RpcOutput<typeof applyFileRpc>;

// The diff each operation acts on.
const sides: Record<Action["operation"], Side> = {
  stage: "unstaged",
  unstage: "staged",
  discard: "unstaged",
};

// The command that makes or undoes all of a tracked file's changes. `git reset` unstages them where
// `git restore --staged` can't, before the first commit.
const fileCommands = { stage: "add", unstage: "reset", discard: "restore" } as const;

const diffOptions: Record<Side, string[]> = { unstaged: [], staged: ["--cached"] };

interface Changes {
  diff: Buffer;
  renamedFrom: string | undefined;
  // What the diff covers: the file, and a renamed one's original path.
  paths: string[];
  // Whether the file isn't in the index, or is there intent-to-add.
  untracked: boolean;
  intentToAdd: boolean;
}

function versionOf(diff: Buffer): string {
  return createHash("sha256").update(diff).digest("hex");
}

// An untracked file's unstaged diff. `git diff` leaves the file out, though its changes are all of
// its lines, so it's diffed as a new file, as git diffs one added with --intent-to-add. One git
// status pairs with a deleted file is diffed intent-to-add, as git status found the rename.
async function untrackedDiff(
  directory: string,
  path: string,
  renamedFrom: string | undefined,
): Promise<Buffer> {
  if (renamedFrom === undefined) {
    const diff = await git(directory, "diff", ["--no-index"], ["/dev/null", path]);

    return diff;
  }

  const renamed = await withIntentToAdd(directory, [path], async (index) => {
    const diff = await git(directory, "diff", [], [renamedFrom, path], { index });

    return diff;
  });

  return renamed;
}

// The file's changes on the side, as git status lists the file. A diff of a renamed file's two
// paths shows the rename, where one of either path shows a deletion or a new file. A file listed
// twice, as deleted from the index and untracked, isn't renamed.
async function changesOf(directory: string, path: string, side: Side): Promise<Changes> {
  const entries = await readStatus(directory);
  const listed = entries.filter((entry) => entry.path === path);
  const renamedFrom = listed[0]?.renamedFrom[side];
  const paths = renamedFrom === undefined ? [path] : [renamedFrom, path];
  const untracked = side === "unstaged" && listed.some((entry) => entry.untracked);
  const intentToAdd = listed[0]?.intentToAdd === true;

  const diff = untracked
    ? await untrackedDiff(directory, path, renamedFrom)
    : await git(directory, "diff", diffOptions[side], paths);

  return { diff, renamedFrom, paths, untracked, intentToAdd };
}

export async function readDiff({
  directory,
  path,
  side,
}: RpcInput<typeof diffRpc>): Promise<RpcOutput<typeof diffRpc>> {
  const { diff, renamedFrom } = await changesOf(directory, path, side);

  return {
    version: versionOf(diff),
    kind: kindOf(diff),
    renamedFrom,
    hunks: parseDiff(diff).hunks.map(({ oldStart, newStart, lines }) => ({
      oldStart,
      newStart,
      lines: lines.map(({ kind, content, newline }) => ({
        kind,
        text: content.toString("utf8"),
        newline,
      })),
    })),
  };
}

// The last apply to start.
let applying: Promise<unknown> = Promise.resolve();

// Once the previous apply has finished, acts on the diff the operation acts on, if it is still the
// one the action was chosen from.
async function applyAfter(
  previous: Promise<unknown>,
  { directory, path, operation, version }: Action,
  act: (changes: Changes) => Promise<void>,
): Promise<Status> {
  await Promise.allSettled([previous]);

  const changes = await changesOf(directory, path, sides[operation]);

  if (versionOf(changes.diff) !== version) {
    return { status: "stale" };
  }

  await act(changes);

  return { status: "applied" };
}

// One apply at a time. Two at once could both find the diff unchanged, and the second would then
// apply to what the first left, where `git apply` can find a patch's lines in another place.
async function applyInTurn(
  action: Action,
  act: (changes: Changes) => Promise<void>,
): Promise<Status> {
  const applied = applyAfter(applying, action, act);

  applying = applied;

  const status = await applied;

  return status;
}

// Stages, unstages or discards the selected lines' changes.
export async function applyLines({
  lines,
  ...action
}: RpcInput<typeof applyLinesRpc>): Promise<Status> {
  const { directory, operation } = action;

  const status = await applyInTurn(action, async ({ diff }) => {
    const parsed = parseDiff(diff);

    for (const { hunk, line } of lines) {
      if (parsed.hunks[hunk]?.lines[line] === undefined) {
        throw new Error(`The diff has no line ${line} in hunk ${hunk}.`);
      }
    }

    const selected = new Set(lines.map(({ hunk, line }) => `${hunk}:${line}`));

    const patch = buildPatch(operation === "stage" ? parsed : reverse(parsed), (hunk, line) =>
      selected.has(`${hunk}:${line}`),
    );

    if (patch.length > 0) {
      await git(directory, "apply", operation === "discard" ? [] : ["--cached"], [], {
        input: patch,
      });
    }
  });

  return status;
}

// Readies a file new in the worktree for `git clean`, which deletes it without ever touching a
// tracked file: brings back the file it was renamed from, and takes it out of the index if it's
// there intent-to-add.
async function readyToDelete(
  directory: string,
  path: string,
  { renamedFrom, intentToAdd }: Changes,
): Promise<void> {
  if (renamedFrom !== undefined) {
    await git(directory, "restore", [], [renamedFrom]);
  }

  if (intentToAdd) {
    await git(directory, "rm", ["--cached"], [path]);
  }
}

// Stages, unstages or discards all of the file's changes, including those a patch can't make, such
// as a binary file's or a mode change, and a rename, both of whose paths it acts on. Discarding an
// untracked file, or one intent-to-add, deletes it. A diff with no changes leaves the file alone.
export async function applyFile(action: Action): Promise<Status> {
  const { directory, path, operation } = action;

  const status = await applyInTurn(action, async (changes) => {
    const { diff, paths, untracked, intentToAdd } = changes;
    const deletes = (untracked || intentToAdd) && operation === "discard";

    if (diff.length > 0) {
      if (deletes) {
        await readyToDelete(directory, path, changes);
      }

      await git(directory, deletes ? "clean" : fileCommands[operation], [], paths);
    }
  });

  return status;
}
